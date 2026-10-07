// ─────────────────────────────────────────────────────────────
// Camada compartilhada de IA (BYOK — Bring Your Own Key)
//
// SEGURANÇA:
// - A chave de IA fica em public.tenant_ai_credentials, tabela com RLS
//   habilitada e SEM policies e SEM GRANT para anon/authenticated.
//   Somente service_role (estas edge functions) consegue ler a coluna api_key.
// - A chave NUNCA é devolvida ao cliente em nenhuma resposta.
// - BYOK é obrigatório: não há chave global de fallback para as chamadas de
//   texto. Transcrição de áudio (ai-transcribe-audio) e geração de imagem
//   (mkt-ai-creative) ainda não passam por este arquivo — ver docs/decisoes.md.
// ─────────────────────────────────────────────────────────────
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type AIProvider = "anthropic" | "openai" | "google";

export interface AIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  // opcionais para fluxo de tool-calling (formato OpenAI)
  tool_call_id?: string;
  name?: string;
  // deno-lint-ignore no-explicit-any
  tool_calls?: any[];
}

export interface AITool {
  type: "function";
  function: {
    name: string;
    description?: string;
    // deno-lint-ignore no-explicit-any
    parameters: any;
  };
}

export interface AICallOptions {
  messages: AIMessage[];
  tools?: AITool[];
  temperature?: number;
  maxTokens?: number;
  /** sobrescreve o modelo configurado pelo tenant (raro) */
  model?: string;
}

export interface AIResult {
  content: string | null;
  tool_calls?: { id: string; function: { name: string; arguments: string } }[];
  provider: AIProvider;
  model: string;
}

export class AIError extends Error {
  code: "no_ai_credentials" | "provider_error" | "rate_limited" | "unauthorized_key";
  status: number;
  constructor(
    code: AIError["code"],
    message: string,
    status = 400,
  ) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export const NO_CREDENTIALS_MESSAGE =
  "Nenhum provedor de IA configurado para esta empresa.";

export const DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: "claude-3-5-sonnet-latest",
  openai: "gpt-4o-mini",
  google: "gemini-3.8-flash", // 2026-10-07: o Google tirou o 2.5-flash de contas novas (404)
};

interface TenantCredential {
  provider: AIProvider;
  api_key: string;
  model: string;
}

function admin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new AIError("provider_error", "Backend não configurado", 500);
  return createClient(url, key);
}

/** Lê a credencial ativa do tenant. Somente service_role consegue. */
export async function getTenantCredential(
  tenantId: string | null | undefined,
): Promise<TenantCredential | null> {
  if (!tenantId) return null;
  const { data, error } = await admin()
    .from("tenant_ai_credentials")
    .select("provider, api_key, model")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) {
    console.error("getTenantCredential error:", error.message);
    return null;
  }
  if (!data?.api_key) return null;
  return data as TenantCredential;
}

async function requireCredential(tenantId: string | null | undefined): Promise<TenantCredential> {
  const cred = await getTenantCredential(tenantId);
  if (!cred) throw new AIError("no_ai_credentials", NO_CREDENTIALS_MESSAGE, 200);
  return cred;
}

// ── Conversões de formato ─────────────────────────────────────

function splitSystem(messages: AIMessage[]) {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const rest = messages.filter((m) => m.role !== "system");
  return { system, rest };
}

// deno-lint-ignore no-explicit-any
function toAnthropicMessages(messages: AIMessage[]): any[] {
  // deno-lint-ignore no-explicit-any
  const out: any[] = [];
  for (const m of messages) {
    if (m.role === "tool") {
      out.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: m.tool_call_id, content: m.content }],
      });
      continue;
    }
    if (m.role === "assistant" && m.tool_calls?.length) {
      out.push({
        role: "assistant",
        content: m.tool_calls.map((tc) => ({
          type: "tool_use",
          id: tc.id,
          name: tc.function?.name,
          input: safeJson(tc.function?.arguments),
        })),
      });
      continue;
    }
    out.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content });
  }
  return out;
}

// deno-lint-ignore no-explicit-any
function safeJson(raw: unknown): any {
  if (typeof raw !== "string") return raw ?? {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function toAnthropicTools(tools?: AITool[]) {
  return tools?.map((t) => ({
    name: t.function.name,
    description: t.function.description ?? "",
    input_schema: t.function.parameters,
  }));
}

function openAIBaseUrl(provider: AIProvider): string {
  // Google expõe endpoint compatível com OpenAI (mesmo host generativelanguage),
  // o que garante streaming + tool-calling no mesmo formato.
  return provider === "google"
    ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
}

/**
 * A chamada ao provedor, com duas proteções (dono, 2026-10-07):
 *  - "ocupado" (429/503/529 — ex.: Gemini "This model is currently experiencing high demand") é
 *    passageiro: tenta de novo mais 2 vezes, esperando 1,5 s e 4 s;
 *  - limite de tempo por tentativa (o Gemini chegou a ficar 150 s sem responder e a tela parava).
 *    No streaming o limite vale só até a resposta começar, para não cortar o texto no meio.
 */
const OCUPADO = new Set([429, 503, 529]);

// O Gemini 3 "pensa" antes de responder, e por padrão pensa muito: refinar um título levava vários
// segundos e o raciocínio comia o limite de tokens (dono, 2026-10-07: "está demorando"). As tarefas
// daqui são curtas — pensar pouco basta.
const RACIOCINIO_DO_GEMINI = "low";

/**
 * POST na rota compatível com OpenAI. Se o modelo do Google recusar o `reasoning_effort` (400 falando
 * dele), manda de novo sem — um modelo que não aceita o parâmetro não pode derrubar a IA da empresa.
 */
async function postarSemRaciocinioSeRecusar(cred: TenantCredential, body: Record<string, unknown>, opts: { limiteMs: number; streaming?: boolean }) {
  const enviar = () => fetchDoProvedor(openAIBaseUrl(cred.provider), {
    method: "POST",
    headers: { Authorization: `Bearer ${cred.api_key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, opts);
  const res = await enviar();
  if (res.status !== 400 || body.reasoning_effort === undefined) return res;
  const erro = await res.text();
  if (!/reasoning/i.test(erro)) return new Response(erro, { status: 400, headers: res.headers });
  delete body.reasoning_effort;
  return enviar();
}
const ESPERAS_MS = [1500, 4000];
async function fetchDoProvedor(url: string, init: RequestInit, opts: { limiteMs: number; streaming?: boolean }): Promise<Response> {
  for (let tentativa = 0; ; tentativa++) {
    const ctrl = new AbortController();
    const relogio = setTimeout(() => ctrl.abort(), opts.limiteMs);
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: ctrl.signal });
    } catch (e) {
      clearTimeout(relogio);
      if (e instanceof DOMException && e.name === "AbortError") {
        throw new AIError("provider_error", `O provedor de IA não respondeu em ${opts.limiteMs / 1000} s. Tente de novo.`, 504);
      }
      throw e;
    }
    // Streaming: a resposta já começou — o relógio não pode cortar o texto que está chegando.
    if (opts.streaming || !res.ok) clearTimeout(relogio);
    if (!OCUPADO.has(res.status) || tentativa >= ESPERAS_MS.length) {
      if (!opts.streaming && res.ok) {
        // Não-streaming: o corpo ainda está dentro do limite; o relógio cai quando o corpo for lido.
        const texto = await res.text().finally(() => clearTimeout(relogio));
        return new Response(texto, { status: res.status, headers: res.headers });
      }
      return res;
    }
    await res.body?.cancel();
    await new Promise((r) => setTimeout(r, ESPERAS_MS[tentativa]));
  }
}

function mapHttpError(status: number, body: string): AIError {
  if (status === 401 || status === 403) {
    return new AIError("unauthorized_key", "Chave de IA inválida ou sem permissão.", 401);
  }
  if (status === 429) {
    return new AIError("rate_limited", "Muitas requisições ao provedor de IA. Aguarde um momento.", 429);
  }
  if (status === 503 || status === 529) {
    return new AIError("rate_limited", "O modelo de IA está ocupado no provedor agora. Tente de novo em instantes ou escolha outro modelo em Configurações › IA.", 503);
  }
  console.error("AI provider error:", status, body.slice(0, 500));
  return new AIError("provider_error", "Erro ao processar com o provedor de IA.", 502);
}

// ── Chamada não-streaming (normalizada) ───────────────────────

export async function callTenantAI(
  tenantId: string | null | undefined,
  opts: AICallOptions,
): Promise<AIResult> {
  const cred = await requireCredential(tenantId);
  const model = opts.model || cred.model || DEFAULT_MODELS[cred.provider];
  const maxTokens = opts.maxTokens ?? 1200;
  const temperature = opts.temperature ?? 0.3;

  if (cred.provider === "anthropic") {
    const { system, rest } = splitSystem(opts.messages);
    // deno-lint-ignore no-explicit-any
    const body: any = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: toAnthropicMessages(rest),
    };
    if (system) body.system = system;
    const tools = toAnthropicTools(opts.tools);
    if (tools?.length) body.tools = tools;

    const res = await fetchDoProvedor("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": cred.api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }, { limiteMs: 60_000 });
    if (!res.ok) throw mapHttpError(res.status, await res.text());
    const data = await res.json();
    let content = "";
    const toolCalls: AIResult["tool_calls"] = [];
    for (const block of data.content ?? []) {
      if (block.type === "text") content += block.text;
      if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
        });
      }
    }
    return {
      content: content || null,
      tool_calls: toolCalls.length ? toolCalls : undefined,
      provider: cred.provider,
      model,
    };
  }

  // OpenAI e Google (endpoint compatível OpenAI)
  // deno-lint-ignore no-explicit-any
  const body: any = {
    model,
    messages: opts.messages,
    max_tokens: maxTokens,
    temperature,
    stream: false,
  };
  if (cred.provider === "google") body.reasoning_effort = RACIOCINIO_DO_GEMINI;
  if (opts.tools?.length) {
    body.tools = opts.tools;
    body.tool_choice = "auto";
  }
  const res = await postarSemRaciocinioSeRecusar(cred, body, { limiteMs: 60_000 });
  if (!res.ok) throw mapHttpError(res.status, await res.text());
  const data = await res.json();
  const choice = data.choices?.[0]?.message;
  return {
    content: choice?.content ?? null,
    tool_calls: choice?.tool_calls ?? undefined,
    provider: cred.provider,
    model,
  };
}

// ── Chamada com streaming (SSE normalizado no formato OpenAI) ──

/**
 * Retorna um Response SSE cujos chunks seguem o formato OpenAI
 * (`data: {"choices":[{"delta":{"content":"..."}}]}`), independentemente
 * do provedor, para que o frontend não precise saber quem respondeu.
 */
export async function streamTenantAI(
  tenantId: string | null | undefined,
  opts: AICallOptions,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const cred = await requireCredential(tenantId);
  const model = opts.model || cred.model || DEFAULT_MODELS[cred.provider];
  const maxTokens = opts.maxTokens ?? 1200;
  const temperature = opts.temperature ?? 0.3;

  const sseHeaders = { ...corsHeaders, "Content-Type": "text/event-stream" };

  if (cred.provider === "anthropic") {
    const { system, rest } = splitSystem(opts.messages);
    // deno-lint-ignore no-explicit-any
    const body: any = {
      model,
      max_tokens: maxTokens,
      temperature,
      stream: true,
      messages: toAnthropicMessages(rest),
    };
    if (system) body.system = system;

    const res = await fetchDoProvedor("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": cred.api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }, { limiteMs: 60_000, streaming: true });
    if (!res.ok) throw mapHttpError(res.status, await res.text());
    return new Response(anthropicToOpenAIStream(res.body!), { headers: sseHeaders });
  }

  // deno-lint-ignore no-explicit-any
  const body: any = {
    model,
    messages: opts.messages,
    max_tokens: maxTokens,
    temperature,
    stream: true,
  };
  if (cred.provider === "google") body.reasoning_effort = RACIOCINIO_DO_GEMINI;
  const res = await postarSemRaciocinioSeRecusar(cred, body, { limiteMs: 60_000, streaming: true });
  if (!res.ok) throw mapHttpError(res.status, await res.text());
  return new Response(res.body, { headers: sseHeaders });
}

function anthropicToOpenAIStream(input: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream({
    async start(controller) {
      const reader = input.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const raw = line.slice(5).trim();
            if (!raw) continue;
            try {
              const evt = JSON.parse(raw);
              if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
                const chunk = { choices: [{ delta: { content: evt.delta.text } }] };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
              }
              if (evt.type === "message_stop") {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              }
            } catch {
              // ignora eventos malformados
            }
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (e) {
        console.error("anthropic stream error:", e);
      } finally {
        controller.close();
      }
    },
  });
}

// ── Helper de resposta de erro ────────────────────────────────

/**
 * Converte um AIError em Response JSON. O caso `no_ai_credentials` volta
 * com HTTP 200 e `{ error: 'no_ai_credentials' }` para que o frontend
 * possa exibir o estado amigável em vez de um erro cru.
 */
export function aiErrorResponse(
  err: unknown,
  corsHeaders: Record<string, string>,
): Response | null {
  if (!(err instanceof AIError)) return null;
  return new Response(
    JSON.stringify({ error: err.code, message: err.message }),
    {
      status: err.code === "no_ai_credentials" ? 200 : err.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

/**
 * Resolve o tenant do usuário autenticado a partir do header Authorization.
 *
 * PROCURA NOS DOIS CADASTROS, e é a correção de 2026-09-27. Olhava só `profiles`,
 * que é o cadastro de quem TRABALHA na empresa. O cliente do SAC vive em
 * `customer_profiles` — então para ele a função devolvia `null`,
 * `requireCredential` lançava `no_ai_credentials`, e o botão "Melhorar com IA" do
 * portal **nunca funcionou**. O fallback por `tenant_slug` que existia nas funções
 * não salvava: `supabase.functions.invoke` sempre manda o Bearer da sessão, então o
 * caminho sem Bearer nunca era alcançado por quem estava logado.
 *
 * A ordem importa pouco (uma pessoa é staff ou é cliente, não os dois), mas
 * `profiles` vem primeiro porque é o caso da maioria das chamadas.
 */
export async function resolveTenantId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return null;
  const client = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data, error } = await client.auth.getUser(authHeader.replace("Bearer ", ""));
  if (error || !data?.user) return null;

  const { data: profile } = await admin()
    .from("profiles")
    .select("tenant_id")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profile?.tenant_id) return profile.tenant_id;

  // Cliente do SAC: mesma pergunta, outro cadastro.
  const { data: customer } = await admin()
    .from("customer_profiles")
    .select("tenant_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  return customer?.tenant_id ?? null;
}

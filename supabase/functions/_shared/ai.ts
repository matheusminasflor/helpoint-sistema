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
  google: "gemini-2.5-flash",
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

function mapHttpError(status: number, body: string): AIError {
  if (status === 401 || status === 403) {
    return new AIError("unauthorized_key", "Chave de IA inválida ou sem permissão.", 401);
  }
  if (status === 429) {
    return new AIError("rate_limited", "Muitas requisições ao provedor de IA. Aguarde um momento.", 429);
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

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": cred.api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
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
  if (opts.tools?.length) {
    body.tools = opts.tools;
    body.tool_choice = "auto";
  }
  const res = await fetch(openAIBaseUrl(cred.provider), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cred.api_key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
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

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": cred.api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
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
  const res = await fetch(openAIBaseUrl(cred.provider), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cred.api_key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
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

/** Resolve o tenant do usuário autenticado a partir do header Authorization. */
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
  return profile?.tenant_id ?? null;
}

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
  /** Análise pesada, no clique do administrador: usa o Sonnet quando a credencial é do Claude. */
  analise?: boolean;
  /** Tempo máximo de espera pelo provedor. Padrão: 60 s. */
  limiteMs?: number;
  /** PDF ou foto para a IA ler, junto da última mensagem. Só com o Claude. */
  anexo?: { base64: string; tipo: string };
  /** Obriga a IA a responder por esta ferramenta. */
  forcarFerramenta?: string;
  /** Quem pediu e para quê: toda chamada confere o limite e fica registrada (20270212340000). */
  uso: { userId: string; recurso: string; guardar?: boolean };
}

export interface AIResult {
  content: string | null;
  tool_calls?: { id: string; function: { name: string; arguments: string } }[];
  provider: AIProvider;
  model: string;
  tokens?: { entrada: number; saida: number };
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
  anthropic: "claude-haiku-5-5",
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

/** US$ por milhão de tokens (entrada, saída). Modelo fora da lista conta pelo preço mais alto, para o teto valer. */
const PRECOS: [RegExp, number, number][] = [
  [/haiku-5/, 0.10, 0.50],
  [/sonnet-5/, 2, 10],
  [/gemini.*flash-lite/, 0.25, 1.50],
  [/gemini.*flash/, 0.75, 3.75],
];
const custoDe = (modelo: string, t: { entrada: number; saida: number }) => {
  const [, entrada, saida] = PRECOS.find(([re]) => re.test(modelo)) ?? [null, 4, 20];
  return (t.entrada * entrada + t.saida * saida) / 1_000_000;
};

async function chaveDoTexto(modelo: string, opts: AICallOptions) {
  const dados = new TextEncoder().encode(JSON.stringify([modelo, opts.messages, opts.tools ?? null]));
  const hash = await crypto.subtle.digest("SHA-256", dados);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * A única porta para a IA: confere o limite da pessoa e o teto da empresa, devolve a resposta guardada de texto
 * repetido e registra o consumo. Falha aqui nunca derruba o que a pessoa estava fazendo: o formulário segue normal.
 */
export async function callTenantAI(
  tenantId: string | null | undefined,
  opts: AICallOptions,
): Promise<AIResult> {
  const cred = await requireCredential(tenantId);
  const modelo = opts.model || (opts.analise && cred.provider === "anthropic" ? "claude-sonnet-5-5" : cred.model) || DEFAULT_MODELS[cred.provider];
  const db = admin();
  const { userId, recurso, guardar } = opts.uso;
  const chave = guardar ? await chaveDoTexto(modelo, opts) : null;
  if (chave) {
    const { data, error } = await db.from("ia_cache").select("resposta").eq("tenant_id", tenantId).eq("chave", chave).maybeSingle();
    if (error) console.error("ia_cache:", error.message);
    if (data) {
      const { error: erroDoUso } = await db.from("ia_uso").insert({ tenant_id: tenantId, user_id: userId, recurso, modelo, do_cache: true });
      if (erroDoUso) console.error("ia_uso:", erroDoUso.message);
      return data.resposta as AIResult;
    }
  }
  const { data: motivo, error: erroDoLimite } = await db.rpc("ia_motivo_do_bloqueio", { p_tenant: tenantId, p_user: userId });
  if (erroDoLimite) throw new AIError("provider_error", "Não foi possível conferir o limite da IA.", 500);
  if (motivo) throw new AIError("rate_limited", motivo as string, 429);

  const resultado = await chamarProvedor(cred, modelo, opts);
  const tokens = resultado.tokens ?? { entrada: 0, saida: 0 };
  const { error: erroDoRegistro } = await db.from("ia_uso").insert({
    tenant_id: tenantId, user_id: userId, recurso, modelo,
    tokens_entrada: tokens.entrada, tokens_saida: tokens.saida, custo_usd: custoDe(modelo, tokens),
  });
  if (erroDoRegistro) console.error("ia_uso:", erroDoRegistro.message);
  if (chave) {
    const { error } = await db.from("ia_cache").upsert({ tenant_id: tenantId, chave, resposta: resultado });
    if (error) console.error("ia_cache:", error.message);
  }
  return resultado;
}

async function chamarProvedor(
  cred: Awaited<ReturnType<typeof requireCredential>>,
  model: string,
  opts: AICallOptions,
): Promise<AIResult> {
  const maxTokens = opts.maxTokens ?? 1200;
  const temperature = opts.temperature ?? 0.3;

  if (cred.provider === "anthropic") {
    const { system, rest } = splitSystem(opts.messages);
    // Sem temperature: o Haiku 5.5 recusa o campo com 400 (2026-11-05). O teste da chave não o envia, por isso passava.
    // deno-lint-ignore no-explicit-any
    const body: any = {
      model,
      max_tokens: maxTokens,
      messages: toAnthropicMessages(rest),
    };
    if (system) body.system = system;
    if (opts.anexo) {
      const ultima = body.messages[body.messages.length - 1];
      const fonte = { type: "base64", media_type: opts.anexo.tipo, data: opts.anexo.base64 };
      ultima.content = [
        { type: opts.anexo.tipo === "application/pdf" ? "document" : "image", source: fonte },
        { type: "text", text: ultima.content },
      ];
    }
    const tools = toAnthropicTools(opts.tools);
    if (tools?.length) body.tools = tools;
    // O Sonnet 5.5 recusa ferramenta obrigatória com 400 (2026-11-05): fica o pedido escrito nas regras de quem chama.
    if (opts.forcarFerramenta && !/sonnet-5/.test(model)) body.tool_choice = { type: "tool", name: opts.forcarFerramenta };

    const res = await fetchDoProvedor("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": cred.api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }, { limiteMs: opts.limiteMs ?? 60_000 });
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
      tokens: { entrada: data.usage?.input_tokens ?? 0, saida: data.usage?.output_tokens ?? 0 },
    };
  }

  if (opts.anexo) throw new AIError("provider_error", "A leitura de anexos precisa do Claude.", 400);

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
    body.tool_choice = opts.forcarFerramenta ? { type: "function", function: { name: opts.forcarFerramenta } } : "auto";
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
    tokens: { entrada: data.usage?.prompt_tokens ?? 0, saida: data.usage?.completion_tokens ?? 0 },
  };
}

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
  return (await resolveUsuario(req))?.tenantId ?? null;
}

/** Quem está chamando: a pessoa e a empresa dela. Nulo sem login. */
export async function resolveUsuario(req: Request): Promise<{ userId: string; tenantId: string | null } | null> {
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
  if (profile?.tenant_id) return { userId: data.user.id, tenantId: profile.tenant_id };

  // Cliente do SAC: mesma pergunta, outro cadastro.
  const { data: customer } = await admin()
    .from("customer_profiles")
    .select("tenant_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  return { userId: data.user.id, tenantId: customer?.tenant_id ?? null };
}

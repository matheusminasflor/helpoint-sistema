// Gerenciamento das credenciais de IA do tenant (BYOK).
// A chave só entra por aqui e nunca sai: as respostas devolvem apenas
// provider, model, status e os 4 últimos caracteres (máscara).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AIProvider, DEFAULT_MODELS } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROVIDERS: AIProvider[] = ["anthropic", "openai", "google"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// O teste tinha fetch sem limite: com o Gemini que não respondia, o botão ficava em "Testando..."
// para sempre (dono, 2026-10-07; o log mostra o preflight e nenhuma resposta). 20 s e erro claro.
const TEMPO_DO_TESTE_MS = 20_000;

// 503/429/529 = o provedor ACEITOU a chave e está sem capacidade naquele modelo agora (dono,
// 2026-10-07: Gemini "This model is currently experiencing high demand"). Não é chave errada —
// salva, com o aviso. Recusar aqui deixava a empresa sem IA por um pico do provedor.
const OCUPADO = new Set([429, 503, 529]);
function chaveValidaModeloOcupado(status: number) {
  return {
    ok: true,
    aviso: `A chave foi aceita, mas o modelo está ocupado no provedor agora (${status}). Ela foi validada; se a IA demorar, tente de novo em instantes ou escolha outro modelo.`,
  };
}

/**
 * Os modelos que a CHAVE consegue usar, perguntados ao próprio provedor (dono, 2026-10-07: o nome
 * "gemini-3.8-flash" que o erro do Google sugeriu não respondia; em vez de adivinhar, a tela lista).
 * A chave vai no cabeçalho, nunca no endereço.
 */
async function listarModelos(provider: AIProvider, apiKey: string) {
  try {
    if (provider === "google") {
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
        headers: { "x-goog-api-key": apiKey },
        signal: AbortSignal.timeout(TEMPO_DO_TESTE_MS),
      });
      if (!res.ok) return { ok: false, error: `${res.status}: ${(await res.text()).slice(0, 200)}` };
      const data = await res.json();
      const modelos = (data.models ?? [])
        .filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m: { name: string }) => m.name.replace(/^models\//, ""))
        .filter((n: string) => n.startsWith("gemini"))
        .sort();
      return { ok: true, modelos };
    }
    const url = provider === "openai" ? "https://api.openai.com/v1/models" : "https://api.anthropic.com/v1/models";
    const headers: Record<string, string> = provider === "openai"
      ? { Authorization: `Bearer ${apiKey}` }
      : { "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(TEMPO_DO_TESTE_MS) });
    if (!res.ok) return { ok: false, error: `${res.status}: ${(await res.text()).slice(0, 200)}` };
    const data = await res.json();
    const modelos = (data.data ?? []).map((m: { id: string }) => m.id).sort();
    return { ok: true, modelos };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha de rede" };
  }
}

async function testProviderKey(provider: AIProvider, apiKey: string, model: string) {
  try {
    // Google pela rota própria (generateContent): a rota "compatível com OpenAI" ficou sem
    // responder até o limite de 150 s com o gemini-3.8-flash (log de 2026-10-07, POST 546).
    if (provider === "google") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          signal: AbortSignal.timeout(TEMPO_DO_TESTE_MS),
          headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }], generationConfig: { maxOutputTokens: 8 } }),
        },
      );
      if (res.ok) {
        await res.text();
        return { ok: true };
      }
      const t = await res.text();
      if (OCUPADO.has(res.status)) return chaveValidaModeloOcupado(res.status);
      return { ok: false, error: `${res.status}: ${t.slice(0, 200)}` };
    }
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: AbortSignal.timeout(TEMPO_DO_TESTE_MS),
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 8,
          messages: [{ role: "user", content: "ping" }],
        }),
      });
      if (res.ok) {
        await res.text();
        return { ok: true };
      }
      const t = await res.text();
      if (OCUPADO.has(res.status)) return chaveValidaModeloOcupado(res.status);
      return { ok: false, error: `${res.status}: ${t.slice(0, 200)}` };
    }

    const url = provider === "google"
      ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
      : "https://api.openai.com/v1/chat/completions";
    const res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(TEMPO_DO_TESTE_MS),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 8,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    if (res.ok) {
      await res.text();
      return { ok: true };
    }
    const t = await res.text();
    if (OCUPADO.has(res.status)) return chaveValidaModeloOcupado(res.status);
    return { ok: false, error: `${res.status}: ${t.slice(0, 200)}` };
  } catch (e) {
    if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) {
      return { ok: false, error: `O provedor não respondeu em ${TEMPO_DO_TESTE_MS / 1000} s. Confira o nome do modelo e tente de novo.` };
    }
    return { ok: false, error: e instanceof Error ? e.message : "Falha de rede" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
    const userId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await admin
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tenantId = profile?.tenant_id;
    if (!tenantId) return json({ error: "no_tenant" }, 403);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action: string = body.action ?? "status";

    // ── status: dados não sensíveis ──
    if (action === "status") {
      const { data } = await admin
        .from("tenant_ai_credentials")
        .select("provider, model, key_last4, is_active, updated_at")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .maybeSingle();
      return json({
        configured: !!data,
        provider: data?.provider ?? null,
        model: data?.model ?? null,
        key_last4: data?.key_last4 ?? null,
        updated_at: data?.updated_at ?? null,
      });
    }

    // Ações de escrita/teste exigem admin do tenant
    const { data: isAdmin } = await admin.rpc("is_admin_or_higher", { _user_id: userId });
    if (!isAdmin) return json({ error: "forbidden" }, 403);

    if (action === "delete") {
      await admin.from("tenant_ai_credentials").delete().eq("tenant_id", tenantId);
      return json({ ok: true, configured: false });
    }

    const provider = body.provider as AIProvider;
    if (!PROVIDERS.includes(provider)) return json({ error: "invalid_provider" }, 400);
    const model: string = (body.model || "").trim() || DEFAULT_MODELS[provider];

    if (action === "modelos") {
      let apiKey: string | undefined = typeof body.api_key === "string" ? body.api_key.trim() : "";
      if (!apiKey) {
        const { data } = await admin
          .from("tenant_ai_credentials")
          .select("api_key")
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .maybeSingle();
        apiKey = data?.api_key ?? "";
      }
      if (!apiKey) return json({ ok: false, error: "Nenhuma chave informada ou salva." }, 200);
      return json(await listarModelos(provider, apiKey));
    }

    if (action === "test") {
      let apiKey: string | undefined = typeof body.api_key === "string" ? body.api_key.trim() : "";
      if (!apiKey) {
        const { data } = await admin
          .from("tenant_ai_credentials")
          .select("api_key")
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .maybeSingle();
        apiKey = data?.api_key;
      }
      if (!apiKey) return json({ ok: false, error: "Nenhuma chave informada ou salva." }, 200);
      const result = await testProviderKey(provider, apiKey, model);
      return json(result);
    }

    if (action === "save") {
      const apiKey = typeof body.api_key === "string" ? body.api_key.trim() : "";
      if (apiKey.length < 12) return json({ error: "invalid_key" }, 400);

      // valida a chave antes de gravar
      const test = await testProviderKey(provider, apiKey, model);
      if (!test.ok && body.force !== true) {
        return json({ ok: false, error: test.error ?? "Chave rejeitada pelo provedor." }, 200);
      }

      await admin.from("tenant_ai_credentials").delete().eq("tenant_id", tenantId);
      const { error } = await admin.from("tenant_ai_credentials").insert({
        tenant_id: tenantId,
        provider,
        api_key: apiKey,
        key_last4: apiKey.slice(-4),
        model,
        is_active: true,
        created_by: userId,
      });
      if (error) return json({ error: error.message }, 400);

      return json({
        ok: true,
        configured: true,
        provider,
        model,
        key_last4: apiKey.slice(-4),
        aviso: (test as { aviso?: string }).aviso,
      });
    }

    return json({ error: "invalid_action" }, 400);
  } catch (e) {
    console.error("ai-credentials error:", e);
    return json({ error: "internal_error" }, 500);
  }
});

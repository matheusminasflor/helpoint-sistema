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

async function testProviderKey(provider: AIProvider, apiKey: string, model: string) {
  try {
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
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
      return { ok: false, error: `${res.status}: ${t.slice(0, 200)}` };
    }

    const url = provider === "google"
      ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
      : "https://api.openai.com/v1/chat/completions";
    const res = await fetch(url, {
      method: "POST",
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
    return { ok: false, error: `${res.status}: ${t.slice(0, 200)}` };
  } catch (e) {
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
      });
    }

    return json({ error: "invalid_action" }, 400);
  } catch (e) {
    console.error("ai-credentials error:", e);
    return json({ error: "internal_error" }, 500);
  }
});

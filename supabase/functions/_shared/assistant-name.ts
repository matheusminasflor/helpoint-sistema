import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const DEFAULT_ASSISTANT_NAME = "Lyra";

/**
 * Retorna o nome personalizado do assistente de IA configurado pelo tenant
 * (tenants.settings.lyra.customName), com fallback para "Lyra".
 */
export async function getAssistantName(tenantId: string | null | undefined): Promise<string> {
  if (!tenantId) return DEFAULT_ASSISTANT_NAME;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return DEFAULT_ASSISTANT_NAME;

  try {
    const admin = createClient(supabaseUrl, serviceKey);
    const { data } = await admin
      .from("tenants")
      .select("settings")
      .eq("id", tenantId)
      .single();

    // deno-lint-ignore no-explicit-any
    const name = (data?.settings as any)?.lyra?.customName;
    return typeof name === "string" && name.trim() ? name.trim() : DEFAULT_ASSISTANT_NAME;
  } catch (_e) {
    return DEFAULT_ASSISTANT_NAME;
  }
}

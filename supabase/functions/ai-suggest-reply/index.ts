import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callTenantAI, aiErrorResponse, resolveTenantId } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function authOrPublic(req: Request, body: any) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");
    const sb = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data, error } = await sb.auth.getUser(token);
    if (!error && data?.user?.id) return { authenticated: true, supabase: sb, tenantId: await resolveTenantId(req) };
  }

  const slug = body?.tenant_slug;
  if (typeof slug === "string" && slug.length > 0) {
    const sb = createClient(supabaseUrl, supabaseAnonKey);
    const { data } = await sb.rpc("get_sac_tenant_branding", { _slug: slug });
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.id) return { authenticated: false, supabase: sb, tenantId: row.id as string };
  }

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const auth = await authOrPublic(req, body);
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { ticketId, mode, context: rawContext, tone } = body as {
      ticketId?: string;
      mode?: string;
      context?: string;
      tone?: string;
    };

    let context = "";
    if (ticketId && auth.authenticated) {
      const { data: ticket, error: ticketError } = await auth.supabase
        .from("tickets")
        .select("title, description, status, priority, category, subcategory")
        .eq("id", ticketId)
        .single();

      if (ticketError || !ticket) {
        return new Response(JSON.stringify({ error: "Chamado não encontrado" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: comments } = await auth.supabase
        .from("ticket_comments")
        .select("content, is_internal, created_at")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: false })
        .limit(10);

      const commentsText = (comments || [])
        .reverse()
        .map((c: any) => `[${c.is_internal ? "Interno" : "Público"}] ${c.content}`)
        .join("\n");

      context = `CHAMADO #${ticketId}
Título: ${ticket.title}
Descrição: ${ticket.description}
Status: ${ticket.status} | Prioridade: ${ticket.priority}
Categoria: ${ticket.category || "N/A"} / ${ticket.subcategory || "N/A"}

HISTÓRICO DE COMENTÁRIOS:
${commentsText || "(sem comentários)"}`;
    } else if (rawContext) {
      context = rawContext;
    } else {
      return new Response(JSON.stringify({ error: "context ou ticketId é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompts: Record<string, string> = {
      reply: `Você é um técnico de suporte profissional do HELPOINT. Gere uma resposta útil e profissional para o chamado abaixo.

REGRAS:
1. Seja objetivo e educado
2. Baseie-se no contexto do chamado e histórico
3. Se possível, indique próximos passos claros
4. Tom ${tone || "profissional mas acessível"}
5. Responda em português brasileiro
6. Retorne APENAS o texto da resposta, sem explicações ou prefixos
7. Máximo 150 palavras`,

      resolution: `Você é um técnico de suporte profissional do HELPOINT. Gere uma descrição de resolução para o chamado abaixo.

REGRAS:
1. Estruture em: **Causa**, **Solução aplicada**, **Prevenção**
2. Use termos técnicos quando apropriado
3. Seja específico sobre as ações tomadas
4. Tom profissional e objetivo
5. Responda em português brasileiro
6. Retorne APENAS a descrição, sem explicações ou prefixos
7. Máximo 200 palavras`,
    };

    const systemPrompt = systemPrompts[mode || "reply"] || systemPrompts.reply;

    const result = await callTenantAI(auth.tenantId, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: context },
      ],
      maxTokens: 300,
      temperature: 0.4,
    });
    const suggestion = result.content?.trim() || "";

    return new Response(
      JSON.stringify({ suggestion, reply: suggestion }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const aiErr = aiErrorResponse(error, corsHeaders);
    if (aiErr) return aiErr;
    console.error("ai-suggest-reply error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

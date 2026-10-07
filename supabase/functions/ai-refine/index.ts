import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callTenantAI, aiErrorResponse, resolveTenantId } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ContextType = 'ticket_title' | 'ticket_description' | 'comment' | 'resolution' | 'checklist_description';

interface RequestBody {
  text: string;
  context: ContextType;
}

async function requireAuthOrPublicTenant(req: Request, body: any): Promise<string | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Backend keys are not configured");
  }

  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data?.user?.id) return await resolveTenantId(req); // autenticado OK
  }

  // Acesso público — exige tenant_slug válido (uso no formulário SAC público)
  const slug = body?.tenant_slug;
  if (typeof slug === "string" && slug.length > 0) {
    const sb = createClient(supabaseUrl, supabaseAnonKey);
    const { data } = await sb.rpc("get_sac_tenant_branding", { _slug: slug });
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.id) return row.id as string;
  }

  throw new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}


function getSystemPrompt(context: ContextType): string {
  // 2026-10-07, o dono: "quando refina está totalmente incorreto". O exemplo do título ensinava a
  // INVENTAR ("Impressora não funciona" → "Impressora HP LaserJet sem resposta na rede": ninguém disse
  // HP nem rede) e a descrição mandava "estruturar em Problema, Quando ocorre, Impacto", que a IA
  // preenchia com coisa que não estava no texto. Refinar é corrigir e clarear, nunca acrescentar.
  const baseRules = `Você revisa textos escritos por colaboradores de uma empresa brasileira no sistema HELPOINT.

O QUE FAZER:
1. Corrija ortografia, acentuação, pontuação e concordância
2. Deixe a frase mais clara e direta, no mesmo português do Brasil, com as palavras da pessoa sempre que possível
3. Mantenha EXATAMENTE os mesmos fatos, nomes, números, datas, produtos e pedidos do original

O QUE NUNCA FAZER:
- NUNCA acrescente informação, detalhe técnico, marca, modelo, causa, prazo ou seção que não esteja no texto
- NUNCA troque o assunto nem generalize ("pedido de arte do rótulo" continua sendo pedido de arte do rótulo)
- NUNCA responda à pessoa, comente o texto ou explique o que mudou
- Se o texto já estiver bom, devolva-o igual

Devolva APENAS o texto revisado, sem aspas e sem rótulos.`;

  const contextRules: Record<ContextType, string> = {
    ticket_title: `

É o TÍTULO de um chamado: uma frase curta, até 80 caracteres, sem ponto final.`,

    ticket_description: `

É a DESCRIÇÃO de um chamado: mantenha a ordem e os parágrafos da pessoa; só quebre em itens se ela já listou várias coisas.`,
    
    comment: `

É um COMENTÁRIO num chamado: tom educado e objetivo; mantenha a pergunta ou o pedido da pessoa.`,

    resolution: `

É a NOTA DE RESOLUÇÃO de um chamado: o que foi feito, com as palavras de quem fez. Não crie seções nem causa.`,

    checklist_description: `

É a DESCRIÇÃO de um checklist: curta e direta; não crie regras, critérios ou etapas.`,
  };

  return baseRules + (contextRules[context] || '');
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const tenantId = await requireAuthOrPublicTenant(req, body);

    const { text, context } = body as RequestBody & { tenant_slug?: string };

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Texto não pode estar vazio" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }


    const systemPrompt = getSystemPrompt(context || 'comment');

    const result = await callTenantAI(tenantId, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      // 200 era pouco: o Gemini 3 gasta parte do limite "pensando" e o texto saía cortado.
      maxTokens: 1024,
      temperature: 0.2,
    });
    // Sem as aspas que alguns modelos devolvem em volta.
    const refinedText = result.content?.trim().replace(/^["“”']+|["“”']+$/g, "").trim() || text;

    return new Response(
      JSON.stringify({ refined: refinedText }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    if (error instanceof Response) return error;
    const aiErr = aiErrorResponse(error, corsHeaders);
    if (aiErr) return aiErr;
    console.error("ai-refine error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

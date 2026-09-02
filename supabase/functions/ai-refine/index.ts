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
  const baseRules = `Você é um assistente de escrita profissional do HELPOINT. Sua função é refinar textos para torná-los mais claros, objetivos e profissionais.

REGRAS GERAIS:
1. Mantenha o significado original
2. Corrija erros de gramática e ortografia
3. Use linguagem profissional mas acessível
4. Seja conciso - remova palavras desnecessárias
5. NÃO adicione informações que não estavam no original
6. Retorne APENAS o texto refinado, sem explicações`;

  const contextRules: Record<ContextType, string> = {
    ticket_title: `

CONTEXTO: Título de chamado de suporte
- Máximo 80 caracteres
- Comece com verbo ou substantivo
- Seja específico sobre o problema
- Exemplo: "Impressora não funciona" → "Impressora HP LaserJet sem resposta na rede"`,
    
    ticket_description: `

CONTEXTO: Descrição de chamado de suporte
- Estruture em: Problema, Quando ocorre, Impacto
- Use bullet points se apropriado
- Inclua detalhes técnicos relevantes
- Evite linguagem emocional`,
    
    comment: `

CONTEXTO: Comentário em chamado
- Tom profissional e objetivo
- Se for atualização, indique claramente o status
- Se for pergunta, seja específico
- Evite informalidades excessivas`,
    
    resolution: `

CONTEXTO: Notas de resolução técnica
- Estruture em: Causa raiz, Solução aplicada, Prevenção
- Use termos técnicos apropriados
- Seja específico sobre as ações tomadas
- Inclua informações úteis para casos futuros`,

    checklist_description: `

CONTEXTO: Descrição geral de checklist operacional
- Explique com clareza a finalidade do checklist
- Indique quando ele deve ser usado
- Mantenha tom administrativo e operacional
- Seja curto, claro e direto
- NÃO invente regras, critérios ou etapas que não existam`,
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
        { role: "user", content: `Refine o seguinte texto:\n\n"${text}"` },
      ],
      maxTokens: 200,
      temperature: 0.3,
    });
    const refinedText = result.content?.trim() || text;

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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callTenantAI, aiErrorResponse, resolveUsuario } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ContextType = 'general' | 'title_from_description' | 'ticket_title' | 'ticket_description' | 'comment' | 'resolution' | 'checklist_description';

interface RequestBody {
  text: string;
  context: ContextType;
}

const MAX_CARACTERES = 4000;

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
    general: `

É um texto interno da empresa: mantenha o formato e o tamanho da pessoa.`,

    title_from_description: `

O texto é a DESCRIÇÃO de um chamado. Devolva só um TÍTULO para ela: uma frase curta, até 80 caracteres, sem ponto final.`,

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
    const usuario = await resolveUsuario(req);
    if (!usuario) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { text, context } = body as RequestBody;

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Texto não pode estar vazio" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }


    if (text.length > MAX_CARACTERES) {
      return new Response(
        JSON.stringify({ error: "texto_longo", message: `O texto passa de ${MAX_CARACTERES} caracteres. Encurte para melhorar com IA.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = getSystemPrompt(context || 'comment');

    const result = await callTenantAI(usuario.tenantId, {
      uso: { userId: usuario.userId, recurso: `melhorar_${context || 'comment'}`, guardar: true },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      maxTokens: 700,
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

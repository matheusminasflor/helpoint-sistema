import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callTenantAI, aiErrorResponse, resolveTenantId } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { metrics, period } = body;

    const tenantId = await resolveTenantId(req);

    const systemPrompt = `Você é um Analista Sênior de TI e Consultor de Gestão com 20 anos de experiência.
Sua função é analisar os indicadores operacionais de TI e fornecer uma análise executiva para o líder do setor.

ESTRUTURA DA ANÁLISE (siga exatamente):

## Resumo Executivo
Uma frase resumindo o estado geral da operação de TI no período.

## Pontos de Atenção
Lista dos itens que precisam de atenção imediata, com dados específicos.

## Áreas que Precisam de Melhoria
Identifique onde o desempenho está abaixo do esperado e sugira ações concretas.

## Riscos Operacionais
Riscos identificados com base nos dados (ex: licenças expirando, SLA baixo, manutenções atrasadas).

## Recomendações
Ações práticas e priorizadas que o líder deve tomar.

REGRAS:
- Use dados específicos dos indicadores fornecidos (números, percentuais)
- Seja direto e objetivo
- Priorize por impacto no negócio
- Não invente dados que não foram fornecidos
- Use formatação markdown para clareza
- Máximo 500 palavras`;

    const userPrompt = `Analise os seguintes indicadores de TI do período "${period}":

${JSON.stringify(metrics, null, 2)}

Forneça sua análise executiva completa.`;

    const result = await callTenantAI(tenantId, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 1500,
      temperature: 0.3,
    });
    const analysis = result.content || "Não foi possível gerar a análise.";

    return new Response(
      JSON.stringify({ analysis }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const aiErr = aiErrorResponse(e, corsHeaders);
    if (aiErr) return aiErr;
    console.error("analyze-indicators error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

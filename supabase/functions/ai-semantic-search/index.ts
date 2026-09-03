import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callTenantAI, aiErrorResponse } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user and get tenant
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;

    // Get user's tenant
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .single();

    if (profileError || !profile?.tenant_id) {
      return new Response(
        JSON.stringify({ error: "User not associated with tenant" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { query } = await req.json();

    if (!query || typeof query !== "string" || query.trim().length < 3) {
      return new Response(
        JSON.stringify({ results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all active POPs for the tenant
    const { data: pops, error: popsError } = await supabase
      .from("pops")
      .select("id, title, keywords, category, content")
      .eq("tenant_id", profile.tenant_id)
      .eq("is_active", true);

    if (popsError) {
      console.error("Error fetching POPs:", popsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch articles" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!pops || pops.length === 0) {
      return new Response(
        JSON.stringify({ results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prepare articles summary for AI
    const articlesSummary = pops.map((p) => {
      const contentPreview = p.content?.substring(0, 200) || "";
      return `ID: ${p.id} | Título: ${p.title} | Categoria: ${p.category || "Geral"} | Tags: ${(p.keywords || []).join(", ")} | Prévia: ${contentPreview}`;
    }).join("\n");

    // Chama a IA do tenant para o casamento semântico
    const aiResult = await callTenantAI(profile.tenant_id, {
      messages: [
        {
          role: "system",
          content: `Você é um assistente que ajuda a encontrar artigos relevantes em uma base de conhecimento corporativa.
Analise a pergunta do usuário e retorne os IDs dos artigos mais relevantes com uma pontuação de 0 a 100.
Considere sinônimos, contexto e intenção do usuário. Retorne no máximo 5 artigos, ordenados por relevância.
Responda SEMPRE chamando a função rank_articles.`,
        },
        {
          role: "user",
          content: `Pergunta do usuário: "${query}"\n\nArtigos disponíveis:\n${articlesSummary}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "rank_articles",
            description: "Retorna os artigos mais relevantes para a pergunta do usuário",
            parameters: {
              type: "object",
              properties: {
                results: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      score: { type: "number" },
                      reason: { type: "string" },
                    },
                    required: ["id", "score", "reason"],
                  },
                },
              },
              required: ["results"],
            },
          },
        },
      ],
      maxTokens: 800,
    });

    // Parse the tool call response
    let rankedResults: Array<{ id: string; score: number; reason: string }> = [];

    if (aiResult.tool_calls?.[0]) {
      const toolCall = aiResult.tool_calls[0];
      try {
        const args = JSON.parse(toolCall.function.arguments);
        rankedResults = args.results || [];
      } catch (e) {
        console.error("Error parsing AI response:", e);
      }
    }

    // Enrich results with article details
    const enrichedResults = rankedResults
      .filter((r) => r.score >= 30) // Only include results with score >= 30
      .map((r) => {
        const article = pops.find((p) => p.id === r.id);
        return {
          id: r.id,
          title: article?.title || "Artigo não encontrado",
          category: article?.category || null,
          score: r.score,
          reason: r.reason,
        };
      })
      .slice(0, 5);

    return new Response(
      JSON.stringify({ results: enrichedResults }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const aiErr = aiErrorResponse(error, corsHeaders);
    if (aiErr) return aiErr;
    console.error("Semantic search error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", results: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

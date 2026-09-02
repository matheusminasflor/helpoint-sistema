import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.91.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MatchRequest {
  title: string;
  description?: string;
  category?: string;
  useAI?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile?.tenant_id) {
      return new Response(JSON.stringify({ error: 'User not associated with tenant' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { title, description, category, useAI }: MatchRequest = await req.json();

    if (!title?.trim()) {
      return new Response(JSON.stringify({ match: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let query = supabase
      .from('pops')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('is_active', true);

    if (category) {
      query = query.or(`category.eq.${category},category.is.null`);
    }

    const { data: pops, error: popsError } = await query;

    if (popsError || !pops || pops.length === 0) {
      return new Response(JSON.stringify({ match: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const inputText = `${title} ${description || ''}`.toLowerCase();
    const inputWords = inputText.split(/\s+/).filter(w => w.length > 2);

    // Score each POP
    const scoredPOPs = pops.map(pop => {
      const keywords = pop.keywords || [];
      let score = 0;
      let matchedKeywords: string[] = [];

      keywords.forEach((keyword: string) => {
        const kw = keyword.toLowerCase();
        if (inputWords.some(w => w.includes(kw) || kw.includes(w))) {
          score += 2;
          matchedKeywords.push(keyword);
        }
      });

      const popTitleWords = pop.title.toLowerCase().split(/\s+/);
      inputWords.forEach(inputWord => {
        if (popTitleWords.some((tw: string) => tw.includes(inputWord) || inputWord.includes(tw))) {
          score += 1;
        }
      });

      const maxPossibleScore = (keywords.length * 2) + popTitleWords.length;
      const confidence = maxPossibleScore > 0 ? Math.min(score / maxPossibleScore, 1) : 0;

      return { pop, score, confidence, matchedKeywords };
    });

    scoredPOPs.sort((a, b) => b.score - a.score);
    const bestMatch = scoredPOPs[0];

    // If useAI flag and no good keyword match, try AI
    if (useAI && (!bestMatch || bestMatch.confidence < 0.3)) {
      try {
        const aiResult = await callTenantAI(profile.tenant_id, {
          messages: [
            {
              role: 'system',
              content: `Você é um assistente que encontra tutoriais relevantes. Analise o problema e retorne os IDs dos tutoriais mais relevantes com uma pontuação de confiança (0-1). Responda SEMPRE chamando a função select_tutorials.`
            },
            {
              role: 'user',
              content: `Problema do usuário: "${title} ${description || ''}"\n\nTutoriais disponíveis:\n${pops.map(p => `- ID: ${p.id} | Título: ${p.title} | Keywords: ${(p.keywords || []).join(', ')}`).join('\n')}`
            }
          ],
          tools: [{
            type: 'function',
            function: {
              name: 'select_tutorials',
              description: 'Seleciona os tutoriais mais relevantes',
              parameters: {
                type: 'object',
                properties: {
                  matches: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: { id: { type: 'string' }, confidence: { type: 'number' } },
                      required: ['id', 'confidence']
                    }
                  }
                },
                required: ['matches']
              }
            }
          }],
          maxTokens: 600,
        });

        const toolCall = aiResult.tool_calls?.[0];
        if (toolCall?.function?.arguments) {
          const parsed = JSON.parse(toolCall.function.arguments);
          if (parsed.matches && parsed.matches.length > 0) {
            const aiMatches = parsed.matches
              .filter((m: any) => m.confidence >= 0.3)
              .slice(0, 3)
              .map((m: any) => {
                const pop = pops.find(p => p.id === m.id);
                return pop ? {
                  pop: { id: pop.id, title: pop.title, content: pop.content, keywords: pop.keywords || [] },
                  confidence: m.confidence,
                  keywords: pop.keywords || []
                } : null;
              })
              .filter(Boolean);

            if (aiMatches.length > 0) {
              return new Response(JSON.stringify({ match: true, matches: aiMatches }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
          }
        }
      } catch (e) {
        // Sem credencial de IA do tenant: segue apenas com o match por palavras-chave
        if (!(e instanceof AIError)) console.error('AI matching error:', e);
      }
    }

    if (bestMatch && bestMatch.confidence >= 0.3) {
      return new Response(JSON.stringify({
        match: true,
        pop: {
          id: bestMatch.pop.id,
          title: bestMatch.pop.title,
          content: bestMatch.pop.content,
          preview: bestMatch.pop.content.slice(0, 200).replace(/[#*_]/g, ''),
          confidence: Math.round(bestMatch.confidence * 100) / 100,
          keywords: bestMatch.matchedKeywords,
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ match: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in ai-match-pop:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error', match: false }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.91.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TicketSummary {
  id: string;
  title: string;
  description: string;
  category: string | null;
}

interface Pattern {
  pattern_name: string;
  description: string;
  category: string | null;
  keywords: string[];
  ticket_ids: string[];
  occurrence_count: number;
  suggested_pop: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if user is supervisor or higher
    const { data: roleCheck } = await supabase.rpc('is_supervisor_or_higher', { _user_id: user.id });
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user's tenant
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

    // Fetch tickets from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Optional module filter from request body (tickets/marketing/qualidade)
    let bodyModule: string | null = null;
    try {
      const body = await req.json().catch(() => null);
      if (body && typeof body.module === 'string') bodyModule = body.module;
    } catch (_) { /* no body */ }

    let ticketsQuery = supabase
      .from('tickets')
      .select('id, title, description, category, module')
      .eq('tenant_id', profile.tenant_id)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(200);

    if (bodyModule) {
      ticketsQuery = ticketsQuery.eq('module', bodyModule);
    }

    const { data: tickets, error: ticketsError } = await ticketsQuery;

    if (ticketsError) {
      throw ticketsError;
    }

    if (!tickets || tickets.length < 5) {
      return new Response(JSON.stringify({ 
        patterns: [],
        message: 'Não há chamados suficientes para análise (mínimo 5)' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Simple pattern detection using keyword frequency
    const wordFrequency: Record<string, { count: number; tickets: string[]; categories: string[] }> = {};
    
    // Common stop words to ignore
    const stopWords = new Set([
      'o', 'a', 'os', 'as', 'um', 'uma', 'de', 'da', 'do', 'das', 'dos',
      'em', 'na', 'no', 'nas', 'nos', 'para', 'por', 'com', 'sem',
      'que', 'e', 'ou', 'não', 'nao', 'se', 'como', 'mais', 'mas',
      'está', 'esta', 'ser', 'ter', 'meu', 'minha', 'seu', 'sua',
      'quando', 'muito', 'já', 'ja', 'também', 'tambem'
    ]);

    tickets.forEach(ticket => {
      const text = `${ticket.title} ${ticket.description || ''}`.toLowerCase();
      const words = text.split(/[\s,.\-!?;:()]+/).filter(w => 
        w.length > 3 && !stopWords.has(w) && !/^\d+$/.test(w)
      );

      // Use bigrams for better pattern detection
      const bigrams: string[] = [];
      for (let i = 0; i < words.length - 1; i++) {
        bigrams.push(`${words[i]} ${words[i + 1]}`);
      }

      [...words, ...bigrams].forEach(word => {
        if (!wordFrequency[word]) {
          wordFrequency[word] = { count: 0, tickets: [], categories: [] };
        }
        if (!wordFrequency[word].tickets.includes(ticket.id)) {
          wordFrequency[word].count++;
          wordFrequency[word].tickets.push(ticket.id);
          if (ticket.category) {
            wordFrequency[word].categories.push(ticket.category);
          }
        }
      });
    });

    // Find patterns (words/phrases appearing in 3+ tickets)
    const significantPatterns = Object.entries(wordFrequency)
      .filter(([_, data]) => data.count >= 3)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);

    // Group similar patterns together
    const patterns: Pattern[] = significantPatterns.map(([keyword, data]) => {
      // Find most common category
      const categoryCounts: Record<string, number> = {};
      data.categories.forEach(cat => {
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      });
      const mainCategory = Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

      // Generate pattern name
      const patternName = keyword.charAt(0).toUpperCase() + keyword.slice(1);

      // Generate suggested POP content
      const suggestedPop = `Tutorial para resolver problemas relacionados a: ${keyword}`;

      return {
        pattern_name: patternName,
        description: `Problema recorrente detectado em ${data.count} chamados`,
        category: mainCategory,
        keywords: [keyword],
        ticket_ids: data.tickets.slice(0, 10),
        occurrence_count: data.count,
        suggested_pop: suggestedPop,
      };
    });

    return new Response(JSON.stringify({ 
      patterns,
      analyzed_tickets: tickets.length,
      period_days: 30,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-analyze-patterns:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage, patterns: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

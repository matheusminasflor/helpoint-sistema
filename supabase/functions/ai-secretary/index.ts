import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { streamTenantAI, aiErrorResponse } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Task {
  title: string;
  priority: number;
  due_date: string | null;
  status: string;
  is_ai_suggested: boolean;
}

interface Ticket {
  ticket_number: number;
  title: string;
  priority: string;
  status: string;
  sla_due_at: string | null;
  category: string | null;
}

interface KanbanCardInput {
  title: string;
  priority: string;
  due_date: string | null;
  board_name?: string;
  column_name?: string;
}

interface LyraConfig {
  customName?: string;
  tone?: 'formal' | 'semiformal' | 'casual';
  companyContext?: string;
  customInstructions?: string;
  priorityFocus?: string[];
  greeting?: string;
  enabled?: boolean;
}

interface RoutineInput {
  title: string;
  scheduled_time: string;
  priority_rank: number;
}

interface RequestBody {
  user_name: string;
  current_hour: number;
  tasks: Task[];
  tickets: Ticket[];
  kanban_cards?: KanbanCardInput[];
  user_modules?: string[];
  routines?: RoutineInput[];
}

async function requireAuthenticatedUser(req: Request): Promise<{ userId: string; tenantId: string | null }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Backend keys are not configured");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Get tenant_id from profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .single();

  return { userId: user.id, tenantId: profile?.tenant_id || null };
}

async function getTenantLyraConfig(authHeader: string, tenantId: string): Promise<LyraConfig> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) return {};

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data } = await supabase
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .single();

  // deno-lint-ignore no-explicit-any
  return (data?.settings as any)?.lyra || {};
}

function getGreeting(hour: number): string {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function getToneInstruction(tone?: LyraConfig['tone']): string {
  switch (tone) {
    case 'formal':
      return 'Use tom estritamente profissional e objetivo. Evite coloquialismos.';
    case 'casual':
      return 'Use tom amigável e descontraído, mantendo profissionalismo.';
    case 'semiformal':
    default:
      return 'Sua personalidade é profissional, acolhedora e eficiente.';
  }
}

function getPriorityInstruction(priorities?: string[]): string {
  if (!priorities || priorities.length === 0) return '';
  
  const instructions: string[] = [];
  if (priorities.includes('sla')) instructions.push('cumprimento de SLA');
  if (priorities.includes('customer')) instructions.push('satisfação do cliente');
  if (priorities.includes('efficiency')) instructions.push('eficiência operacional');
  if (priorities.includes('costs')) instructions.push('redução de custos');
  
  if (instructions.length === 0) return '';
  return `\nFOCO PRIORITÁRIO: ${instructions.join(', ')}.`;
}

function buildSystemPrompt(config: LyraConfig): string {
  const name = config.customName || 'Lyra';
  const tone = getToneInstruction(config.tone);
  const context = config.companyContext ? `\nCONTEXTO DA EMPRESA: ${config.companyContext}` : '';
  const priorities = getPriorityInstruction(config.priorityFocus);
  const custom = config.customInstructions ? `\nINSTRUÇÕES ADICIONAIS DO CLIENTE: ${config.customInstructions}` : '';

  return `Você é ${name}, secretária executiva sênior do colaborador no HELPOINT. ${tone}
${context}${priorities}${custom}

IDENTIDADE:
- Você é uma consultora de tempo: prioriza, organiza e orienta com precisão cirúrgica
- Cada item mencionado DEVE existir nos dados fornecidos pelo sistema
- NUNCA invente chamados, cards ou tarefas que não existam nos dados
- NUNCA mencione o mesmo item mais de uma vez - duplicar é erro grave

ESTRUTURA OBRIGATÓRIA (siga exatamente):
1. Saudação (1 frase, nome do usuário)
2. Avaliação do dia: comece com "Dia tranquilo.", "Dia moderado." ou "Dia intenso." seguido de 1 frase com o motivo
3. Lista NUMERADA (máximo 5 itens), na ordem recomendada de execução:
   - Formato: N. [Tipo] identificador - ação concreta (motivo curto)
   - Tipos válidos: [Chamado] [Projeto] [Tarefa]
4. Frase de fechamento com recomendação de foco específica

REGRAS INVIOLÁVEIS:
- Chamados: SEMPRE use EXATAMENTE o ticket_number fornecido nos dados precedido de # (ex: se ticket_number é 17, escreva #17). NUNCA invente ou altere números de chamados.
- Cards Kanban: SEMPRE título entre aspas duplas (ex: "Deploy v2.1")
- Tarefas: SEMPRE título entre aspas duplas (ex: "Revisar documentacao")
- ZERO markdown (**, *, ##, etc.). ZERO emojis
- Máximo 120 palavras no total
- Ordem de prioridade: SLA vencendo > Críticos > Atrasados > Vencendo hoje > Outros
- Se NÃO houver NENHUM item nos dados (0 tickets, 0 cards, 0 tarefas): responda "Dia tranquilo." seguido de UMA sugestão proativa do departamento do usuário.
  NUNCA cite números de chamados (#) ou títulos específicos quando não existem nos dados.
  NUNCA invente demandas. Se os dados estão vazios, os dados estão VAZIOS.
  A sugestão proativa DEVE usar o formato: [Ação] "Nome da Ação" - descrição curta
  Escolha 1 sugestão da lista de SUGESTÕES PROATIVAS que será incluída nos dados do usuário.
- CADA ITEM UMA ÚNICA VEZ. Repetir qualquer item = erro grave
- Só mencione itens que existam nos dados. Inventar = erro grave
- Se os dados dizem "NENHUM ticket aberto", NÃO mencione nenhum # de chamado

EXEMPLO QUANDO NÃO HÁ DADOS:
Boa tarde, Carlos!

Dia tranquilo. Nenhuma demanda pendente no momento.

1. [Ação] "Novo chamado" - Verificar se há demandas externas não registradas no sistema

Aproveite o momento para antecipar rotinas e manter tudo organizado.`;
}


function getProactiveSuggestions(modules: string[]): string {
  const suggestions: Record<string, string[]> = {
    ti: [
      '"Novo chamado" - Verificar se há demandas externas de TI não registradas no sistema',
      '"Manutenções" - Antecipar manutenções preventivas antes que se tornem corretivas',
      '"Revisar POPs" - Atualizar procedimentos operacionais para manter a base de conhecimento em dia',
    ],
    marketing: [
      '"Cronograma Social" - Revisar posts agendados e antecipar conteúdo para as redes',
      '"Eventos" - Verificar eventos próximos e pendências de organização',
      '"Fornecedores" - Atualizar cadastro de fornecedores e verificar orçamentos pendentes',
    ],
    comercial: [
      '"Pipeline" - Revisar oportunidades comerciais e follow-ups pendentes',
      '"Novo chamado" - Registrar demandas comerciais não capturadas no sistema',
    ],
    rh: [
      '"Novo chamado" - Registrar solicitações de RH pendentes no sistema',
      '"Criar POP" - Documentar um processo de gestão de pessoas que ainda não possui procedimento',
    ],
    financeiro: [
      '"Novo chamado" - Registrar demandas financeiras pendentes no sistema',
      '"Revisar POPs" - Atualizar procedimentos financeiros e compliance',
    ],
    producao: [
      '"Novo chamado" - Registrar demandas de produção não capturadas',
      '"Manutenções" - Verificar manutenções preventivas de equipamentos',
    ],
    qualidade: [
      '"Criar POP" - Documentar procedimento de qualidade pendente',
      '"Revisar POPs" - Atualizar procedimentos de qualidade existentes',
    ],
  };

  // Collect suggestions from user's modules
  const collected: string[] = [];
  for (const mod of modules) {
    const modSuggestions = suggestions[mod.toLowerCase()];
    if (modSuggestions) {
      collected.push(...modSuggestions);
    }
  }

  // Add generic fallbacks if no module-specific ones found
  if (collected.length === 0) {
    collected.push(
      '"Novo chamado" - Verificar se há demandas externas não registradas no sistema',
      '"Criar POP" - Documentar um processo recorrente que ainda não possui procedimento',
      '"Revisar POPs" - Atualizar procedimentos operacionais existentes',
    );
  }

  // Deduplicate
  const unique = [...new Set(collected)];
  return unique.map(s => `    * [Ação] ${s}`).join('\n');
}

function buildUserPrompt(data: RequestBody): string {
  const { user_name, current_hour, tasks, kanban_cards, user_modules } = data;
  const greeting = getGreeting(current_hour);
  
  // Deduplicate tickets by ticket_number
  const rawTickets = data.tickets || [];
  const tickets = rawTickets.filter((t, i, arr) => 
    arr.findIndex(x => x.ticket_number === t.ticket_number) === i
  );
  
  const now = new Date();
  const overdueTickets = tickets.filter(t => {
    if (!t.sla_due_at) return false;
    return new Date(t.sla_due_at) < now;
  });
  
  const criticalTickets = tickets.filter(t => t.priority === 'critical' || t.priority === 'high');
  
  const overdueTasks = tasks.filter(t => {
    if (!t.due_date) return false;
    return new Date(t.due_date) < now && t.status !== 'completed';
  });
  
  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
  
  let context = `CONTEXTO DO USUÁRIO:
- Nome: ${user_name || 'Usuário'}
- Horário atual: ${current_hour}h (${greeting})
- Data: ${now.toLocaleDateString('pt-BR')}

TICKETS ABERTOS (${tickets.length} total):${tickets.length === 0 ? ' NENHUM ticket aberto. NÃO cite nenhum número de chamado (#).' : ''}`;
  
  if (overdueTickets.length > 0) {
    context += `\nCOM SLA VENCIDO (${overdueTickets.length}):`;
    overdueTickets.forEach(t => {
      const hoursOverdue = Math.round((now.getTime() - new Date(t.sla_due_at!).getTime()) / (1000*60*60));
      context += `\n  - #${t.ticket_number}: ${t.title} [${t.priority.toUpperCase()}] (vencido há ${hoursOverdue}h)`;
    });
  }
  
  if (criticalTickets.length > 0) {
    context += `\nCRÍTICOS/ALTA PRIORIDADE (${criticalTickets.length}):`;
    criticalTickets.slice(0, 5).forEach(t => {
      const slaInfo = t.sla_due_at ? ` (SLA: ${new Date(t.sla_due_at).toLocaleString('pt-BR')})` : '';
      context += `\n  - #${t.ticket_number}: ${t.title}${slaInfo}`;
    });
  }
  
  const otherTickets = tickets.filter(t => 
    !overdueTickets.includes(t) && !criticalTickets.includes(t)
  );
  if (otherTickets.length > 0) {
    context += `\nOUTROS TICKETS (${otherTickets.length}):`;
    otherTickets.slice(0, 10).forEach(t => {
      const slaInfo = t.sla_due_at ? ` (SLA: ${new Date(t.sla_due_at).toLocaleString('pt-BR')})` : '';
      context += `\n  - #${t.ticket_number}: ${t.title} [${t.priority.toUpperCase()}]${slaInfo}`;
    });
  }
  
  context += `\n\nTAREFAS PESSOAIS (${pendingTasks.length} pendentes):`;
  
  if (overdueTasks.length > 0) {
    context += `\nATRASADAS (${overdueTasks.length}):`;
    overdueTasks.forEach(t => {
      const dueDate = t.due_date ? new Date(t.due_date).toLocaleDateString('pt-BR') : '';
      context += `\n  - ${t.title} (era para ${dueDate}) [Prioridade ${t.priority}]`;
    });
  }
  
  const todayTasks = pendingTasks.filter(t => {
    if (!t.due_date) return false;
    const dueDate = new Date(t.due_date);
    return dueDate.toDateString() === now.toDateString();
  });
  
  if (todayTasks.length > 0) {
    context += `\nPARA HOJE (${todayTasks.length}):`;
    todayTasks.forEach(t => {
      const aiTag = t.is_ai_suggested ? ' [Sugestão IA]' : '';
      context += `\n  - ${t.title} [Prioridade ${t.priority}]${aiTag}`;
    });
  }
  
  const futureTasks = pendingTasks.filter(t => {
    if (!t.due_date) return true;
    const dueDate = new Date(t.due_date);
    return dueDate > now && dueDate.toDateString() !== now.toDateString();
  });
  
  if (futureTasks.length > 0) {
    context += `\nOutras tarefas pendentes: ${futureTasks.length}`;
  }

  // Kanban cards section — deduplicate by title to prevent AI from repeating same card
  const rawCards = kanban_cards || [];
  const cards = rawCards.filter((c, i, arr) => arr.findIndex(x => x.title === c.title) === i);
  if (cards.length > 0) {
    const overdueCards = cards.filter(c => {
      if (!c.due_date) return false;
      return new Date(c.due_date) < now;
    });
    const todayCards = cards.filter(c => {
      if (!c.due_date) return false;
      return new Date(c.due_date).toDateString() === now.toDateString();
    });

    context += `\n\nPROJETOS KANBAN (${cards.length} cards atribuídos):`;

    if (overdueCards.length > 0) {
      context += `\nATRASADOS (${overdueCards.length}):`;
      overdueCards.forEach(c => {
        const daysOverdue = Math.round((now.getTime() - new Date(c.due_date!).getTime()) / (1000*60*60*24));
        context += `\n  - "${c.title}" no projeto ${c.board_name || 'Kanban'} (${c.column_name || '?'}) [${(c.priority || 'medium').toUpperCase()}] (atrasado ${daysOverdue}d)`;
      });
    }

    if (todayCards.length > 0) {
      context += `\nVENCENDO HOJE (${todayCards.length}):`;
      todayCards.forEach(c => {
        context += `\n  - "${c.title}" no projeto ${c.board_name || 'Kanban'} (${c.column_name || '?'}) [${(c.priority || 'medium').toUpperCase()}]`;
      });
    }

    const otherCards = cards.filter(c => !overdueCards.includes(c) && !todayCards.includes(c));
    if (otherCards.length > 0) {
      context += `\nOutros cards: ${otherCards.length} em andamento`;
    }
  }
  
  // Routines section
  const routines = data.routines || [];
  if (routines.length > 0) {
    context += `\n\nROTINAS DO DIA (${routines.length} programadas):`;
    routines.sort((a, b) => a.priority_rank - b.priority_rank);
    routines.forEach((r, i) => {
      const time = r.scheduled_time.slice(0, 5);
      context += `\n  ${i + 1}. [${time}] ${r.title}`;
    });
    context += `\nINCLUA as rotinas no briefing informando o plano do dia com horários.`;
  }

  // Add proactive suggestions based on user modules
  const proactiveSuggestions = getProactiveSuggestions(user_modules || []);
  context += `\n\nSUGESTÕES PROATIVAS (use APENAS quando não houver nenhum item acima):\n${proactiveSuggestions}`;

  context += `\n\nIMPORTANTE: Os dados acima são EXAUSTIVOS. Não mencione nenhum item que não esteja listado acima. Cada chamado, card e tarefa deve aparecer NO MÁXIMO uma vez na sua resposta. Inventar itens ou duplicar = erro grave.`;
  context += `\n\nGere o briefing executivo do dia para ${user_name || 'o usuário'}, com avaliação de intensidade e ordem recomendada de execução.`;
  
  return context;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    // Ensure only authenticated users can use this endpoint (prevents credit abuse)
    const { tenantId } = await requireAuthenticatedUser(req);

    // Fetch tenant-specific Lyra configuration
    let lyraConfig: LyraConfig = {};
    if (tenantId) {
      lyraConfig = await getTenantLyraConfig(authHeader, tenantId);
    }

    // Check if Lyra is disabled for this tenant
    if (lyraConfig.enabled === false) {
      return new Response(
        JSON.stringify({ error: "Lyra está desativada para este tenant" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: RequestBody = await req.json();
    const systemPrompt = buildSystemPrompt(lyraConfig);
    const userPrompt = buildUserPrompt(body);

    return await streamTenantAI(
      tenantId,
      {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        maxTokens: 600,
        temperature: 0.4,
      },
      corsHeaders,
    );
  } catch (error) {
    if (error instanceof Response) return error;
    const aiErr = aiErrorResponse(error, corsHeaders);
    if (aiErr) return aiErr;
    console.error("ai-secretary error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

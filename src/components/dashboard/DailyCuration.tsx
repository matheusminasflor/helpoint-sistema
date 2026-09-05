import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import type { KanbanCardItem } from '@/hooks/useAISecretary';
import { ptBR } from 'date-fns/locale';
import { 
  Play, RefreshCw, Ticket, CheckCircle2, ChevronRight, ChevronDown,
  LayoutGrid, BookOpen, Settings, Send, Mic, TrendingUp,
  Sparkles, Megaphone, CalendarDays, PartyPopper, Package,
  ClipboardCheck, Clock, Flame, Zap, Target, Plus,
  BarChart3, FileText, Monitor, Calendar, Users, ShieldCheck, Bell, Repeat, AlertTriangle, type LucideIcon
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { useLyraChat } from '@/hooks/useLyraChat';
import { LyraAvatar } from '@/components/ai/LyraAvatar';
import { useAssistantName } from '@/hooks/useAssistantName';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAISecretary } from '@/hooks/useAISecretary';
import { useVisibleModules } from '@/hooks/useVisibleModules';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { VoiceRecorderBar } from '@/components/ui/VoiceRecorderBar';
import { usePersonalPerformance } from '@/hooks/usePersonalPerformance';
import type { Task } from '@/types/database';
import { KPICard } from '@/components/glpi/KPICard';

interface Suggestion {
  icon: LucideIcon;
  label: string;
  desc: string;
  route: string;
}

function getContextualSuggestions(modules: ReturnType<typeof useVisibleModules>): Suggestion[] {
  const s: Suggestion[] = [];
  if (modules.showTI) {
    s.push({ icon: BarChart3, label: 'Indicadores de SLA', desc: 'Analise tempos e metas', route: '/ti/indicadores' });
    s.push({ icon: Monitor, label: 'Inventário', desc: 'Verifique ativos e licenças', route: '/inventario' });
  }
  if (modules.showMarketing) {
    s.push({ icon: Megaphone, label: 'Cronograma Social', desc: 'Planeje publicações', route: '/mkt/social' });
    s.push({ icon: CalendarDays, label: 'Eventos', desc: 'Próximos eventos do mês', route: '/mkt/social' });
  }
  if (modules.showPortal) {
    s.push({ icon: FileText, label: 'POPs do Setor', desc: 'Atualize procedimentos', route: '/portal' });
  }
  if (modules.showQuality) {
    s.push({ icon: ShieldCheck, label: 'Checklists', desc: 'Revise conformidade', route: '/ti/configuracoes' });
  }
  s.push({ icon: Calendar, label: 'Agenda', desc: 'Agende compromissos', route: '/inicio' });
  return s.slice(0, 6);
}

const lyraEmptyTips = [
  'Aproveite para antecipar rotinas da próxima semana.',
  'Bom momento para revisar métricas do mês.',
  'Que tal documentar um processo no Portal?',
  'Revise os POPs do seu setor — manter atualizado evita retrabalho.',
  'Organize o backlog e priorize o que importa.',
];

function EmptyStateSuggestions({ modules }: { modules: ReturnType<typeof useVisibleModules> }) {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const suggestions = useMemo(() => getContextualSuggestions(modules), [modules]);
  const tip = useMemo(() => lyraEmptyTips[Math.floor(Math.random() * lyraEmptyTips.length)], []);

  return (
    <div className="px-6 py-8">
      <div className="text-center mb-6">
        <div className="w-12 h-12 bg-monday-green/10 rounded-xl flex items-center justify-center mx-auto mb-3">
          <CheckCircle2 className="w-6 h-6 text-monday-green" strokeWidth={1.5} />
        </div>
        <p className="text-[15px] font-semibold text-foreground">Tudo em dia!</p>
        <p className="text-[13px] text-muted-foreground mt-1">Nenhuma demanda pendente</p>
      </div>

      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Sugestões para você</p>
      <div className="grid grid-cols-2 gap-2">
        {suggestions.map((s) => (
          <button
            key={s.route + s.label}
            onClick={() => navigate(tenantPath(s.route))}
            className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:shadow-card transition-all text-left group"
          >
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <s.icon className="w-4 h-4 text-primary" strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-foreground group-hover:text-primary truncate">{s.label}</p>
              <p className="text-[11px] text-muted-foreground truncate">{s.desc}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-5 flex items-start gap-2 p-3 rounded-lg bg-monday-purple/5 border border-monday-purple/10">
        <Sparkles className="w-4 h-4 text-monday-purple mt-0.5 shrink-0" strokeWidth={1.5} />
        <p className="text-[12px] text-muted-foreground leading-relaxed">{tip}</p>
      </div>
    </div>
  );
}

interface DailyCurationProps {
  onEnterFocusMode: (task: Task) => void;
}

interface UnifiedDemand {
  id: string;
  type: 'task' | 'ticket' | 'kanban';
  typeLabel: string;
  title: string;
  subtitle: string;
  priority: number;
  priorityLabel: string;
  dueDate: Date | null;
  urgencyGroup: 'overdue' | 'today' | 'tomorrow' | 'future' | 'no_date';
  status: string;
  onClick: () => void;
  onFocus?: () => void;
}

function normalizePriority(val: string | number | null): number {
  if (typeof val === 'number') return Math.min(Math.max(val, 1), 4);
  const map: Record<string, number> = { critical: 1, high: 2, medium: 3, low: 4 };
  return map[val || 'medium'] || 3;
}

function priorityLabel(n: number): string {
  return ['', 'Crítico', 'Alto', 'Médio', 'Baixo'][n] || 'Baixo';
}

function getUrgencyGroup(dueDate: Date | null): UnifiedDemand['urgencyGroup'] {
  if (!dueDate) return 'no_date';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const diff = Math.floor((dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  return 'future';
}

const urgencyOrder: Record<string, number> = { overdue: 0, today: 1, tomorrow: 2, future: 3, no_date: 4 };

const urgencyConfig: Record<string, { bg: string; fg: string; dot: string; label: string; textClass: string }> = {
  overdue:  { bg: 'badge-danger',  fg: '', dot: 'bg-current', label: 'Atrasados',  textClass: 'text-status-danger font-semibold' },
  today:    { bg: 'badge-warning', fg: '', dot: 'bg-current', label: 'Hoje',       textClass: 'text-status-warning font-semibold' },
  tomorrow: { bg: 'badge-info',    fg: '', dot: 'bg-current', label: 'Amanhã',     textClass: 'text-muted-foreground' },
  future:   { bg: 'badge-success', fg: '', dot: 'bg-current', label: 'Futuro',     textClass: 'text-muted-foreground' },
  no_date:  { bg: 'badge-neutral', fg: '', dot: 'bg-current', label: 'Sem Prazo',  textClass: 'text-muted-foreground' },
};

function LyraBriefing({
  content, tickets: briefTickets, kanbanCards: briefCards, tasks: briefTasks, onFocusTask,
}: {
  content: string;
  tickets: { id: string; ticket_number: number; title: string }[];
  kanbanCards: KanbanCardItem[];
  tasks: Task[];
  onFocusTask: (task: Task) => void;
}) {
  const nav = useNavigate();
  const tenantPath = useTenantPath();
  const ticketMap = useMemo(() => {
    const m = new Map<number, string>();
    briefTickets.forEach(t => m.set(t.ticket_number, t.id));
    return m;
  }, [briefTickets]);

  const segments = useMemo(() => {
    const regex = /(#(\d+))|("([^"]+)")/g;
    const result: { text: string; type: string; id?: string; task?: Task; route?: string }[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) result.push({ text: content.slice(lastIndex, match.index), type: 'text' });
      if (match[2]) {
        const num = parseInt(match[2], 10);
        const ticketId = ticketMap.get(num);
        result.push(ticketId ? { text: match[0], type: 'ticket', id: ticketId } : { text: match[0], type: 'text' });
      } else if (match[4]) {
        const quoted = match[4].toLowerCase();
        const kanbanCard = briefCards.find(c => c.title.toLowerCase() === quoted);
        const taskItem = briefTasks.find(t => t.title.toLowerCase() === quoted);
        if (kanbanCard) result.push({ text: match[0], type: 'kanban', id: kanbanCard.id });
        else if (taskItem) result.push({ text: match[0], type: 'task', task: taskItem });
        else result.push({ text: match[0], type: 'text' });
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) result.push({ text: content.slice(lastIndex), type: 'text' });
    return result;
  }, [content, ticketMap, briefCards, briefTasks]);

  return (
    <div className="text-[13px] leading-relaxed text-muted-foreground">
      {segments.map((seg, i) => {
        if (seg.type === 'ticket') return <span key={i} className="text-primary font-bold cursor-pointer hover:underline" onClick={() => nav(tenantPath(`/helpdesk/${seg.id}`))}>{seg.text}</span>;
        // `/kanban` não é rota deste app (docs/nao-funciona.md): prefixar não conserta, cai no NotFound de qualquer jeito.
        if (seg.type === 'kanban') return <span key={i} className="text-primary font-bold cursor-pointer hover:underline" onClick={() => nav('/kanban')}>{seg.text}</span>;
        if (seg.type === 'task' && seg.task) return <span key={i} className="text-primary font-bold cursor-pointer hover:underline" onClick={() => onFocusTask(seg.task!)}>{seg.text}</span>;
        return <span key={i}>{seg.text}</span>;
      })}
    </div>
  );
}

export function DailyCuration({ onEnterFocusMode }: DailyCurationProps) {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const { user, profile } = useAuth();
  const modules = useVisibleModules();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const perf = usePersonalPerformance();

  const { summary, isLoading: isLoadingAI, error: aiError, generateSummary, tickets, kanbanCards } = useAISecretary();
  const assistantName = useAssistantName();
  const { messages: chatMessages, isTyping: isChatTyping, sendMessage } = useLyraChat({ tickets, kanbanCards, tasks });

  const [chatInput, setChatInput] = useState('');
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  const handleVoiceTranscript = useCallback((text: string) => { sendMessage(text); }, [sendMessage]);
  const { recorderState, interimText, duration, audioUrl, audioLevels, isSupported, isSending, startRecording, stopRecording, sendRecording, cancelRecording } = useVoiceRecorder(handleVoiceTranscript);

  useEffect(() => {
    if (scrollAnchorRef.current) scrollAnchorRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isChatTyping]);

  const handleSendChat = () => {
    if (!chatInput.trim() || isChatTyping) return;
    sendMessage(chatInput.trim());
    setChatInput('');
  };

  const hasFetchedRef = useRef(false);
  useEffect(() => {
    if (user && !hasFetchedRef.current) { hasFetchedRef.current = true; fetchTasks(); }
  }, [user]);

  const fetchTasks = async () => {
    if (!user) return;
    setIsLoadingTasks(true);
    try {
      const { data, error } = await supabase.from('tasks').select('*').eq('user_id', user.id).in('status', ['pending', 'in_progress']).order('priority', { ascending: true }).order('due_date', { ascending: true, nullsFirst: false }).limit(20);
      if (error) throw error;
      setTasks((data || []) as Task[]);
      await generateSummary((data || []) as Task[]);
    } catch (e) { console.error('Error fetching tasks:', e); }
    finally { setIsLoadingTasks(false); }
  };

  const unifiedDemands = useMemo<UnifiedDemand[]>(() => {
    const items: UnifiedDemand[] = [];
    tasks.forEach(t => {
      const due = t.due_date ? new Date(t.due_date) : null;
      const prio = normalizePriority(t.priority || 3);
      items.push({ id: t.id, type: 'task', typeLabel: 'Tarefa', title: t.title, subtitle: t.is_ai_suggested ? `Sugerido pela ${assistantName}` : t.status === 'in_progress' ? 'Em andamento' : 'Pendente', priority: prio, priorityLabel: priorityLabel(prio), dueDate: due, urgencyGroup: getUrgencyGroup(due), status: t.status || 'pending', onClick: () => onEnterFocusMode(t), onFocus: () => onEnterFocusMode(t) });
    });
    tickets.forEach(t => {
      // Chamados resolvidos/fechados saem do relógio de SLA: sem prazo de urgência
      const slaStopped = ['resolved', 'closed', 'cancelled', 'rejected'].includes(t.status);
      const due = !slaStopped && t.sla_due_at ? new Date(t.sla_due_at) : null;
      const prio = normalizePriority(t.priority);
      items.push({ id: t.id, type: 'ticket', typeLabel: 'Chamado', title: t.title, subtitle: `#${t.ticket_number}`, priority: prio, priorityLabel: priorityLabel(prio), dueDate: due, urgencyGroup: getUrgencyGroup(due), status: t.status, onClick: () => navigate(tenantPath(`/helpdesk/${t.id}`)) });
    });
    kanbanCards.forEach(c => {
      const due = c.due_date ? new Date(c.due_date) : null;
      const prio = normalizePriority(c.priority);
      items.push({ id: c.id, type: 'kanban', typeLabel: 'Projeto', title: c.title, subtitle: c.board_name || 'Kanban', priority: prio, priorityLabel: priorityLabel(prio), dueDate: due, urgencyGroup: getUrgencyGroup(due), status: c.column_name || 'Em andamento', onClick: () => navigate(tenantPath('/kanban')) });
    });
    items.sort((a, b) => {
      const ug = urgencyOrder[a.urgencyGroup] - urgencyOrder[b.urgencyGroup];
      if (ug !== 0) return ug;
      const pr = a.priority - b.priority;
      if (pr !== 0) return pr;
      if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime();
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });
    return items;
  }, [tasks, tickets, kanbanCards, navigate, onEnterFocusMode]);

  const firstName = profile?.full_name?.split(' ')[0] || 'Usuário';
  const getGreeting = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };

  const totalDemands = unifiedDemands.length;
  const overdueCount = unifiedDemands.filter(d => d.urgencyGroup === 'overdue').length;
  const todayCount = unifiedDemands.filter(d => d.urgencyGroup === 'today').length;
  const resolvedCount = unifiedDemands.filter(d => d.status === 'resolved' || d.status === 'closed').length;
  const nextAction = unifiedDemands[0] || null;

  const quickNavItems = useMemo(() => {
    const items: { label: string; icon: any; route: string }[] = [];
    if (modules.showTI) {
      items.push({ label: 'Chamados', icon: Ticket, route: '/ti/chamados' });
      items.push({ label: 'Dashboard TI', icon: TrendingUp, route: '/ti/indicadores' });
      items.push({ label: 'Inventário', icon: Package, route: '/inventario' });
    } else {
      items.push({ label: 'Solicitação', icon: Ticket, route: '/nova-solicitacao' });
    }
    if (modules.showMarketing) {
      items.push({ label: 'MKT', icon: Megaphone, route: '/mkt' });
      items.push({ label: 'Social', icon: CalendarDays, route: '/mkt/social' });
      items.push({ label: 'Eventos', icon: PartyPopper, route: '/mkt/social' });
    }
    if (modules.showQuality) items.push({ label: 'Qualidade', icon: ClipboardCheck, route: '/qualidade' });
    
    if (modules.showPortal) items.push({ label: 'POPs', icon: BookOpen, route: '/base-conhecimento' });
    if (modules.isManagerOrHigher) items.push({ label: 'Config', icon: Settings, route: '/ti/configuracoes' });
    return items;
  }, [modules]);

  const { todayEvents, createEvent } = useCalendarEvents();
  const [agendaOpen, setAgendaOpen] = useState(true);
  const [quickEventTitle, setQuickEventTitle] = useState('');

  const agendaItems = useMemo(() => {
    const items: { time: string; label: string; type: 'demand' | 'routine' | 'event'; urgency?: string; description?: string; origin?: string; route?: string; eventType?: string }[] = [];
    unifiedDemands.filter(d => d.urgencyGroup === 'today' || d.urgencyGroup === 'overdue').forEach(d => {
      items.push({
        time: d.dueDate ? format(d.dueDate, 'HH:mm') : '--:--',
        label: d.title,
        type: 'demand',
        urgency: d.urgencyGroup,
        origin: d.type === 'ticket' ? `Chamado ${d.subtitle}` : d.type === 'kanban' ? `Kanban · ${d.subtitle}` : 'Tarefa',
        route: d.type === 'ticket' ? `/helpdesk/${d.id}` : d.type === 'kanban' ? '/kanban' : undefined,
      });
    });
    todayEvents.forEach(ev => {
      items.push({
        time: format(new Date(ev.start_at), 'HH:mm'),
        label: ev.title,
        type: 'event',
        description: ev.description || undefined,
        origin: ev.event_type === 'reminder' ? 'Lembrete' : 'Evento',
        eventType: ev.event_type,
      });
    });
    items.sort((a, b) => a.time.localeCompare(b.time));
    return items;
  }, [unifiedDemands, todayEvents]);

  const handleQuickEvent = async () => {
    if (!quickEventTitle.trim()) return;
    const now = new Date();
    await createEvent.mutateAsync({
      title: quickEventTitle.trim(),
      start_at: now.toISOString(),
      event_type: 'reminder',
    });
    setQuickEventTitle('');
  };

  if (isLoadingTasks) {
    return (
      <div className="p-6 animate-pulse space-y-4">
        <div className="h-10 bg-surface-2 rounded-lg w-1/3" />
        <div className="grid grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-20 bg-surface-2 rounded-lg" />)}
        </div>
        <div className="h-[400px] bg-surface-2/50 rounded-lg" />
      </div>
    );
  }

  const urgencyGroups = (['overdue', 'today', 'tomorrow', 'future', 'no_date'] as const)
    .map(group => ({ key: group, items: unifiedDemands.filter(d => d.urgencyGroup === group), config: urgencyConfig[group] }))
    .filter(g => g.items.length > 0);

  return (
    <div className="h-[calc(100vh-52px)] flex flex-col overflow-hidden">
      {/* ═══ HEADER with greeting + stat cards ═══ */}
      <div className="shrink-0 px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-foreground">
            {getGreeting()}, <span className="text-primary">{firstName}</span>
          </h2>
          <Button
            variant="ghost" size="sm" onClick={() => fetchTasks()} disabled={isLoadingAI}
            className="gap-1.5 h-8 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoadingAI ? 'animate-spin' : ''}`} strokeWidth={1.5} />
            <span className="text-[13px]">Atualizar</span>
          </Button>
        </div>

        {/* KPI grid — padrão Qualidade/TI/MKT */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard value={overdueCount} label="Atrasados" icon={AlertTriangle} color="red" />
          <KPICard value={todayCount} label="Para hoje" icon={Zap} color="yellow" />
          <KPICard value={totalDemands} label="Total" icon={Ticket} color="blue" />
          <KPICard value={perf.resolvedToday} label="Concluídos hoje" icon={CheckCircle2} color="green" />
        </div>
      </div>

      {/* ═══ MAIN GRID ═══ */}
      <div className="flex-1 grid grid-cols-12 overflow-hidden">

        {/* ── Main Table Area ── */}
        <div className="col-span-12 lg:col-span-8 overflow-y-auto">
          {/* Next action banner */}
          {nextAction && (
            <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-primary/5">
              <Zap className="w-4 h-4 text-primary shrink-0" strokeWidth={2} />
              <span className="text-[12px] font-bold uppercase tracking-wider text-primary/70">Comece por</span>
              <span className="text-[14px] text-foreground font-medium truncate flex-1">{nextAction.title}</span>
              <Button
                size="sm" className="h-8 gap-1.5 text-[12px] shrink-0 rounded-md"
                onClick={() => { if (nextAction.onFocus) nextAction.onFocus(); else nextAction.onClick(); }}
              >
                <Play className="w-3.5 h-3.5" strokeWidth={2} /> Focar
              </Button>
            </div>
          )}

          {/* Monday-style grouped table */}
          {unifiedDemands.length > 0 ? (
            <div className="p-4 space-y-2">
              {urgencyGroups.map(({ key, items, config }) => (
                <div key={key} className="rounded-lg overflow-hidden border border-border">
                  {/* Group header — Monday vibrant */}
                  <div className={`flex items-center gap-3 px-4 py-2 ${config.bg} ${config.fg} border-l-[6px]`} style={{ borderLeftColor: 'inherit' }}>
                    <ChevronDown className="w-4 h-4 opacity-80" strokeWidth={2} aria-hidden="true" />
                    <span className="font-bold text-[13px]">{config.label}</span>
                    <span className="text-[12px] px-2 py-0.5 rounded-full font-semibold bg-current/15">{items.length}</span>
                  </div>

                  {/* Column header */}
                  <div className="flex items-center gap-4 h-8 px-4 border-b border-border text-[12px] text-muted-foreground font-medium bg-card">
                    <span className="w-10">Tipo</span>
                    <span className="w-16">Ref</span>
                    <span className="flex-1">Título</span>
                    <span className="w-20 text-center border-l border-border">Prioridade</span>
                    <span className="w-16 text-center border-l border-border">Prazo</span>
                    <span className="w-6" />
                  </div>

                  {/* Rows */}
                  {items.map((item) => {
                    const dueDateStr = item.dueDate
                      ? item.urgencyGroup === 'overdue'
                        ? `${Math.abs(Math.floor((item.dueDate.getTime() - new Date().setHours(0,0,0,0)) / (1000*60*60*24)))}d`
                        : item.urgencyGroup === 'today' ? 'Hoje'
                        : item.urgencyGroup === 'tomorrow' ? 'Amanhã'
                        : format(item.dueDate, "dd MMM", { locale: ptBR })
                      : '—';

                    const priorityBg = item.priority === 1 ? 'badge-danger' : item.priority === 2 ? 'badge-orange' : item.priority === 3 ? 'badge-warning' : 'badge-success';

                    return (
                      <div
                        key={`${item.type}-${item.id}`}
                        onClick={item.onClick}
                        className="flex items-center gap-4 h-10 px-4 cursor-pointer transition-all border-b border-border bg-card hover:bg-primary/[0.02] group"
                      >
                        {/* Type */}
                        <span className="text-[12px] text-muted-foreground w-10 shrink-0 font-medium">
                          {item.type === 'ticket' ? 'TK' : item.type === 'task' ? 'TA' : 'KN'}
                        </span>
                        {/* Ref */}
                        <span className="font-mono text-[12px] text-primary font-bold w-16 shrink-0 truncate">
                          {item.type === 'ticket' ? item.subtitle : `#${item.id.slice(0, 4)}`}
                        </span>
                        {/* Title */}
                        <span className="flex-1 text-[13px] text-foreground truncate font-medium">{item.title}</span>
                        {/* Priority pill */}
                        <div className="w-20 flex justify-center border-l border-border">
                          <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${priorityBg}`}>
                            {item.priorityLabel}
                          </span>
                        </div>
                        {/* Due date */}
                        <span className={`text-[12px] w-16 text-center shrink-0 border-l border-border font-medium ${
                          item.urgencyGroup === 'overdue' ? 'text-monday-red font-bold' :
                          item.urgencyGroup === 'today' ? 'text-status-warning font-semibold' : 'text-muted-foreground'
                        }`}>
                          {dueDateStr}
                        </span>
                        {/* Action */}
                        <div className="w-6 shrink-0 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          {item.onFocus ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); item.onFocus!(); }}
                              className="text-muted-foreground hover:text-primary inline-flex items-center justify-center h-11 w-11 -mr-3"
                              aria-label={`Focar em ${item.title}`}
                            >
                              <Play className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                            </button>
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.5} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <EmptyStateSuggestions modules={modules} />
          )}
        </div>

        {/* ── Right Panel ── */}
        <div className="hidden lg:flex lg:col-span-4 flex-col bg-card border-l border-border overflow-y-auto">

          {/* Lyra Chat */}
          <div className="border-b border-border">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
              <LyraAvatar size="sm" animated={isLoadingAI || isChatTyping} />
              <span className="text-[13px] font-semibold text-foreground">{assistantName}</span>
              <span className="text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded uppercase">IA</span>
            </div>

            <div ref={chatScrollRef} className="px-4 py-3 max-h-[180px] overflow-y-auto space-y-3" onWheel={(e) => e.stopPropagation()}>
              {isLoadingAI && !summary ? (
                <div className="flex items-center gap-2 text-muted-foreground py-2">
                  <span className="text-[13px]">Analisando...</span>
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              ) : (
                <LyraBriefing content={summary || 'Nenhuma pendência.'} tickets={tickets} kanbanCards={kanbanCards} tasks={tasks} onFocusTask={onEnterFocusMode} />
              )}

              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'user' ? (
                    <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md px-3 py-2 max-w-[85%]">
                      <p className="text-[13px]">{msg.content}</p>
                    </div>
                  ) : (
                    <div className="bg-surface-2 rounded-2xl rounded-bl-md px-3 py-2 max-w-[90%]">
                      <MarkdownRenderer content={msg.content} className="text-[13px] text-foreground" />
                    </div>
                  )}
                </div>
              ))}

              {isChatTyping && chatMessages[chatMessages.length - 1]?.role !== 'assistant' && (
                <div className="flex gap-1 text-muted-foreground py-1">
                  <span className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce" />
                  <span className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}
              <div ref={scrollAnchorRef} />
            </div>

            {aiError && <p className="text-[12px] text-monday-red px-4 pb-1">{aiError}</p>}

            {!isLoadingAI && (
              <div className="px-4 pb-3 pt-1">
                {recorderState !== 'idle' ? (
                  <VoiceRecorderBar recorderState={recorderState} duration={duration} interimText={interimText} audioUrl={audioUrl} audioLevels={audioLevels} isSending={isSending} onStop={stopRecording} onSend={sendRecording} onCancel={cancelRecording} />
                ) : (
                  <div className="border border-border rounded-full flex items-center px-3 py-1.5 bg-surface-2">
                    <input
                      type="text" value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendChat()}
                      aria-label={`Pergunte à ${assistantName}`}
                      placeholder={`Pergunte à ${assistantName}...`}
                      disabled={isChatTyping}
                      className="bg-transparent border-0 focus:outline-none focus:ring-0 text-[13px] text-foreground placeholder:text-muted-foreground flex-1"
                    />
                    {isSupported && (
                      <button type="button" aria-label="Gravar mensagem de voz" onClick={startRecording} disabled={isChatTyping} className="ml-1.5 p-1.5 text-muted-foreground hover:text-primary transition-colors">
                        <Mic className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
                      </button>
                    )}
                    <button type="button" aria-label="Enviar pergunta" onClick={handleSendChat} disabled={!chatInput.trim() || isChatTyping} className="ml-1.5 p-1.5 text-primary hover:text-primary/80 disabled:text-muted-foreground disabled:opacity-50 transition-colors">
                      <Send className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Agenda Timeline */}
          <Collapsible open={agendaOpen} onOpenChange={setAgendaOpen}>
            <div className="border-b border-border">
              <div className="flex items-center justify-between px-4 py-3">
                <CollapsibleTrigger className="flex items-center gap-2 cursor-pointer group">
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${!agendaOpen ? '-rotate-90' : ''}`} strokeWidth={1.5} />
                  <span className="text-[13px] font-semibold text-foreground group-hover:text-primary transition-colors">Agenda</span>
                  <span className="text-[11px] font-semibold text-muted-foreground bg-surface-2 px-1.5 py-0.5 rounded">{agendaItems.length}</span>
                </CollapsibleTrigger>
                <button onClick={() => navigate(tenantPath('/agenda'))} className="text-[11px] font-medium text-primary hover:text-primary/80 transition-colors">
                  Ver tudo
                </button>
              </div>
              <CollapsibleContent>
                <div className="px-4 pb-3 space-y-1">
                  {agendaItems.length > 0 ? agendaItems.map((item, i) => (
                    <HoverCard key={i} openDelay={200} closeDelay={100}>
                      <HoverCardTrigger asChild>
                        <div
                          onClick={() => item.route && navigate(tenantPath(item.route))}
                          className={`flex items-center gap-3 py-2 rounded-md px-2 -mx-2 transition-colors ${item.route ? 'cursor-pointer hover:bg-surface-2' : ''}`}
                        >
                          <span className="text-[12px] font-mono text-primary w-10 shrink-0">{item.time}</span>
                          <div className={`w-2 h-2 rounded-full shrink-0 ${
                            item.type === 'routine' ? 'bg-monday-purple' :
                            item.type === 'event' ? (item.eventType === 'reminder' ? 'bg-monday-yellow' : 'bg-primary') :
                            item.urgency === 'overdue' ? 'bg-monday-red' : 'bg-monday-yellow'
                          }`} />
                          <span className="text-[13px] text-foreground truncate flex-1">{item.label}</span>
                          <span className="text-[10px] font-medium text-muted-foreground shrink-0 bg-surface-2 px-1.5 py-0.5 rounded">
                            {item.type === 'routine' ? 'Rotina' : item.type === 'event' ? (item.eventType === 'reminder' ? 'Lembrete' : 'Evento') : 'Demanda'}
                          </span>
                        </div>
                      </HoverCardTrigger>
                      <HoverCardContent side="left" align="start" className="w-56 p-3" sideOffset={8}>
                        <div className="space-y-2">
                          <p className="text-[13px] font-semibold text-foreground">{item.label}</p>
                          <p className="text-[12px] text-muted-foreground">{item.time}</p>
                          {item.description && <p className="text-[12px] text-muted-foreground">{item.description}</p>}
                          {item.origin && <p className="text-[11px] text-muted-foreground">Origem: {item.origin}</p>}
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  )) : (
                    <p className="text-[13px] text-muted-foreground py-2">Nenhum compromisso</p>
                  )}

                  {/* Quick event input */}
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border">
                    <Plus className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={2} />
                    <input
                      type="text"
                      value={quickEventTitle}
                      onChange={(e) => setQuickEventTitle(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleQuickEvent()}
                      aria-label="Criar lembrete rápido"
                      placeholder="Lembrete rápido..."
                      className="bg-transparent border-0 focus:outline-none focus:ring-0 text-[13px] text-foreground placeholder:text-muted-foreground flex-1 min-w-0"
                    />
                    {quickEventTitle.trim() && (
                      <button type="button" aria-label="Salvar lembrete" onClick={handleQuickEvent} className="p-1.5 text-primary hover:text-primary/80 transition-colors">
                        <Send className="w-3.5 h-3.5" strokeWidth={2} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          {/* Performance — Radial Progress */}
          <div className="border-b border-border">
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-foreground">Sua Performance</span>
              <span className="text-[11px] text-muted-foreground">Últimos 7 dias</span>
            </div>
            <div className="px-4 pb-4 grid grid-cols-4 gap-2">
              <TooltipProvider delayDuration={150}>
              {/* Radial: On-Time Rate */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center gap-1.5 cursor-help">
                    <div className="relative w-16 h-16">
                      <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                        <circle cx="18" cy="18" r="15.5" fill="none" stroke="hsl(var(--border))" strokeWidth="3" />
                        <circle
                          cx="18" cy="18" r="15.5" fill="none"
                          strokeWidth="3" strokeLinecap="round"
                          stroke={perf.onTimeRate !== null ? (perf.onTimeRate >= 80 ? 'hsl(var(--monday-green))' : perf.onTimeRate >= 60 ? 'hsl(var(--monday-yellow))' : 'hsl(var(--monday-red))') : 'hsl(var(--border))'}
                          strokeDasharray={`${((perf.onTimeRate ?? 0) / 100) * 97.4} 97.4`}
                        />
                      </svg>
                      <span className={cn(
                        "absolute inset-0 flex items-center justify-center text-sm font-bold",
                        perf.onTimeRate !== null ? (perf.onTimeRate >= 80 ? 'text-monday-green' : perf.onTimeRate >= 60 ? 'text-monday-yellow' : 'text-monday-red') : 'text-muted-foreground'
                      )}>
                        {perf.onTimeRate !== null ? `${perf.onTimeRate}%` : '—'}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground font-medium text-center">No Prazo</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[220px] text-xs">
                  <p className="font-semibold mb-1">No prazo</p>
                  <p>Percentual dos seus chamados resolvidos dentro do prazo (SLA) nos últimos 30 dias. Verde acima de 80%, amarelo entre 60% e 80%, vermelho abaixo.</p>
                </TooltipContent>
              </Tooltip>

              {/* Entregas (week) */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center gap-1.5 cursor-help">
                    <div className="w-16 h-16 rounded-full border-[3px] border-primary/30 flex items-center justify-center bg-primary/5">
                      <span className="text-lg font-bold text-primary">{perf.resolvedThisWeek}</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground font-medium text-center">Entregas</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[220px] text-xs">
                  <p className="font-semibold mb-1">Entregas</p>
                  <p>Total de chamados que você concluiu nos últimos 7 dias. Conta cada chamado resolvido ou encerrado por você.</p>
                </TooltipContent>
              </Tooltip>

              {/* Streak */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center gap-1.5 cursor-help">
                    <div className={cn(
                      "w-16 h-16 rounded-full border-[3px] flex items-center justify-center gap-0.5",
                      perf.streak >= 3 ? 'border-monday-orange/40 bg-monday-orange/5' : 'border-border'
                    )}>
                      <Flame className={cn("w-4 h-4", perf.streak >= 3 ? 'text-monday-orange' : 'text-muted-foreground')} strokeWidth={2} />
                      <span className={cn("text-lg font-bold", perf.streak >= 3 ? 'text-monday-orange' : 'text-foreground')}>{perf.streak}</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground font-medium text-center">Sequência</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[220px] text-xs">
                  <p className="font-semibold mb-1">Sequência</p>
                  <p>Dias seguidos em que você concluiu pelo menos um chamado. A chama acende quando você emenda 3 dias ou mais.</p>
                </TooltipContent>
              </Tooltip>
              </TooltipProvider>


              {/* Atrasos — with hover detail */}
              <HoverCard openDelay={150}>
                <HoverCardTrigger asChild>
                  <button
                    type="button"
                    className="flex flex-col items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-monday-red rounded-md"
                    aria-label="Itens em atraso"
                  >
                    <div className={cn(
                      "w-16 h-16 rounded-full border-[3px] flex items-center justify-center transition-transform hover:scale-105",
                      perf.overdueItems.length > 0 ? 'border-monday-red/40 bg-monday-red/5' : 'border-border'
                    )}>
                      <span className={cn(
                        "text-lg font-bold",
                        perf.overdueItems.length > 0 ? 'text-monday-red' : 'text-muted-foreground'
                      )}>
                        {perf.overdueItems.length}
                      </span>
                    </div>
                    <span className={cn(
                      "text-[11px] font-medium text-center",
                      perf.overdueItems.length > 0 ? 'text-monday-red' : 'text-muted-foreground'
                    )}>
                      Atrasos
                    </span>
                  </button>
                </HoverCardTrigger>
                <HoverCardContent align="end" side="left" className="w-80 p-0">
                  <div className="px-3 py-2 border-b border-border flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-monday-red" />
                    <span className="text-[13px] font-semibold text-foreground">
                      {perf.overdueItems.length === 0
                        ? 'Sem atrasos'
                        : `${perf.overdueItems.length} ${perf.overdueItems.length === 1 ? 'item atrasado' : 'itens atrasados'}`}
                    </span>
                  </div>
                  {perf.overdueItems.length === 0 ? (
                    <div className="p-4 text-center text-[12px] text-muted-foreground">
                      Tudo no prazo. Continue assim.
                    </div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto py-1">
                      {perf.overdueItems.slice(0, 10).map(item => (
                        <button
                          key={`${item.type}-${item.id}`}
                          onClick={() => navigate(tenantPath(item.route))}
                          className="w-full text-left px-3 py-2 hover:bg-surface-2/50 transition-colors group"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[13px] font-medium text-foreground line-clamp-1 group-hover:text-monday-red">
                              {item.title}
                            </p>
                            <span className="text-[10px] font-bold uppercase tracking-wider badge-danger px-1.5 py-0.5 rounded shrink-0">
                              {item.daysOverdue}d
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                              {item.typeLabel}
                            </span>
                            <span className="text-[11px] text-muted-foreground">·</span>
                            <span className="text-[11px] text-muted-foreground">
                              {format(item.dueDate, "dd/MM 'às' HH:mm", { locale: ptBR })}
                            </span>
                          </div>
                        </button>
                      ))}
                      {perf.overdueItems.length > 10 && (
                        <div className="px-3 py-2 text-[11px] text-muted-foreground text-center border-t border-border">
                          + {perf.overdueItems.length - 10} outros atrasos
                        </div>
                      )}
                    </div>
                  )}
                </HoverCardContent>
              </HoverCard>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ReguaDoDia } from './ReguaDoDia';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import type { KanbanCardItem } from '@/hooks/useAISecretary';
import { ptBR } from 'date-fns/locale';
import { 
  Play, RefreshCw, CheckCircle2, ChevronDown,
  LayoutGrid, Send, Mic,
  Sparkles, Megaphone, CalendarDays,
  Clock, Flame, Zap, Target, Plus,
  BarChart3, FileText, Monitor, Calendar, Users, ShieldCheck, Bell, Repeat, AlertTriangle, HandHelping, type LucideIcon
} from 'lucide-react';
import { ExplicacaoDoIndicador } from '@/components/ajuda/ExplicacaoDoIndicador';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { useLyraChat } from '@/hooks/useLyraChat';
import { LyraAvatar } from '@/components/ai/LyraAvatar';
import { useAssistantName, useIALigada } from '@/hooks/useAssistantName';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAISecretary } from '@/hooks/useAISecretary';
import { LyraAvisa } from '@/components/dashboard/LyraAvisa';
import { JornalNaHome } from '@/components/jornal/JornalNaHome';
import { useVisibleModules } from '@/hooks/useVisibleModules';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { VoiceRecorderBar } from '@/components/ui/VoiceRecorderBar';
import { usePersonalPerformance } from '@/hooks/usePersonalPerformance';
import type { Task } from '@/types/database';
import { MODULE_LABELS } from '@/lib/automation-flow';
import { ChipDoSetor } from '@/components/ui/ChipDoSetor';
import { KPICard } from '@/components/glpi/KPICard';
import { setorDoModulo } from '@/lib/setores';
import { estaPausada } from '@/config/telas-pausadas';
import { nivelDaChama, type Periodo } from '@/lib/chama-da-performance';
import { SLA_PAUSED_STATUSES } from '@/types/helpdesk';
import { usePessoasDaEmpresa } from '@/hooks/useProjetos';

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
    s.push({ icon: ShieldCheck, label: 'Checklists', desc: 'Revise conformidade', route: '/qualidade/configuracoes' });
  }
  s.push({ icon: Calendar, label: 'Agenda', desc: 'Agende compromissos', route: '/agenda' });
  return s.slice(0, 6);
}

const lyraEmptyTips = [
  'Aproveite para antecipar rotinas da próxima semana.',
  'Bom momento para revisar métricas do mês.',
  'Que tal documentar um processo no Portal?',
  'Revise os POPs do seu setor — manter atualizado evita retrabalho.',
  'Organize o backlog e priorize o que importa.',
];

// `atrasosDaEquipe`: o "Tudo em dia!" valia só para os MEUS, e o gestor lia como se fosse o setor (dono, 2026-10-28:
// "informa tudo em dia, porém a minha equipe tem 2 com SLA em atraso").
function EmptyStateSuggestions({ modules, atrasosDaEquipe }: { modules: ReturnType<typeof useVisibleModules>; atrasosDaEquipe: number }) {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const suggestions = useMemo(() => getContextualSuggestions(modules), [modules]);
  const tip = useMemo(() => lyraEmptyTips[Math.floor(Math.random() * lyraEmptyTips.length)], []);

  return (
    <div className="px-4 sm:px-8 py-8">
      <div className="text-center mb-6">
        <div className="w-[60px] h-[60px] kpi-icone-verde rounded-[23px] flex items-center justify-center mx-auto mb-3">
          <CheckCircle2 className="w-7 h-7" strokeWidth={2} />
        </div>
        <p className="text-[24px] font-bold text-foreground">Nada com você agora</p>
        <p className="text-[14px] text-muted-foreground mt-1">Nenhuma demanda sua pendente</p>
        {atrasosDaEquipe > 0 && (
          <p className="text-[14px] font-semibold text-status-danger mt-2">
            Mas a sua equipe tem {atrasosDaEquipe} {atrasosDaEquipe === 1 ? 'chamado atrasado' : 'chamados atrasados'}: veja abaixo.
          </p>
        )}
      </div>

      {/* Sugestões e dica: só no computador (no celular, poluíam o vazio). */}
      <div className="hidden lg:block">
      <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Sugestões para você</p>
      <div className="grid grid-cols-2 gap-2">
        {suggestions.map((s) => (
          <button
            key={s.route + s.label}
            onClick={() => navigate(tenantPath(s.route))}
            className="flex items-start gap-3 p-4 rounded-lg bg-background hover:bg-primary-soft transition-colors text-left group"
          >
            <div className="w-10 h-10 rounded-[14px] kpi-icone-azul flex items-center justify-center shrink-0">
              <s.icon className="w-4 h-4 text-primary" strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-foreground group-hover:text-primary truncate">{s.label}</p>
              <p className="text-[12px] text-muted-foreground truncate">{s.desc}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-5 flex items-start gap-2 p-3 rounded-lg bg-monday-purple/5 border border-monday-purple/10">
        <Sparkles className="w-4 h-4 text-monday-purple mt-0.5 shrink-0" strokeWidth={1.5} />
        <p className="text-[13px] text-muted-foreground leading-relaxed">{tip}</p>
      </div>
      </div>
    </div>
  );
}

// Prazo pausado não é "sem prazo" (vídeo do dono, 2026-10-28: os agendados e pendentes do Yuri liam "sem prazo").
const semPrazo = (status: string) =>
  status === 'scheduled' ? 'agendado' : status === 'waiting_user' ? 'aguarda retorno'
    : status === 'waiting_parts' ? 'aguarda compra' : 'sem prazo';

interface DailyCurationProps {
  /** Só pelo botão "Focar" (escolha do atendente): o modo foco nunca abre pelo clique na linha. */
  onEnterFocusMode: (task: Task) => void;
  /** Clique na tarefa: abre o painel da tarefa (descrição, prazo, de onde veio, Concluir / Modo foco). */
  onOpenTask: (task: Task) => void;
}

/** De onde a tarefa veio, em uma frase — para não confundir a tarefa com o chamado que a originou. */
function taskOrigin(t: Task): string {
  if (t.is_ai_suggested) return 'Sugerida pela assistente';
  if (t.source_type === 'automation') return 'Criada por um fluxo';
  if (t.source_type === 'ticket') return 'Nascida de um chamado';
  if (t.project_id) return 'Atividade de projeto';
  return t.status === 'in_progress' ? 'Em andamento' : 'Pendente';
}

interface UnifiedDemand {
  id: string;
  type: 'task' | 'ticket' | 'kanban';
  typeLabel: string;
  title: string;
  subtitle: string;
  priority: number;
  dueDate: Date | null;
  urgencyGroup: 'overdue' | 'today' | 'tomorrow' | 'future' | 'no_date';
  status: string;
  /** Módulo onde o chamado vive, para a pessoa saber onde procurar. */
  moduleLabel?: string;
  /** O módulo cru, para a cor do setor (rodada 3). */
  modulo?: string | null;
  /** Só tarefa: o chamado que a representa na fila do módulo. */
  ticketId?: string | null;
  /** Chamado do setor que não é meu (de outro atendente, ou sem atendente): vai para "Da minha equipe" (2026-10-20). */
  daEquipe?: boolean;
  atendenteId?: string | null;
  onClick: () => void;
  onFocus?: () => void;
}

/** A lista por trás de um número do topo: chamado, tarefa ou cartão, cada um abre no clique. */
function DemandasNoHover({ titulo, demandas, children }: { titulo: string; demandas: UnifiedDemand[]; children: React.ReactNode }) {
  const lista = demandas.slice(0, 25);
  // Rodada 3 (achado C5, Fitts): no celular, tocar no número abre a lista — quem faz isso é o próprio `hover-card`.
  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild><div>{children}</div></HoverCardTrigger>
      <HoverCardContent side="bottom" className="w-[360px] p-0">
        <div className="px-3 py-2 border-b border-border bg-muted/30">
          <p className="text-xs font-semibold text-foreground">{titulo}</p>
          <p className="text-[12px] text-muted-foreground">{demandas.length} {demandas.length === 1 ? 'demanda' : 'demandas'} · clique para abrir</p>
        </div>
        {lista.length === 0 ? (
          <p className="text-xs text-muted-foreground p-3">Nenhuma.</p>
        ) : (
          <div className="max-h-[280px] overflow-y-auto">
            {lista.map(d => (
              <button key={`${d.type}-${d.id}`} type="button" onClick={d.onClick}
                className="block w-full text-left px-3 py-2 hover:bg-muted/50 border-b border-border/40 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[12px] text-muted-foreground">{d.type === 'ticket' ? d.subtitle : d.typeLabel}</span>
                  <span className="text-xs text-foreground truncate flex-1">{d.title}</span>
                </div>
                <div className="text-[12px] text-muted-foreground mt-0.5">
                  {d.moduleLabel ?? d.typeLabel}{d.dueDate ? ` · prazo ${format(d.dueDate, 'dd/MM HH:mm')}` : ' · sem prazo'}
                </div>
              </button>
            ))}
            {demandas.length > lista.length && (
              <p className="px-3 py-2 text-[12px] text-muted-foreground text-center">+ {demandas.length - lista.length} outras</p>
            )}
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

function normalizePriority(val: string | number | null): number {
  if (typeof val === 'number') return Math.min(Math.max(val, 1), 4);
  const map: Record<string, number> = { critical: 1, high: 2, medium: 3, low: 4 };
  return map[val || 'medium'] || 3;
}

/**
 * O prazo diz **quando estoura**, não se é trabalho. Quem organiza a fila é a
 * prioridade — é assim que helpdesk funciona, e era o contrário aqui: tudo com
 * mais de um dia pela frente caía num grupo "Futuro" pintado de verde, e uma
 * tarefa Baixa para hoje ficava acima de um chamado Crítico para depois de
 * amanhã. Corrigido em 2026-09-13, a pedido do dono.
 */
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

/** Os quatro grupos da fila, de cima para baixo. Prioridade, não calendário. */
/** "15:00" quando são 14:20: a hora padrão do lembrete rápido. */
const proximaHoraCheia = () => `${String((new Date().getHours() + 1) % 24).padStart(2, '0')}:00`; // taste-skill-ignore: um relógio

// O prazo é a etiqueta da DashStack em cada linha (Von Restorff: só o que pede atenção ganha cor) — vermelho atrasado,
// laranja hoje, azul os próximos. Verde é só "feito". A forma vem de `.estado` (index.css).
const SELO_DO_PRAZO: Record<UnifiedDemand['urgencyGroup'], string> = {
  overdue: 'estado-atraso',
  today: 'estado-espera',
  tomorrow: 'bg-primary/20 text-primary',
  future: 'bg-primary/20 text-primary',
  no_date: 'estado-recebido',
};

/** "atrasado 2 dias", "hoje 14:00", "amanhã", "qui 30/10" — ou o porquê de não ter prazo. */
function rotuloDoPrazo(item: UnifiedDemand): string {
  if (!item.dueDate) return semPrazo(item.status);
  if (item.urgencyGroup === 'overdue') {
    const dias = Math.max(1, Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(item.dueDate).setHours(0, 0, 0, 0)) / 86_400_000));
    return `atrasado ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  }
  if (item.urgencyGroup === 'today') return `hoje ${format(item.dueDate, 'HH:mm')}`;
  if (item.urgencyGroup === 'tomorrow') return 'amanhã';
  return format(item.dueDate, 'EEE dd/MM', { locale: ptBR });
}

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
    <div className="text-[14px] leading-relaxed text-muted-foreground">
      {segments.map((seg, i) => {
        if (seg.type === 'ticket') return <span key={i} className="text-primary font-bold cursor-pointer hover:underline" onClick={() => nav(tenantPath(`/helpdesk/${seg.id}`))}>{seg.text}</span>;
        // `/kanban` existe desde 2026-09-13 (OKR-2) e leva a `/projetos`.
        if (seg.type === 'kanban') return <span key={i} className="text-primary font-bold cursor-pointer hover:underline" onClick={() => nav(tenantPath('/projetos'))}>{seg.text}</span>;
        if (seg.type === 'task' && seg.task) return <span key={i} className="text-primary font-bold cursor-pointer hover:underline" onClick={() => onFocusTask(seg.task!)}>{seg.text}</span>;
        return <span key={i}>{seg.text}</span>;
      })}
    </div>
  );
}

export function DailyCuration({ onEnterFocusMode, onOpenTask }: DailyCurationProps) {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const { user, profile } = useAuth();
  const modules = useVisibleModules();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  // Esta semana (segunda até hoje) ou este mês (dono, 2026-10-13), lembrado no navegador (só conveniência:
  // falhando, volta à semana).
  const [periodo, setPeriodo] = useState<Periodo>(() => {
    try { return localStorage.getItem('helpoint.performance.periodo') === 'mes' ? 'mes' : 'semana'; } catch { return 'semana'; }
  });
  const escolherPeriodo = (p: Periodo) => {
    setPeriodo(p);
    try { localStorage.setItem('helpoint.performance.periodo', p); } catch { /* sem armazenamento */ }
  };
  const perf = usePersonalPerformance(periodo);
  // A chama é sempre da semana: a sequência zera toda segunda.
  const chama = nivelDaChama(perf.streak);
  const noPeriodo = periodo === 'semana' ? 'nesta semana (de segunda até hoje)' : 'neste mês';

  const { summary, isLoading: isLoadingAI, error: aiError, generateSummary, tickets, kanbanCards, ticketsDosAvisos } = useAISecretary();
  // O resumo cita também os chamados das movimentações não lidas — que podem já estar resolvidos
  // ou ser de outra fila; o link do #número precisa deles (a lista de abertos não os traz).
  const ticketsDoResumo = useMemo(() => {
    const vistos = new Set(tickets.map((t) => t.id));
    return [...tickets, ...ticketsDosAvisos.filter((t) => !vistos.has(t.id))];
  }, [tickets, ticketsDosAvisos]);
  const assistantName = useAssistantName();
  const iaLigada = useIALigada();
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
    if (user && !hasFetchedRef.current) { hasFetchedRef.current = true; fetchTasks(true); }
  }, [user]);

  // O "Atualizar" (o dono, 2026-10-02: "não atualiza"). Três defeitos: a tela inteira virava
  // esqueleto enquanto a Lyra escrevia o resumo (o fetch esperava o streaming todo); os números de
  // "Concluídos hoje", no prazo e sequência (`usePersonalPerformance`, React Query) nunca eram
  // recarregados; e o giro do botão seguia a IA, não a atualização. Agora o esqueleto é só da
  // PRIMEIRA carga, o resumo roda por trás (ele também relê os chamados e os avisos) e o botão
  // recarrega tarefas, desempenho e avisos de uma vez.
  const queryClient = useQueryClient();
  const [atualizando, setAtualizando] = useState(false);
  const fetchTasks = async (primeiraCarga = false) => {
    if (!user) return;
    if (primeiraCarga) setIsLoadingTasks(true);
    try {
      const { data, error } = await supabase.from('tasks').select('*').eq('user_id', user.id).in('status', ['pending', 'in_progress']).order('priority', { ascending: true }).order('due_date', { ascending: true, nullsFirst: false }).limit(20);
      if (error) throw error;
      setTasks((data || []) as Task[]);
      void generateSummary((data || []) as Task[], !primeiraCarga);
    } catch (e) {
      console.error('Error fetching tasks:', e);
      toast.error('Não foi possível atualizar as tarefas.');
    } finally { setIsLoadingTasks(false); }
  };
  const atualizar = async () => {
    setAtualizando(true);
    try {
      await Promise.all([
        fetchTasks(),
        queryClient.invalidateQueries({ queryKey: ['personal-perf-tickets-resolved'] }),
        queryClient.invalidateQueries({ queryKey: ['personal-perf-tickets-open'] }),
        queryClient.invalidateQueries({ queryKey: ['personal-perf-tasks-done'] }),
        queryClient.invalidateQueries({ queryKey: ['personal-perf-tasks-open'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      ]);
    } finally { setAtualizando(false); }
  };

  const todasAsDemandas = useMemo<UnifiedDemand[]>(() => {
    const items: UnifiedDemand[] = [];
    tasks.forEach(t => {
      const due = t.due_date ? new Date(t.due_date) : null;
      const prio = normalizePriority(t.priority || 3);
      // Clique = painel da tarefa; modo foco só pelo botão "Focar" (o dono concluiu uma tarefa achando que era o chamado, 2026-09-12).
      // Atividade de projeto abre o projeto: o % e o farol moram lá (o painel genérico não sabe deles).
      // Abre já a própria tarefa no projeto (`?tarefa=`, 2026-10-29).
      const abrir = t.project_id ? () => navigate(tenantPath(`/projetos/${t.project_id}?tarefa=${t.id}`)) : () => onOpenTask(t);
      items.push({ id: t.id, type: 'task', typeLabel: t.project_id ? 'Projeto' : 'Tarefa', title: t.title, subtitle: taskOrigin(t), priority: prio, dueDate: due, urgencyGroup: getUrgencyGroup(due), status: t.status || 'pending', ticketId: t.ticket_id, onClick: abrir, onFocus: () => onEnterFocusMode(t) });
    });
    tickets.forEach(t => {
      // Chamados resolvidos/fechados saem do relógio de SLA: sem prazo de urgência. E o prazo PAUSADO
      // (Agendado, Aguardando retorno, Aguardando aprovação) não vence (dono, 2026-10-09: o topo dizia "1
      // atrasado" — o #32, agendado — e a performance, 0). O prazo é o do banco (`sla_due_at`, que já é o
      // maior entre a entrega pedida e o SLA), como na performance; `due_date` só na falta dele.
      const slaStopped = ['resolved', 'closed', 'cancelled', 'rejected'].includes(t.status)
        || ((SLA_PAUSED_STATUSES as readonly string[]).includes(t.status)
            // Agendado com o prazo já vencido continua atrasado (2026-10-15; 20270115010000).
            && !(t.status === 'scheduled' && (t as { agendou_vencido?: boolean }).agendou_vencido));
      const prazo = t.sla_due_at ?? t.due_date;
      const due = !slaStopped && prazo ? new Date(prazo) : null;
      const prio = normalizePriority(t.priority);
      const doResumo = t as { meu?: boolean; atendente?: string | null };
      items.push({ id: t.id, type: 'ticket', typeLabel: 'Chamado', title: t.title, subtitle: `#${t.ticket_number}`, priority: prio, dueDate: due, urgencyGroup: getUrgencyGroup(due), status: t.status, daEquipe: doResumo.meu === false, atendenteId: doResumo.atendente ?? null, modulo: t.module, moduleLabel: t.module ? (MODULE_LABELS[t.module as keyof typeof MODULE_LABELS] ?? (t.module === 'compras' ? 'Compras' : undefined)) : undefined, onClick: () => navigate(tenantPath(`/helpdesk/${t.id}`)) });
    });
    // Projetos pausados pelo dono (2026-10-03): os cartões deles saem da lista do dia.
    if (!estaPausada('/projetos')) kanbanCards.forEach(c => {
      const due = c.due_date ? new Date(c.due_date) : null;
      const prio = normalizePriority(c.priority);
      items.push({ id: c.id, type: 'kanban', typeLabel: 'Projeto', title: c.title, subtitle: c.board_name || 'Kanban', priority: prio, dueDate: due, urgencyGroup: getUrgencyGroup(due), status: c.column_name || 'Em andamento', onClick: () => navigate(tenantPath('/projetos')) });
    });
    // Uma lista só, "Para fazer", na ordem em que precisa ser feita (dono, 2026-10-28, proposta aprovada): atrasados,
    // hoje, amanhã, depois, sem prazo; dentro de cada um, o prazo mais perto; empate, a prioridade. Os grupos
    // Crítico/Alto/Médio saíram ("fica poluído").
    const ORDEM: Record<UnifiedDemand['urgencyGroup'], number> = { overdue: 0, today: 1, tomorrow: 2, future: 3, no_date: 4 };
    items.sort((a, b) =>
      ORDEM[a.urgencyGroup] - ORDEM[b.urgencyGroup]
      || (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity)
      || a.priority - b.priority);

    // Tarefa de fluxo e o chamado dela são a mesma demanda: uma linha só, a do
    // chamado, que é o que os relatórios contam. A linha que fica herda o botão
    // "Focar" da tarefa — sem isso o modo foco deixaria de alcançar trabalho de
    // fluxo, que é justamente o caminho do bug de 2026-09-12.
    const porChamado = new Map(items.filter((i) => i.type === 'ticket').map((i) => [i.id, i]));
    for (const t of items) {
      if (t.type !== 'task' || !t.ticketId) continue;
      const chamado = porChamado.get(t.ticketId);
      if (chamado && !chamado.onFocus) chamado.onFocus = t.onFocus;
    }
    return items.filter((i) => !(i.type === 'task' && i.ticketId && porChamado.has(i.ticketId)));
  }, [tasks, tickets, kanbanCards, navigate, tenantPath, onEnterFocusMode, onOpenTask]);
  // "Meus" × "Da minha equipe" (dono, 2026-10-20, #140): quem gerencia a fila via no topo o atraso do chamado
  // de outro atendente. Os números, o "Comece por" e a agenda contam só o que é meu — como a Performance —, e o
  // resto do setor vai para um bloco à parte, com o atendente de cada um.
  const unifiedDemands = useMemo(() => todasAsDemandas.filter((d) => !d.daEquipe), [todasAsDemandas]);
  const daEquipe = useMemo(() => todasAsDemandas.filter((d) => d.daEquipe), [todasAsDemandas]);
  const atrasosDaEquipe = daEquipe.filter((d) => d.urgencyGroup === 'overdue').length;
  const { data: pessoas = [] } = usePessoasDaEmpresa();
  const nomeDe = (id?: string | null) => (id ? pessoas.find((p) => p.id === id)?.nome ?? '—' : 'sem atendente');

  const firstName = profile?.full_name?.split(' ')[0] || 'Usuário';
  const getGreeting = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };

  const totalDemands = unifiedDemands.length;
  const overdueCount = unifiedDemands.filter(d => d.urgencyGroup === 'overdue').length;
  const todayCount = unifiedDemands.filter(d => d.urgencyGroup === 'today').length;
  const resolvedCount = unifiedDemands.filter(d => d.status === 'resolved' || d.status === 'closed').length;
  const nextAction = unifiedDemands[0] || null;

  const { todayEvents, createEvent } = useCalendarEvents();
  // No celular a Agenda vem recolhida, no fim da tela (proposta aprovada, 2026-10-28).
  const [agendaOpen, setAgendaOpen] = useState(() => typeof window === 'undefined' || window.matchMedia?.('(min-width: 1024px)').matches !== false);
  // "Da minha equipe" começa recolhido (proposta aprovada, 2026-10-28): o selo vermelho diz se há atraso.
  const [gruposFechados, setGruposFechados] = useState<Set<string>>(() => new Set(['equipe']));
  const [quickEventTitle, setQuickEventTitle] = useState('');
  const [quickEventTime, setQuickEventTime] = useState(proximaHoraCheia);

  const agendaItems = useMemo(() => {
    const items: { time: string; label: string; type: 'demand' | 'routine' | 'event'; urgency?: string; description?: string; origin?: string; route?: string; eventType?: string }[] = [];
    unifiedDemands.filter(d => d.urgencyGroup === 'today' || d.urgencyGroup === 'overdue').forEach(d => {
      items.push({
        time: d.dueDate ? format(d.dueDate, 'HH:mm') : '--:--',
        label: d.title,
        type: 'demand',
        urgency: d.urgencyGroup,
        origin: d.type === 'ticket' ? `Chamado ${d.subtitle}` : d.type === 'kanban' ? `Kanban · ${d.subtitle}` : 'Tarefa',
        route: d.type === 'ticket' ? `/helpdesk/${d.id}` : d.type === 'kanban' ? '/projetos' : undefined,
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

  // O lembrete rápido nascia com a hora de agora, já vencido, e o aviso nunca saía (defeito 12, 2026-10-24).
  // Agora tem hora: a próxima hora cheia por padrão, e o aviso sai na hora marcada (`reminder_offsets: [0]`).
  const handleQuickEvent = async () => {
    if (!quickEventTitle.trim() || !quickEventTime) return;
    const [h, m] = quickEventTime.split(':').map(Number);
    const quando = new Date();
    quando.setHours(h, m, 0, 0);
    if (quando.getTime() <= Date.now()) quando.setDate(quando.getDate() + 1); // hora que já passou = amanhã
    await createEvent.mutateAsync({
      title: quickEventTitle.trim(),
      start_at: quando.toISOString(),
      event_type: 'reminder',
      reminder_offsets: [0],
    });
    setQuickEventTitle('');
    setQuickEventTime(proximaHoraCheia());
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

  return (
    // O Início no desenho do "Dashboard" da DashStack (dono, 2026-10-28): o título grande, os números em cartões com o
    // ícone colorido, e cada bloco num cartão branco solto sobre o fundo. A página rola inteira, no celular e no computador.
    <div className="flex flex-col gap-6 lg:gap-7 px-4 lg:px-8 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[24px] sm:text-[32px] font-bold leading-tight tracking-[-0.11px] text-foreground">
          {getGreeting()}, <span className="text-primary">{firstName}</span>
        </h1>
        <Button variant="outline" onClick={atualizar} disabled={atualizando} className="gap-2 shrink-0">
          <RefreshCw className={`h-4 w-4 ${atualizando ? 'animate-spin' : ''}`} strokeWidth={2} />
          <span className="max-sm:hidden">Atualizar</span>
        </Button>
      </div>

      {/* "Meu dia": três números (proposta aprovada, 2026-10-28), cada um num cartão da DashStack com o ícone colorido. */}
      <div className="grid grid-cols-3 gap-3 sm:gap-6">
        {/* Passar o mouse mostra QUAIS demandas estão no número, cada uma clicável (dono, 2026-10-15). */}
        <DemandasNoHover titulo="Atrasados" demandas={unifiedDemands.filter(d => d.urgencyGroup === 'overdue')}>
          <KPICard value={overdueCount} label={overdueCount === 1 ? 'Atrasado' : 'Atrasados'} color="red" icon={AlertTriangle}
            className="h-full max-sm:px-3" />
        </DemandasNoHover>
        <DemandasNoHover titulo="Para hoje" demandas={unifiedDemands.filter(d => d.urgencyGroup === 'today')}>
          <KPICard value={todayCount} label="Para hoje" color="yellow" icon={Clock} className="h-full max-sm:px-3" />
        </DemandasNoHover>
        <KPICard value={perf.resolvedToday} label="Feitos hoje" color="green" icon={CheckCircle2} className="h-full max-sm:px-3" />
      </div>

      {/* A régua das horas, num cartão, só no computador (proposta aprovada, 2026-10-28: no celular ocupava sem dizer nada). */}
      <section className="hidden lg:block panel px-8 pt-6 pb-4">
        <h2 className="text-[24px] font-bold">Seu dia</h2>
        <ReguaDoDia prazos={unifiedDemands.filter((d) => d.dueDate).map((d) => ({ id: d.id, rotulo: d.title, quando: d.dueDate! }))} />
      </section>

      <div className="grid grid-cols-12 gap-6 lg:gap-7 items-start">
        <div className="col-span-12 lg:col-span-8 xl:col-span-9 flex flex-col gap-6 lg:gap-7 min-w-0">
          {/* "Para fazer": UMA lista, na ordem do prazo (proposta aprovada, 2026-10-28), no cartão "Deals Details" da
              DashStack: título, a faixa do cabeçalho e uma linha por demanda. No celular cada linha tem duas linhas. */}
          {unifiedDemands.length > 0 ? (
            <section className="panel px-4 sm:px-8 pt-6 pb-3">
              <div className="flex items-center justify-between gap-3 mb-5">
                <h2 className="text-[24px] font-bold">Para fazer <span className="text-muted-foreground font-semibold text-[16px]">· {unifiedDemands.length}</span></h2>
                {/* "Comece por": só no computador (no celular a primeira linha da lista já é isso). */}
                {nextAction && (
                  <Button size="sm" className="hidden lg:inline-flex gap-1.5 shrink-0"
                    onClick={() => { if (nextAction.onFocus) nextAction.onFocus(); else nextAction.onClick(); }}
                    title={`Comece por: ${nextAction.title}`}>
                    <Zap className="w-3.5 h-3.5" strokeWidth={2} /> Comece pela primeira
                  </Button>
                )}
              </div>
              <div className="hidden sm:grid grid-cols-[1fr_96px_150px_150px] gap-4 items-center h-12 px-6 rounded-xl bg-muted text-[14px] font-bold">
                <span>Demanda</span><span>Nº</span><span>Setor</span><span className="text-center">Prazo</span>
              </div>
              <ul className="divide-y divide-border/70">
                {unifiedDemands.map((item) => (
                  <li key={`${item.type}-${item.id}`} onClick={item.onClick}
                    className="group cursor-pointer flex flex-wrap gap-x-2.5 gap-y-1.5 items-center py-3 sm:py-0 sm:h-16 sm:grid sm:grid-cols-[1fr_96px_150px_150px] sm:gap-4 sm:px-6 transition-colors hover:bg-muted/40">
                    <span className="basis-full sm:basis-auto min-w-0 flex items-center gap-2">
                      <span className="text-[15px] sm:text-[14px] font-semibold text-foreground sm:truncate leading-snug">{item.title}</span>
                      {item.type === 'task' && <span className="text-[12px] text-muted-foreground shrink-0 hidden md:inline">{item.subtitle.toLowerCase()}</span>}
                      {/* A prioridade só aparece quando é Crítica (o resto é o prazo que diz). */}
                      {item.priority === 1 && <span className="estado estado-atraso shrink-0">Crítica</span>}
                      {item.onFocus && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); item.onFocus!(); }}
                          className="hidden sm:inline-flex ml-auto opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted-foreground hover:text-primary items-center justify-center h-9 w-9 shrink-0"
                          aria-label={`Focar em ${item.title}`}>
                          <Play className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                        </button>
                      )}
                    </span>
                    <span className="text-[14px] text-primary font-bold shrink-0 tabular-nums">
                      {item.type === 'ticket' ? item.subtitle : item.typeLabel}
                    </span>
                    <span className="min-w-0 truncate">
                      {setorDoModulo(item.modulo) ? <ChipDoSetor setor={item.modulo} />
                        : item.moduleLabel ? <span className="text-[13px] font-semibold text-muted-foreground">{item.moduleLabel}</span> : null}
                    </span>
                    <span className={cn('estado shrink-0 sm:justify-self-center', SELO_DO_PRAZO[item.urgencyGroup])}>
                      {rotuloDoPrazo(item)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <section className="panel">
              <EmptyStateSuggestions modules={modules} atrasosDaEquipe={atrasosDaEquipe} />
            </section>
          )}

          {daEquipe.length > 0 && (
            <section className="panel overflow-hidden">
              <div>
                <button type="button" aria-expanded={!gruposFechados.has('equipe')}
                  onClick={() => setGruposFechados((s) => { const n = new Set(s); if (n.has('equipe')) n.delete('equipe'); else n.add('equipe'); return n; })}
                  className="w-full flex items-center gap-3 px-4 sm:px-8 py-4 text-left">
                  <ChevronDown className={`w-4 h-4 opacity-80 transition-transform ${gruposFechados.has('equipe') ? '-rotate-90' : ''}`} strokeWidth={2} aria-hidden="true" />
                  <span className="font-bold text-[14px] whitespace-nowrap">Da minha equipe</span>
                  <span className="text-[13px] px-2 py-0.5 rounded-full font-semibold bg-current/15">{daEquipe.length}</span>
                  {atrasosDaEquipe > 0 && (
                    <span className="text-[13px] px-2 py-0.5 rounded-full font-semibold bg-[hsl(var(--estado-atraso-bg))] text-[hsl(var(--estado-atraso-fg))]">
                      {atrasosDaEquipe} {atrasosDaEquipe === 1 ? 'atrasado' : 'atrasados'}
                    </span>
                  )}
                  {/* No celular a nota sai: quebrava o cabeçalho em três linhas (2026-10-28). */}
                  <span className="hidden sm:inline text-[12px] text-muted-foreground">não contam nos seus números nem na sua Performance</span>
                </button>
                {!gruposFechados.has('equipe') && [...daEquipe]
                  .sort((a, b) => (a.urgencyGroup === 'overdue' ? 0 : 1) - (b.urgencyGroup === 'overdue' ? 0 : 1)
                    || (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity))
                  .map((item) => (
                    <div key={`equipe-${item.id}`} onClick={item.onClick}
                      className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1 sm:gap-4 py-3 sm:py-0 sm:h-14 px-4 sm:px-8 cursor-pointer border-t border-border/70 hover:bg-muted/40">
                      <span className="text-[14px] text-primary font-bold tabular-nums sm:w-16 shrink-0 truncate">{item.subtitle}</span>
                      <span className="order-first basis-full sm:order-none sm:basis-auto flex-1 min-w-0 text-[15px] sm:text-[14px] text-foreground sm:truncate font-semibold sm:font-medium">{item.title}</span>
                      <span className="sm:w-32 shrink-0 text-[13px] text-muted-foreground truncate">{nomeDe(item.atendenteId)}</span>
                      <span className="sm:w-24 sm:text-center shrink-0 sm:border-l border-border text-[12px] text-muted-foreground truncate">
                        {setorDoModulo(item.modulo) ? <ChipDoSetor setor={item.modulo} /> : (item.moduleLabel ?? '—')}
                      </span>
                      <span className={`text-[13px] sm:w-20 sm:text-center shrink-0 sm:border-l border-border font-medium ${
                        item.urgencyGroup === 'overdue' ? 'text-status-danger font-bold' : 'text-muted-foreground'}`}>
                        {item.dueDate
                          ? item.urgencyGroup === 'overdue' ? 'atrasado'
                            : item.urgencyGroup === 'today' ? 'Hoje' : format(item.dueDate, 'dd MMM', { locale: ptBR })
                          : semPrazo(item.status)}
                      </span>
                    </div>
                  ))}
              </div>
            </section>
          )}
          {/* Os avisos (as movimentações não vistas) vêm DEPOIS do que fazer (proposta aprovada, 2026-10-28). */}
          <LyraAvisa />
          {/* As Notícias descem para o fim (proposta "Helpoint no dia a dia", Início, 2026-10-24): o trabalho vem primeiro.
              A notícia nova continua com o número no item "Notícias" do menu. Some sem notícia. */}
          <JornalNaHome />
        </div>

        {/* ── Right Panel ── */}
        {/* Rodada 3 (achado C4): no celular a Agenda e a Sua Performance vêm abaixo da lista — antes sumiam abaixo de 1024 px. */}
        <div className="col-span-12 lg:col-span-4 xl:col-span-3 flex flex-col gap-6 lg:gap-7 min-w-0">

          {/* Lyra Chat: o painel inteiro é IA (resumo, chat, voz) e some com a IA desligada (2026-10-26). */}
          {/* No celular o painel da Lyra sai (proposta aprovada, 2026-10-28); fica no computador. */}
          {iaLigada && (
          <section className="hidden lg:block panel overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
              <LyraAvatar size="sm" animated={isLoadingAI || isChatTyping} />
              <span className="text-[14px] font-semibold text-foreground">{assistantName}</span>
              <span className="text-[12px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded uppercase">IA</span>
            </div>

            <div ref={chatScrollRef} className="px-4 py-3 max-h-[180px] overflow-y-auto space-y-3" onWheel={(e) => e.stopPropagation()}>
              {isLoadingAI && !summary ? (
                <div className="flex items-center gap-2 text-muted-foreground py-2">
                  <span className="text-[14px]">Analisando…</span>
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              ) : (
                <LyraBriefing content={summary || 'Nenhuma pendência.'} tickets={ticketsDoResumo} kanbanCards={kanbanCards} tasks={tasks} onFocusTask={onOpenTask} />
              )}

              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'user' ? (
                    <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md px-3 py-2 max-w-[85%]">
                      <p className="text-[14px]">{msg.content}</p>
                    </div>
                  ) : (
                    <div className="bg-surface-2 rounded-2xl rounded-bl-md px-3 py-2 max-w-[90%]">
                      <MarkdownRenderer content={msg.content} className="text-[14px] text-foreground" />
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

            {aiError && <p className="text-[13px] text-monday-red px-4 pb-1">{aiError}</p>}

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
                      placeholder={`Pergunte à ${assistantName}…`}
                      disabled={isChatTyping}
                      className="bg-transparent border-0 focus:outline-none focus:ring-0 text-[14px] text-foreground placeholder:text-muted-foreground flex-1"
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
          </section>
          )}

          {/* Agenda Timeline */}
          <Collapsible open={agendaOpen} onOpenChange={setAgendaOpen}>
            <section className="panel">
              <div className="flex items-center justify-between px-4 py-3">
                <CollapsibleTrigger className="flex items-center gap-2 cursor-pointer group">
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${!agendaOpen ? '-rotate-90' : ''}`} strokeWidth={1.5} />
                  <span className="text-[18px] font-bold text-foreground group-hover:text-primary transition-colors">Agenda</span>
                  <span className="text-[12px] font-semibold text-muted-foreground bg-surface-2 px-1.5 py-0.5 rounded">{agendaItems.length}</span>
                </CollapsibleTrigger>
                <button onClick={() => navigate(tenantPath('/agenda'))} className="text-[12px] font-medium text-primary hover:text-primary/80 transition-colors">
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
                          <span className="text-[13px] font-mono text-primary w-10 shrink-0">{item.time}</span>
                          <div className={`w-2 h-2 rounded-full shrink-0 ${
                            item.type === 'routine' ? 'bg-monday-purple' :
                            item.type === 'event' ? (item.eventType === 'reminder' ? 'bg-monday-yellow' : 'bg-primary') :
                            item.urgency === 'overdue' ? 'bg-monday-red' : 'bg-monday-yellow'
                          }`} />
                          <span className="text-[14px] text-foreground truncate flex-1">{item.label}</span>
                          <span className="text-[12px] font-medium text-muted-foreground shrink-0 bg-surface-2 px-1.5 py-0.5 rounded">
                            {item.type === 'routine' ? 'Rotina' : item.type === 'event' ? (item.eventType === 'reminder' ? 'Lembrete' : 'Evento') : 'Demanda'}
                          </span>
                        </div>
                      </HoverCardTrigger>
                      <HoverCardContent side="left" align="start" className="w-56 p-3" sideOffset={8}>
                        <div className="space-y-2">
                          <p className="text-[14px] font-semibold text-foreground">{item.label}</p>
                          <p className="text-[13px] text-muted-foreground">{item.time}</p>
                          {item.description && <p className="text-[13px] text-muted-foreground">{item.description}</p>}
                          {item.origin && <p className="text-[12px] text-muted-foreground">Origem: {item.origin}</p>}
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  )) : (
                    <p className="text-[14px] text-muted-foreground py-2">Nenhum compromisso</p>
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
                      placeholder="Lembrete rápido…"
                      className="bg-transparent border-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded text-[14px] text-foreground placeholder:text-muted-foreground flex-1 min-w-0"
                    />
                    <input
                      type="time"
                      value={quickEventTime}
                      onChange={(e) => setQuickEventTime(e.target.value)}
                      aria-label="Hora do lembrete"
                      className="bg-transparent border border-border rounded px-1.5 py-0.5 text-[13px] text-foreground w-[92px] shrink-0"
                    />
                    {quickEventTitle.trim() && (
                      <button type="button" aria-label="Salvar lembrete" onClick={handleQuickEvent} className="p-1.5 text-primary hover:text-primary/80 transition-colors">
                        <Send className="w-3.5 h-3.5" strokeWidth={2} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              </CollapsibleContent>
            </section>
          </Collapsible>

          {/* Performance — Radial Progress */}
          <section className="panel">
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-[18px] font-bold text-foreground">Sua Performance</span>
              {/* Esta semana ou este mês (dono, 2026-10-13), lembrado no navegador. */}
              <div className="inline-flex rounded-md border border-border p-0.5 text-[12px]" role="group" aria-label="Período da performance">
                {([['semana', 'Esta semana'], ['mes', 'Este mês']] as const).map(([p, rotulo]) => (
                  <button key={p} type="button" onClick={() => escolherPeriodo(p)} aria-pressed={periodo === p}
                    className={cn('rounded px-2 py-0.5 font-medium', periodo === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
                    {rotulo}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-4 pb-4 grid grid-cols-4 gap-2">
              {/* Radial: On-Time Rate */}
              <HoverCard openDelay={150} closeDelay={100}>
                <HoverCardTrigger asChild>
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
                    <span className="text-[12px] text-muted-foreground font-medium text-center">No Prazo</span>
                  </div>
                </HoverCardTrigger>
                <HoverCardContent side="bottom" className="w-[220px] p-3 text-xs">
                  <p className="font-semibold mb-1">No prazo</p>
                  <p>Percentual dos seus chamados e tarefas concluídos dentro do prazo {noPeriodo} — só dos seus setores; ajuda a outros setores não entra. Verde acima de 80%, amarelo entre 60% e 80%, vermelho abaixo.</p>
                </HoverCardContent>
              </HoverCard>

              {/* Entregas (week) */}
              <HoverCard openDelay={150} closeDelay={100}>
                <HoverCardTrigger asChild>
                  <div className="flex flex-col items-center gap-1.5 cursor-help">
                    <div className="w-16 h-16 rounded-full border-[3px] border-primary/30 flex items-center justify-center bg-primary/5">
                      <span className="text-lg font-bold text-primary">{perf.resolvedThisWeek}</span>
                    </div>
                    <span className="text-[12px] text-muted-foreground font-medium text-center">Entregas</span>
                  </div>
                </HoverCardTrigger>
                <HoverCardContent side="bottom" className="w-[220px] p-3 text-xs">
                  <p className="font-semibold mb-1">Entregas</p>
                  <p>Chamados e tarefas que você concluiu {noPeriodo}, dos seus setores. O que você resolveu para outro setor aparece à parte, em "Ajuda a outros setores".</p>
                </HoverCardContent>
              </HoverCard>

              {/* Streak */}
              <HoverCard openDelay={150} closeDelay={100}>
                <HoverCardTrigger asChild>
                  <div className="flex flex-col items-center gap-1.5 cursor-help">
                    {/* Na semana, a sequência de agora; no mês, a melhor do mês (dono, 2026-10-13). */}
                    {(() => { const seq = periodo === 'semana' ? perf.streak : perf.melhorSequenciaDoMes; return (
                    <div className={cn(
                      "w-16 h-16 rounded-full border-[3px] flex items-center justify-center gap-0.5",
                      seq >= 3 ? 'border-monday-orange/40 bg-monday-orange/5' : 'border-border'
                    )}>
                      <Flame className={cn("w-4 h-4", seq >= 3 ? 'text-monday-orange' : 'text-muted-foreground')} strokeWidth={2} />
                      <span className={cn("text-lg font-bold", seq >= 3 ? 'text-monday-orange' : 'text-foreground')}>{seq}</span>
                    </div>
                    ); })()}
                    <span className="text-[12px] text-muted-foreground font-medium text-center">{periodo === 'semana' ? 'Sequência' : 'Melhor sequência'}</span>
                  </div>
                </HoverCardTrigger>
                <HoverCardContent side="bottom" className="w-[260px] p-3 text-xs space-y-1">
                  {/* O dono, 2026-10-13: a sequência é de resolver, não de dias; e a semana zera na segunda. */}
                  <p className="font-semibold">Sequência: resolvidos seguidos no prazo</p>
                  <p>Cada chamado ou tarefa que você resolve dentro do prazo soma +1. Um resolvido atrasado zera a conta. Toda segunda-feira começa do zero.</p>
                  <p>3 seguidos acendem a chama, 6 "Pegando fogo", 10 "EM CHAMAS".</p>
                  <p className="text-muted-foreground">{periodo === 'semana'
                    ? 'Ex.: segunda resolveu 4 no prazo, terça 1 atrasado e 2 no prazo → sequência 2.'
                    : 'No mês aparece a melhor sequência de uma semana do mês.'}</p>
                </HoverCardContent>
              </HoverCard>


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
                      "text-[12px] font-medium text-center",
                      perf.overdueItems.length > 0 ? 'text-monday-red' : 'text-muted-foreground'
                    )}>
                      Atrasos
                    </span>
                  </button>
                </HoverCardTrigger>
                <HoverCardContent align="end" side="left" className="w-80 p-0">
                  <div className="px-3 py-2 border-b border-border flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-monday-red" />
                    <span className="text-[14px] font-semibold text-foreground">
                      {perf.overdueItems.length === 0
                        ? 'Sem atrasos'
                        : `${perf.overdueItems.length} ${perf.overdueItems.length === 1 ? 'item atrasado' : 'itens atrasados'}`}
                    </span>
                  </div>
                  {perf.overdueItems.length === 0 ? (
                    <div className="p-4 text-center text-[13px] text-muted-foreground">
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
                            <p className="text-[14px] font-medium text-foreground line-clamp-1 group-hover:text-monday-red">
                              {item.title}
                            </p>
                            <span className="text-[12px] font-bold uppercase tracking-wider badge-danger px-1.5 py-0.5 rounded shrink-0">
                              {item.daysOverdue}d
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[12px] uppercase tracking-wider font-semibold text-muted-foreground">
                              {item.typeLabel}
                            </span>
                            <span className="text-[12px] text-muted-foreground">·</span>
                            <span className="text-[12px] text-muted-foreground">
                              {format(item.dueDate, "dd/MM 'às' HH:mm", { locale: ptBR })}
                            </span>
                          </div>
                        </button>
                      ))}
                      {perf.overdueItems.length > 10 && (
                        <div className="px-3 py-2 text-[12px] text-muted-foreground text-center border-t border-border">
                          + {perf.overdueItems.length - 10} outros atrasos
                        </div>
                      )}
                    </div>
                  )}
                </HoverCardContent>
              </HoverCard>
            </div>
            {/* A chama: o gatilho para quem resolve muito E no prazo — acende pela sequência da semana (dono,
                2026-10-13), 3 níveis, cada um maior e mais vivo (`@/lib/chama-da-performance`, `.chama` no index.css). */}
            <div className={cn(
              'mx-4 mb-3 flex items-center gap-3 rounded-lg border px-3 py-2',
              chama.nivel === 0 ? 'border-border text-muted-foreground' : 'border-monday-orange/40 bg-monday-orange/5',
            )}>
              <span className="flex items-end gap-0.5 shrink-0" aria-hidden="true">
                {Array.from({ length: Math.max(1, chama.nivel) }).map((_, i) => (
                  <Flame key={i} strokeWidth={2}
                    className={cn(
                      chama.nivel === 0 ? 'w-5 h-5 text-muted-foreground/50' : `chama chama-${chama.nivel} text-monday-orange fill-monday-orange/30`,
                      chama.nivel === 1 && 'w-6 h-6', chama.nivel === 2 && 'w-7 h-7', chama.nivel === 3 && 'w-8 h-8 text-monday-red fill-monday-orange/50',
                    )}
                    style={{ animationDelay: `${i * 0.2}s` }} />
                ))}
              </span>
              <span className="min-w-0">
                <span className={cn('block text-[13px] font-bold uppercase tracking-wide', chama.nivel > 0 && 'text-monday-orange')}>
                  {chama.nome}
                </span>
                <span className="block text-[12px] text-muted-foreground">{chama.frase}</span>
              </span>
            </div>
            {/* Ajuda a outros setores (dono, 2026-10-07): fica à parte e não pesa nos números acima. */}
            {perf.ajudaOutrosSetores > 0 && (
              <div className="px-4 pb-3 -mt-1 flex items-center justify-center gap-1.5 text-[12px] text-muted-foreground">
                <HandHelping className="w-3.5 h-3.5" aria-hidden="true" />
                Ajuda a outros setores: <span className="font-semibold text-foreground">{perf.ajudaOutrosSetores}</span>
                <ExplicacaoDoIndicador id="inicio.ajuda_outros_setores" />
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

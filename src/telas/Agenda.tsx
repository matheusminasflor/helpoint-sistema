import { useState, useMemo } from 'react';
import { useQueryState } from '@/hooks/useQueryState';
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, Plus, Repeat, Trash2, Pencil, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { EventEditDialog, type EventoEditavel, type MudancaDoEvento } from '@/components/dashboard/EventEditDialog';
import { ConfirmarExclusao } from '@/components/ui/ConfirmarExclusao';
import { Button } from '@/components/ui/button';
import { useCalendarEvents, type RecurrenceScope } from '@/hooks/useCalendarEvents';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { EventCreateDialog } from '@/components/dashboard/EventCreateDialog';
import { RecurrenceScopeDialog } from '@/components/dashboard/RecurrenceScopeDialog';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useAgendaUnica } from '@/hooks/useAgendaUnica';
import { itensDaAgenda, type ItemDaAgenda } from '@/lib/agenda-unica';
import { toLocalISODate } from '@/lib/dates';
import { cn } from '@/lib/utils';

// A Agenda única (etapa 4, 2026-10-25): os eventos de sempre e, junto, o que vinha só no Início — os meus chamados
// agendados e os prazos — mais as férias de quem é do meu setor. Esses três não se editam aqui: o chamado abre no
// clique, e as férias são do RH.
const rotuloExtra: Record<ItemDaAgenda['tipo'], string> = { agendado: 'Chamado agendado', prazo: 'Prazo', ferias: 'Férias' };

// `meeting` nasce das reuniões marcadas no negócio (CRM-3b). Sem entrada aqui,
// a etiqueta saía literalmente "MEETING", em inglês. A cor fica na semântica
// que os mapas abaixo já têm de reserva (`bg-primary`): paleta fixa é dívida
// congelada pela L0b, e reunião não precisa abrir mais uma.
const typeLabels: Record<string, string> = {
  event: 'Evento',
  reminder: 'Lembrete',
  routine: 'Rotina',
  meeting: 'Reunião',
};

const typeColors: Record<string, string> = {
  // Situação em palavras (etapa 2): o tipo do evento sem a pílula colorida.
  event: 'text-muted-foreground',
  reminder: 'text-muted-foreground',
  routine: 'text-muted-foreground',
};

const dotColors: Record<string, string> = {
  event: 'bg-status-info',
  reminder: 'bg-status-warning',
  routine: 'bg-status-success',
};

// A faixa do evento dentro do dia, como na DashStack: fundo claro da cor e a borda esquerda cheia.
const FAIXA_DO_TIPO: Record<string, string> = {
  event: 'badge-info border-status-info',
  meeting: 'badge-purple border-[hsl(var(--badge-purple-text))]',
  reminder: 'badge-warning border-status-warning',
  routine: 'badge-success border-status-success',
  prazo: 'badge-orange border-[hsl(var(--badge-orange-text))]',
  ferias: 'badge-neutral border-[hsl(var(--badge-neutral-text))]',
};

const DIAS_DA_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function Agenda() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(new Date().getDate());
  // Só no celular: o calendário recolhido (rodada 3, etapa D). No computador ele fica sempre aberto (sm:contents).
  const [calendarioAberto, setCalendarioAberto] = useState(false);
  const [open, setOpen] = useState(false);
  const [defaultDate, setDefaultDate] = useState<string | undefined>(undefined);
  const [filterType, setFilterType] = useQueryState<string>('tipo', 'all');

  // Scope dialog state for delete on recurring events
  const [scopeDialog, setScopeDialog] = useState<{
    open: boolean;
    eventId: string;
    eventTitle: string;
  }>({ open: false, eventId: '', eventTitle: '' });

  const range = useMemo(() => ({
    from: startOfMonth(currentMonth),
    to: endOfMonth(currentMonth),
  }), [currentMonth]);

  const { events, eventDays, createEvent, deleteEvent, updateEvent } = useCalendarEvents(range);
  const { user } = useAuth();
  const tenantPath = useTenantPath();
  const de = toLocalISODate(range.from);
  const ate = toLocalISODate(range.to);
  const { chamados, ferias } = useAgendaUnica(de, ate);
  const extrasPorDia = useMemo(
    () => itensDaAgenda(chamados.data ?? [], ferias.data ?? [], de, ate, user?.id),
    [chamados.data, ferias.data, de, ate, user?.id],
  );
  const extrasDoMes = useMemo(() => [...extrasPorDia.values()].flat(), [extrasPorDia]);
  const [editando, setEditando] = useState<EventoEditavel | null>(null);
  // A mudança espera a escolha "só este / os próximos / todos" quando o evento se repete.
  const [mudancaPendente, setMudancaPendente] = useState<{ mudanca: MudancaDoEvento; mudouAHora: boolean } | null>(null);
  const [apagandoAvulso, setApagandoAvulso] = useState<{ id: string; title: string } | null>(null);

  const selectedDate = useMemo(() => {
    if (selectedDay === null) return new Date();
    return new Date(currentMonth.getFullYear(), currentMonth.getMonth(), selectedDay);
  }, [selectedDay, currentMonth]);

  const selectedDateLabel = useMemo(() => {
    return format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR });
  }, [selectedDate]);

  // Items for the selected day
  const dayItems = useMemo(() => {
    const items = events
      .filter(e => new Date(e.start_at).toDateString() === selectedDate.toDateString())
      .map(ev => ({
        id: ev.id,
        time: format(new Date(ev.start_at), 'HH:mm'),
        title: ev.title,
        type: ev.event_type,
        description: ev.description || undefined,
        seriesId: ev.series_id,
        start_at: ev.start_at,
        rawDescription: ev.description ?? '',
      }))
      .sort((a, b) => a.time.localeCompare(b.time));

    if (filterType === 'chamados' || filterType === 'ferias') return [];
    if (filterType !== 'all') return items.filter(i => i.type === filterType);
    return items;
  }, [events, selectedDate, filterType]);

  const extrasDoDia = useMemo(() => {
    const todos = (extrasPorDia.get(toLocalISODate(selectedDate)) ?? [])
      .slice().sort((a, b) => (a.hora ?? '').localeCompare(b.hora ?? ''));
    if (filterType === 'all') return todos;
    if (filterType === 'chamados') return todos.filter((i) => i.tipo !== 'ferias');
    if (filterType === 'ferias') return todos.filter((i) => i.tipo === 'ferias');
    return [];
  }, [extrasPorDia, selectedDate, filterType]);

  // Calendar grid
  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const firstDay = start.getDay();
    const daysInMonth = endOfMonth(currentMonth).getDate();
    const days: { day: number; hasEvent: boolean; isToday: boolean }[] = [];

    for (let i = 0; i < firstDay; i++) {
      days.push({ day: 0, hasEvent: false, isToday: false });
    }

    const today = new Date();
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d);
      days.push({
        day: d,
        hasEvent: eventDays.has(date.toDateString()) || extrasPorDia.has(toLocalISODate(date)),
        isToday: date.toDateString() === today.toDateString(),
      });
    }
    return days;
  }, [currentMonth, eventDays, extrasPorDia]);

  // O que cada dia do mês mostra na grade grande (DashStack "Calendar"): até duas faixas e "+N". Segue o filtro.
  const faixasPorDia = useMemo(() => {
    const mapa = new Map<string, { titulo: string; classe: string }[]>();
    const por = (chave: string) => { if (!mapa.has(chave)) mapa.set(chave, []); return mapa.get(chave)!; };
    if (filterType !== 'chamados' && filterType !== 'ferias') {
      for (const ev of events) {
        if (filterType !== 'all' && ev.event_type !== filterType) continue;
        por(toLocalISODate(new Date(ev.start_at))).push({ titulo: ev.title, classe: FAIXA_DO_TIPO[ev.event_type] ?? FAIXA_DO_TIPO.event });
      }
    }
    for (const [dia, itens] of extrasPorDia) {
      for (const item of itens) {
        if (filterType === 'chamados' && item.tipo === 'ferias') continue;
        if (filterType === 'ferias' && item.tipo !== 'ferias') continue;
        if (filterType !== 'all' && filterType !== 'chamados' && filterType !== 'ferias') continue;
        por(dia).push({ titulo: item.titulo, classe: item.tipo === 'ferias' ? FAIXA_DO_TIPO.ferias : FAIXA_DO_TIPO.prazo });
      }
    }
    return mapa;
  }, [events, extrasPorDia, filterType]);

  const handleDayClick = (day: number) => {
    if (day <= 0) return;
    setSelectedDay(day);
  };

  const handleDayDoubleClick = (day: number) => {
    if (day <= 0) return;
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    setDefaultDate(format(date, 'yyyy-MM-dd'));
    setSelectedDay(day);
    setOpen(true);
  };

  const openCreateDialog = () => {
    if (selectedDay !== null) {
      const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), selectedDay);
      setDefaultDate(format(date, 'yyyy-MM-dd'));
    } else {
      setDefaultDate(format(new Date(), 'yyyy-MM-dd'));
    }
    setOpen(true);
  };

  const handleDeleteClick = (item: { id: string; title: string; seriesId: string | null }) => {
    if (item.seriesId) {
      setScopeDialog({ open: true, eventId: item.id, eventTitle: item.title });
    } else {
      setApagandoAvulso({ id: item.id, title: item.title });
    }
  };

  const salvarEdicao = (mudanca: MudancaDoEvento, mudouAHora: boolean) => {
    if (!editando) return;
    if (editando.seriesId) { setMudancaPendente({ mudanca, mudouAHora }); return; }
    updateEvent.mutate({ id: editando.id, scope: 'this', changes: mudanca }, { onSuccess: () => setEditando(null) });
  };
  const confirmarEscopoDaEdicao = (scope: RecurrenceScope) => {
    if (!editando || !mudancaPendente) return;
    // Para "os próximos" e "todos", a hora não vai junto: gravar o mesmo start_at em toda a série a empilharia
    // num horário só. Dia e hora mudam só em "só este".
    const { start_at, ...semHora } = mudancaPendente.mudanca;
    const changes = scope === 'this' ? mudancaPendente.mudanca : semHora;
    void start_at;
    updateEvent.mutate({ id: editando.id, scope, changes }, { onSuccess: () => { setEditando(null); setMudancaPendente(null); } });
  };

  const handleScopeConfirm = (scope: RecurrenceScope) => {
    deleteEvent.mutate({ id: scopeDialog.eventId, scope });
  };

  const hoje = new Date();
  const irParaHoje = () => { setCurrentMonth(hoje); setSelectedDay(hoje.getDate()); };

  return (
    // O "Calendar" da DashStack (2026-10-28): à esquerda o cartão do dia, com o "Novo evento" no topo; à direita o mês
    // inteiro num cartão grande, com as faixas dos eventos dentro de cada dia. No celular o dia vem primeiro e o mês
    // fica recolhido (rodada 3, etapa D, Posição serial).
    <div className="flex flex-col gap-6 px-4 lg:px-8 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[24px] sm:text-[32px] font-bold leading-tight tracking-[-0.11px]">Agenda</h1>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-9 w-48 bg-card" aria-label="Mostrar na agenda">
            <Filter className="w-4 h-4 mr-1.5 text-muted-foreground" aria-hidden="true" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="event">Eventos</SelectItem>
            <SelectItem value="reminder">Lembretes</SelectItem>
            <SelectItem value="routine">Rotinas</SelectItem>
            <SelectItem value="meeting">Reuniões</SelectItem>
            <SelectItem value="chamados">Chamados e prazos</SelectItem>
            <SelectItem value="ferias">Férias do setor</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] items-start">
        {/* O dia escolhido */}
        <section className="panel p-5 flex flex-col gap-4 min-w-0">
          <Button className="w-full h-[43px] gap-2" onClick={openCreateDialog}>
            <Plus className="w-4 h-4" aria-hidden="true" /> Novo evento
          </Button>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-[18px] font-bold first-letter:uppercase">{selectedDateLabel}</h2>
              <p className="text-[13px] font-semibold text-muted-foreground">{dayItems.length + extrasDoDia.length} {dayItems.length + extrasDoDia.length === 1 ? 'item' : 'itens'}</p>
            </div>
            <button type="button" aria-expanded={calendarioAberto} onClick={() => setCalendarioAberto((a) => !a)}
              className="lg:hidden shrink-0 text-[14px] font-bold text-primary min-h-10 px-1">
              {calendarioAberto ? 'Fechar o mês' : 'Escolher o dia'}
            </button>
          </div>

          {dayItems.length + extrasDoDia.length > 0 ? (
            <div className="divide-y divide-border/70 -mx-5">
              {extrasDoDia.map((item) => {
                const corpo = (
                  <>
                    <span className="text-[13px] font-bold text-muted-foreground w-12 shrink-0 pt-0.5 tabular-nums">{item.hora ?? 'o dia'}</span>
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${item.tipo === 'prazo' ? 'bg-status-info' : 'bg-muted-foreground'}`} />
                    <div className="flex-1 min-w-0">
                      <span className="block text-[14px] font-bold text-foreground">{item.titulo}</span>
                      <span className="block text-[12px] font-semibold text-muted-foreground">{rotuloExtra[item.tipo]}</span>
                      {item.detalhe && <p className="text-[12px] text-muted-foreground mt-0.5">{item.detalhe}</p>}
                    </div>
                  </>
                );
                return item.chamadoId ? (
                  <Link key={item.chave} to={tenantPath(`/helpdesk/${item.chamadoId}`)}
                    className="flex items-start gap-3 px-5 py-3 hover:bg-muted/40 transition-colors">{corpo}</Link>
                ) : (
                  <div key={item.chave} className="flex items-start gap-3 px-5 py-3">{corpo}</div>
                );
              })}
              {dayItems.map(item => (
                <div key={item.id} className="flex items-start gap-3 px-5 py-3 hover:bg-muted/40 transition-colors group">
                  <span className="text-[13px] font-bold text-muted-foreground w-12 shrink-0 pt-0.5 tabular-nums">{item.time}</span>
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${dotColors[item.type] || 'bg-primary'}`} />
                  <div className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5 text-[14px] font-bold text-foreground">
                      {item.title}
                      {item.seriesId && <Repeat className="w-3 h-3 text-primary/70 shrink-0" strokeWidth={2} aria-label="Evento recorrente" />}
                    </span>
                    <span className={`block text-[12px] font-semibold ${typeColors[item.type] || 'text-primary'}`}>{typeLabels[item.type] || item.type}</span>
                    {item.description && <p className="text-[12px] text-muted-foreground mt-0.5">{item.description}</p>}
                  </div>
                  <button
                    onClick={() => setEditando({ id: item.id, title: item.title, description: item.rawDescription, start_at: item.start_at, seriesId: item.seriesId })}
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground hover:text-foreground mt-0.5"
                    aria-label={`Editar ${item.title}`}
                  >
                    <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => handleDeleteClick(item)}
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground hover:text-destructive mt-0.5"
                    aria-label={`Excluir ${item.title}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <span className="w-[60px] h-[60px] rounded-[23px] kpi-icone-azul flex items-center justify-center mb-3">
                <CalendarDays className="w-7 h-7" aria-hidden="true" />
              </span>
              <p className="text-[14px] font-bold">Nenhum evento neste dia</p>
              <p className="text-[12px] text-muted-foreground mt-1">Clique duas vezes num dia do mês ou use "Novo evento".</p>
            </div>
          )}

          <div className="border-t border-border/70 pt-4 -mx-5 px-5">
            <p className="text-[13px] font-bold text-muted-foreground mb-2">Resumo do mês</p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <span className="text-[22px] font-bold block tabular-nums leading-tight">{events.length}</span>
                <span className="text-[12px] font-semibold text-muted-foreground">Eventos</span>
              </div>
              <div>
                <span className="text-[22px] font-bold block tabular-nums leading-tight">{extrasDoMes.filter((i) => i.tipo !== 'ferias').length}</span>
                <span className="text-[12px] font-semibold text-muted-foreground">Chamados</span>
              </div>
              <div>
                <span className="text-[22px] font-bold block tabular-nums leading-tight">{new Set(extrasDoMes.filter((i) => i.tipo === 'ferias').map((i) => i.titulo)).size}</span>
                <span className="text-[12px] font-semibold text-muted-foreground">De férias</span>
              </div>
            </div>
            {(chamados.isError || ferias.isError) && (
              <p className="text-[12px] text-status-danger mt-2">Não consegui ler {chamados.isError ? 'os chamados' : 'as férias'} do mês. Recarregue a página.</p>
            )}
          </div>
        </section>

        {/* O mês inteiro */}
        <section className={cn('panel p-4 sm:p-6 min-w-0', !calendarioAberto && 'max-lg:hidden', 'max-lg:order-first')}>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mb-5">
            <Button variant="outline" size="sm" className="justify-self-start" onClick={irParaHoje}>Hoje</Button>
            <div className="flex items-center gap-3 sm:gap-5">
              <button type="button" aria-label="Mês anterior" onClick={() => setCurrentMonth(m => subMonths(m, 1))}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted">
                <ChevronLeft aria-hidden="true" className="w-5 h-5" />
              </button>
              <span className="text-[18px] sm:text-[24px] font-bold capitalize tabular-nums whitespace-nowrap">
                {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
              </span>
              <button type="button" aria-label="Próximo mês" onClick={() => setCurrentMonth(m => addMonths(m, 1))}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted">
                <ChevronRight aria-hidden="true" className="w-5 h-5" />
              </button>
            </div>
            <span />
          </div>

          <div className="rounded-xl border border-border overflow-hidden" role="group" aria-label="Dias do mês">
            <div className="grid grid-cols-7 bg-muted">
              {DIAS_DA_SEMANA.map((d) => (
                <div key={d} className="py-3 text-center text-[13px] sm:text-[14px] font-bold">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {calendarDays.map((d, i) => {
                const chave = d.day > 0 ? toLocalISODate(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d.day)) : '';
                const faixas = d.day > 0 ? faixasPorDia.get(chave) ?? [] : [];
                const escolhido = selectedDay === d.day;
                return d.day > 0 ? (
                  <button type="button" key={i}
                    onClick={() => { handleDayClick(d.day); setCalendarioAberto(false); }}
                    onDoubleClick={() => handleDayDoubleClick(d.day)}
                    aria-label={`${d.day}${faixas.length ? `, ${faixas.length} ${faixas.length === 1 ? 'item' : 'itens'}` : ''}`}
                    aria-pressed={escolhido}
                    className={cn('relative min-h-[52px] sm:min-h-[104px] border-t border-l border-border p-1 sm:p-2 flex flex-col items-stretch gap-1 text-left transition-colors hover:bg-muted/40',
                      i % 7 === 0 && 'border-l-0', escolhido && 'bg-primary-soft')}>
                    <span className={cn('self-end text-[14px] sm:text-[16px] font-bold tabular-nums w-7 h-7 rounded-full flex items-center justify-center',
                      d.isToday && 'bg-primary text-primary-foreground')}>{d.day}</span>
                    {/* No celular, um ponto; no computador, as faixas. */}
                    {faixas.length > 0 && <span className="sm:hidden mx-auto w-1.5 h-1.5 rounded-full bg-primary" aria-hidden="true" />}
                    {faixas.slice(0, 2).map((f, j) => (
                      <span key={j} className={cn('hidden sm:block truncate rounded-sm border-l-[3px] px-1.5 py-0.5 text-[12px] font-bold', f.classe)}>{f.titulo}</span>
                    ))}
                    {faixas.length > 2 && <span className="hidden sm:block text-[12px] font-bold text-primary px-1">+{faixas.length - 2}</span>}
                  </button>
                ) : (
                  <div key={i} className={cn('min-h-[52px] sm:min-h-[104px] border-t border-l border-border bg-muted/40', i % 7 === 0 && 'border-l-0')} aria-hidden="true" />
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <EventCreateDialog
        open={open}
        onOpenChange={setOpen}
        defaultDate={defaultDate}
        onCreate={async (input) => {
          await createEvent.mutateAsync(input);
        }}
        isPending={createEvent.isPending}
      />

      <EventEditDialog evento={editando} enviando={updateEvent.isPending}
        onCancelar={() => { setEditando(null); setMudancaPendente(null); }} onSalvar={salvarEdicao} />

      <RecurrenceScopeDialog
        open={!!mudancaPendente}
        onOpenChange={(o) => { if (!o) setMudancaPendente(null); }}
        mode="edit"
        eventTitle={editando?.title ?? ''}
        onConfirm={confirmarEscopoDaEdicao}
      />

      <ConfirmarExclusao aberto={!!apagandoAvulso} titulo="Excluir este evento?" acao="Excluir"
        descricao={apagandoAvulso ? `“${apagandoAvulso.title}” sai da sua agenda e não volta.` : ''}
        enviando={deleteEvent.isPending} onCancelar={() => setApagandoAvulso(null)}
        onConfirmar={() => apagandoAvulso && deleteEvent.mutate({ id: apagandoAvulso.id }, { onSuccess: () => setApagandoAvulso(null) })} />

      <RecurrenceScopeDialog
        open={scopeDialog.open}
        onOpenChange={(o) => setScopeDialog(s => ({ ...s, open: o }))}
        mode="delete"
        eventTitle={scopeDialog.eventTitle}
        onConfirm={handleScopeConfirm}
      />
    </div>
  );
}

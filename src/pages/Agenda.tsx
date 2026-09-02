import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, Plus, Repeat, Trash2, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCalendarEvents, type RecurrenceScope } from '@/hooks/useCalendarEvents';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { EventCreateDialog } from '@/components/dashboard/EventCreateDialog';
import { RecurrenceScopeDialog } from '@/components/dashboard/RecurrenceScopeDialog';

const typeLabels: Record<string, string> = {
  event: 'Evento',
  reminder: 'Lembrete',
  routine: 'Rotina',
};

const typeColors: Record<string, string> = {
  event: 'bg-blue-500/20 text-blue-400',
  reminder: 'bg-amber-500/20 text-amber-400',
  routine: 'bg-emerald-500/20 text-emerald-400',
};

const dotColors: Record<string, string> = {
  event: 'bg-blue-400',
  reminder: 'bg-amber-400',
  routine: 'bg-emerald-400',
};

export default function Agenda() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(new Date().getDate());
  const [open, setOpen] = useState(false);
  const [defaultDate, setDefaultDate] = useState<string | undefined>(undefined);
  const [filterType, setFilterType] = useState<string>('all');

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

  const { events, eventDays, createEvent, deleteEvent } = useCalendarEvents(range);

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
      }))
      .sort((a, b) => a.time.localeCompare(b.time));

    if (filterType !== 'all') return items.filter(i => i.type === filterType);
    return items;
  }, [events, selectedDate, filterType]);

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
        hasEvent: eventDays.has(date.toDateString()),
        isToday: date.toDateString() === today.toDateString(),
      });
    }
    return days;
  }, [currentMonth, eventDays]);

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
      deleteEvent.mutate({ id: item.id });
    }
  };

  const handleScopeConfirm = (scope: RecurrenceScope) => {
    deleteEvent.mutate({ id: scopeDialog.eventId, scope });
  };

  return (
    <div className="h-[calc(100vh-36px)] flex overflow-hidden">
      {/* Left: Calendar */}
      <div className="w-80 shrink-0 border-r border-border/50 flex flex-col bg-card/50">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
          <button onClick={() => setCurrentMonth(m => subMonths(m, 1))} className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-foreground capitalize">
            {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
          </span>
          <button onClick={() => setCurrentMonth(m => addMonths(m, 1))} className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pt-4 pb-3">
          <div className="grid grid-cols-7 gap-0 mb-2">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d, i) => (
              <div key={i} className="text-[11px] text-muted-foreground/60 text-center py-1 font-medium">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {calendarDays.map((d, i) => (
              <div key={i} className="text-center py-0.5">
                {d.day > 0 ? (
                  <button
                    onClick={() => handleDayClick(d.day)}
                    onDoubleClick={() => handleDayDoubleClick(d.day)}
                    className={`relative inline-flex items-center justify-center w-8 h-8 text-sm rounded-lg transition-colors ${
                      d.isToday && selectedDay === d.day ? 'bg-primary text-primary-foreground font-semibold' :
                      d.isToday ? 'ring-1 ring-primary text-primary font-semibold' :
                      selectedDay === d.day ? 'bg-primary/10 text-foreground font-medium ring-1 ring-primary/50' :
                      'text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    {d.day}
                    {d.hasEvent && (
                      <div className="absolute bottom-0.5 w-1 h-1 rounded-full bg-primary" />
                    )}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-border/30 mt-auto">
          <p className="text-xs text-muted-foreground mb-2">Resumo do mês</p>
          <div className="flex items-center gap-3">
            <div className="text-center">
              <span className="text-lg font-semibold text-foreground block">{events.length}</span>
              <span className="text-[10px] text-muted-foreground uppercase">Eventos</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Day view */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-3 border-b border-border/30">
          <div>
            <h2 className="text-base font-semibold text-foreground capitalize">{selectedDateLabel}</h2>
            <p className="text-xs text-muted-foreground">{dayItems.length} {dayItems.length === 1 ? 'item' : 'itens'}</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-8 w-32 text-xs bg-surface-1 border-border/50">
                <Filter className="w-3 h-3 mr-1.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="event">Eventos</SelectItem>
                <SelectItem value="reminder">Lembretes</SelectItem>
                <SelectItem value="routine">Rotinas</SelectItem>
              </SelectContent>
            </Select>

            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={openCreateDialog}>
              <Plus className="w-3.5 h-3.5" /> Novo Evento
            </Button>
          </div>
        </div>

        {/* Events list */}
        <div className="flex-1 overflow-y-auto">
          {dayItems.length > 0 ? (
            <div className="divide-y divide-border/20">
              {dayItems.map(item => (
                <div key={item.id} className="flex items-start gap-4 px-6 py-4 hover:bg-accent/30 transition-colors group">
                  <span className="text-sm font-mono text-muted-foreground w-12 shrink-0 pt-0.5">{item.time}</span>
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${dotColors[item.type] || 'bg-primary'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{item.title}</span>
                      {item.seriesId && (
                        <Repeat className="w-3 h-3 text-primary/70 shrink-0" strokeWidth={2} aria-label="Evento recorrente" />
                      )}
                      <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${typeColors[item.type] || 'bg-primary/20 text-primary'}`}>
                        {typeLabels[item.type] || item.type}
                      </span>
                    </div>
                    {item.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteClick(item)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive mt-0.5"
                    aria-label="Excluir"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CalendarDays className="w-8 h-8 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum evento neste dia</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Clique duplo no calendário ou use o botão "Novo Evento"</p>
            </div>
          )}
        </div>
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

import { useState, useEffect, useMemo } from 'react';
import { Bell, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FREQ_LABELS,
  WEEKDAY_LABELS_PT,
  generateOccurrences,
  type RecurrenceFreq,
  type RecurrenceUnit,
  type RecurrenceEndType,
  type RecurrenceRule,
} from '@/lib/recurrence';
import { cn } from '@/lib/utils';
import { useAssistantName } from '@/hooks/useAssistantName';

interface EventCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: string;
  onCreate: (input: {
    title: string;
    description?: string;
    start_at: string;
    event_type: string;
    reminder_offsets: number[];
    recurrence?: RecurrenceRule;
  }) => Promise<void>;
  isPending?: boolean;
}

const REMINDER_OPTIONS: { label: string; minutes: number }[] = [
  { label: '1 dia antes', minutes: 1440 },
  { label: '1 hora antes', minutes: 60 },
  { label: '15 minutos antes', minutes: 15 },
];

const FREQ_OPTIONS: RecurrenceFreq[] = [
  'none',
  'daily',
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'semiannually',
  'yearly',
  'custom',
];

export function EventCreateDialog({
  open,
  onOpenChange,
  defaultDate,
  onCreate,
  isPending,
}: EventCreateDialogProps) {
  const assistantName = useAssistantName();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [type, setType] = useState('reminder');
  const [reminders, setReminders] = useState<number[]>([60]);

  // Recurrence
  const [freq, setFreq] = useState<RecurrenceFreq>('none');
  const [byweekday, setByweekday] = useState<number[]>([]);
  const [customInterval, setCustomInterval] = useState(2);
  const [customUnit, setCustomUnit] = useState<RecurrenceUnit>('week');
  const [endType, setEndType] = useState<RecurrenceEndType>('never');
  const [endDate, setEndDate] = useState('');
  const [endCount, setEndCount] = useState(10);

  // Reset/seed when opened
  useEffect(() => {
    if (open) {
      setDate(defaultDate || '');
    } else {
      setTitle('');
      setDescription('');
      setDate('');
      setTime('09:00');
      setType('reminder');
      setReminders([60]);
      setFreq('none');
      setByweekday([]);
      setCustomInterval(2);
      setCustomUnit('week');
      setEndType('never');
      setEndDate('');
      setEndCount(10);
    }
  }, [open, defaultDate]);

  // Pre-select the weekday of the chosen date when switching to weekly modes
  useEffect(() => {
    if ((freq === 'weekly' || freq === 'biweekly') && date && byweekday.length === 0) {
      const d = new Date(`${date}T00:00:00`);
      setByweekday([d.getDay()]);
    }
  }, [freq, date, byweekday.length]);

  const toggleReminder = (minutes: number, checked: boolean) => {
    setReminders(prev =>
      checked ? [...prev, minutes].sort((a, b) => b - a) : prev.filter(m => m !== minutes)
    );
  };

  const toggleWeekday = (dow: number) => {
    setByweekday(prev =>
      prev.includes(dow) ? prev.filter(d => d !== dow) : [...prev, dow].sort()
    );
  };

  const buildRule = (): RecurrenceRule | undefined => {
    if (freq === 'none') return undefined;
    return {
      freq,
      interval: freq === 'custom' ? Math.max(1, customInterval) : 1,
      unit: freq === 'custom' ? customUnit : undefined,
      byweekday: (freq === 'weekly' || freq === 'biweekly') ? byweekday : undefined,
      endType,
      endDate: endType === 'date' ? endDate || null : null,
      count: endType === 'count' ? Math.max(1, endCount) : null,
    };
  };

  // Live preview of how many occurrences will be generated
  const occurrencePreview = useMemo(() => {
    if (freq === 'none' || !date) return null;
    const start = new Date(`${date}T${time}:00`);
    if (Number.isNaN(start.getTime())) return null;
    const rule = buildRule();
    if (!rule) return null;
    if ((rule.freq === 'weekly' || rule.freq === 'biweekly') &&
      (!rule.byweekday || rule.byweekday.length === 0)) return null;
    if (rule.endType === 'date' && !rule.endDate) return null;
    try {
      return generateOccurrences(start, rule).length;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freq, date, time, byweekday, customInterval, customUnit, endType, endDate, endCount]);

  const canSubmit = () => {
    if (!title.trim() || !date) return false;
    if ((freq === 'weekly' || freq === 'biweekly') && byweekday.length === 0) return false;
    if (freq === 'custom' && (!customInterval || customInterval < 1)) return false;
    if (freq !== 'none' && endType === 'date' && !endDate) return false;
    if (freq !== 'none' && endType === 'count' && (!endCount || endCount < 1)) return false;
    return true;
  };

  const handleSubmit = async () => {
    if (!canSubmit()) return;
    await onCreate({
      title: title.trim(),
      description: description.trim() || undefined,
      start_at: new Date(`${date}T${time}:00`).toISOString(),
      event_type: type,
      reminder_offsets: reminders,
      recurrence: buildRule(),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-base">Novo Lembrete</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1 -mr-1">
          <div className="space-y-4 pt-2 pb-1">
            <div>
              <label className="text-xs text-muted-foreground uppercase mb-1 block">Título</label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Ex: Reunião com cliente"
                className="h-9 text-sm bg-surface-1 border-border/50"
                autoFocus
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground uppercase mb-1 block">Descrição</label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Detalhes do lembrete..."
                className="text-sm bg-surface-1 border-border/50 min-h-[72px] resize-none"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground uppercase mb-1 block">Data</label>
                <Input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="h-9 text-sm bg-surface-1 border-border/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase mb-1 block">Hora</label>
                <Input
                  type="time"
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  className="h-9 text-sm bg-surface-1 border-border/50"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground uppercase mb-1 block">Tipo</label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-9 text-sm bg-surface-1 border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reminder">Lembrete</SelectItem>
                  <SelectItem value="event">Evento</SelectItem>
                  <SelectItem value="routine">Rotina</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Repetição */}
            <div className="rounded-md border border-border/50 bg-surface-1 p-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <Repeat className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />
                <span className="text-xs font-medium text-foreground">
                  Repetir evento?
                </span>
              </div>

              <Select value={freq} onValueChange={v => setFreq(v as RecurrenceFreq)}>
                <SelectTrigger className="h-9 text-sm bg-card border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQ_OPTIONS.map(f => (
                    <SelectItem key={f} value={f}>{FREQ_LABELS[f]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {(freq === 'weekly' || freq === 'biweekly') && (
                <div className="space-y-1.5">
                  <span className="text-[11px] text-muted-foreground uppercase">Repetir nos dias</span>
                  <div className="flex gap-1">
                    {WEEKDAY_LABELS_PT.map((label, dow) => {
                      const active = byweekday.includes(dow);
                      return (
                        <button
                          key={dow}
                          type="button"
                          onClick={() => toggleWeekday(dow)}
                          className={cn(
                            'w-7 h-7 rounded-md text-xs font-medium transition-colors border',
                            active
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-card border-border/50 text-muted-foreground hover:bg-accent'
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {freq === 'custom' && (
                <div className="space-y-1.5">
                  <span className="text-[11px] text-muted-foreground uppercase">A cada</span>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={customInterval}
                      onChange={e => setCustomInterval(parseInt(e.target.value || '1', 10))}
                      className="h-9 w-20 text-sm bg-card border-border/50"
                    />
                    <Select value={customUnit} onValueChange={v => setCustomUnit(v as RecurrenceUnit)}>
                      <SelectTrigger className="h-9 text-sm bg-card border-border/50 flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="day">dia(s)</SelectItem>
                        <SelectItem value="week">semana(s)</SelectItem>
                        <SelectItem value="month">mês(es)</SelectItem>
                        <SelectItem value="year">ano(s)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {freq !== 'none' && (
                <div className="space-y-1.5 pt-1 border-t border-border/30">
                  <span className="text-[11px] text-muted-foreground uppercase">Terminar repetição</span>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer text-foreground/80">
                      <input
                        type="radio"
                        name="endType"
                        checked={endType === 'never'}
                        onChange={() => setEndType('never')}
                        className="accent-primary"
                      />
                      Nunca
                    </label>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 text-sm cursor-pointer text-foreground/80 shrink-0">
                        <input
                          type="radio"
                          name="endType"
                          checked={endType === 'date'}
                          onChange={() => setEndType('date')}
                          className="accent-primary"
                        />
                        Em
                      </label>
                      <Input
                        type="date"
                        value={endDate}
                        onChange={e => { setEndDate(e.target.value); setEndType('date'); }}
                        className="h-8 text-sm bg-card border-border/50 flex-1"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 text-sm cursor-pointer text-foreground/80 shrink-0">
                        <input
                          type="radio"
                          name="endType"
                          checked={endType === 'count'}
                          onChange={() => setEndType('count')}
                          className="accent-primary"
                        />
                        Após
                      </label>
                      <Input
                        type="number"
                        min={1}
                        value={endCount}
                        onChange={e => { setEndCount(parseInt(e.target.value || '1', 10)); setEndType('count'); }}
                        className="h-8 w-20 text-sm bg-card border-border/50"
                      />
                      <span className="text-xs text-muted-foreground">ocorrências</span>
                    </div>
                  </div>
                  {occurrencePreview !== null && (
                    <p className="text-[11px] text-muted-foreground/80 pt-1">
                      {occurrencePreview === 1
                        ? 'Será criada 1 ocorrência'
                        : `Serão criadas ${occurrencePreview} ocorrências`}
                      {endType === 'never' && ' (limite máximo)'}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Lembretes */}
            <div className="rounded-md border border-border/50 bg-surface-1 p-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <Bell className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />
                <span className="text-xs font-medium text-foreground">
                  Deseja que a {assistantName} te notifique?
                </span>
              </div>
              <div className="space-y-2 pl-1">
                {REMINDER_OPTIONS.map(opt => (
                  <label
                    key={opt.minutes}
                    className="flex items-center gap-2 cursor-pointer text-sm text-foreground/80 hover:text-foreground transition-colors"
                  >
                    <Checkbox
                      checked={reminders.includes(opt.minutes)}
                      onCheckedChange={checked => toggleReminder(opt.minutes, !!checked)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
              {reminders.length === 0 && (
                <p className="text-[11px] text-muted-foreground/60 pl-1">
                  Sem notificações da {assistantName} para este lembrete.
                </p>
              )}
            </div>
          </div>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!canSubmit() || isPending}
          size="sm"
          className="w-full h-9 text-sm shrink-0"
        >
          {isPending ? 'Criando...' : 'Criar Lembrete'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

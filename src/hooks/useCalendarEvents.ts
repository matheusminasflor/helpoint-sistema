import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  generateOccurrences,
  type RecurrenceRule,
  type RecurrenceFreq,
} from '@/lib/recurrence';

export interface CalendarEvent {
  id: string;
  tenant_id: string;
  user_id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  event_type: string;
  source_type: string | null;
  source_id: string | null;
  color: string;
  is_recurring: boolean;
  recurrence_rule: string | null;
  google_event_id: string | null;
  reminder_offsets: number[];
  reminders_sent: number[];
  created_at: string;
  updated_at: string;
  // Recurrence fields
  series_id: string | null;
  recurrence_freq: RecurrenceFreq;
  recurrence_interval: number;
  recurrence_unit: string | null;
  recurrence_byweekday: number[] | null;
  recurrence_end_type: 'never' | 'date' | 'count';
  recurrence_end_date: string | null;
  recurrence_count: number | null;
  occurrence_index: number | null;
  is_exception: boolean;
  original_start_at: string | null;
}

interface CreateEventInput {
  title: string;
  description?: string;
  start_at: string;
  end_at?: string;
  all_day?: boolean;
  event_type?: string;
  source_type?: string;
  source_id?: string;
  color?: string;
  reminder_offsets?: number[];
  recurrence?: RecurrenceRule;
}

export type RecurrenceScope = 'this' | 'following' | 'all';

interface UpdateEventInput {
  id: string;
  scope?: RecurrenceScope;
  changes: Partial<
    Pick<
      CalendarEvent,
      'title' | 'description' | 'start_at' | 'event_type' | 'reminder_offsets'
    >
  >;
}

interface DeleteEventInput {
  id: string;
  scope?: RecurrenceScope;
}

export function useCalendarEvents(dateRange?: { from: Date; to: Date }) {
  const { user, profile } = useAuth();
  const qc = useQueryClient();

  const { data: events = [], isLoading } = useQuery({
    queryKey: [
      'calendar-events',
      user?.id,
      dateRange?.from?.toISOString(),
      dateRange?.to?.toISOString(),
    ],
    queryFn: async () => {
      let q = supabase
        .from('calendar_events')
        .select('*')
        .order('start_at', { ascending: true });

      if (dateRange) {
        q = q
          .gte('start_at', dateRange.from.toISOString())
          .lte('start_at', dateRange.to.toISOString());
      }

      const { data, error } = await q.limit(1000);
      if (error) throw error;
      return (data || []) as CalendarEvent[];
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  const createEvent = useMutation({
    mutationFn: async (input: CreateEventInput) => {
      const recurrence = input.recurrence;
      const isRecurring = recurrence && recurrence.freq !== 'none';

      const baseRow = {
        tenant_id: profile!.tenant_id,
        user_id: user!.id,
        title: input.title,
        description: input.description || null,
        end_at: input.end_at || null,
        all_day: input.all_day || false,
        event_type: input.event_type || 'event',
        source_type: input.source_type || null,
        source_id: input.source_id || null,
        color: input.color || '#7c3aed',
        reminder_offsets: input.reminder_offsets || [],
      };

      if (!isRecurring) {
        const { error } = await supabase.from('calendar_events').insert({
          ...baseRow,
          start_at: input.start_at,
          is_recurring: false,
          recurrence_freq: 'none',
        } as any);
        if (error) throw error;
        return;
      }

      // Materialize the series
      const startDate = new Date(input.start_at);
      const dates = generateOccurrences(startDate, recurrence!);
      const seriesId = crypto.randomUUID();

      const recurrenceCols = {
        is_recurring: true,
        series_id: seriesId,
        recurrence_freq: recurrence!.freq,
        recurrence_interval: recurrence!.interval ?? 1,
        recurrence_unit: recurrence!.unit ?? null,
        recurrence_byweekday: recurrence!.byweekday ?? null,
        recurrence_end_type: recurrence!.endType,
        recurrence_end_date: recurrence!.endDate ?? null,
        recurrence_count: recurrence!.count ?? null,
      };

      const rows = dates.map((d, idx) => ({
        ...baseRow,
        ...recurrenceCols,
        start_at: d.toISOString(),
        original_start_at: d.toISOString(),
        occurrence_index: idx,
      }));

      // Batch insert in chunks of 200 to stay safe
      for (let i = 0; i < rows.length; i += 200) {
        const slice = rows.slice(i, i + 200);
        const { error } = await supabase
          .from('calendar_events')
          .insert(slice as any);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar-events'] }),
  });

  const updateEvent = useMutation({
    mutationFn: async ({ id, scope = 'this', changes }: UpdateEventInput) => {
      // Fetch the target row to know the series
      const { data: target, error: fetchErr } = await supabase
        .from('calendar_events')
        .select('id, series_id, start_at')
        .eq('id', id)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!target) throw new Error('Evento não encontrado');

      const seriesId = (target as any).series_id as string | null;
      const targetStart = (target as any).start_at as string;

      if (!seriesId || scope === 'this') {
        const patch: Record<string, unknown> = { ...changes };
        if (seriesId) patch.is_exception = true;
        const { error } = await supabase
          .from('calendar_events')
          .update(patch as any)
          .eq('id', id);
        if (error) throw error;
        return;
      }

      let q = supabase
        .from('calendar_events')
        .update(changes as any)
        .eq('series_id', seriesId);

      if (scope === 'following') {
        q = q.gte('start_at', targetStart);
      }
      // 'all' applies to entire series; we still skip user-marked exceptions
      // unless the change is on this specific row's start_at adjustment.
      if (scope === 'all') {
        q = q.eq('is_exception', false);
      }

      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar-events'] }),
  });

  const deleteEvent = useMutation({
    mutationFn: async (input: DeleteEventInput | string) => {
      const { id, scope = 'this' } =
        typeof input === 'string' ? { id: input, scope: 'this' as const } : input;

      const { data: target, error: fetchErr } = await supabase
        .from('calendar_events')
        .select('id, series_id, start_at')
        .eq('id', id)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!target) return;

      const seriesId = (target as any).series_id as string | null;
      const targetStart = (target as any).start_at as string;

      if (!seriesId || scope === 'this') {
        const { error } = await supabase
          .from('calendar_events')
          .delete()
          .eq('id', id);
        if (error) throw error;
        return;
      }

      let q = supabase.from('calendar_events').delete().eq('series_id', seriesId);
      if (scope === 'following') q = q.gte('start_at', targetStart);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar-events'] }),
  });

  // Days that have events (for dot indicators on calendar)
  const eventDays = new Set(events.map((e) => new Date(e.start_at).toDateString()));

  // Today's events
  const todayStr = new Date().toDateString();
  const todayEvents = events.filter(
    (e) => new Date(e.start_at).toDateString() === todayStr,
  );

  return {
    events,
    todayEvents,
    eventDays,
    isLoading,
    createEvent,
    updateEvent,
    deleteEvent,
  };
}

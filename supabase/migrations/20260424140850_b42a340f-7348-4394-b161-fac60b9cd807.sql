
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS reminder_offsets integer[] NOT NULL DEFAULT '{}'::integer[],
  ADD COLUMN IF NOT EXISTS reminders_sent integer[] NOT NULL DEFAULT '{}'::integer[];

CREATE INDEX IF NOT EXISTS idx_calendar_events_reminder_check
  ON public.calendar_events (start_at)
  WHERE array_length(reminder_offsets, 1) > 0;

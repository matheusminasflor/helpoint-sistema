ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS series_id uuid,
  ADD COLUMN IF NOT EXISTS recurrence_freq text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS recurrence_interval int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS recurrence_unit text,
  ADD COLUMN IF NOT EXISTS recurrence_byweekday int[],
  ADD COLUMN IF NOT EXISTS recurrence_end_type text NOT NULL DEFAULT 'never',
  ADD COLUMN IF NOT EXISTS recurrence_end_date timestamptz,
  ADD COLUMN IF NOT EXISTS recurrence_count int,
  ADD COLUMN IF NOT EXISTS occurrence_index int,
  ADD COLUMN IF NOT EXISTS is_exception boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_start_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_calendar_events_series
  ON public.calendar_events (series_id, start_at)
  WHERE series_id IS NOT NULL;
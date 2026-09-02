
ALTER TABLE public.sac_technical_reports
  ADD COLUMN IF NOT EXISTS signed_by_name text,
  ADD COLUMN IF NOT EXISTS signed_by_role text;

ALTER TYPE public.ticket_status ADD VALUE IF NOT EXISTS 'rejected';

ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_module_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_module_check
  CHECK (module = ANY (ARRAY['tickets'::text, 'marketing'::text, 'qualidade'::text, 'rh'::text, 'financeiro'::text]));
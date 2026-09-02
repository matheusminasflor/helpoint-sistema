ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_module_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_module_check
  CHECK (module = ANY (ARRAY['tickets','marketing','qualidade','rh']));
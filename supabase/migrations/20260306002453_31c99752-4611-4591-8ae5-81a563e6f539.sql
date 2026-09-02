ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id);
NOTIFY pgrst, 'reload schema';
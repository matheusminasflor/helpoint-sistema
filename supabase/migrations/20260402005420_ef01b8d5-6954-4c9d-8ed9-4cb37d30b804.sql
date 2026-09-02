
CREATE TABLE public.kanban_routines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  board_id UUID REFERENCES public.kanban_boards(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  scheduled_time TIME NOT NULL,
  priority_rank INTEGER NOT NULL DEFAULT 0,
  days_of_week INTEGER[] DEFAULT '{1,2,3,4,5}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.kanban_routines ENABLE ROW LEVEL SECURITY;

-- RLS: users can only manage their own routines within their tenant
CREATE POLICY "Users can view own routines"
  ON public.kanban_routines FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND user_id = auth.uid());

CREATE POLICY "Users can create own routines"
  ON public.kanban_routines FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND user_id = auth.uid());

CREATE POLICY "Users can update own routines"
  ON public.kanban_routines FOR UPDATE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND user_id = auth.uid());

CREATE POLICY "Users can delete own routines"
  ON public.kanban_routines FOR DELETE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND user_id = auth.uid());

-- Updated_at trigger
CREATE TRIGGER update_kanban_routines_updated_at
  BEFORE UPDATE ON public.kanban_routines
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

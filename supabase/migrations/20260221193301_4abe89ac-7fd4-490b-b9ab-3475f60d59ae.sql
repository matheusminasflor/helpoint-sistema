
CREATE TABLE public.dashboard_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  module TEXT NOT NULL DEFAULT 'ti',
  visible_widgets TEXT[] NOT NULL DEFAULT '{}',
  widget_order TEXT[] NOT NULL DEFAULT '{}',
  default_period TEXT NOT NULL DEFAULT '7d',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id, module)
);

ALTER TABLE public.dashboard_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own preferences"
ON public.dashboard_preferences FOR SELECT
USING (tenant_id = get_user_tenant_id() AND user_id = auth.uid());

CREATE POLICY "Users can create their own preferences"
ON public.dashboard_preferences FOR INSERT
WITH CHECK (tenant_id = get_user_tenant_id() AND user_id = auth.uid());

CREATE POLICY "Users can update their own preferences"
ON public.dashboard_preferences FOR UPDATE
USING (tenant_id = get_user_tenant_id() AND user_id = auth.uid())
WITH CHECK (tenant_id = get_user_tenant_id() AND user_id = auth.uid());

CREATE POLICY "Users can delete their own preferences"
ON public.dashboard_preferences FOR DELETE
USING (tenant_id = get_user_tenant_id() AND user_id = auth.uid());

CREATE TRIGGER handle_dashboard_preferences_updated_at
BEFORE UPDATE ON public.dashboard_preferences
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- Dashboard view templates for persisting user's preferred views
CREATE TABLE public.dashboard_view_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  active_tab TEXT NOT NULL DEFAULT 'dashboard',
  selected_period TEXT NOT NULL DEFAULT '30d',
  technician_filter UUID,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.dashboard_view_templates ENABLE ROW LEVEL SECURITY;

-- Users can only see their own templates within their tenant
CREATE POLICY "Users can view their own templates"
  ON public.dashboard_view_templates FOR SELECT
  USING (tenant_id = get_user_tenant_id() AND user_id = auth.uid());

CREATE POLICY "Users can create their own templates"
  ON public.dashboard_view_templates FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND user_id = auth.uid());

CREATE POLICY "Users can update their own templates"
  ON public.dashboard_view_templates FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND user_id = auth.uid())
  WITH CHECK (tenant_id = get_user_tenant_id() AND user_id = auth.uid());

CREATE POLICY "Users can delete their own templates"
  ON public.dashboard_view_templates FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND user_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_dashboard_view_templates_updated_at
  BEFORE UPDATE ON public.dashboard_view_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

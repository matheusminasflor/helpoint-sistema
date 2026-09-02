
-- Table: ti_insight_reports
CREATE TABLE public.ti_insight_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  created_by UUID NOT NULL,
  name TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'weekly',
  target_metrics TEXT[] NOT NULL DEFAULT '{}',
  notify_email BOOLEAN DEFAULT false,
  notify_inapp BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  last_generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ti_insight_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Supervisors can view reports" ON public.ti_insight_reports
  FOR SELECT USING (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

CREATE POLICY "Supervisors can create reports" ON public.ti_insight_reports
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

CREATE POLICY "Supervisors can update reports" ON public.ti_insight_reports
  FOR UPDATE USING (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

CREATE POLICY "Directors can delete reports" ON public.ti_insight_reports
  FOR DELETE USING (tenant_id = get_user_tenant_id() AND is_diretor(auth.uid()));

CREATE TRIGGER inject_tenant_id_ti_insight_reports
  BEFORE INSERT ON public.ti_insight_reports
  FOR EACH ROW EXECUTE FUNCTION public.inject_tenant_id();

CREATE TRIGGER handle_updated_at_ti_insight_reports
  BEFORE UPDATE ON public.ti_insight_reports
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Table: ti_insight_snapshots
CREATE TABLE public.ti_insight_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.ti_insight_reports(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  metrics_data JSONB NOT NULL DEFAULT '{}',
  lyra_analysis TEXT,
  generated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ti_insight_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Supervisors can view snapshots" ON public.ti_insight_snapshots
  FOR SELECT USING (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

CREATE POLICY "Supervisors can create snapshots" ON public.ti_insight_snapshots
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

CREATE TRIGGER inject_tenant_id_ti_insight_snapshots
  BEFORE INSERT ON public.ti_insight_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.inject_tenant_id();

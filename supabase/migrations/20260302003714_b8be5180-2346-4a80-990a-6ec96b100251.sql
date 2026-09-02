-- Fix DELETE policy: allow supervisors (not just directors) to delete insight reports
DROP POLICY IF EXISTS "Directors can delete reports" ON public.ti_insight_reports;
CREATE POLICY "Supervisors can delete reports"
  ON public.ti_insight_reports
  FOR DELETE
  USING ((tenant_id = get_user_tenant_id()) AND is_supervisor_or_higher(auth.uid()));

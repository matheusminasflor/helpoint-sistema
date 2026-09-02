
CREATE TABLE public.software_license_renewals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  license_id uuid NOT NULL REFERENCES public.software_licenses(id) ON DELETE CASCADE,
  previous_purchase_date date,
  previous_expiry_date date,
  new_purchase_date date,
  new_expiry_date date,
  renewal_value numeric(12,2),
  provider text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_license_renewals_license ON public.software_license_renewals(license_id, created_at DESC);
CREATE INDEX idx_license_renewals_tenant ON public.software_license_renewals(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.software_license_renewals TO authenticated;
GRANT ALL ON public.software_license_renewals TO service_role;

ALTER TABLE public.software_license_renewals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View renewals in tenant"
  ON public.software_license_renewals FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Supervisors insert renewals"
  ON public.software_license_renewals FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.is_supervisor_or_higher(auth.uid()));

CREATE POLICY "Supervisors update renewals"
  ON public.software_license_renewals FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id() AND public.is_supervisor_or_higher(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.is_supervisor_or_higher(auth.uid()));

CREATE POLICY "Admins delete renewals"
  ON public.software_license_renewals FOR DELETE
  USING (tenant_id = public.get_user_tenant_id() AND public.is_admin_or_higher(auth.uid()));

CREATE TRIGGER inject_tenant_id_license_renewals
  BEFORE INSERT ON public.software_license_renewals
  FOR EACH ROW EXECUTE FUNCTION public.inject_tenant_id();

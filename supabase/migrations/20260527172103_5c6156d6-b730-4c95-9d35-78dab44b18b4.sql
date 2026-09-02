
-- 1) PERFIL: novos campos
ALTER TABLE public.rh_employee_profiles
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS position text,
  ADD COLUMN IF NOT EXISTS cost_center text;

-- 2) BENEFIT PLANS
CREATE TABLE IF NOT EXISTS public.rh_benefit_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('saude','odonto','vale_refeicao','vale_alimentacao','vale_transporte','seguro_vida','gympass','educacao','outros')),
  provider text,
  description text,
  monthly_value numeric(12,2),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rh_benefit_plans TO authenticated;
GRANT ALL ON public.rh_benefit_plans TO service_role;

ALTER TABLE public.rh_benefit_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "RH plans tenant read"
  ON public.rh_benefit_plans FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "RH plans manage by RH"
  ON public.rh_benefit_plans FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.has_rh_access(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_rh_access(auth.uid()));

CREATE TRIGGER trg_rh_benefit_plans_updated
  BEFORE UPDATE ON public.rh_benefit_plans
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_rh_benefit_plans_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.rh_benefit_plans
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

CREATE INDEX IF NOT EXISTS idx_rh_benefit_plans_tenant ON public.rh_benefit_plans(tenant_id);

-- 3) EMPLOYEE BENEFITS (vínculo)
CREATE TABLE IF NOT EXISTS public.rh_employee_benefits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  plan_id uuid NOT NULL REFERENCES public.rh_benefit_plans(id) ON DELETE RESTRICT,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','suspenso','encerrado')),
  dependents jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rh_employee_benefits TO authenticated;
GRANT ALL ON public.rh_employee_benefits TO service_role;

ALTER TABLE public.rh_employee_benefits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "RH benefits owner read"
  ON public.rh_employee_benefits FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (user_id = auth.uid() OR public.has_rh_access(auth.uid()))
  );

CREATE POLICY "RH benefits manage by RH"
  ON public.rh_employee_benefits FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.has_rh_access(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_rh_access(auth.uid()));

CREATE TRIGGER trg_rh_employee_benefits_updated
  BEFORE UPDATE ON public.rh_employee_benefits
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_rh_employee_benefits_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.rh_employee_benefits
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

CREATE INDEX IF NOT EXISTS idx_rh_employee_benefits_user ON public.rh_employee_benefits(user_id);
CREATE INDEX IF NOT EXISTS idx_rh_employee_benefits_plan ON public.rh_employee_benefits(plan_id);

-- 4) DOCUMENT VAULT
CREATE TABLE IF NOT EXISTS public.rh_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('contrato','aditivo','aso','epi','rg_cpf','ctps','comprovante_residencia','diploma','curso','advertencia','suspensao','outros')),
  title text NOT NULL,
  file_path text NOT NULL,
  issue_date date,
  expires_at date,
  version int NOT NULL DEFAULT 1,
  notes text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rh_documents TO authenticated;
GRANT ALL ON public.rh_documents TO service_role;

ALTER TABLE public.rh_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "RH documents owner read"
  ON public.rh_documents FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (user_id = auth.uid() OR public.has_rh_access(auth.uid()))
  );

CREATE POLICY "RH documents manage by RH"
  ON public.rh_documents FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.has_rh_access(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_rh_access(auth.uid()));

CREATE TRIGGER trg_rh_documents_updated
  BEFORE UPDATE ON public.rh_documents
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_rh_documents_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.rh_documents
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

CREATE INDEX IF NOT EXISTS idx_rh_documents_user ON public.rh_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_rh_documents_expires ON public.rh_documents(tenant_id, expires_at) WHERE expires_at IS NOT NULL;

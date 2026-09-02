
-- 1) Tornar user_id opcional em rh_employee_profiles e adicionar novos campos
ALTER TABLE public.rh_employee_profiles
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS manager_name text,
  ADD COLUMN IF NOT EXISTS contract_type text DEFAULT 'CLT',
  ADD COLUMN IF NOT EXISTS probation_45 date,
  ADD COLUMN IF NOT EXISTS probation_90 date,
  ADD COLUMN IF NOT EXISTS base_salary numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS termination_date date;

-- 2) rh_companies
CREATE TABLE IF NOT EXISTS public.rh_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  cnpj text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rh_companies TO authenticated;
GRANT ALL ON public.rh_companies TO service_role;
ALTER TABLE public.rh_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rh_companies_supervisor" ON public.rh_companies
  FOR ALL USING (public.is_supervisor_or_higher(auth.uid()) AND tenant_id = public.get_user_tenant_id())
  WITH CHECK (public.is_supervisor_or_higher(auth.uid()) AND tenant_id = public.get_user_tenant_id());
CREATE TRIGGER trg_rh_companies_updated BEFORE UPDATE ON public.rh_companies
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_rh_companies_audit AFTER INSERT OR UPDATE OR DELETE ON public.rh_companies
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- 3) rh_departments_catalog
CREATE TABLE IF NOT EXISTS public.rh_departments_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rh_departments_catalog TO authenticated;
GRANT ALL ON public.rh_departments_catalog TO service_role;
ALTER TABLE public.rh_departments_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rh_dep_select" ON public.rh_departments_catalog
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "rh_dep_write" ON public.rh_departments_catalog
  FOR ALL USING (public.is_supervisor_or_higher(auth.uid()) AND tenant_id = public.get_user_tenant_id())
  WITH CHECK (public.is_supervisor_or_higher(auth.uid()) AND tenant_id = public.get_user_tenant_id());
CREATE TRIGGER trg_rh_dep_updated BEFORE UPDATE ON public.rh_departments_catalog
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 4) rh_payroll_settings (por empresa)
CREATE TABLE IF NOT EXISTS public.rh_payroll_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  company_id uuid REFERENCES public.rh_companies(id) ON DELETE CASCADE,
  transport_voucher_pct numeric(5,4) NOT NULL DEFAULT 0.06,
  transport_voucher_cap numeric(12,2) NOT NULL DEFAULT 500,
  meal_voucher_pct numeric(5,4) NOT NULL DEFAULT 0.20,
  meal_voucher_default_value numeric(10,2) NOT NULL DEFAULT 18.81,
  advance_pct numeric(5,4) NOT NULL DEFAULT 0.20,
  fuel_pct numeric(5,4) NOT NULL DEFAULT 0.06,
  fuel_price_per_km numeric(10,4) NOT NULL DEFAULT 0.70,
  inss_brackets jsonb NOT NULL DEFAULT '[
    {"min":0,"max":1412.00,"rate":0.075,"deduct":0},
    {"min":1412.01,"max":2666.68,"rate":0.09,"deduct":21.18},
    {"min":2666.69,"max":4000.03,"rate":0.12,"deduct":101.18},
    {"min":4000.04,"max":7786.02,"rate":0.14,"deduct":181.18}
  ]'::jsonb,
  irpf_brackets jsonb NOT NULL DEFAULT '[
    {"min":0,"max":2259.20,"rate":0,"deduct":0},
    {"min":2259.21,"max":2826.65,"rate":0.075,"deduct":169.44},
    {"min":2826.66,"max":3751.05,"rate":0.15,"deduct":381.44},
    {"min":3751.06,"max":4664.68,"rate":0.225,"deduct":662.77},
    {"min":4664.69,"max":999999,"rate":0.275,"deduct":896.00}
  ]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, company_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rh_payroll_settings TO authenticated;
GRANT ALL ON public.rh_payroll_settings TO service_role;
ALTER TABLE public.rh_payroll_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rh_payroll_settings_all" ON public.rh_payroll_settings
  FOR ALL USING (public.is_supervisor_or_higher(auth.uid()) AND tenant_id = public.get_user_tenant_id())
  WITH CHECK (public.is_supervisor_or_higher(auth.uid()) AND tenant_id = public.get_user_tenant_id());
CREATE TRIGGER trg_rh_ps_updated BEFORE UPDATE ON public.rh_payroll_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 5) rh_payroll_entries
CREATE TABLE IF NOT EXISTS public.rh_payroll_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  company_id uuid REFERENCES public.rh_companies(id) ON DELETE SET NULL,
  employee_id uuid NOT NULL REFERENCES public.rh_employee_profiles(id) ON DELETE CASCADE,
  reference_month date NOT NULL,
  gross_salary numeric(12,2) NOT NULL DEFAULT 0,
  family_allowance numeric(12,2) NOT NULL DEFAULT 0,
  advance numeric(12,2) NOT NULL DEFAULT 0,
  meal_voucher numeric(12,2) NOT NULL DEFAULT 0,
  transport_voucher numeric(12,2) NOT NULL DEFAULT 0,
  health_plan numeric(12,2) NOT NULL DEFAULT 0,
  health_coparticipation numeric(12,2) NOT NULL DEFAULT 0,
  payroll_loan numeric(12,2) NOT NULL DEFAULT 0,
  mobility numeric(12,2) NOT NULL DEFAULT 0,
  inss numeric(12,2) NOT NULL DEFAULT 0,
  irpf numeric(12,2) NOT NULL DEFAULT 0,
  other_deductions numeric(12,2) NOT NULL DEFAULT 0,
  total_deductions numeric(12,2) NOT NULL DEFAULT 0,
  net_salary numeric(12,2) NOT NULL DEFAULT 0,
  thirteenth_vacation numeric(12,2) NOT NULL DEFAULT 0,
  irpf_thirteenth numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, employee_id, reference_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rh_payroll_entries TO authenticated;
GRANT ALL ON public.rh_payroll_entries TO service_role;
ALTER TABLE public.rh_payroll_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rh_payroll_entries_all" ON public.rh_payroll_entries
  FOR ALL USING (public.is_supervisor_or_higher(auth.uid()) AND tenant_id = public.get_user_tenant_id())
  WITH CHECK (public.is_supervisor_or_higher(auth.uid()) AND tenant_id = public.get_user_tenant_id());
CREATE INDEX IF NOT EXISTS idx_rh_payroll_month ON public.rh_payroll_entries (tenant_id, reference_month);
CREATE TRIGGER trg_rh_pe_updated BEFORE UPDATE ON public.rh_payroll_entries
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_rh_pe_audit AFTER INSERT OR UPDATE OR DELETE ON public.rh_payroll_entries
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- 6) rh_absences
CREATE TABLE IF NOT EXISTS public.rh_absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.rh_employee_profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  kind text NOT NULL DEFAULT 'falta',
  justified boolean NOT NULL DEFAULT false,
  reason text,
  days numeric(5,2) NOT NULL DEFAULT 1,
  hours numeric(5,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rh_absences TO authenticated;
GRANT ALL ON public.rh_absences TO service_role;
ALTER TABLE public.rh_absences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rh_absences_all" ON public.rh_absences
  FOR ALL USING (public.is_supervisor_or_higher(auth.uid()) AND tenant_id = public.get_user_tenant_id())
  WITH CHECK (public.is_supervisor_or_higher(auth.uid()) AND tenant_id = public.get_user_tenant_id());
CREATE INDEX IF NOT EXISTS idx_rh_absences_emp_date ON public.rh_absences (tenant_id, employee_id, date);
CREATE TRIGGER trg_rh_abs_updated BEFORE UPDATE ON public.rh_absences
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 7) rh_monthly_deductions
CREATE TABLE IF NOT EXISTS public.rh_monthly_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.rh_employee_profiles(id) ON DELETE CASCADE,
  reference_month date NOT NULL,
  mobility numeric(12,2) NOT NULL DEFAULT 0,
  health_plan numeric(12,2) NOT NULL DEFAULT 0,
  health_coparticipation numeric(12,2) NOT NULL DEFAULT 0,
  payroll_loan numeric(12,2) NOT NULL DEFAULT 0,
  meal_voucher_discount numeric(12,2) NOT NULL DEFAULT 0,
  family_allowance numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, employee_id, reference_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rh_monthly_deductions TO authenticated;
GRANT ALL ON public.rh_monthly_deductions TO service_role;
ALTER TABLE public.rh_monthly_deductions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rh_ded_all" ON public.rh_monthly_deductions
  FOR ALL USING (public.is_supervisor_or_higher(auth.uid()) AND tenant_id = public.get_user_tenant_id())
  WITH CHECK (public.is_supervisor_or_higher(auth.uid()) AND tenant_id = public.get_user_tenant_id());
CREATE TRIGGER trg_rh_ded_updated BEFORE UPDATE ON public.rh_monthly_deductions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 8) rh_transport_vouchers
CREATE TABLE IF NOT EXISTS public.rh_transport_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.rh_employee_profiles(id) ON DELETE CASCADE,
  reference_month date NOT NULL,
  bus_trips_per_day numeric(5,2) NOT NULL DEFAULT 0,
  metro_trips_per_day numeric(5,2) NOT NULL DEFAULT 0,
  work_days int NOT NULL DEFAULT 20,
  value_per_day numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  previous_balance numeric(12,2) NOT NULL DEFAULT 0,
  to_deposit numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, employee_id, reference_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rh_transport_vouchers TO authenticated;
GRANT ALL ON public.rh_transport_vouchers TO service_role;
ALTER TABLE public.rh_transport_vouchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rh_vt_all" ON public.rh_transport_vouchers
  FOR ALL USING (public.is_supervisor_or_higher(auth.uid()) AND tenant_id = public.get_user_tenant_id())
  WITH CHECK (public.is_supervisor_or_higher(auth.uid()) AND tenant_id = public.get_user_tenant_id());
CREATE TRIGGER trg_rh_vt_updated BEFORE UPDATE ON public.rh_transport_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 9) rh_meal_vouchers
CREATE TABLE IF NOT EXISTS public.rh_meal_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.rh_employee_profiles(id) ON DELETE CASCADE,
  reference_month date NOT NULL,
  value_per_day numeric(10,2) NOT NULL DEFAULT 18.81,
  days int NOT NULL DEFAULT 20,
  total numeric(12,2) NOT NULL DEFAULT 0,
  employee_share_20 numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, employee_id, reference_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rh_meal_vouchers TO authenticated;
GRANT ALL ON public.rh_meal_vouchers TO service_role;
ALTER TABLE public.rh_meal_vouchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rh_va_all" ON public.rh_meal_vouchers
  FOR ALL USING (public.is_supervisor_or_higher(auth.uid()) AND tenant_id = public.get_user_tenant_id())
  WITH CHECK (public.is_supervisor_or_higher(auth.uid()) AND tenant_id = public.get_user_tenant_id());
CREATE TRIGGER trg_rh_va_updated BEFORE UPDATE ON public.rh_meal_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 10) rh_fuel_reimbursements
CREATE TABLE IF NOT EXISTS public.rh_fuel_reimbursements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.rh_employee_profiles(id) ON DELETE CASCADE,
  reference_month date NOT NULL,
  km_per_day numeric(8,2) NOT NULL DEFAULT 0,
  price_per_km numeric(10,4) NOT NULL DEFAULT 0.70,
  work_days int NOT NULL DEFAULT 20,
  value_per_day numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  salary_discount numeric(12,2) NOT NULL DEFAULT 0,
  to_pay numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, employee_id, reference_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rh_fuel_reimbursements TO authenticated;
GRANT ALL ON public.rh_fuel_reimbursements TO service_role;
ALTER TABLE public.rh_fuel_reimbursements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rh_fuel_all" ON public.rh_fuel_reimbursements
  FOR ALL USING (public.is_supervisor_or_higher(auth.uid()) AND tenant_id = public.get_user_tenant_id())
  WITH CHECK (public.is_supervisor_or_higher(auth.uid()) AND tenant_id = public.get_user_tenant_id());
CREATE TRIGGER trg_rh_fuel_updated BEFORE UPDATE ON public.rh_fuel_reimbursements
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 11) Funções de cálculo
CREATE OR REPLACE FUNCTION public.rh_calc_inss(_salary numeric, _tenant uuid, _company uuid DEFAULT NULL)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _b jsonb; _row jsonb; _result numeric := 0;
BEGIN
  SELECT inss_brackets INTO _b FROM public.rh_payroll_settings
    WHERE tenant_id = _tenant AND (company_id = _company OR (_company IS NULL AND company_id IS NULL))
    ORDER BY company_id NULLS LAST LIMIT 1;
  IF _b IS NULL THEN
    SELECT inss_brackets INTO _b FROM public.rh_payroll_settings WHERE tenant_id = _tenant LIMIT 1;
  END IF;
  IF _b IS NULL OR _salary <= 0 THEN RETURN 0; END IF;
  FOR _row IN SELECT * FROM jsonb_array_elements(_b) LOOP
    IF _salary >= (_row->>'min')::numeric AND _salary <= COALESCE((_row->>'max')::numeric, _salary) THEN
      _result := _salary * (_row->>'rate')::numeric - (_row->>'deduct')::numeric;
      EXIT;
    END IF;
  END LOOP;
  RETURN GREATEST(_result, 0);
END $$;

CREATE OR REPLACE FUNCTION public.rh_calc_irpf(_base numeric, _tenant uuid, _company uuid DEFAULT NULL)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _b jsonb; _row jsonb; _result numeric := 0;
BEGIN
  SELECT irpf_brackets INTO _b FROM public.rh_payroll_settings
    WHERE tenant_id = _tenant AND (company_id = _company OR (_company IS NULL AND company_id IS NULL))
    ORDER BY company_id NULLS LAST LIMIT 1;
  IF _b IS NULL THEN
    SELECT irpf_brackets INTO _b FROM public.rh_payroll_settings WHERE tenant_id = _tenant LIMIT 1;
  END IF;
  IF _b IS NULL OR _base <= 0 THEN RETURN 0; END IF;
  FOR _row IN SELECT * FROM jsonb_array_elements(_b) LOOP
    IF _base >= (_row->>'min')::numeric AND _base <= COALESCE((_row->>'max')::numeric, _base) THEN
      _result := _base * (_row->>'rate')::numeric - (_row->>'deduct')::numeric;
      EXIT;
    END IF;
  END LOOP;
  RETURN GREATEST(_result, 0);
END $$;

-- 12) Gera/atualiza folha do mês para uma empresa
CREATE OR REPLACE FUNCTION public.rh_generate_payroll(_tenant uuid, _company uuid, _month date)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _emp record; _count int := 0; _settings record; _va numeric; _vt numeric; _fuel numeric;
  _ded record; _inss numeric; _irpf numeric; _gross numeric; _adv numeric;
  _total_ded numeric; _net numeric;
BEGIN
  IF NOT public.is_supervisor_or_higher(auth.uid()) THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT * INTO _settings FROM public.rh_payroll_settings
    WHERE tenant_id = _tenant AND (company_id = _company OR (_company IS NULL AND company_id IS NULL))
    ORDER BY company_id NULLS LAST LIMIT 1;
  IF _settings IS NULL THEN
    SELECT * INTO _settings FROM public.rh_payroll_settings WHERE tenant_id = _tenant LIMIT 1;
  END IF;

  FOR _emp IN
    SELECT * FROM public.rh_employee_profiles
    WHERE tenant_id = _tenant
      AND status = 'ativo'
      AND (_company IS NULL OR company_id = _company)
  LOOP
    _gross := COALESCE(_emp.base_salary, 0);
    _adv := ROUND(_gross * COALESCE(_settings.advance_pct, 0.20), 2);

    SELECT COALESCE(total, 0) - COALESCE(employee_share_20, 0) INTO _va FROM public.rh_meal_vouchers
      WHERE tenant_id = _tenant AND employee_id = _emp.id AND reference_month = _month;
    _va := COALESCE(_va, 0);

    SELECT COALESCE(to_deposit, 0) INTO _vt FROM public.rh_transport_vouchers
      WHERE tenant_id = _tenant AND employee_id = _emp.id AND reference_month = _month;
    _vt := COALESCE(_vt, 0);

    SELECT COALESCE(to_pay, 0) INTO _fuel FROM public.rh_fuel_reimbursements
      WHERE tenant_id = _tenant AND employee_id = _emp.id AND reference_month = _month;
    _fuel := COALESCE(_fuel, 0);

    SELECT * INTO _ded FROM public.rh_monthly_deductions
      WHERE tenant_id = _tenant AND employee_id = _emp.id AND reference_month = _month;

    _inss := public.rh_calc_inss(_gross, _tenant, _company);
    _irpf := public.rh_calc_irpf(_gross - _inss, _tenant, _company);

    _total_ded := _adv + COALESCE(_ded.health_plan, 0) + COALESCE(_ded.health_coparticipation, 0)
      + COALESCE(_ded.payroll_loan, 0) + COALESCE(_ded.meal_voucher_discount, 0) + _inss + _irpf;
    _net := _gross + COALESCE(_ded.family_allowance, 0) - _total_ded;

    INSERT INTO public.rh_payroll_entries (
      tenant_id, company_id, employee_id, reference_month, gross_salary, family_allowance,
      advance, meal_voucher, transport_voucher, health_plan, health_coparticipation,
      payroll_loan, mobility, inss, irpf, other_deductions, total_deductions, net_salary,
      thirteenth_vacation, irpf_thirteenth
    ) VALUES (
      _tenant, _company, _emp.id, _month, _gross, COALESCE(_ded.family_allowance, 0),
      _adv, _va, _vt, COALESCE(_ded.health_plan, 0), COALESCE(_ded.health_coparticipation, 0),
      COALESCE(_ded.payroll_loan, 0), _fuel, _inss, _irpf, 0, _total_ded, _net,
      ROUND(_gross * 1.333, 2), public.rh_calc_irpf((_gross * 1.333) - public.rh_calc_inss(_gross * 1.333, _tenant, _company), _tenant, _company)
    )
    ON CONFLICT (tenant_id, employee_id, reference_month) DO UPDATE SET
      gross_salary = EXCLUDED.gross_salary,
      family_allowance = EXCLUDED.family_allowance,
      advance = EXCLUDED.advance,
      meal_voucher = EXCLUDED.meal_voucher,
      transport_voucher = EXCLUDED.transport_voucher,
      health_plan = EXCLUDED.health_plan,
      health_coparticipation = EXCLUDED.health_coparticipation,
      payroll_loan = EXCLUDED.payroll_loan,
      mobility = EXCLUDED.mobility,
      inss = EXCLUDED.inss,
      irpf = EXCLUDED.irpf,
      total_deductions = EXCLUDED.total_deductions,
      net_salary = EXCLUDED.net_salary,
      thirteenth_vacation = EXCLUDED.thirteenth_vacation,
      irpf_thirteenth = EXCLUDED.irpf_thirteenth,
      updated_at = now();
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END $$;

-- 13) Seed departamentos para tenants existentes
INSERT INTO public.rh_departments_catalog (tenant_id, name, sort_order)
SELECT t.id, d.name, d.sort_order
FROM public.tenants t
CROSS JOIN (VALUES
  ('TI',1),('Financeiro',2),('RH',3),('Comercial',4),('Marketing',5),
  ('Expedição',6),('Produção',7),('Laboratório',8),('Limpeza',9)
) AS d(name, sort_order)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- 14) Seed payroll_settings padrão (sem empresa) para tenants existentes
INSERT INTO public.rh_payroll_settings (tenant_id)
SELECT t.id FROM public.tenants t
WHERE NOT EXISTS (SELECT 1 FROM public.rh_payroll_settings ps WHERE ps.tenant_id = t.id AND ps.company_id IS NULL);

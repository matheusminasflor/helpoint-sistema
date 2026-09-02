
-- ============================================================================
-- RH Fase 2 — Portal do Colaborador
-- ============================================================================

-- Helper: verifica se usuário tem acesso ao módulo RH (staff RH)
CREATE OR REPLACE FUNCTION public.has_rh_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_module_access
    WHERE user_id = _user_id AND module = 'rh'
  ) OR public.is_supervisor_or_higher(_user_id)
$$;

-- ============================================================================
-- 1. rh_employee_profiles
-- ============================================================================
CREATE TABLE public.rh_employee_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL UNIQUE,
  admission_date date,
  vacation_balance_days integer NOT NULL DEFAULT 30,
  last_vacation_end date,
  cpf text,
  matricula text,
  manager_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rh_employee_profiles TO authenticated;
GRANT ALL ON public.rh_employee_profiles TO service_role;

ALTER TABLE public.rh_employee_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Colaborador lê o próprio perfil RH"
  ON public.rh_employee_profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_rh_access(auth.uid()));

CREATE POLICY "RH gerencia perfis RH do tenant"
  ON public.rh_employee_profiles FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.has_rh_access(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_rh_access(auth.uid()));

CREATE TRIGGER trg_rh_employee_profiles_updated_at
  BEFORE UPDATE ON public.rh_employee_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_rh_employee_profiles_tenant
  BEFORE INSERT ON public.rh_employee_profiles
  FOR EACH ROW EXECUTE FUNCTION public.inject_tenant_id();

CREATE TRIGGER trg_rh_employee_profiles_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.rh_employee_profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- ============================================================================
-- 2. rh_vacation_requests
-- ============================================================================
CREATE TABLE public.rh_vacation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  ticket_id uuid,
  start_date date NOT NULL,
  end_date date NOT NULL,
  days_requested integer NOT NULL,
  type text NOT NULL DEFAULT 'ferias' CHECK (type IN ('ferias','abono','banco_horas')),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovada','recusada','cancelada')),
  notes text,
  decided_by uuid,
  decided_at timestamptz,
  decision_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rh_vacation_user ON public.rh_vacation_requests(user_id, status);
CREATE INDEX idx_rh_vacation_tenant ON public.rh_vacation_requests(tenant_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rh_vacation_requests TO authenticated;
GRANT ALL ON public.rh_vacation_requests TO service_role;

ALTER TABLE public.rh_vacation_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Colaborador vê suas solicitações de férias"
  ON public.rh_vacation_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_rh_access(auth.uid()));

CREATE POLICY "Colaborador cria suas solicitações de férias"
  ON public.rh_vacation_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND tenant_id = public.get_user_tenant_id());

CREATE POLICY "Colaborador cancela sua própria solicitação pendente"
  ON public.rh_vacation_requests FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'pendente')
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "RH gerencia solicitações de férias do tenant"
  ON public.rh_vacation_requests FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.has_rh_access(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_rh_access(auth.uid()));

CREATE TRIGGER trg_rh_vacation_updated_at
  BEFORE UPDATE ON public.rh_vacation_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_rh_vacation_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.rh_vacation_requests
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- ============================================================================
-- 3. rh_medical_certificates
-- ============================================================================
CREATE TABLE public.rh_medical_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  ticket_id uuid,
  issue_date date NOT NULL,
  days_off integer NOT NULL DEFAULT 1,
  doctor_name text,
  doctor_crm text,
  cid_code text,
  file_path text NOT NULL,
  status text NOT NULL DEFAULT 'recebido' CHECK (status IN ('recebido','validado','rejeitado')),
  validated_by uuid,
  validated_at timestamptz,
  validation_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rh_certificate_user ON public.rh_medical_certificates(user_id, status);
CREATE INDEX idx_rh_certificate_tenant ON public.rh_medical_certificates(tenant_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rh_medical_certificates TO authenticated;
GRANT ALL ON public.rh_medical_certificates TO service_role;

ALTER TABLE public.rh_medical_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Colaborador vê seus atestados"
  ON public.rh_medical_certificates FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_rh_access(auth.uid()));

CREATE POLICY "Colaborador envia seus atestados"
  ON public.rh_medical_certificates FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND tenant_id = public.get_user_tenant_id());

CREATE POLICY "RH gerencia atestados do tenant"
  ON public.rh_medical_certificates FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.has_rh_access(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_rh_access(auth.uid()));

CREATE TRIGGER trg_rh_certificate_updated_at
  BEFORE UPDATE ON public.rh_medical_certificates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_rh_certificate_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.rh_medical_certificates
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- ============================================================================
-- 4. rh_payslips
-- ============================================================================
CREATE TABLE public.rh_payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  reference_month date NOT NULL,
  type text NOT NULL DEFAULT 'mensal' CHECK (type IN ('mensal','13o','ferias','rescisao')),
  file_path text NOT NULL,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  viewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rh_payslip_user ON public.rh_payslips(user_id, reference_month DESC);
CREATE INDEX idx_rh_payslip_tenant ON public.rh_payslips(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rh_payslips TO authenticated;
GRANT ALL ON public.rh_payslips TO service_role;

ALTER TABLE public.rh_payslips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Colaborador vê seus holerites"
  ON public.rh_payslips FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_rh_access(auth.uid()));

CREATE POLICY "Colaborador marca holerite como visto"
  ON public.rh_payslips FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "RH gerencia holerites do tenant"
  ON public.rh_payslips FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.has_rh_access(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_rh_access(auth.uid()));

CREATE TRIGGER trg_rh_payslip_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.rh_payslips
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- ============================================================================
-- 5. Storage bucket rh-documents (privado)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('rh-documents', 'rh-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Estrutura: {tenant_id}/{user_id}/{ano}/{tipo}/{filename}
-- Colaborador acessa só sua pasta; RH acessa toda do tenant
CREATE POLICY "Colaborador lê arquivos RH dele"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'rh-documents'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "Colaborador envia arquivos RH dele"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'rh-documents'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "RH lê todos arquivos RH do tenant"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'rh-documents'
    AND public.has_rh_access(auth.uid())
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  );

CREATE POLICY "RH envia/atualiza arquivos RH do tenant"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'rh-documents'
    AND public.has_rh_access(auth.uid())
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  );

CREATE POLICY "RH deleta arquivos RH do tenant"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'rh-documents'
    AND public.has_rh_access(auth.uid())
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  );

-- ============================================================================
-- 6. Trigger: cria ticket RH automaticamente ao solicitar férias ou atestado
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_rh_ticket_from_request()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _category_id uuid;
  _category_name text;
  _ticket_id uuid;
  _title text;
  _description text;
  _category_search text;
BEGIN
  IF TG_TABLE_NAME = 'rh_vacation_requests' THEN
    _category_search := CASE NEW.type
      WHEN 'ferias' THEN 'Solicitação de férias'
      WHEN 'abono' THEN 'Abono'
      WHEN 'banco_horas' THEN 'Banco de horas'
    END;
    _title := 'Solicitação de ' || _category_search || ' — ' ||
              to_char(NEW.start_date, 'DD/MM') || ' a ' || to_char(NEW.end_date, 'DD/MM/YYYY');
    _description := format(
      E'Tipo: %s\nPeríodo: %s a %s (%s dias)\nObservações: %s',
      _category_search,
      to_char(NEW.start_date, 'DD/MM/YYYY'),
      to_char(NEW.end_date, 'DD/MM/YYYY'),
      NEW.days_requested,
      COALESCE(NEW.notes, '—')
    );
  ELSIF TG_TABLE_NAME = 'rh_medical_certificates' THEN
    _category_search := 'Atestado médico';
    _title := 'Atestado médico — ' || NEW.days_off || ' dia(s) a partir de ' || to_char(NEW.issue_date, 'DD/MM/YYYY');
    _description := format(
      E'Data do atestado: %s\nDias de afastamento: %s\nMédico: %s\nCRM: %s\nCID: %s',
      to_char(NEW.issue_date, 'DD/MM/YYYY'),
      NEW.days_off,
      COALESCE(NEW.doctor_name, '—'),
      COALESCE(NEW.doctor_crm, '—'),
      COALESCE(NEW.cid_code, '—')
    );
  ELSE
    RETURN NEW;
  END IF;

  SELECT id INTO _category_id
  FROM public.ti_categories
  WHERE tenant_id = NEW.tenant_id
    AND module = 'rh'
    AND name = _category_search
  LIMIT 1;

  INSERT INTO public.tickets (
    tenant_id, module, title, description, category_id,
    priority, status, created_by
  ) VALUES (
    NEW.tenant_id, 'rh', _title, _description, _category_id,
    'medium', 'open', NEW.user_id
  )
  RETURNING id INTO _ticket_id;

  NEW.ticket_id := _ticket_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rh_vacation_create_ticket
  BEFORE INSERT ON public.rh_vacation_requests
  FOR EACH ROW EXECUTE FUNCTION public.create_rh_ticket_from_request();

CREATE TRIGGER trg_rh_certificate_create_ticket
  BEFORE INSERT ON public.rh_medical_certificates
  FOR EACH ROW EXECUTE FUNCTION public.create_rh_ticket_from_request();

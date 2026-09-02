
-- ============================================
-- 1. customer_profiles: novos campos do cadastro
-- ============================================
ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS razao_social text,
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS address_cep text,
  ADD COLUMN IF NOT EXISTS address_street text,
  ADD COLUMN IF NOT EXISTS address_number text,
  ADD COLUMN IF NOT EXISTS address_complement text,
  ADD COLUMN IF NOT EXISTS address_neighborhood text,
  ADD COLUMN IF NOT EXISTS address_city text,
  ADD COLUMN IF NOT EXISTS address_state text;

-- Permitir o próprio cliente fazer INSERT do seu profile
DROP POLICY IF EXISTS "Customers can insert their own profile" ON public.customer_profiles;
CREATE POLICY "Customers can insert their own profile"
  ON public.customer_profiles FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ============================================
-- 2. sac_ticket_comments: notify_status
-- ============================================
ALTER TABLE public.sac_ticket_comments
  ADD COLUMN IF NOT EXISTS notify_status text DEFAULT 'pending';

-- ============================================
-- 3. Fix RLS de UPDATE em sac_tickets (WITH CHECK)
-- ============================================
DROP POLICY IF EXISTS "Internal team manages SAC tickets of their tenant" ON public.sac_tickets;
CREATE POLICY "Internal team manages SAC tickets of their tenant"
  ON public.sac_tickets FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id() AND public.is_member_or_higher_role())
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.is_member_or_higher_role());

-- ============================================
-- 4. Tabela sac_technical_reports
-- ============================================
CREATE TABLE IF NOT EXISTS public.sac_technical_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL UNIQUE REFERENCES public.sac_tickets(id) ON DELETE CASCADE,
  report_number text NOT NULL,
  report_date date NOT NULL DEFAULT CURRENT_DATE,
  customer_name text,
  customer_contact text,
  complaint text,
  treatment text,
  test_location text,
  conclusion text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','completed')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sac_reports_tenant ON public.sac_technical_reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sac_reports_ticket ON public.sac_technical_reports(ticket_id);

ALTER TABLE public.sac_technical_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal team manages SAC reports"
  ON public.sac_technical_reports FOR ALL
  USING (tenant_id = public.get_user_tenant_id() AND public.is_member_or_higher_role())
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.is_member_or_higher_role());

CREATE POLICY "Customers view their own SAC report when resolved"
  ON public.sac_technical_reports FOR SELECT
  USING (
    status = 'completed'
    AND EXISTS (
      SELECT 1 FROM public.sac_tickets t
      WHERE t.id = ticket_id
        AND t.customer_user_id = auth.uid()
        AND t.status IN ('resolved','closed')
    )
  );

CREATE TRIGGER trg_sac_reports_updated_at
  BEFORE UPDATE ON public.sac_technical_reports
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- 5. sac_report_products
-- ============================================
CREATE TABLE IF NOT EXISTS public.sac_report_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.sac_technical_reports(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  batch text,
  quantity numeric,
  ph numeric,
  density numeric,
  viscosity numeric,
  appearance text,
  color text,
  odor text,
  specification text,
  found_values text,
  evidence_files jsonb DEFAULT '[]'::jsonb,
  sort_order int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sac_report_products_report ON public.sac_report_products(report_id);

ALTER TABLE public.sac_report_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal team manages report products"
  ON public.sac_report_products FOR ALL
  USING (tenant_id = public.get_user_tenant_id() AND public.is_member_or_higher_role())
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.is_member_or_higher_role());

CREATE POLICY "Customers view products of their own visible report"
  ON public.sac_report_products FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sac_technical_reports r
      JOIN public.sac_tickets t ON t.id = r.ticket_id
      WHERE r.id = report_id
        AND r.status = 'completed'
        AND t.customer_user_id = auth.uid()
        AND t.status IN ('resolved','closed')
    )
  );

-- ============================================
-- 6. Trigger: bloquear finalização sem laudo concluído
-- ============================================
CREATE OR REPLACE FUNCTION public.enforce_sac_report_before_closing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('resolved','closed') AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.sac_technical_reports
      WHERE ticket_id = NEW.id AND status = 'completed'
    ) THEN
      RAISE EXCEPTION 'Não é possível encerrar o SAC sem um Laudo Técnico concluído.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_sac_report ON public.sac_tickets;
CREATE TRIGGER trg_enforce_sac_report
  BEFORE UPDATE ON public.sac_tickets
  FOR EACH ROW EXECUTE FUNCTION public.enforce_sac_report_before_closing();

-- ============================================
-- 7. pops.audience
-- ============================================
ALTER TABLE public.pops
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'staff'
  CHECK (audience IN ('staff','customer'));

CREATE INDEX IF NOT EXISTS idx_pops_audience ON public.pops(tenant_id, audience);

-- Permitir clientes lerem POPs do tenant marcados para customer
DROP POLICY IF EXISTS "Customers read customer-facing POPs" ON public.pops;
CREATE POLICY "Customers read customer-facing POPs"
  ON public.pops FOR SELECT
  USING (
    audience = 'customer'
    AND is_active = true
    AND tenant_id = public.get_customer_tenant_id()
  );

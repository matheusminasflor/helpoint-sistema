-- Catálogo de produtos de compras
CREATE TABLE public.fin_purchase_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_purchase_products TO authenticated;
GRANT ALL ON public.fin_purchase_products TO service_role;
ALTER TABLE public.fin_purchase_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read products" ON public.fin_purchase_products FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "tenant insert products" ON public.fin_purchase_products FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_user_tenant_id());
CREATE POLICY "tenant update products" ON public.fin_purchase_products FOR UPDATE TO authenticated USING (tenant_id = public.get_user_tenant_id()) WITH CHECK (tenant_id = public.get_user_tenant_id());
CREATE POLICY "admins delete products" ON public.fin_purchase_products FOR DELETE TO authenticated USING (tenant_id = public.get_user_tenant_id() AND public.is_manager_or_higher(auth.uid()));

-- Solicitações de compra (uma por chamado)
CREATE TABLE public.fin_purchase_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  ticket_id UUID NOT NULL UNIQUE REFERENCES public.tickets(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.fin_purchase_products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  product_link TEXT,
  department TEXT,
  estimated_amount NUMERIC(14,2),
  status TEXT NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval','approved','rejected','completed')),
  approved_quote_id UUID,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  rejected_by UUID,
  rejected_at TIMESTAMPTZ,
  purchase_report TEXT,
  purchase_file_path TEXT,
  executed_by UUID,
  executed_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_purchase_requests TO authenticated;
GRANT ALL ON public.fin_purchase_requests TO service_role;
ALTER TABLE public.fin_purchase_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read purchase requests" ON public.fin_purchase_requests FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "tenant insert purchase requests" ON public.fin_purchase_requests FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_user_tenant_id());
CREATE POLICY "tenant update purchase requests" ON public.fin_purchase_requests FOR UPDATE TO authenticated USING (tenant_id = public.get_user_tenant_id()) WITH CHECK (tenant_id = public.get_user_tenant_id());
CREATE POLICY "admins delete purchase requests" ON public.fin_purchase_requests FOR DELETE TO authenticated USING (tenant_id = public.get_user_tenant_id() AND public.is_manager_or_higher(auth.uid()));

-- Orçamentos (cotações) da solicitação
CREATE TABLE public.fin_purchase_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  request_id UUID NOT NULL REFERENCES public.fin_purchase_requests(id) ON DELETE CASCADE,
  supplier TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  link TEXT,
  file_path TEXT,
  notes TEXT,
  position INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_purchase_quotes TO authenticated;
GRANT ALL ON public.fin_purchase_quotes TO service_role;
ALTER TABLE public.fin_purchase_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read quotes" ON public.fin_purchase_quotes FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "tenant insert quotes" ON public.fin_purchase_quotes FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_user_tenant_id());
CREATE POLICY "tenant update quotes" ON public.fin_purchase_quotes FOR UPDATE TO authenticated USING (tenant_id = public.get_user_tenant_id()) WITH CHECK (tenant_id = public.get_user_tenant_id());
CREATE POLICY "tenant delete quotes" ON public.fin_purchase_quotes FOR DELETE TO authenticated USING (tenant_id = public.get_user_tenant_id());

ALTER TABLE public.fin_purchase_requests
  ADD CONSTRAINT fin_purchase_requests_approved_quote_fkey
  FOREIGN KEY (approved_quote_id) REFERENCES public.fin_purchase_quotes(id) ON DELETE SET NULL;

-- Configuração de teto de gasto por empresa
CREATE TABLE public.fin_budget_settings (
  tenant_id UUID PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'none' CHECK (mode IN ('none','per_department')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_budget_settings TO authenticated;
GRANT ALL ON public.fin_budget_settings TO service_role;
ALTER TABLE public.fin_budget_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read budget settings" ON public.fin_budget_settings FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "managers write budget settings" ON public.fin_budget_settings FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_manager_or_higher(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.is_manager_or_higher(auth.uid()));

-- Teto mensal por departamento
CREATE TABLE public.fin_department_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  department TEXT NOT NULL,
  monthly_limit NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, department)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_department_budgets TO authenticated;
GRANT ALL ON public.fin_department_budgets TO service_role;
ALTER TABLE public.fin_department_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read department budgets" ON public.fin_department_budgets FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "managers write department budgets" ON public.fin_department_budgets FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_manager_or_higher(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.is_manager_or_higher(auth.uid()));

-- Triggers de updated_at
CREATE TRIGGER fin_purchase_products_updated_at BEFORE UPDATE ON public.fin_purchase_products FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER fin_purchase_requests_updated_at BEFORE UPDATE ON public.fin_purchase_requests FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER fin_purchase_quotes_updated_at BEFORE UPDATE ON public.fin_purchase_quotes FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER fin_budget_settings_updated_at BEFORE UPDATE ON public.fin_budget_settings FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER fin_department_budgets_updated_at BEFORE UPDATE ON public.fin_department_budgets FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX idx_fin_purchase_requests_tenant_status ON public.fin_purchase_requests(tenant_id, status);
CREATE INDEX idx_fin_purchase_quotes_request ON public.fin_purchase_quotes(request_id);
CREATE INDEX idx_fin_purchase_products_tenant_name ON public.fin_purchase_products(tenant_id, name);
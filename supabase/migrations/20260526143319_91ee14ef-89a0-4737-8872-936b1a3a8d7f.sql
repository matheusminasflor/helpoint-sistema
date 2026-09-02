
CREATE TABLE public.sac_ticket_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES public.sac_tickets(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.sac_products(id) ON DELETE SET NULL,
  product_batch_id uuid REFERENCES public.sac_product_batches(id) ON DELETE SET NULL,
  product_name text,
  product_batch text,
  quantity numeric,
  description text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sac_ticket_products_ticket ON public.sac_ticket_products(ticket_id);
CREATE INDEX idx_sac_ticket_products_tenant ON public.sac_ticket_products(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sac_ticket_products TO authenticated;
GRANT ALL ON public.sac_ticket_products TO service_role;

ALTER TABLE public.sac_ticket_products ENABLE ROW LEVEL SECURITY;

-- Cliente vê itens dos seus próprios chamados
CREATE POLICY "Customers view own ticket products"
ON public.sac_ticket_products FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sac_tickets t
    WHERE t.id = sac_ticket_products.ticket_id
      AND t.customer_user_id = auth.uid()
  )
);

CREATE POLICY "Customers insert into own tickets"
ON public.sac_ticket_products FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sac_tickets t
    WHERE t.id = sac_ticket_products.ticket_id
      AND t.customer_user_id = auth.uid()
      AND t.tenant_id = sac_ticket_products.tenant_id
  )
);

-- Staff (mesmo tenant) acessa tudo do tenant
CREATE POLICY "Tenant staff manage ticket products"
ON public.sac_ticket_products FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id())
WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE TRIGGER trg_sac_ticket_products_updated
BEFORE UPDATE ON public.sac_ticket_products
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_sac_ticket_products_audit
AFTER INSERT OR UPDATE OR DELETE ON public.sac_ticket_products
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

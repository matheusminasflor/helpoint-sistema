ALTER TABLE public.fin_purchase_products
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS fin_purchase_products_tenant_active_idx
  ON public.fin_purchase_products (tenant_id, is_active);
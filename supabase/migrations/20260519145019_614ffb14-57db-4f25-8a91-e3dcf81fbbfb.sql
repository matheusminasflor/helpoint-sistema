
-- 1) Relax SAC attachment SELECT policies for staff (any profile in the tenant)
DROP POLICY IF EXISTS "Internal team views attachments of their tenant" ON public.sac_ticket_attachments;
CREATE POLICY "Tenant staff views SAC attachments"
  ON public.sac_ticket_attachments FOR SELECT
  USING (
    tenant_id = public.get_user_tenant_id()
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.tenant_id = public.get_user_tenant_id())
  );

DROP POLICY IF EXISTS "Internal team can upload attachments" ON public.sac_ticket_attachments;
CREATE POLICY "Tenant staff can upload SAC attachments"
  ON public.sac_ticket_attachments FOR INSERT
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.tenant_id = public.get_user_tenant_id())
  );

DROP POLICY IF EXISTS "Owners and staff can read SAC attachments" ON storage.objects;
CREATE POLICY "Owners and tenant staff can read SAC attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'sac-attachments'
    AND (
      owner = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.tenant_id IS NOT NULL)
    )
  );

-- 2) Catalog: products
CREATE TABLE public.sac_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  sku text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sac_products_tenant ON public.sac_products(tenant_id);
ALTER TABLE public.sac_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant staff manages products"
  ON public.sac_products FOR ALL
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Customers can view active products of their tenant"
  ON public.sac_products FOR SELECT
  USING (is_active = true AND tenant_id = public.get_customer_tenant_id());

CREATE TRIGGER trg_sac_products_updated_at
  BEFORE UPDATE ON public.sac_products
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 3) Catalog: batches
CREATE TABLE public.sac_product_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.sac_products(id) ON DELETE CASCADE,
  batch_code text NOT NULL,
  manufactured_at date,
  expires_at date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sac_batches_product ON public.sac_product_batches(product_id);
CREATE INDEX idx_sac_batches_tenant ON public.sac_product_batches(tenant_id);
ALTER TABLE public.sac_product_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant staff manages batches"
  ON public.sac_product_batches FOR ALL
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Customers can view active batches of their tenant"
  ON public.sac_product_batches FOR SELECT
  USING (is_active = true AND tenant_id = public.get_customer_tenant_id());

CREATE TRIGGER trg_sac_batches_updated_at
  BEFORE UPDATE ON public.sac_product_batches
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 4) Link sac_tickets to catalog
ALTER TABLE public.sac_tickets
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.sac_products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_batch_id uuid REFERENCES public.sac_product_batches(id) ON DELETE SET NULL;

-- 5) Trigger to fill product_name/product_batch from catalog when linked
CREATE OR REPLACE FUNCTION public.sync_sac_product_names()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name text;
  _batch text;
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    SELECT name INTO _name FROM public.sac_products WHERE id = NEW.product_id;
    IF _name IS NOT NULL THEN NEW.product_name := _name; END IF;
  END IF;
  IF NEW.product_batch_id IS NOT NULL THEN
    SELECT batch_code INTO _batch FROM public.sac_product_batches WHERE id = NEW.product_batch_id;
    IF _batch IS NOT NULL THEN NEW.product_batch := _batch; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_sac_product_names ON public.sac_tickets;
CREATE TRIGGER trg_sync_sac_product_names
  BEFORE INSERT OR UPDATE OF product_id, product_batch_id ON public.sac_tickets
  FOR EACH ROW EXECUTE FUNCTION public.sync_sac_product_names();

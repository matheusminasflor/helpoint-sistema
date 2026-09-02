
-- 1) Status do inventário: adicionar "em uso" e "em estoque"
ALTER TYPE asset_status ADD VALUE IF NOT EXISTS 'in_use';
ALTER TYPE asset_status ADD VALUE IF NOT EXISTS 'in_stock';

-- 2) Cronograma social: nova plataforma whatsapp + campos de mídia/estratégia
ALTER TYPE social_platform ADD VALUE IF NOT EXISTS 'whatsapp';
ALTER TYPE social_platform ADD VALUE IF NOT EXISTS 'meta_ads';
ALTER TYPE social_post_type ADD VALUE IF NOT EXISTS 'paid_ad';
ALTER TYPE social_post_type ADD VALUE IF NOT EXISTS 'broadcast_list';

ALTER TABLE public.mkt_social_posts
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.mkt_social_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_link text,
  ADD COLUMN IF NOT EXISTS strategy_notes text;

-- 3) Inventário de MKT (espelho simplificado de assets)
CREATE TABLE IF NOT EXISTS public.mkt_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  asset_tag text NOT NULL,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'outros',
  subcategory text,
  manufacturer text,
  model text,
  serial_number text,
  assigned_to uuid REFERENCES public.profiles(id),
  department text,
  location text,
  status asset_status NOT NULL DEFAULT 'active',
  purchase_date date,
  purchase_value numeric(12,2),
  warranty_expiry date,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, asset_tag)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_assets TO authenticated;
GRANT ALL ON public.mkt_assets TO service_role;

ALTER TABLE public.mkt_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mkt_assets_tenant_select" ON public.mkt_assets
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "mkt_assets_tenant_insert" ON public.mkt_assets
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.is_member_or_higher_role());

CREATE POLICY "mkt_assets_tenant_update" ON public.mkt_assets
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_member_or_higher_role());

CREATE POLICY "mkt_assets_tenant_delete" ON public.mkt_assets
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_supervisor_or_higher(auth.uid()));

CREATE TRIGGER mkt_assets_updated_at
  BEFORE UPDATE ON public.mkt_assets
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER mkt_assets_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.mkt_assets
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

CREATE INDEX IF NOT EXISTS idx_mkt_assets_tenant ON public.mkt_assets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mkt_assets_status ON public.mkt_assets(tenant_id, status);


-- 1) Tabela tenant_domains
CREATE TABLE public.tenant_domains (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hostname TEXT NOT NULL,
  verification_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  verified_at TIMESTAMPTZ,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  last_check_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX tenant_domains_hostname_unique
  ON public.tenant_domains (lower(hostname));
CREATE INDEX tenant_domains_tenant_idx
  ON public.tenant_domains (tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_domains TO authenticated;
GRANT ALL ON public.tenant_domains TO service_role;

ALTER TABLE public.tenant_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage own tenant domains"
  ON public.tenant_domains
  FOR ALL
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND public.is_admin_or_higher(auth.uid())
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND public.is_admin_or_higher(auth.uid())
  );

CREATE POLICY "Members view own tenant domains"
  ON public.tenant_domains
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE TRIGGER tenant_domains_set_updated_at
  BEFORE UPDATE ON public.tenant_domains
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 2) Resolver tenant por hostname (público, só devolve verificado)
CREATE OR REPLACE FUNCTION public.get_tenant_by_hostname(_hostname TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  logo_url TEXT,
  primary_color TEXT,
  login_banner_url TEXT,
  welcome_text TEXT
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.name,
    t.slug,
    t.logo_url,
    t.settings->'branding'->>'primaryColor',
    t.settings->'branding'->>'loginBannerUrl',
    t.settings->'branding'->>'welcomeText'
  FROM public.tenant_domains d
  JOIN public.tenants t ON t.id = d.tenant_id
  WHERE lower(d.hostname) = lower(_hostname)
    AND d.verified_at IS NOT NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_by_hostname(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_sac_tenant_branding(_slug text)
RETURNS TABLE(id uuid, name text, slug text, logo_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.name, t.slug, t.logo_url
  FROM public.tenants t
  WHERE _slug IS NOT NULL AND t.slug = _slug
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_sac_tenant_branding(text) TO anon, authenticated;
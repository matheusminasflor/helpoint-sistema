
DROP FUNCTION IF EXISTS public.get_sac_tenant_branding(text);

CREATE FUNCTION public.get_sac_tenant_branding(_slug text)
RETURNS TABLE(
  id uuid,
  name text,
  slug text,
  logo_url text,
  primary_color text,
  login_banner_url text,
  welcome_text text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    t.id,
    t.name,
    t.slug,
    t.logo_url,
    t.settings->'branding'->>'primaryColor',
    t.settings->'branding'->>'loginBannerUrl',
    t.settings->'branding'->>'welcomeText'
  FROM public.tenants t
  WHERE _slug IS NOT NULL AND t.slug = _slug
  LIMIT 1;
$function$;

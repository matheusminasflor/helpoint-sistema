CREATE OR REPLACE FUNCTION public.get_invite_public(_invite_id uuid)
RETURNS TABLE(
  id uuid,
  email text,
  role text,
  department text,
  expires_at timestamptz,
  used_at timestamptz,
  tenant_name text,
  tenant_slug text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.email, i.role::text, i.department, i.expires_at, i.used_at,
         t.name, t.slug
  FROM public.tenant_invites i
  LEFT JOIN public.tenants t ON t.id = i.tenant_id
  WHERE i.id = _invite_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_invite_public(uuid) TO anon, authenticated;
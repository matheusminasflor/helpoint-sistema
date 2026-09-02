-- Make profiles SELECT policies apply only to authenticated users (scanner expects TO authenticated)

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Supervisors can view profiles in their tenant" ON public.profiles;

CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  tenant_id = get_user_tenant_id()
  AND id = auth.uid()
);

CREATE POLICY "Supervisors can view profiles in their tenant"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  tenant_id = get_user_tenant_id()
  AND is_supervisor_or_higher(auth.uid())
);

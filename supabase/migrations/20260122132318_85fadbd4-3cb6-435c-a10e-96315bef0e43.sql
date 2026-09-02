-- Add explicit auth checks and restrict SELECT policies to authenticated role

-- profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Supervisors can view profiles in their tenant" ON public.profiles;

CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND tenant_id = get_user_tenant_id()
  AND id = auth.uid()
);

CREATE POLICY "Supervisors can view profiles in their tenant"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND tenant_id = get_user_tenant_id()
  AND is_supervisor_or_higher(auth.uid())
);

-- software_contracts
DROP POLICY IF EXISTS "Supervisors can view contracts" ON public.software_contracts;

CREATE POLICY "Supervisors can view contracts"
ON public.software_contracts
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND tenant_id = get_user_tenant_id()
  AND is_supervisor_or_higher(auth.uid())
);

-- software_license_keys
DROP POLICY IF EXISTS "Supervisors can view license keys" ON public.software_license_keys;

CREATE POLICY "Supervisors can view license keys"
ON public.software_license_keys
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND tenant_id = get_user_tenant_id()
  AND is_supervisor_or_higher(auth.uid())
);

-- Fix security scan errors by tightening SELECT policies

-- 1) profiles: user can see own profile; supervisor+ can see all within tenant
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view profiles in their tenant" ON public.profiles;

CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND tenant_id = get_user_tenant_id()
  AND id = auth.uid()
);

CREATE POLICY "Supervisors can view profiles in their tenant"
ON public.profiles
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND tenant_id = get_user_tenant_id()
  AND is_supervisor_or_higher(auth.uid())
);

-- 2) software_contracts: restrict visibility to supervisor+ only
ALTER TABLE public.software_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view contracts in their tenant" ON public.software_contracts;

CREATE POLICY "Supervisors can view contracts"
ON public.software_contracts
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND tenant_id = get_user_tenant_id()
  AND is_supervisor_or_higher(auth.uid())
);

-- 3) software_license_keys: keep supervisor+ access, but make auth requirement explicit
ALTER TABLE public.software_license_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Supervisors can view license keys" ON public.software_license_keys;
DROP POLICY IF EXISTS "Supervisors can create license keys" ON public.software_license_keys;
DROP POLICY IF EXISTS "Supervisors can update license keys" ON public.software_license_keys;
DROP POLICY IF EXISTS "Supervisors can delete license keys" ON public.software_license_keys;

CREATE POLICY "Supervisors can view license keys"
ON public.software_license_keys
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND tenant_id = get_user_tenant_id()
  AND is_supervisor_or_higher(auth.uid())
);

CREATE POLICY "Supervisors can create license keys"
ON public.software_license_keys
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND tenant_id = get_user_tenant_id()
  AND is_supervisor_or_higher(auth.uid())
);

CREATE POLICY "Supervisors can update license keys"
ON public.software_license_keys
FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND tenant_id = get_user_tenant_id()
  AND is_supervisor_or_higher(auth.uid())
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND tenant_id = get_user_tenant_id()
  AND is_supervisor_or_higher(auth.uid())
);

CREATE POLICY "Supervisors can delete license keys"
ON public.software_license_keys
FOR DELETE
USING (
  auth.uid() IS NOT NULL
  AND tenant_id = get_user_tenant_id()
  AND is_supervisor_or_higher(auth.uid())
);

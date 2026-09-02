
ALTER TABLE public.customer_profiles ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;
ALTER TABLE public.customer_profiles ADD COLUMN IF NOT EXISTS blocked_at timestamptz;
ALTER TABLE public.customer_profiles ADD COLUMN IF NOT EXISTS blocked_by uuid;

-- Staff (admin/manager) of the same tenant can manage customer profiles
DROP POLICY IF EXISTS "Staff can update customers of their tenant" ON public.customer_profiles;
CREATE POLICY "Staff can update customers of their tenant"
ON public.customer_profiles FOR UPDATE
USING (
  tenant_id = public.get_user_tenant_id()
  AND public.is_manager_or_higher(auth.uid())
);

DROP POLICY IF EXISTS "Staff can delete customers of their tenant" ON public.customer_profiles;
CREATE POLICY "Staff can delete customers of their tenant"
ON public.customer_profiles FOR DELETE
USING (
  tenant_id = public.get_user_tenant_id()
  AND public.is_manager_or_higher(auth.uid())
);

-- Update is_customer to consider block status
CREATE OR REPLACE FUNCTION public.is_customer(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.customer_profiles
    WHERE user_id = _user_id AND is_blocked = false
  )
$$;

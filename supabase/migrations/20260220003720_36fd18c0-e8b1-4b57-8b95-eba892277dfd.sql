
-- =============================================
-- REESTRUTURAÇÃO TOTAL: profiles RLS
-- =============================================

-- 1. DROP de TODAS as políticas existentes
DROP POLICY IF EXISTS "Directors can delete profiles" ON public.profiles;
DROP POLICY IF EXISTS "System can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Supervisors can view profiles in their tenant" ON public.profiles;
DROP POLICY IF EXISTS "Tenant isolation on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update tenant profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- 2. Desativar e reativar RLS
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

-- 3. ÚNICA política SELECT
CREATE POLICY "profiles_isolation_policy"
ON public.profiles
FOR SELECT
TO authenticated
USING (tenant_id = get_user_tenant_id());

-- 4. Políticas para outras operações
CREATE POLICY "profiles_update_own"
ON public.profiles
FOR UPDATE
TO authenticated
USING (tenant_id = get_user_tenant_id() AND id = auth.uid())
WITH CHECK (tenant_id = get_user_tenant_id() AND id = auth.uid());

CREATE POLICY "profiles_update_admin"
ON public.profiles
FOR UPDATE
TO authenticated
USING (tenant_id = get_user_tenant_id() AND is_admin_or_higher(auth.uid()))
WITH CHECK (tenant_id = get_user_tenant_id() AND is_admin_or_higher(auth.uid()));

CREATE POLICY "profiles_insert"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY "profiles_delete_director"
ON public.profiles
FOR DELETE
TO authenticated
USING (tenant_id = get_user_tenant_id() AND is_diretor(auth.uid()));

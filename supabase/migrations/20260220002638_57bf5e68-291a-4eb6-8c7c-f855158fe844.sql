
-- =============================================
-- CORREÇÃO CRÍTICA: Vazamento Cross-Tenant em profiles
-- =============================================

-- 1. Garantir RLS ativado
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Dropar TODAS as políticas existentes da tabela profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Supervisors can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Supervisors can view all profiles in tenant" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles in their tenant" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
DROP POLICY IF EXISTS "Directors can delete profiles" ON public.profiles;
DROP POLICY IF EXISTS "Supervisors can view tenant profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update tenant profiles" ON public.profiles;
DROP POLICY IF EXISTS "System can insert profiles" ON public.profiles;

-- 3. Recriar políticas com isolamento total por tenant_id

-- SELECT: Usuário comum vê apenas seu próprio perfil
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (tenant_id = get_user_tenant_id() AND id = auth.uid());

-- SELECT: Supervisores/Admins veem todos os perfis DO SEU TENANT
CREATE POLICY "Supervisors can view tenant profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

-- UPDATE: Usuário edita apenas seu próprio perfil
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (tenant_id = get_user_tenant_id() AND id = auth.uid())
WITH CHECK (tenant_id = get_user_tenant_id() AND id = auth.uid());

-- UPDATE: Admins podem editar perfis dentro do tenant
CREATE POLICY "Admins can update tenant profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (tenant_id = get_user_tenant_id() AND is_admin_or_higher(auth.uid()))
WITH CHECK (tenant_id = get_user_tenant_id() AND is_admin_or_higher(auth.uid()));

-- INSERT: Apenas com tenant_id correto
CREATE POLICY "System can insert profiles"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (tenant_id = get_user_tenant_id());

-- DELETE: Apenas diretores do mesmo tenant
CREATE POLICY "Directors can delete profiles"
ON public.profiles
FOR DELETE
TO authenticated
USING (tenant_id = get_user_tenant_id() AND is_diretor(auth.uid()));

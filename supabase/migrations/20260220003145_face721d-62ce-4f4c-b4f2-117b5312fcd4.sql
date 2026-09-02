
-- CORREÇÃO DEFINITIVA: Uma única política SELECT na profiles
-- Remove TODAS as políticas SELECT existentes
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Supervisors can view tenant profiles" ON public.profiles;

-- Política ÚNICA: qualquer usuário autenticado vê APENAS perfis do seu tenant
CREATE POLICY "Tenant isolation on profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (tenant_id = get_user_tenant_id());

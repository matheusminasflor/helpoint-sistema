
-- Fix: FORCE ROW LEVEL SECURITY blocks SECURITY DEFINER functions
-- causing get_user_tenant_id() to return NULL (circular dependency)
-- Regular ENABLE RLS is sufficient for the 'authenticated' role

ALTER TABLE public.profiles NO FORCE ROW LEVEL SECURITY;

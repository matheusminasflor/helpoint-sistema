-- Step 1: Update is_supervisor_or_higher to include admin
CREATE OR REPLACE FUNCTION public.is_supervisor_or_higher(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND role IN ('supervisor', 'admin', 'diretor')
    )
$$;

-- Step 2: Update is_diretor to also recognize admin as equivalent
CREATE OR REPLACE FUNCTION public.is_diretor(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND role IN ('diretor', 'admin')
    )
$$;

-- Step 3: Create is_admin function
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND role = 'admin'
    )
$$;

-- Step 4: Update get_user_role to prioritize admin
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS public.app_role
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT role FROM public.user_roles
    WHERE user_id = _user_id
    ORDER BY CASE role
        WHEN 'admin' THEN 1
        WHEN 'diretor' THEN 2
        WHEN 'supervisor' THEN 3
        WHEN 'tecnico' THEN 4
        WHEN 'colaborador' THEN 5
    END
    LIMIT 1
$$;

-- Step 5: Create tenant if not exists
INSERT INTO public.tenants (name, slug)
VALUES ('Helpoint', 'helpoint')
ON CONFLICT (slug) DO NOTHING;

-- Step 6: Create profile for existing user
INSERT INTO public.profiles (id, tenant_id, email, full_name, department)
SELECT 
  '6d447cb2-22c1-44db-93b9-c30b61647c9c'::uuid,
  t.id,
  'matheusbaeta1997@gmail.com',
  'Matheus Baeta',
  'ti'
FROM public.tenants t
WHERE t.slug = 'helpoint'
ON CONFLICT (id) DO NOTHING;

-- Step 7: Assign admin role to user
INSERT INTO public.user_roles (user_id, role)
VALUES ('6d447cb2-22c1-44db-93b9-c30b61647c9c'::uuid, 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
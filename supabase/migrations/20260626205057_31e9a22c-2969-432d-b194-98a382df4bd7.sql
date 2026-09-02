
-- 1) access_profiles
CREATE TABLE public.access_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  department text NOT NULL CHECK (department IN ('ti','marketing','rh','qualidade')),
  name text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  restrictions jsonb NOT NULL DEFAULT '{}'::jsonb,
  legacy_ti_profile_id uuid,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, department, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_profiles TO authenticated;
GRANT ALL ON public.access_profiles TO service_role;

ALTER TABLE public.access_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "access_profiles_select_same_tenant"
  ON public.access_profiles FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "access_profiles_insert_supervisor"
  ON public.access_profiles FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.is_supervisor_or_higher(auth.uid()));

CREATE POLICY "access_profiles_update_supervisor"
  ON public.access_profiles FOR UPDATE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_supervisor_or_higher(auth.uid()));

CREATE POLICY "access_profiles_delete_supervisor"
  ON public.access_profiles FOR DELETE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_supervisor_or_higher(auth.uid()));

CREATE TRIGGER access_profiles_updated_at
  BEFORE UPDATE ON public.access_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX idx_access_profiles_tenant_dept ON public.access_profiles(tenant_id, department);

-- 2) user_access_profiles
CREATE TABLE public.user_access_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department text NOT NULL CHECK (department IN ('ti','marketing','rh','qualidade')),
  profile_id uuid REFERENCES public.access_profiles(id) ON DELETE SET NULL,
  overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  assigned_by uuid REFERENCES auth.users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, department)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_access_profiles TO authenticated;
GRANT ALL ON public.user_access_profiles TO service_role;

ALTER TABLE public.user_access_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uap_select_self_or_supervisor"
  ON public.user_access_profiles FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (user_id = auth.uid() OR public.is_supervisor_or_higher(auth.uid()))
  );

CREATE POLICY "uap_insert_supervisor"
  ON public.user_access_profiles FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.is_supervisor_or_higher(auth.uid()));

CREATE POLICY "uap_update_supervisor"
  ON public.user_access_profiles FOR UPDATE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_supervisor_or_higher(auth.uid()));

CREATE POLICY "uap_delete_supervisor"
  ON public.user_access_profiles FOR DELETE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_supervisor_or_higher(auth.uid()));

CREATE TRIGGER uap_updated_at
  BEFORE UPDATE ON public.user_access_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX idx_uap_tenant_user ON public.user_access_profiles(tenant_id, user_id);

-- 3) Backfill: copia perfis TI existentes para access_profiles (idempotente)
INSERT INTO public.access_profiles (tenant_id, department, name, description, is_default, permissions, restrictions, legacy_ti_profile_id, created_at, updated_at)
SELECT
  t.tenant_id,
  'ti',
  t.name,
  t.description,
  t.is_default,
  jsonb_build_object('modules', t.modules, 'detailed', t.permissions),
  t.ticket_restrictions,
  t.id,
  t.created_at,
  t.updated_at
FROM public.ti_access_profiles t
ON CONFLICT (tenant_id, department, name) DO NOTHING;

-- 4) Backfill: vincula usuários TI
INSERT INTO public.user_access_profiles (tenant_id, user_id, department, profile_id, assigned_by, assigned_at)
SELECT
  tup.tenant_id,
  tup.user_id,
  'ti',
  ap.id,
  tup.assigned_by,
  COALESCE(tup.assigned_at, now())
FROM public.ti_user_profiles tup
JOIN public.access_profiles ap ON ap.legacy_ti_profile_id = tup.profile_id
ON CONFLICT (tenant_id, user_id, department) DO NOTHING;

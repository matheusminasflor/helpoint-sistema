
-- 1) access_email para vincular conta de acesso ao colaborador
ALTER TABLE public.rh_employee_profiles
  ADD COLUMN IF NOT EXISTS access_email text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rh_emp_access_email
  ON public.rh_employee_profiles (tenant_id, lower(access_email))
  WHERE access_email IS NOT NULL;

-- 2) RPC para atrelar conta via e-mail (busca em profiles do mesmo tenant)
CREATE OR REPLACE FUNCTION public.rh_link_employee_user(_employee_id uuid, _email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant uuid;
  _user uuid;
  _norm text := lower(trim(_email));
BEGIN
  IF NOT public.has_rh_access(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT tenant_id INTO _tenant FROM public.rh_employee_profiles WHERE id = _employee_id;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'employee_not_found'; END IF;
  IF _tenant <> public.get_user_tenant_id() THEN RAISE EXCEPTION 'tenant_mismatch'; END IF;

  SELECT id INTO _user FROM public.profiles
   WHERE tenant_id = _tenant AND lower(email) = _norm
   LIMIT 1;

  UPDATE public.rh_employee_profiles
     SET access_email = _norm,
         user_id = COALESCE(_user, user_id),
         updated_at = now()
   WHERE id = _employee_id;

  RETURN jsonb_build_object('linked', _user IS NOT NULL, 'user_id', _user);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rh_link_employee_user(uuid, text) TO authenticated;

-- 3) Vincula automaticamente ao criar/atualizar um perfil em profiles
CREATE OR REPLACE FUNCTION public.rh_auto_link_on_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NULL OR NEW.tenant_id IS NULL THEN RETURN NEW; END IF;
  UPDATE public.rh_employee_profiles
     SET user_id = NEW.id, updated_at = now()
   WHERE tenant_id = NEW.tenant_id
     AND user_id IS NULL
     AND access_email IS NOT NULL
     AND lower(access_email) = lower(NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rh_auto_link_on_profile ON public.profiles;
CREATE TRIGGER trg_rh_auto_link_on_profile
AFTER INSERT OR UPDATE OF email, tenant_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.rh_auto_link_on_profile();

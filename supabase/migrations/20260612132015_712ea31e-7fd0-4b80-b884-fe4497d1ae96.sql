
-- 1. CNPJ opcional e único nas empresas
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS cnpj text;
CREATE UNIQUE INDEX IF NOT EXISTS tenants_cnpj_unique ON public.tenants (cnpj) WHERE cnpj IS NOT NULL;

-- 2. Tabela de tentativas anti-abuso
CREATE TABLE IF NOT EXISTS public.tenant_signup_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text,
  slug text,
  cnpj text,
  success boolean NOT NULL DEFAULT false,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tenant_signup_attempts_email_idx ON public.tenant_signup_attempts (email, created_at DESC);
CREATE INDEX IF NOT EXISTS tenant_signup_attempts_user_idx ON public.tenant_signup_attempts (user_id, created_at DESC);

GRANT SELECT, INSERT ON public.tenant_signup_attempts TO authenticated;
GRANT ALL ON public.tenant_signup_attempts TO service_role;

ALTER TABLE public.tenant_signup_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own attempts" ON public.tenant_signup_attempts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 3. RPC: claim_new_tenant
CREATE OR REPLACE FUNCTION public.claim_new_tenant(
  _company_name text,
  _slug text,
  _cnpj text,
  _full_name text,
  _department text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _email text;
  _email_confirmed_at timestamptz;
  _new_tenant_id uuid;
  _recent_attempts int;
  _existing_profile_tenant uuid;
  _reserved text[] := ARRAY['admin','app','helpoint','api','www','sac','public','root','support','suporte','login','signup','cadastro','painel','dashboard','portal','config','configuracoes','sistema'];
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
  END IF;

  -- Verifica email confirmado
  SELECT email, email_confirmed_at INTO _email, _email_confirmed_at
  FROM auth.users WHERE id = _user_id;
  IF _email_confirmed_at IS NULL THEN
    INSERT INTO public.tenant_signup_attempts (user_id, email, slug, cnpj, success, error_code)
      VALUES (_user_id, _email, _slug, _cnpj, false, 'email_not_confirmed');
    RAISE EXCEPTION 'email_not_confirmed' USING ERRCODE = 'P0001';
  END IF;

  -- Rate limit: máx 5 tentativas na última hora por usuário
  SELECT count(*) INTO _recent_attempts
  FROM public.tenant_signup_attempts
  WHERE user_id = _user_id AND created_at > now() - interval '1 hour';
  IF _recent_attempts >= 5 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001';
  END IF;

  -- Já tem empresa?
  SELECT tenant_id INTO _existing_profile_tenant FROM public.profiles WHERE id = _user_id;
  IF _existing_profile_tenant IS NOT NULL THEN
    RAISE EXCEPTION 'already_has_tenant' USING ERRCODE = 'P0001';
  END IF;

  -- Validações
  IF _company_name IS NULL OR length(trim(_company_name)) < 2 THEN
    RAISE EXCEPTION 'invalid_company_name' USING ERRCODE = 'P0001';
  END IF;
  IF _slug !~ '^[a-z0-9][a-z0-9-]{2,39}$' THEN
    INSERT INTO public.tenant_signup_attempts (user_id, email, slug, cnpj, success, error_code)
      VALUES (_user_id, _email, _slug, _cnpj, false, 'invalid_slug');
    RAISE EXCEPTION 'invalid_slug' USING ERRCODE = 'P0001';
  END IF;
  IF _slug = ANY(_reserved) THEN
    RAISE EXCEPTION 'reserved_slug' USING ERRCODE = 'P0001';
  END IF;
  IF _cnpj IS NOT NULL AND length(regexp_replace(_cnpj, '\D', '', 'g')) NOT IN (0,14) THEN
    RAISE EXCEPTION 'invalid_cnpj' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = _slug) THEN
    INSERT INTO public.tenant_signup_attempts (user_id, email, slug, cnpj, success, error_code)
      VALUES (_user_id, _email, _slug, _cnpj, false, 'slug_taken');
    RAISE EXCEPTION 'slug_taken' USING ERRCODE = 'P0001';
  END IF;
  IF _cnpj IS NOT NULL AND length(regexp_replace(_cnpj,'\D','','g')) = 14
     AND EXISTS (SELECT 1 FROM public.tenants WHERE cnpj = regexp_replace(_cnpj,'\D','','g')) THEN
    INSERT INTO public.tenant_signup_attempts (user_id, email, slug, cnpj, success, error_code)
      VALUES (_user_id, _email, _slug, _cnpj, false, 'cnpj_taken');
    RAISE EXCEPTION 'cnpj_taken' USING ERRCODE = 'P0001';
  END IF;

  -- Cria tenant, profile e role em transação
  INSERT INTO public.tenants (name, slug, cnpj)
    VALUES (trim(_company_name), _slug,
            CASE WHEN _cnpj IS NULL OR length(regexp_replace(_cnpj,'\D','','g'))=0
                 THEN NULL ELSE regexp_replace(_cnpj,'\D','','g') END)
    RETURNING id INTO _new_tenant_id;

  INSERT INTO public.profiles (id, tenant_id, email, full_name, department)
    VALUES (_user_id, _new_tenant_id, _email, COALESCE(_full_name, _email), _department)
    ON CONFLICT (id) DO UPDATE
      SET tenant_id = EXCLUDED.tenant_id,
          full_name = EXCLUDED.full_name,
          department = EXCLUDED.department;

  INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, 'owner')
    ON CONFLICT DO NOTHING;

  INSERT INTO public.tenant_signup_attempts (user_id, email, slug, cnpj, success)
    VALUES (_user_id, _email, _slug, _cnpj, true);

  RETURN _new_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_new_tenant(text,text,text,text,text) TO authenticated;

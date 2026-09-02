
-- 1) Tabela de histórico de perfis
CREATE TABLE public.profile_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  archived_by uuid,
  reason text,
  snapshot jsonb NOT NULL,
  restored_at timestamptz,
  restored_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_profile_history_user ON public.profile_history(user_id, archived_at DESC);
CREATE INDEX idx_profile_history_tenant ON public.profile_history(tenant_id, archived_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.profile_history TO authenticated;
GRANT ALL ON public.profile_history TO service_role;

ALTER TABLE public.profile_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ph_select_supervisors" ON public.profile_history
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_supervisor_or_higher(auth.uid()));

CREATE POLICY "ph_insert_supervisors" ON public.profile_history
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.is_supervisor_or_higher(auth.uid()));

CREATE POLICY "ph_update_supervisors" ON public.profile_history
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_supervisor_or_higher(auth.uid()));

-- 2) Função para arquivar e revogar acessos
CREATE OR REPLACE FUNCTION public.archive_profile(_user_id uuid, _reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant uuid;
  _snapshot jsonb;
  _hid uuid;
BEGIN
  IF NOT public.is_supervisor_or_higher(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = _user_id;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF _tenant <> public.get_user_tenant_id() THEN RAISE EXCEPTION 'tenant_mismatch'; END IF;

  SELECT jsonb_build_object(
    'profile', to_jsonb(p),
    'roles', COALESCE((SELECT jsonb_agg(role) FROM public.user_roles WHERE user_id = _user_id), '[]'::jsonb),
    'modules', COALESCE((SELECT jsonb_agg(module) FROM public.user_module_access WHERE user_id = _user_id), '[]'::jsonb),
    'ti_profile', (SELECT to_jsonb(t) FROM public.ti_user_profiles t WHERE user_id = _user_id LIMIT 1),
    'qualidade_profile', (SELECT to_jsonb(q) FROM public.qualidade_user_profiles q WHERE user_id = _user_id LIMIT 1)
  )
  INTO _snapshot
  FROM public.profiles p
  WHERE p.id = _user_id;

  INSERT INTO public.profile_history (tenant_id, user_id, archived_by, reason, snapshot)
  VALUES (_tenant, _user_id, auth.uid(), _reason, _snapshot)
  RETURNING id INTO _hid;

  -- Revoga acessos imediatos
  DELETE FROM public.user_module_access WHERE user_id = _user_id;
  DELETE FROM public.ti_user_profiles WHERE user_id = _user_id;
  DELETE FROM public.qualidade_user_profiles WHERE user_id = _user_id;

  UPDATE public.profiles SET is_active = false, updated_at = now() WHERE id = _user_id;

  RETURN _hid;
END;
$$;

-- 3) Função para restaurar a partir do último snapshot
CREATE OR REPLACE FUNCTION public.restore_profile(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant uuid;
  _hist record;
  _module text;
  _restored_modules text[] := ARRAY[]::text[];
  _skipped_modules text[] := ARRAY[]::text[];
  _available text[];
BEGIN
  IF NOT public.is_supervisor_or_higher(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = _user_id;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF _tenant <> public.get_user_tenant_id() THEN RAISE EXCEPTION 'tenant_mismatch'; END IF;

  SELECT * INTO _hist FROM public.profile_history
   WHERE user_id = _user_id AND tenant_id = _tenant AND restored_at IS NULL
   ORDER BY archived_at DESC LIMIT 1;
  IF _hist.id IS NULL THEN RAISE EXCEPTION 'no_snapshot'; END IF;

  -- Reativa profile
  UPDATE public.profiles SET is_active = true, updated_at = now() WHERE id = _user_id;

  -- Módulos disponíveis no plano atual (best-effort)
  SELECT COALESCE(array_agg(value::text), ARRAY[]::text[]) INTO _available
  FROM jsonb_array_elements_text(
    COALESCE((SELECT settings->'plan'->'available_modules' FROM public.tenants WHERE id = _tenant), '[]'::jsonb)
  );

  -- Restaura módulos validando contra o plano (quando definido)
  FOR _module IN SELECT jsonb_array_elements_text(_hist.snapshot->'modules')
  LOOP
    IF array_length(_available, 1) IS NULL OR _module = ANY(_available) THEN
      INSERT INTO public.user_module_access (tenant_id, user_id, module, granted_by)
      VALUES (_tenant, _user_id, _module, auth.uid())
      ON CONFLICT DO NOTHING;
      _restored_modules := array_append(_restored_modules, _module);
    ELSE
      _skipped_modules := array_append(_skipped_modules, _module);
    END IF;
  END LOOP;

  -- Restaura perfil TI
  IF _hist.snapshot ? 'ti_profile' AND _hist.snapshot->'ti_profile' IS NOT NULL AND _hist.snapshot->'ti_profile' <> 'null'::jsonb THEN
    INSERT INTO public.ti_user_profiles (tenant_id, user_id, profile_id)
    VALUES (_tenant, _user_id, (_hist.snapshot->'ti_profile'->>'profile_id')::uuid)
    ON CONFLICT DO NOTHING;
  END IF;

  IF _hist.snapshot ? 'qualidade_profile' AND _hist.snapshot->'qualidade_profile' IS NOT NULL AND _hist.snapshot->'qualidade_profile' <> 'null'::jsonb THEN
    INSERT INTO public.qualidade_user_profiles (tenant_id, user_id, profile_id)
    VALUES (_tenant, _user_id, (_hist.snapshot->'qualidade_profile'->>'profile_id')::uuid)
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.profile_history
     SET restored_at = now(), restored_by = auth.uid()
   WHERE id = _hist.id;

  RETURN jsonb_build_object(
    'restored', _restored_modules,
    'skipped', _skipped_modules,
    'history_id', _hist.id
  );
END;
$$;

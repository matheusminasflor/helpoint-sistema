
-- 1. Tabela de acessos liberados ao colaborador
CREATE TABLE public.employee_access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  employee_name TEXT NOT NULL,
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  access_type TEXT NOT NULL CHECK (access_type IN ('sistema','email','pasta','equipamento','outro')),
  name TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revoke_ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_access_grants TO authenticated;
GRANT ALL ON public.employee_access_grants TO service_role;

ALTER TABLE public.employee_access_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read access grants"
  ON public.employee_access_grants FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "tenant members write access grants"
  ON public.employee_access_grants FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "tenant members update access grants"
  ON public.employee_access_grants FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "tenant supervisors delete access grants"
  ON public.employee_access_grants FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_supervisor_or_higher(auth.uid()));

CREATE INDEX idx_eag_tenant_employee ON public.employee_access_grants(tenant_id, employee_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_eag_ticket ON public.employee_access_grants(ticket_id);

CREATE TRIGGER trg_eag_updated_at
  BEFORE UPDATE ON public.employee_access_grants
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 2. Trigger: criar chamado TI espelho quando RH abrir desligamento
CREATE OR REPLACE FUNCTION public.create_offboarding_ti_ticket()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ti_category_id UUID;
  _grants_text TEXT;
  _employee_name TEXT;
  _mirror_id UUID;
BEGIN
  -- Apenas chamados RH novos com subcategoria Desligamento
  IF NEW.module <> 'rh' OR NEW.subcategory IS NULL OR NEW.subcategory NOT ILIKE 'desligamento%' THEN
    RETURN NEW;
  END IF;

  -- Localiza subcategoria TI "Conta AD" (módulo tickets) ou primeira de Acesso
  SELECT id INTO _ti_category_id
  FROM public.ti_categories
  WHERE tenant_id = NEW.tenant_id AND module = 'tickets' AND name = 'Conta AD'
  LIMIT 1;

  IF _ti_category_id IS NULL THEN
    SELECT c.id INTO _ti_category_id
    FROM public.ti_categories c
    WHERE c.tenant_id = NEW.tenant_id AND c.module = 'tickets'
      AND c.name ILIKE 'Acesso%'
    LIMIT 1;
  END IF;

  -- Nome do colaborador (requester)
  SELECT COALESCE(full_name, email) INTO _employee_name
  FROM public.profiles WHERE id = NEW.requester_id;
  _employee_name := COALESCE(_employee_name, 'colaborador');

  -- Lista de acessos ativos
  SELECT string_agg(
    format('• [%s] %s%s',
      access_type,
      name,
      CASE WHEN details->>'note' IS NOT NULL AND details->>'note' <> ''
           THEN ' — ' || (details->>'note') ELSE '' END
    ),
    E'\n' ORDER BY access_type, name
  )
  INTO _grants_text
  FROM public.employee_access_grants
  WHERE tenant_id = NEW.tenant_id
    AND employee_id = NEW.requester_id
    AND revoked_at IS NULL;

  IF _grants_text IS NULL THEN
    _grants_text := '(Nenhum acesso registrado na admissão — verifique manualmente com o RH.)';
  END IF;

  -- Cria chamado espelho no módulo TI
  INSERT INTO public.tickets (
    tenant_id, module, title, description, category_id,
    priority, status, requester_id, created_by
  ) VALUES (
    NEW.tenant_id,
    'tickets',
    'Revogar acessos — ' || _employee_name,
    format(
      E'Solicitação gerada automaticamente pelo desligamento (chamado RH #%s).\n\nColaborador: %s\n\nAcessos a revogar / equipamentos a recolher:\n%s',
      NEW.ticket_number, _employee_name, _grants_text
    ),
    _ti_category_id,
    'high',
    'open',
    NEW.requester_id,
    NEW.created_by
  )
  RETURNING id INTO _mirror_id;

  -- Marca grants com o ticket de revogação (sem revogar ainda — quem fecha é o TI)
  UPDATE public.employee_access_grants
  SET revoke_ticket_id = _mirror_id, updated_at = now()
  WHERE tenant_id = NEW.tenant_id
    AND employee_id = NEW.requester_id
    AND revoked_at IS NULL;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_offboarding_ti_ticket
  AFTER INSERT ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.create_offboarding_ti_ticket();

-- 3. Garante subcategorias RH "Admissão" e "Desligamento" em tenants existentes
DO $$
DECLARE _tenant RECORD; _parent UUID;
BEGIN
  FOR _tenant IN SELECT id FROM public.tenants LOOP
    SELECT id INTO _parent FROM public.ti_categories
      WHERE tenant_id = _tenant.id AND module = 'rh' AND name = 'Admissão / Desligamento'
      LIMIT 1;
    IF _parent IS NOT NULL THEN
      INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order)
      VALUES (_tenant.id, 'rh', 'Admissão', _parent, 0)
      ON CONFLICT DO NOTHING;
      INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order)
      VALUES (_tenant.id, 'rh', 'Desligamento', _parent, 0)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;


-- Permissões padrão por departamento como JSONB
-- Estrutura: { "<module_key>": { "<action_key>": true } }

CREATE OR REPLACE FUNCTION public.seed_default_access_profiles(
  p_tenant_id uuid,
  p_department text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full jsonb;
  v_operator jsonb;
  v_viewer jsonb;
BEGIN
  IF p_department NOT IN ('ti','marketing','rh','qualidade') THEN
    RAISE EXCEPTION 'Departamento inválido: %', p_department;
  END IF;

  -- Matrizes mínimas (o front aceita módulos faltantes — schema é fonte da verdade).
  -- Aqui marcamos só ações universais; o editor de perfil mostra/edita o restante.
  IF p_department = 'ti' THEN
    v_full := '{
      "tickets": {"view": true, "create": true, "edit": true, "delete": true, "assign": true, "close": true, "internal_notes": true},
      "inventory": {"view": true, "create": true, "edit": true, "delete": true},
      "contracts": {"view": true, "create": true, "edit": true, "delete": true},
      "licenses": {"view": true, "create": true, "edit": true, "delete": true, "view_keys": true},
      "maintenances": {"view": true, "create": true, "edit": true, "delete": true},
      "knowledge": {"view": true, "create": true, "edit": true, "delete": true},
      "reports": {"view": true},
      "settings": {"view": true, "edit": true}
    }'::jsonb;
    v_operator := '{
      "tickets": {"view": true, "create": true, "edit": true, "assign": true, "close": true, "internal_notes": true},
      "inventory": {"view": true, "create": true, "edit": true},
      "contracts": {"view": true},
      "licenses": {"view": true, "create": true, "edit": true},
      "maintenances": {"view": true, "create": true, "edit": true},
      "knowledge": {"view": true, "create": true, "edit": true},
      "reports": {"view": true},
      "settings": {"view": true}
    }'::jsonb;
    v_viewer := '{
      "tickets": {"view": true},
      "inventory": {"view": true},
      "contracts": {"view": true},
      "licenses": {"view": true},
      "maintenances": {"view": true},
      "knowledge": {"view": true},
      "reports": {"view": true}
    }'::jsonb;

  ELSIF p_department = 'marketing' THEN
    v_full := '{
      "tickets": {"view": true, "create": true, "edit": true, "delete": true, "assign": true, "close": true},
      "calendar": {"view": true, "create": true, "edit": true, "delete": true, "publish": true},
      "campaigns": {"view": true, "create": true, "edit": true, "delete": true},
      "suppliers": {"view": true, "create": true, "edit": true, "delete": true},
      "inventory": {"view": true, "create": true, "edit": true, "delete": true},
      "reports": {"view": true},
      "settings": {"view": true, "edit": true}
    }'::jsonb;
    v_operator := '{
      "tickets": {"view": true, "create": true, "edit": true, "close": true},
      "calendar": {"view": true, "create": true, "edit": true},
      "campaigns": {"view": true, "create": true, "edit": true},
      "suppliers": {"view": true, "create": true, "edit": true},
      "inventory": {"view": true, "create": true, "edit": true},
      "reports": {"view": true}
    }'::jsonb;
    v_viewer := '{
      "tickets": {"view": true},
      "calendar": {"view": true},
      "campaigns": {"view": true},
      "suppliers": {"view": true},
      "inventory": {"view": true},
      "reports": {"view": true}
    }'::jsonb;

  ELSIF p_department = 'rh' THEN
    v_full := '{
      "tickets": {"view": true, "create": true, "edit": true, "delete": true, "assign": true, "close": true},
      "employees": {"view": true, "create": true, "edit": true, "delete": true, "view_salary": true},
      "payroll": {"view": true, "create": true, "edit": true, "approve": true},
      "vacations": {"view": true, "create": true, "edit": true, "approve": true},
      "absences": {"view": true, "create": true, "edit": true, "approve": true},
      "benefits": {"view": true, "create": true, "edit": true, "delete": true},
      "documents": {"view": true, "create": true, "edit": true, "delete": true},
      "reports": {"view": true},
      "settings": {"view": true, "edit": true}
    }'::jsonb;
    v_operator := '{
      "tickets": {"view": true, "create": true, "edit": true, "close": true},
      "employees": {"view": true, "create": true, "edit": true},
      "payroll": {"view": true, "create": true, "edit": true},
      "vacations": {"view": true, "edit": true},
      "absences": {"view": true, "create": true, "edit": true},
      "benefits": {"view": true, "create": true, "edit": true},
      "documents": {"view": true, "create": true, "edit": true},
      "reports": {"view": true}
    }'::jsonb;
    v_viewer := '{
      "tickets": {"view": true},
      "employees": {"view": true},
      "vacations": {"view": true},
      "absences": {"view": true},
      "benefits": {"view": true},
      "documents": {"view": true},
      "reports": {"view": true}
    }'::jsonb;

  ELSE -- qualidade
    v_full := '{
      "tickets": {"view": true, "create": true, "edit": true, "delete": true, "assign": true, "close": true},
      "pops": {"view": true, "create": true, "edit": true, "delete": true, "approve": true, "publish": true},
      "audits": {"view": true, "create": true, "edit": true, "delete": true},
      "ncs": {"view": true, "create": true, "edit": true, "delete": true},
      "reports": {"view": true},
      "settings": {"view": true, "edit": true}
    }'::jsonb;
    v_operator := '{
      "tickets": {"view": true, "create": true, "edit": true, "close": true},
      "pops": {"view": true, "create": true, "edit": true},
      "audits": {"view": true, "create": true, "edit": true},
      "ncs": {"view": true, "create": true, "edit": true},
      "reports": {"view": true}
    }'::jsonb;
    v_viewer := '{
      "tickets": {"view": true},
      "pops": {"view": true},
      "audits": {"view": true},
      "ncs": {"view": true},
      "reports": {"view": true}
    }'::jsonb;
  END IF;

  -- Inserir os 3 perfis se não existirem (idempotente por nome)
  INSERT INTO public.access_profiles (tenant_id, department, name, description, is_default, permissions)
  SELECT p_tenant_id, p_department, 'Gestor', 'Acesso completo ao departamento', false, v_full
  WHERE NOT EXISTS (
    SELECT 1 FROM public.access_profiles
    WHERE tenant_id = p_tenant_id AND department = p_department AND name = 'Gestor'
  );

  INSERT INTO public.access_profiles (tenant_id, department, name, description, is_default, permissions)
  SELECT p_tenant_id, p_department, 'Operador', 'Trabalho do dia a dia: ver, criar e editar', true, v_operator
  WHERE NOT EXISTS (
    SELECT 1 FROM public.access_profiles
    WHERE tenant_id = p_tenant_id AND department = p_department AND name = 'Operador'
  );

  INSERT INTO public.access_profiles (tenant_id, department, name, description, is_default, permissions)
  SELECT p_tenant_id, p_department, 'Somente leitura', 'Visualização sem permitir alterações', false, v_viewer
  WHERE NOT EXISTS (
    SELECT 1 FROM public.access_profiles
    WHERE tenant_id = p_tenant_id AND department = p_department AND name = 'Somente leitura'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_default_access_profiles(uuid, text) TO authenticated;

-- Backfill: criar perfis padrão para todos os tenants existentes
DO $$
DECLARE
  t RECORD;
  d text;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    FOREACH d IN ARRAY ARRAY['ti','marketing','rh','qualidade']
    LOOP
      PERFORM public.seed_default_access_profiles(t.id, d);
    END LOOP;
  END LOOP;
END $$;

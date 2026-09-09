-- Leva L3a (Fase 3): receita de módulo — Comercial e Educacional com chamados.
--
-- O que um módulo "com chamados" precisa no banco, e nada mais:
--   1. entrar no CHECK de `tickets.module` (sem isso nenhum chamado é inserido);
--   2. entrar no CHECK de `automation_rules.module` (L2);
--   3. entrar nos CHECKs de `access_profiles` / `user_access_profiles`
--      (`financeiro` estava fora deles desde sempre — entra junto);
--   4. os três perfis padrão (Gestor / Operador / Somente leitura);
--   5. as categorias padrão, para o tenant novo (trigger) e para os que já
--      existem (backfill).
--
-- Tabela própria não há: Comercial ganha CRM/domínio na L6 e Educacional
-- ganha treinamentos na L3b — cada uma com migration e decisão próprias.
--
-- As categorias padrão dos dois módulos novos ficam num trigger SEPARADO
-- (`seed_default_categories_novos_modulos`), em vez de reescrever os 126
-- linhas de `seed_default_ti_categories`: copiar para acrescentar é como se
-- perde a versão que roda.

-- ───────────────────────────────────────────────────────────────────────────
-- 1–3. CHECKs
-- ───────────────────────────────────────────────────────────────────────────
alter table public.tickets drop constraint if exists tickets_module_check;
alter table public.tickets add constraint tickets_module_check
  check (module = any (array['tickets', 'marketing', 'qualidade', 'rh', 'financeiro', 'comercial', 'educacional']));

alter table public.automation_rules drop constraint if exists automation_rules_module_check;
alter table public.automation_rules add constraint automation_rules_module_check
  check (module in ('tickets', 'marketing', 'qualidade', 'rh', 'financeiro', 'comercial', 'educacional'));

alter table public.access_profiles drop constraint if exists access_profiles_department_check;
alter table public.access_profiles add constraint access_profiles_department_check
  check (department = any (array['ti', 'marketing', 'rh', 'qualidade', 'financeiro', 'comercial', 'educacional']));

alter table public.user_access_profiles drop constraint if exists user_access_profiles_department_check;
alter table public.user_access_profiles add constraint user_access_profiles_department_check
  check (department = any (array['ti', 'marketing', 'rh', 'qualidade', 'financeiro', 'comercial', 'educacional']));

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Perfis padrão. A função original só conhece quatro departamentos e
--    lança erro para os demais; esta versão mantém as quatro matrizes como
--    estavam e dá aos outros (financeiro, comercial, educacional) uma matriz
--    genérica de "módulo com chamados" — o editor de perfil mostra o resto.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.seed_default_access_profiles(p_tenant_id uuid, p_department text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full jsonb;
  v_operator jsonb;
  v_viewer jsonb;
begin
  if p_department not in ('ti', 'marketing', 'rh', 'qualidade', 'financeiro', 'comercial', 'educacional') then
    raise exception 'Departamento inválido: %', p_department;
  end if;

  if p_department = 'ti' then
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

  elsif p_department = 'marketing' then
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

  elsif p_department = 'rh' then
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

  elsif p_department = 'qualidade' then
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

  else
    -- Módulo com chamados, sem domínio próprio ainda (financeiro, comercial, educacional).
    v_full := '{
      "tickets": {"view": true, "create": true, "edit": true, "delete": true, "assign": true, "close": true, "internal_notes": true},
      "dashboard": {"view": true},
      "reports": {"view": true},
      "settings": {"view": true, "edit": true}
    }'::jsonb;
    v_operator := '{
      "tickets": {"view": true, "create": true, "edit": true, "assign": true, "close": true, "internal_notes": true},
      "dashboard": {"view": true},
      "reports": {"view": true}
    }'::jsonb;
    v_viewer := '{
      "tickets": {"view": true},
      "dashboard": {"view": true},
      "reports": {"view": true}
    }'::jsonb;
  end if;

  insert into public.access_profiles (tenant_id, department, name, description, is_default, permissions)
  select p_tenant_id, p_department, 'Gestor', 'Acesso completo ao departamento', false, v_full
  where not exists (
    select 1 from public.access_profiles
    where tenant_id = p_tenant_id and department = p_department and name = 'Gestor'
  );

  insert into public.access_profiles (tenant_id, department, name, description, is_default, permissions)
  select p_tenant_id, p_department, 'Operador', 'Trabalho do dia a dia: ver, criar e editar', true, v_operator
  where not exists (
    select 1 from public.access_profiles
    where tenant_id = p_tenant_id and department = p_department and name = 'Operador'
  );

  insert into public.access_profiles (tenant_id, department, name, description, is_default, permissions)
  select p_tenant_id, p_department, 'Somente leitura', 'Visualização sem permitir alterações', false, v_viewer
  where not exists (
    select 1 from public.access_profiles
    where tenant_id = p_tenant_id and department = p_department and name = 'Somente leitura'
  );
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Categorias padrão dos dois módulos novos: para tenant novo (trigger) e
--    para os existentes (backfill). Idempotente: só semeia quem não tem nada.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.seed_categorias_comercial_educacional(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent uuid;
begin
  if not exists (select 1 from public.ti_categories where tenant_id = p_tenant_id and module = 'comercial') then
    insert into public.ti_categories (tenant_id, module, name, sort_order)
      values (p_tenant_id, 'comercial', 'Orçamento e proposta', 1);
    insert into public.ti_categories (tenant_id, module, name, sort_order)
      values (p_tenant_id, 'comercial', 'Pedido', 2) returning id into v_parent;
    insert into public.ti_categories (tenant_id, module, name, parent_id, sort_order) values
      (p_tenant_id, 'comercial', 'Novo pedido', v_parent, 1),
      (p_tenant_id, 'comercial', 'Alteração de pedido', v_parent, 2),
      (p_tenant_id, 'comercial', 'Cancelamento', v_parent, 3);
    insert into public.ti_categories (tenant_id, module, name, sort_order)
      values (p_tenant_id, 'comercial', 'Pós-venda', 3) returning id into v_parent;
    insert into public.ti_categories (tenant_id, module, name, parent_id, sort_order) values
      (p_tenant_id, 'comercial', 'Entrega', v_parent, 1),
      (p_tenant_id, 'comercial', 'Troca ou devolução', v_parent, 2),
      (p_tenant_id, 'comercial', 'Reclamação', v_parent, 3);
    insert into public.ti_categories (tenant_id, module, name, sort_order) values
      (p_tenant_id, 'comercial', 'Cadastro de cliente', 4),
      (p_tenant_id, 'comercial', 'Outros', 99);
  end if;

  if not exists (select 1 from public.ti_categories where tenant_id = p_tenant_id and module = 'educacional') then
    insert into public.ti_categories (tenant_id, module, name, sort_order)
      values (p_tenant_id, 'educacional', 'Treinamento interno', 1) returning id into v_parent;
    insert into public.ti_categories (tenant_id, module, name, parent_id, sort_order) values
      (p_tenant_id, 'educacional', 'Solicitar treinamento', v_parent, 1),
      (p_tenant_id, 'educacional', 'Dúvida sobre conteúdo', v_parent, 2);
    insert into public.ti_categories (tenant_id, module, name, sort_order)
      values (p_tenant_id, 'educacional', 'Treinamento de cliente', 2) returning id into v_parent;
    insert into public.ti_categories (tenant_id, module, name, parent_id, sort_order) values
      (p_tenant_id, 'educacional', 'Agendar turma', v_parent, 1),
      (p_tenant_id, 'educacional', 'Material de apoio', v_parent, 2);
    insert into public.ti_categories (tenant_id, module, name, sort_order) values
      (p_tenant_id, 'educacional', 'Certificados', 3),
      (p_tenant_id, 'educacional', 'Outros', 99);
  end if;
end;
$$;

-- Achado ao provar: tenant novo nascia SEM perfil de acesso de módulo nenhum —
-- `seed_default_access_profiles` só rodou uma vez, no backfill de junho, e
-- nenhum trigger a chamava. Este trigger passa a semear os perfis de todos os
-- módulos com chamados, além das categorias dos dois novos.
create or replace function public.seed_default_categories_novos_modulos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d text;
begin
  perform public.seed_categorias_comercial_educacional(new.id);
  foreach d in array array['ti', 'marketing', 'rh', 'qualidade', 'financeiro', 'comercial', 'educacional'] loop
    perform public.seed_default_access_profiles(new.id, d);
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_seed_categories_novos_modulos on public.tenants;
create trigger trg_seed_categories_novos_modulos
  after insert on public.tenants
  for each row execute function public.seed_default_categories_novos_modulos();

revoke all on function public.seed_categorias_comercial_educacional(uuid) from public, anon, authenticated;

-- Backfill nos tenants que já existem: categorias e perfis dos módulos que
-- ainda não os tinham (financeiro nunca teve perfis — entra junto).
do $$
declare
  t record;
  d text;
begin
  for t in select id from public.tenants loop
    perform public.seed_categorias_comercial_educacional(t.id);
    foreach d in array array['financeiro', 'comercial', 'educacional'] loop
      perform public.seed_default_access_profiles(t.id, d);
    end loop;
  end loop;
end $$;

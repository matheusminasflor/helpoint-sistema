-- Leva L3a (Fase 3): receita de módulo — Comercial e Educacional com chamados
-- (migration 20260909020000).
--
-- O que um módulo com chamados precisa no banco: entrar no CHECK de
-- `tickets.module`, ter perfis de acesso e categorias padrão — no tenant
-- novo (trigger) e nos que já existem (backfill). E o resto da casa
-- (notificação de chamado novo, automação) tem de funcionar para ele sem
-- caso especial.
--
-- Rode com:  npx supabase test db --linked   (precisa do Docker Desktop de pé)

begin;
\ir _helpers.psql

select plan(9);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-modulos-novos', 'Modulos novos') as tenant;

create temporary table u on commit drop as
select tests.create_user('vendedor@pgtap.test',    (select tenant from f)) as vendedor,
       tests.create_user('solicitante@pgtap.test', (select tenant from f)) as solicitante;

select tests.grant_module((select vendedor from u), (select tenant from f), 'comercial');

grant select on f, u to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- Tenant novo nasce com categorias e perfis dos dois módulos
-- ───────────────────────────────────────────────────────────────────────────
select is(
  (select array_agg(name order by sort_order) from public.ti_categories
    where tenant_id = (select tenant from f) and module = 'comercial' and parent_id is null),
  array['Orçamento e proposta', 'Pedido', 'Pós-venda', 'Cadastro de cliente', 'Outros'],
  'tenant novo nasce com as categorias padrao do Comercial'
);

select is(
  (select array_agg(name order by sort_order) from public.ti_categories
    where tenant_id = (select tenant from f) and module = 'educacional' and parent_id is null),
  array['Treinamento interno', 'Treinamento de cliente', 'Certificados', 'Outros'],
  'e com as do Educacional'
);

select is(
  (select array_agg(department || ':' || name order by department, name) from public.access_profiles
    where tenant_id = (select tenant from f) and department in ('comercial', 'educacional', 'financeiro')),
  array['comercial:Gestor', 'comercial:Operador', 'comercial:Somente leitura',
        'educacional:Gestor', 'educacional:Operador', 'educacional:Somente leitura',
        'financeiro:Gestor', 'financeiro:Operador', 'financeiro:Somente leitura'],
  'tenant novo nasce com os perfis padrao de Comercial, Educacional e Financeiro (antes nascia sem perfil nenhum)'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Chamado entra nos dois módulos; um módulo inventado continua barrado
-- ───────────────────────────────────────────────────────────────────────────
select lives_ok(
  $$ insert into public.tickets (tenant_id, module, title, description, priority, status, created_by, requester_id)
     select tenant, 'comercial', 'Orcamento para cliente X', 'x', 'medium', 'open', solicitante, solicitante from f, u $$,
  'chamado com module = comercial entra'
);

select lives_ok(
  $$ insert into public.tickets (tenant_id, module, title, description, priority, status, created_by, requester_id)
     select tenant, 'educacional', 'Treinamento de integracao', 'x', 'medium', 'open', solicitante, solicitante from f, u $$,
  'chamado com module = educacional entra'
);

select throws_ok(
  $$ insert into public.tickets (tenant_id, module, title, description, priority, status, created_by, requester_id)
     select tenant, 'producao', 'x', 'x', 'medium', 'open', solicitante, solicitante from f, u $$,
  '23514',
  null,
  'modulo sem receita aplicada continua barrado pelo CHECK'
);

-- ───────────────────────────────────────────────────────────────────────────
-- O resto da casa funciona sem caso especial: aviso de chamado novo vai
-- para quem tem o módulo; regra de automação aceita o módulo
-- ───────────────────────────────────────────────────────────────────────────
select is(
  (select array_agg(distinct n.user_id) from public.notifications n
    join public.tickets t on t.id = n.reference_id
   where t.module = 'comercial' and t.tenant_id = (select tenant from f) and n.type = 'ticket_created'),
  (select array[vendedor] from u),
  'chamado novo do Comercial avisa quem tem o modulo comercial'
);

select lives_ok(
  $$ insert into public.automation_workflows (tenant_id, module, name, trigger, steps)
     select tenant, 'educacional', 'Avisar equipe', '{"kind":"record_created","entity":"ticket","next":["s1"]}'::jsonb,
            '[{"id":"s1","kind":"notify","config":{"team_module":"educacional"},"next":[]}]'::jsonb from f $$,
  'fluxo de automacao aceita o modulo educacional'
);

-- Backfill é idempotente: rodar de novo não duplica nada.
select public.seed_categorias_comercial_educacional((select tenant from f));
select is(
  (select count(*)::int from public.ti_categories
    where tenant_id = (select tenant from f) and module = 'comercial' and parent_id is null),
  5,
  'semear de novo nao duplica categorias'
);

select * from finish();
rollback;

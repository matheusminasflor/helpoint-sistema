-- CRM-2b: nota fiscal pelo Bling (migrations 20260917010000 e 20260917020000). Prova:
--   - o token do Bling não é lido por ninguém logado (GRANT revogado, não só RLS)
--   - a tela vê empresa, validade e escolhas — da própria empresa; quem não tem o Comercial e a empresa B veem nada
--   - o fluxo aceita o passo "pedido no Bling" só com gatilho de pedido
--   - pedido pago deixa o run esperando o worker com pending_kind = 'bling_order'
begin;
\ir _helpers.psql

select plan(9);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-bling-a', 'Bling A') as a,
       tests.create_tenant('pgtap-bling-b', 'Bling B') as b;

create temporary table u on commit drop as
select tests.create_user('gerente@bling.test',   (select a from f)) as gerente,
       tests.create_user('rh@bling.test',        (select a from f)) as rh,
       tests.create_user('vendedorb@bling.test', (select b from f)) as vendedor_b;
select tests.grant_role((select gerente from u), 'manager');
select tests.grant_module((select gerente from u),    (select a from f), 'comercial');
select tests.grant_module((select rh from u),         (select a from f), 'rh');
select tests.grant_module((select vendedor_b from u), (select b from f), 'comercial');
grant select on f, u to authenticated;

-- Conexão gravada pelo servidor (a edge function bling-oauth faz isso com service_role).
insert into public.tenant_bling_connections (tenant_id, access_token, refresh_token, expires_at, company_name, settings)
values ((select a from f), 'TOKEN-SECRETO', 'REFRESH-SECRETO', now() + interval '6 hours', 'Loja A',
        '{"forma_pagamento_id": 123, "gerar_nfe": true, "enviar_nfe": false}'::jsonb);

-- ───────────────────────────────────────────────────────────────────────────
-- O token nunca sai
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('gerente@bling.test');
select throws_ok(
  $$ select access_token from public.tenant_bling_connections $$,
  '42501', null,
  'usuario logado nao le a tabela de tokens do Bling'
);
select is(
  (select company_name || '|' || (settings->>'forma_pagamento_id') || '|' || (settings->>'gerar_nfe') from public.crm_bling_status()),
  'Loja A|123|true',
  'a tela ve empresa e escolhas, sem token'
);
select tests.clear_authentication();

select tests.authenticate_as('rh@bling.test');
select is((select count(*)::int from public.crm_bling_status()), 0, 'quem nao tem o Comercial nao ve a conexao');
select tests.clear_authentication();

select tests.authenticate_as('vendedorb@bling.test');
select is((select count(*)::int from public.crm_bling_status()), 0, 'a empresa B nao ve a conexao da A');
select tests.clear_authentication();

set local role anon;
select throws_ok($$ select * from public.crm_bling_status() $$, '42501', null, 'sem login nem a funcao da tela e chamada');
reset role;

-- ───────────────────────────────────────────────────────────────────────────
-- O passo "pedido no Bling" no motor de fluxos
-- ───────────────────────────────────────────────────────────────────────────
create temporary table s on commit drop as
select gen_random_uuid() as contact_id, gen_random_uuid() as order_id, gen_random_uuid() as wf;
grant select on s to authenticated;

insert into public.crm_contacts (id, tenant_id, name, document) select contact_id, (select a from f), 'Cliente Bling', '12345678000199' from s;

-- Fluxo válido: pedido pago → pedido no Bling → aviso.
select lives_ok(
  $$ insert into public.automation_workflows (id, tenant_id, module, name, status, trigger, steps, created_by)
     select wf, (select a from f), 'comercial', 'Pago → Bling', 'active',
       '{"kind":"record_updated","entity":"crm_order","fields":["status"],"filter":{"op":"and","rules":[{"path":"trigger.after.status","cmp":"eq","value":"paid"}]},"next":["s1"]}'::jsonb,
       '[{"id":"s1","kind":"bling_order","config":{"gerar_nfe":true},"next":["s2"]},
         {"id":"s2","kind":"notify","config":{"target":"created_by","message":"No Bling: #{{trigger.after.number}}"},"next":[]}]'::jsonb,
       (select gerente from u) from s $$,
  'o fluxo aceita o passo bling_order com gatilho de pedido'
);

-- O passo exige um pedido: com gatilho de negócio o motor recusa na hora de rodar (run falha com o motivo).
create temporary table s2 on commit drop as select gen_random_uuid() as wf_deal, gen_random_uuid() as deal_id,
  (select id from public.crm_pipeline_stages where tenant_id = (select a from f) and name = 'Novo' limit 1) as novo;
insert into public.automation_workflows (id, tenant_id, module, name, status, trigger, steps, created_by)
select wf_deal, (select a from f), 'comercial', 'Negocio → Bling (errado)', 'active',
  '{"kind":"record_created","entity":"crm_deal","next":["s1"]}'::jsonb,
  '[{"id":"s1","kind":"bling_order","config":{},"next":[]}]'::jsonb,
  (select gerente from u) from s2;
insert into public.crm_deals (id, tenant_id, contact_id, stage_id, title, owner_id)
select deal_id, (select a from f), (select contact_id from s), novo, 'Venda errada', (select gerente from u) from s2;
select ok(
  (select r.status = 'failed' and r.error like '%exige um pedido%' from public.automation_runs r where r.workflow_id = (select wf_deal from s2)),
  'bling_order com gatilho de negocio falha dizendo que exige um pedido'
);

insert into public.crm_orders (id, tenant_id, contact_id, status, created_by)
select order_id, (select a from f), contact_id, 'draft', (select gerente from u) from s;
insert into public.crm_order_items (tenant_id, order_id, description, quantity, unit_price, position)
select (select a from f), order_id, 'Creme 1 kg', 2, 85, 0 from s;

update public.crm_orders set status = 'paid' where id = (select order_id from s);
select is(
  (select r.status || '|' || r.pending_kind || '|' || r.pending_step_id from public.automation_runs r where r.workflow_id = (select wf from s)),
  'waiting|bling_order|s1',
  'pedido pago deixa o run esperando o worker no passo do Bling'
);

-- O claim entrega o passo ao worker com o pedido como registro.
select is(
  (select kind || '|' || subject_type || '|' || (config->>'gerar_nfe') from public.automation_claim_external(10) where run_id = (select r.id from public.automation_runs r where r.workflow_id = (select wf from s))),
  'bling_order|crm_order|true',
  'o worker recebe o passo com o pedido e as escolhas'
);

select * from finish();
rollback;

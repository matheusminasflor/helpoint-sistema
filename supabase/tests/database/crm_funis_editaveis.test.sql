-- Leva E1 (ADR-007): funil editável (migration 20260911010000).
--
-- Prova: empresa nova nasce com um funil padrão e as seis etapas; um ganho e
-- um perdido POR FUNIL; apagar etapa move os negócios antes e se recusa sem
-- destino; mover entre funis fica na linha do tempo; pedido pago leva ao
-- "ganho" do funil certo; isolamento entre empresas; etapa não aponta para
-- funil de outra empresa.
--
-- Rode com:  npx supabase test db --linked   ou   scripts/pgtap-local/run.sh

begin;
\ir _helpers.psql

select plan(13);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-funil-a', 'Funil A') as a,
       tests.create_tenant('pgtap-funil-b', 'Funil B') as b;

create temporary table u on commit drop as
select tests.create_user('vendedor@funil.test',  (select a from f)) as vendedor,
       tests.create_user('gerente@funil.test',   (select a from f)) as gerente,
       tests.create_user('vendedorb@funil.test', (select b from f)) as vendedor_b;

select tests.grant_module((select vendedor from u),   (select a from f), 'comercial');
select tests.grant_module((select gerente from u),    (select a from f), 'comercial');
select tests.grant_module((select vendedor_b from u), (select b from f), 'comercial');
select tests.grant_role((select gerente from u), 'manager');

create temporary table s on commit drop as
select gen_random_uuid() as contact_id, gen_random_uuid() as deal_id, gen_random_uuid() as pipeline_b2b,
       gen_random_uuid() as stage_b2b_novo, gen_random_uuid() as stage_b2b_won, gen_random_uuid() as order_id;

grant select on f, u, s to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- Semente: um funil padrão com as seis etapas
-- ───────────────────────────────────────────────────────────────────────────
select is(
  (select count(*)::int || ':' || bool_and(is_default)::text from public.crm_pipelines where tenant_id = (select a from f)),
  '1:true',
  'empresa nova nasce com um funil, o padrao'
);

select is(
  (select array_agg(s.name || ':' || s.kind || ':' || s.color order by s.position)
     from public.crm_pipeline_stages s join public.crm_pipelines p on p.id = s.pipeline_id
    where p.tenant_id = (select a from f) and p.is_default),
  array['Novo:open:blue', 'Em contato:open:teal', 'Orçamento enviado:open:violet', 'Negociação:open:amber', 'Ganho:won:green', 'Perdido:lost:red'],
  'as seis etapas pertencem ao funil padrao e tem cor'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Um ganho por funil — mas cada funil tem o seu
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('vendedor@funil.test');

select throws_ok(
  $$ insert into public.crm_pipeline_stages (tenant_id, pipeline_id, name, position, kind)
     select a, (select id from public.crm_pipelines where tenant_id = a and is_default), 'Outro ganho', 9, 'won' from f $$,
  '23505', null,
  'segundo "ganho" no mesmo funil e recusado'
);

insert into public.crm_pipelines (id, tenant_id, name, position)
select pipeline_b2b, (select a from f), 'Funil B2B', 2 from s;

insert into public.crm_pipeline_stages (id, tenant_id, pipeline_id, name, position, kind, color)
select stage_b2b_novo, (select a from f), pipeline_b2b, 'Prospecção', 1, 'open', 'blue' from s
union all
select stage_b2b_won, (select a from f), pipeline_b2b, 'Fechado', 2, 'won', 'green' from s;

select is(
  (select count(*)::int from public.crm_pipeline_stages where tenant_id = (select a from f) and kind = 'won'),
  2,
  'cada funil tem o seu "ganho"'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Apagar etapa: recusa sem destino; com destino move e some
-- ───────────────────────────────────────────────────────────────────────────
insert into public.crm_contacts (id, tenant_id, name) select contact_id, (select a from f), 'Cliente' from s;
insert into public.crm_deals (id, tenant_id, contact_id, stage_id, title, value)
select deal_id, (select a from f), contact_id,
       (select id from public.crm_pipeline_stages where tenant_id = (select a from f) and name = 'Em contato'),
       'Negócio', 100
  from s;

select tests.clear_authentication();
select tests.authenticate_as('gerente@funil.test');

select throws_ok(
  $$ select public.crm_delete_stage((select id from public.crm_pipeline_stages where tenant_id = (select a from f) and name = 'Em contato')) $$,
  'P0001', null,
  'apagar etapa com negocio e sem destino e recusado'
);

select throws_ok(
  $$ select public.crm_delete_stage((select id from public.crm_pipeline_stages where tenant_id = (select a from f) and name = 'Ganho')) $$,
  'P0001', null,
  'apagar a etapa Ganho e recusado'
);

select lives_ok(
  $$ select public.crm_delete_stage(
       (select id from public.crm_pipeline_stages where tenant_id = (select a from f) and name = 'Em contato'),
       (select id from public.crm_pipeline_stages where tenant_id = (select a from f) and name = 'Novo')) $$,
  'com destino, apaga'
);

select is(
  (select s.name || '|' || (select count(*) from public.crm_deal_activities where deal_id = (select deal_id from s) and kind = 'stage_change')::text
     from public.crm_deals d join public.crm_pipeline_stages s on s.id = d.stage_id where d.id = (select deal_id from s)),
  'Novo|1',
  'o negocio foi para o destino e a mudanca ficou na linha do tempo'
);

select is(
  (select count(*)::int from public.crm_pipeline_stages where tenant_id = (select a from f) and name = 'Em contato'),
  0,
  'a etapa sumiu'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Mover para outro funil fica dito na linha do tempo; pedido pago vai ao
-- "ganho" do funil onde o negócio está
-- ───────────────────────────────────────────────────────────────────────────
update public.crm_deals set stage_id = (select stage_b2b_novo from s) where id = (select deal_id from s);

select alike(
  (select content from public.crm_deal_activities where deal_id = (select deal_id from s) and kind = 'stage_change' order by id desc limit 1),
  '%funil "Funil B2B"%',
  'mudar de funil fica registrado'
);

insert into public.crm_orders (id, tenant_id, deal_id, contact_id, status)
select order_id, (select a from f), deal_id, contact_id, 'sent' from s;

select tests.clear_authentication();
update public.crm_orders set status = 'paid' where id = (select order_id from s);

select is(
  (select stage_id from public.crm_deals where id = (select deal_id from s)),
  (select stage_b2b_won from s),
  'pedido pago leva ao "ganho" do funil B2B, nao ao do funil padrao'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Isolamento
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('vendedorb@funil.test');
select is(
  (select count(*)::int from public.crm_pipelines where name = 'Funil B2B'),
  0,
  'empresa B nao ve o funil da empresa A'
);
select tests.clear_authentication();

select throws_ok(
  $$ insert into public.crm_pipeline_stages (tenant_id, pipeline_id, name, position)
     select b, (select pipeline_b2b from s), 'Invasora', 1 from f $$,
  'P0001', null,
  'etapa nao aponta para funil de outra empresa, nem escrita pelo sistema'
);

select * from finish();
rollback;

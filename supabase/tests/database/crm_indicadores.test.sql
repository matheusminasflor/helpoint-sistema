-- Leva E4 (ADR-007): indicadores de venda (migration 20260911040000).
--
-- Prova: foto do funil (só abertos), ganhos e perdidos só do período, ciclo
-- médio, criados por origem, por vendedor, filtro por funil e isolamento.
-- Datas gravadas à mão (won_at/created_at explícitos), porque dentro da
-- transação now() é constante.
--
-- Rode com:  npx supabase test db --linked   ou   scripts/pgtap-local/run.sh

begin;
\ir _helpers.psql

select plan(9);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-ind-a', 'Ind A') as a,
       tests.create_tenant('pgtap-ind-b', 'Ind B') as b;

create temporary table u on commit drop as
select tests.create_user('vendedor@ind.test',  (select a from f)) as vendedor,
       tests.create_user('vendedorb@ind.test', (select b from f)) as vendedor_b;

select tests.grant_module((select vendedor from u),   (select a from f), 'comercial');
select tests.grant_module((select vendedor_b from u), (select b from f), 'comercial');

create temporary table s on commit drop as
select gen_random_uuid() as contact_id,
       (select id from public.crm_pipeline_stages where tenant_id = (select a from f) and name = 'Novo') as novo,
       (select id from public.crm_pipeline_stages where tenant_id = (select a from f) and name = 'Negociação') as negociacao,
       (select id from public.crm_pipeline_stages where tenant_id = (select a from f) and kind = 'won') as ganho,
       (select id from public.crm_pipeline_stages where tenant_id = (select a from f) and kind = 'lost') as perdido,
       (select id from public.crm_pipelines where tenant_id = (select a from f) and is_default) as funil;
grant select on f, u, s to authenticated;

insert into public.crm_contacts (id, tenant_id, name) select contact_id, (select a from f), 'Cliente' from s;

-- Dois abertos, um ganho há 2 dias (criado há 12 → ciclo 10), um ganho há 60 dias (fora), um perdido ontem.
insert into public.crm_deals (tenant_id, contact_id, stage_id, title, value, source, owner_id, created_at)
select (select a from f), contact_id, novo, 'Aberto 1', 100, 'site', (select vendedor from u), now() - interval '3 days' from s;
insert into public.crm_deals (tenant_id, contact_id, stage_id, title, value, source, owner_id, created_at)
select (select a from f), contact_id, negociacao, 'Aberto 2', 200, 'manual', null, now() - interval '5 days' from s;
insert into public.crm_deals (tenant_id, contact_id, stage_id, title, value, source, owner_id, created_at, won_at)
select (select a from f), contact_id, ganho, 'Ganho novo', 500, 'site', (select vendedor from u), now() - interval '12 days', now() - interval '2 days' from s;
insert into public.crm_deals (tenant_id, contact_id, stage_id, title, value, source, owner_id, created_at, won_at)
select (select a from f), contact_id, ganho, 'Ganho velho', 900, 'site', (select vendedor from u), now() - interval '90 days', now() - interval '60 days' from s;
insert into public.crm_deals (tenant_id, contact_id, stage_id, title, value, source, owner_id, created_at, lost_at)
select (select a from f), contact_id, perdido, 'Perdido', 300, 'manual', null, now() - interval '4 days', now() - interval '1 day' from s;

select tests.authenticate_as('vendedor@ind.test');

create temporary table m on commit drop as
select public.crm_sales_metrics((now() - interval '30 days')::date, now()::date) as r;
grant select on m to authenticated;

select is(
  (select (select sum((x->>'count')::int) from jsonb_array_elements(r->'pipeline') x)::text || '/' || (select sum((x->>'value')::numeric)::int from jsonb_array_elements(r->'pipeline') x)::text from m),
  '2/300',
  'foto do funil: so os abertos, com soma'
);
select is(
  (select (r->'won'->>'count') || '/' || (r->'won'->>'value')::numeric::int from m),
  '1/500',
  'ganho no periodo: o de 2 dias entra, o de 60 nao'
);
select is(
  (select r->'lost'->>'count' from m),
  '1',
  'perdido no periodo'
);
select is(
  (select r->>'cycle_days' from m),
  '10.0',
  'ciclo medio = won_at - created_at dos ganhos do periodo'
);
select is(
  (select r->>'created' from m),
  '4',
  'criados no periodo: os quatro de ate 30 dias'
);
select is(
  (select array_agg((x->>'source') || ':' || (x->>'count') order by x->>'source') from m, jsonb_array_elements(r->'by_source') x),
  array['manual:2', 'site:2'],
  'criados por origem'
);
select is(
  (select (x->>'won_value')::numeric::int || '/' || (x->>'open_count') from m, jsonb_array_elements(r->'by_owner') x where x->>'owner_id' = (select vendedor from u)::text),
  '500/1',
  'por vendedor: ganho no periodo e abertos de agora'
);
select is(
  (select r->>'created' from (select public.crm_sales_metrics((now() - interval '30 days')::date, now()::date, gen_random_uuid()) as r) q),
  '0',
  'filtro por funil inexistente zera'
);
select tests.clear_authentication();

select tests.authenticate_as('vendedorb@ind.test');
select is(
  (select (r->'won'->>'count') || '/' || (r->>'created') from (select public.crm_sales_metrics((now() - interval '30 days')::date, now()::date) as r) q),
  '0/0',
  'empresa B nao ve os numeros da empresa A'
);
select tests.clear_authentication();

select * from finish();
rollback;

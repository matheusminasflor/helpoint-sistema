-- AS METAS POR SETOR (migration 20270212220000; dono, 2026-11-03): o Marketing tem metas próprias de chamado.
--   1  quem configura os Chamados do Marketing grava a meta do Marketing
--   2  e não grava a meta da TI
--   3  quem configura a TI não grava a meta do Marketing
--   4  o Marketing só tem as metas de chamado (FSENSE é da TI)
begin;
\ir _helpers.psql

select plan(4);

create temporary table f on commit drop as select tests.create_tenant('pgtap-metas-setor', 'Metas por setor', false) as a;
create temporary table u on commit drop as
select tests.create_user('mkt@metassetor.test', (select a from f)) as mkt,
       tests.create_user('ti@metassetor.test',  (select a from f)) as ti;
select tests.grant_module((select mkt from u), (select a from f), 'marketing');
select tests.grant_module((select ti from u), (select a from f), 'ti');
select tests.grant_profile((select mkt from u), (select a from f), 'marketing', 'Gestor');
select tests.grant_profile((select ti from u), (select a from f), 'ti', 'Gestor');
-- A aba Chamados da configuração de cada setor, alterável pelo Gestor de cada um (como a Minasflor está).
update public.access_profiles set permissions = permissions || '{"config_chamados": {"view": true, "edit": true}}'::jsonb
 where tenant_id = (select a from f) and name = 'Gestor' and department in ('marketing', 'ti');

select tests.authenticate_as('mkt@metassetor.test');
select is(public.metas_salvar('marketing', 'sla_cumprido', '[{"a_partir_de": "2026-11-01", "meta": 80}]'::jsonb), 1,
  'quem configura os Chamados do Marketing grava a meta do Marketing');
select throws_ok($$ select public.metas_salvar('ti', 'sla_cumprido', '[{"a_partir_de": "2026-11-01", "meta": 50}]'::jsonb) $$,
  '42501', null, 'e nao grava a meta da TI');
select throws_ok($$ select public.metas_salvar('marketing', 'fsense_trabalho', '[{"a_partir_de": "2026-11-01", "meta": 50}]'::jsonb) $$,
  '23514', null, 'o Marketing so tem as metas de chamado');
select tests.clear_authentication();

select tests.authenticate_as('ti@metassetor.test');
select throws_ok($$ select public.metas_salvar('marketing', 'sla_cumprido', '[{"a_partir_de": "2026-11-01", "meta": 50}]'::jsonb) $$,
  '42501', null, 'quem configura a TI nao grava a meta do Marketing');
select tests.clear_authentication();

select * from finish();
rollback;

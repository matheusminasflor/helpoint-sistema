-- MAIS DO INSTAGRAM NOS INDICADORES (migration 20270212290000).
--   1  alcance e visualizações da semana entram na linha da conta, sem valor negativo
--   2  o público do mês é sempre o dia 1
--   3  quem vê os Indicadores lê o público; ninguém da tela grava (só o coletor)
begin;
\ir _helpers.psql

select plan(6);

create temporary table f on commit drop as select tests.create_tenant('pgtap-mkt-ig', 'MKT IG', false) as a;
create temporary table u on commit drop as
select tests.create_user('lanca@mktig.test', (select a from f)) as lanca;
select tests.grant_module((select lanca from u), (select a from f), 'marketing');
select tests.grant_profile((select lanca from u), (select a from f), 'marketing', 'Gestor');
update public.access_profiles set permissions = permissions || '{"reports": {"view": true, "lancar": true}}'::jsonb
 where tenant_id = (select a from f) and department = 'marketing' and name = 'Gestor';

insert into public.mkt_publico_ig (tenant_id, conta, mes, genero) values ((select a from f), '@minasflor', date '2026-11-01', '{"F": 94.7}');
select throws_ok($$ insert into public.mkt_publico_ig (tenant_id, conta, mes) values ((select a from f), '@mf.pro', date '2026-11-04') $$,
  '23514', null, 'o publico do mes e sempre o dia 1');

select tests.authenticate_as('lanca@mktig.test');
with x as (insert into public.mkt_redes_semana (semana, conta, alcance, visualizacoes, publicacoes)
  values (date '2026-11-01', '@minasflor', 19200, 43900, '[{"tipo": "FEED", "alcance": 415}]') returning id)
select is((select count(*)::int from x), 1, 'alcance, visualizacoes e publicacoes entram na linha da conta');
select throws_ok($$ update public.mkt_redes_semana set alcance = -1 where conta = '@minasflor' $$,
  '23514', null, 'alcance negativo nao entra');
select is((select count(*)::int from public.mkt_publico_ig), 1, 'quem ve os Indicadores le o publico');
select throws_ok($$ insert into public.mkt_publico_ig (tenant_id, conta, mes) values ((select public.get_user_tenant_id()), '@mf.pro', date '2026-11-01') $$,
  '42501', null, 'a tela nao grava o publico');
select throws_ok($$ update public.mkt_publico_ig set genero = '{}' $$, '42501', null, 'nem altera');
select tests.clear_authentication();

select * from finish();
rollback;

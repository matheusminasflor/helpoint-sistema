-- REDES E TRÁFEGO LANÇADOS À MÃO (migration 20270212250000).
--   1  quem tem "Lançar redes e tráfego" lança a semana de uma conta (com returning)
--   2  a semana é o domingo: outro dia não entra
--   3  o tráfego da conta entra na linha dela, sem valor negativo (20270212260000)
--   4  quem só vê os Indicadores lê e não lança
begin;
\ir _helpers.psql

select plan(6);

create temporary table f on commit drop as select tests.create_tenant('pgtap-mkt-redes', 'MKT Redes', false) as a;
create temporary table u on commit drop as
select tests.create_user('lanca@mktredes.test', (select a from f)) as lanca,
       tests.create_user('ve@mktredes.test',    (select a from f)) as ve;
select tests.grant_module(x, (select a from f), 'marketing') from (select lanca x from u union all select ve from u) s;
select tests.grant_profile((select lanca from u), (select a from f), 'marketing', 'Gestor');
select tests.grant_profile((select ve from u), (select a from f), 'marketing', 'Operador');
update public.access_profiles set permissions = permissions || '{"reports": {"view": true, "lancar": true}}'::jsonb
 where tenant_id = (select a from f) and department = 'marketing' and name = 'Gestor';
update public.access_profiles set permissions = permissions || '{"reports": {"view": true, "lancar": false}}'::jsonb
 where tenant_id = (select a from f) and department = 'marketing' and name = 'Operador';

select tests.authenticate_as('lanca@mktredes.test');
select lives_ok($$ insert into public.mkt_redes_semana (semana, conta, posts, reels, total_seguidores)
  values (date '2026-11-01', '@minasflor', 3, 2, 10000) returning id $$, 'quem lanca lanca a semana de uma conta');
select throws_ok($$ insert into public.mkt_trafego_semana (semana, investimento) values (date '2026-11-02', 100) $$,
  '23514', null, 'a semana e o domingo');
-- O tráfego da conta (20270212260000) vai na mesma linha da conta.
with x as (update public.mkt_redes_semana set investimento = 201.08, alcance_pago = 17374, campanhas_ativas = 1
             where conta = '@minasflor' returning id)
select is((select count(*)::int from x), 1, 'o trafego da conta entra na linha da conta');
select throws_ok($$ update public.mkt_redes_semana set investimento = -1 where conta = '@minasflor' $$,
  '23514', null, 'investimento negativo nao entra');
select tests.clear_authentication();

select tests.authenticate_as('ve@mktredes.test');
select is((select count(*)::int from public.mkt_redes_semana), 1, 'quem so ve os Indicadores le');
select throws_ok($$ insert into public.mkt_trafego_semana (semana, investimento) values (date '2026-11-01', 100) $$,
  '42501', null, 'e nao lanca');
select tests.clear_authentication();

select * from finish();
rollback;

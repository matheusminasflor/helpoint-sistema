-- COMPRAS TAMBÉM RECEBE O AVISO DE AUSÊNCIA (migration 20261205010000; revisão de permissões
-- aprovada pelo dono em 2026-10-04).
--
--   comprador  Compras, Operador — entra de férias (10 dias, registradas pelo RH)
--   chefe      Compras, perfil Gestor (a semente da empresa nova traz a caixinha marcada)
--   velho      Compras, perfil Gestor com a caixinha DESMARCADA no acesso dele
--   rh         RH, Gestor — registra as férias já aprovadas
--
--   1     a semente da empresa nova: o Gestor de Compras nasce com a caixinha;
--   2     o RH registra as férias do comprador: o Gestor de Compras é avisado;
--   3     quem tem o perfil Gestor com a caixinha desmarcada não é avisado (vale a caixinha);
--   4     com o aviso no gestor de Compras, ninguém da administração é chamado no lugar;
--   5     o gestor de Compras abre as demandas do comprador para repassar;
--   6     quem desmarcou a caixinha não abre.
begin;
\ir _helpers.psql

select plan(6);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-compras-ausencia', 'Compras Ausencia', false) as a;
create temporary table u on commit drop as
select tests.create_user('comprador@compras-aus.test', (select a from f)) as comprador,
       tests.create_user('chefe@compras-aus.test',     (select a from f)) as chefe,
       tests.create_user('velho@compras-aus.test',     (select a from f)) as velho,
       tests.create_user('rh@compras-aus.test',        (select a from f)) as rh,
       tests.create_user('dono@compras-aus.test',      (select a from f)) as dono;
select tests.grant_role((select dono from u), 'owner');
select tests.grant_module(x, (select a from f), 'compras')
  from (select comprador x from u union all select chefe from u union all select velho from u) s;
select tests.grant_profile((select comprador from u), (select a from f), 'compras', 'Operador');
select tests.grant_profile((select chefe from u), (select a from f), 'compras', 'Gestor');
select tests.grant_profile((select velho from u), (select a from f), 'compras', 'Gestor');
update public.user_access_profiles set overrides = '{"tickets":{"repassar_ausencias":false}}'::jsonb
 where user_id = (select velho from u) and department = 'compras';
select tests.grant_module((select rh from u), (select a from f), 'rh');
select tests.grant_profile((select rh from u), (select a from f), 'rh', 'Gestor');

create temporary table hoje on commit drop as select (now() at time zone 'America/Sao_Paulo')::date as d;
create temporary table ferias (id uuid) on commit drop;
grant select on f, u, hoje to authenticated;
grant select, insert on ferias to authenticated;

-- ═══ 1. A semente. ═══
select is(
  (select (permissions -> 'tickets' ->> 'repassar_ausencias')::boolean from public.access_profiles
    where tenant_id = (select a from f) and department = 'compras' and name = 'Gestor'),
  true, 'o Gestor de Compras da empresa nova nasce com a caixinha de ausencias');

-- ═══ 2-4. O RH registra as férias do comprador. ═══
select tests.authenticate_as('rh@compras-aus.test');
with t as (
  insert into public.rh_vacation_requests (tenant_id, user_id, start_date, end_date, days_requested, type, status)
  select a, (select comprador from u), (select d from hoje), (select d from hoje) + 9, 10, 'ferias', 'aprovada' from f
  returning id
) insert into ferias select id from t;
select tests.clear_authentication();

select is((select count(*)::int from public.notifications where user_id = (select chefe from u) and type = 'ferias_repassar'), 1,
  'o Gestor de Compras recebe o aviso para repassar as demandas do comprador');
select is((select count(*)::int from public.notifications where user_id = (select velho from u) and type = 'ferias_repassar'), 0,
  'perfil Gestor com a caixinha desmarcada nao recebe');
select is((select count(*)::int from public.notifications where user_id = (select dono from u) and type = 'ferias_repassar'), 0,
  'com gestor de Compras com a caixinha, o aviso nao cai no dono');

-- ═══ 5-6. Quem abre o repasse. ═══
select tests.authenticate_as('chefe@compras-aus.test');
select lives_ok($$ select public.ferias_demandas((select id from ferias)) $$,
  'o gestor de Compras abre as demandas do comprador');
select tests.clear_authentication();

select tests.authenticate_as('velho@compras-aus.test');
select throws_ok($$ select public.ferias_demandas((select id from ferias)) $$, '42501', null,
  'sem a caixinha, nao abre o repasse');
select tests.clear_authentication();

select * from finish();
rollback;

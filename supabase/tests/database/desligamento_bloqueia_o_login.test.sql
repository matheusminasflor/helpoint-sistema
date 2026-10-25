-- DESLIGAMENTO COMO ASSISTENTE (migration 20270131030000; decisão do dono de 2026-10-25: o login para no DIA).
begin;
\ir _helpers.psql

select plan(11);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-deslig', 'Deslig', false) as a;
create temporary table u on commit drop as
select tests.create_user('mel@deslig.test', (select a from f)) as mel,
       tests.create_user('gi@deslig.test', (select a from f)) as gi,
       tests.create_user('rh@deslig.test', (select a from f)) as rh,
       tests.create_user('ana@deslig.test', (select a from f)) as ana;
select tests.grant_module((select mel from u), (select a from f), 'marketing');
select tests.grant_module((select rh from u), (select a from f), 'rh');
select tests.grant_profile((select rh from u), (select a from f), 'rh', 'Gestor');
select tests.grant_module((select ana from u), (select a from f), 'marketing');

create temporary table e on commit drop as
with x as (
  insert into public.rh_employee_profiles (tenant_id, full_name, status, user_id)
  select a, 'Mel', 'ativo', (select mel from u) from f
  union all
  select a, 'Gi', 'ativo', (select gi from u) from f
  returning id, user_id
) select * from x;
create temporary table hoje on commit drop as select (now() at time zone 'America/Sao_Paulo')::date as d;
create temporary table r (j jsonb) on commit drop;
grant select on f, u, e, hoje to authenticated;
grant select, insert on r to authenticated;

-- ═══ Hoje: chamado na TI e o login para na hora ═══
select tests.authenticate_as('rh@deslig.test');
insert into r select public.rh_desligar((select id from e where user_id = (select mel from u)), (select d from hoje), 'Pediu demissão');
select tests.clear_authentication();
select is((select (j ->> 'bloqueado_agora')::boolean from r), true, 'desligamento com a data de hoje bloqueia na hora');
select is((select count(*)::int from public.tickets where colaborador_id = (select mel from u) and module = 'tickets'), 1,
  'a TI recebe o chamado de equipamentos e acessos');
select is((select is_active from public.profiles where id = (select mel from u)), false, 'a pessoa fica inativa');
select is((select banned_until from auth.users where id = (select mel from u)), 'infinity'::timestamptz, 'e o login é barrado');
select is((select termination_reason from public.rh_employee_profiles where user_id = (select mel from u)), 'Pediu demissão',
  'o motivo fica no cadastro');

-- ═══ Data futura: entra normalmente até o dia; o robô desativa no dia ═══
select tests.authenticate_as('rh@deslig.test');
select lives_ok($$ select public.rh_desligar((select id from e where user_id = (select gi from u)), (select d + 3 from hoje), null) $$,
  'desligamento para daqui a três dias');
select tests.clear_authentication();
select is((select is_active from public.profiles where id = (select gi from u)), true, 'até o dia, a pessoa continua entrando');
update public.rh_employee_profiles set termination_date = (select d from hoje) where user_id = (select gi from u);
select public.rh_desativa_os_desligados_do_dia();
select is((select banned_until from auth.users where id = (select gi from u)), 'infinity'::timestamptz,
  'no dia, o robô barra o login');

-- ═══ Reativar libera; sem permissão não desliga; não desliga duas vezes ═══
update public.profiles set is_active = true where id = (select mel from u);
select is((select banned_until from auth.users where id = (select mel from u)), null::timestamptz, 'reativar libera o login');

select tests.authenticate_as('ana@deslig.test');
select throws_ok($$ select public.rh_desligar((select id from e where user_id = (select gi from u)), (select d from hoje), null) $$,
  '42501', null, 'sem "Editar" em Colaboradores do RH, não desliga');
select tests.clear_authentication();

select tests.authenticate_as('rh@deslig.test');
select throws_ok($$ select public.rh_desligar((select id from e where user_id = (select mel from u)), (select d from hoje), null) $$,
  '23514', null, 'quem já está desligado não é desligado de novo');
select tests.clear_authentication();

select * from finish();
rollback;

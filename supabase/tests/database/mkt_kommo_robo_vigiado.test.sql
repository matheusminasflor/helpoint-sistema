-- LEITURA DO KOMMO VIGIADA (migration 20270212640000).
--   1  a queda avisa quem administra
--   2  quem não administra não recebe
--   3  a mesma queda não repete o aviso
--   4  colaborador não vê a situação
--   5  a função não abre para o navegador
begin;
\ir _helpers.psql

select plan(5);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-kommo', 'Robo', false) as a;
create temporary table u on commit drop as
select tests.create_user('dona@kommo.test', (select a from f)) as dona,
       tests.create_user('ana@kommo.test', (select a from f)) as ana;
select tests.grant_role((select dona from u), 'admin');
grant select on f, u to authenticated;

select public.mkt_kommo_robo_caiu((select a from f), 'Chave recusada');
select is((select count(*)::int from public.notifications where user_id = (select dona from u) and type = 'ligacao_caiu'), 1, 'a queda avisa quem administra');
select is((select count(*)::int from public.notifications where user_id = (select ana from u) and type = 'ligacao_caiu'), 0, 'quem não administra não recebe');

select public.mkt_kommo_robo_caiu((select a from f), 'Chave recusada de novo');
select is((select count(*)::int from public.notifications where user_id = (select dona from u) and type = 'ligacao_caiu'), 1, 'a mesma queda não repete');

select tests.authenticate_as('ana@kommo.test');
select is((select count(*)::int from public.mkt_kommo_robo), 0, 'colaborador não vê a situação');
select tests.clear_authentication();

select ok(not has_function_privilege('authenticated', 'public.mkt_kommo_robo_caiu(uuid, text)', 'execute'), 'a função não abre para o navegador');

select * from finish();
rollback;

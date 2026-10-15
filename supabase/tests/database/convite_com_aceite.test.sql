-- CONVITE PARA ATENDER JUNTO COM ACEITE (migration 20270113010000; dono, 2026-10-14).
--   1  convidada, a Mel ainda não atende junto (o convite espera)
--   2  ... e vê o convite na lista dela
--   3  recusou: não entra no chamado
--   4  ... e quem convidou fica sabendo
--   5  convidada de novo e aceitou: passa a atender junto
--   6  chamar a si mesmo entra direto, sem convite
--   7  as funções novas não abrem para anon
begin;
\ir _helpers.psql

select plan(7);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-convite', 'Convite', false) as a;
create temporary table u on commit drop as
select tests.create_user('ti1@convite.test', (select a from f)) as ti1,
       tests.create_user('mel@convite.test', (select a from f)) as mel,
       tests.create_user('ana@convite.test', (select a from f)) as ana,
       tests.create_user('ger@convite.test', (select a from f)) as ger;
select tests.grant_module((select ti1 from u), (select a from f), 'ti');
select tests.grant_module((select mel from u), (select a from f), 'marketing');
select tests.grant_role((select ger from u), 'admin');
grant select on f, u to authenticated;

create temporary table c on commit drop as
with t as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, created_by, priority, status, assigned_to)
  select a, 'tickets', 'Impressora', 'x', (select ana from u), (select ana from u), 'medium', 'in_progress', (select ti1 from u) from f
  returning id
) select id from t;
grant select on c to authenticated;

create or replace function pg_temp.junto(p uuid) returns boolean language sql as
  $$ select exists (select 1 from public.ticket_participantes where ticket_id = (select id from c) and user_id = p) $$;

select tests.authenticate_as('ti1@convite.test');
select public.convidar_para_atender_junto((select id from c), (select mel from u));
select tests.clear_authentication();
select ok(not pg_temp.junto((select mel from u)), 'convidada, a Mel ainda nao atende junto');

select tests.authenticate_as('mel@convite.test');
select is((select count(*)::int from public.meus_convites_atender_junto()), 1, 'a Mel ve o convite na lista dela');
select public.responder_convite_atender_junto((select id from c), false);
select tests.clear_authentication();
select ok(not pg_temp.junto((select mel from u)), 'recusou: nao entra no chamado');
select is((select count(*)::int from public.notifications where user_id = (select ti1 from u) and title like '%recusou atender junto%'), 1,
  'quem convidou fica sabendo da recusa');

select tests.authenticate_as('ti1@convite.test');
select public.convidar_para_atender_junto((select id from c), (select mel from u));
select tests.clear_authentication();
select tests.authenticate_as('mel@convite.test');
select public.responder_convite_atender_junto((select id from c), true);
select tests.clear_authentication();
select ok(pg_temp.junto((select mel from u)), 'convidada de novo e aceitou: atende junto');

select tests.authenticate_as('ger@convite.test');
select public.convidar_para_atender_junto((select id from c), (select ger from u));
select tests.clear_authentication();
select ok(pg_temp.junto((select ger from u)), 'chamar a si mesmo entra direto');

select ok(not has_function_privilege('anon', 'public.responder_convite_atender_junto(uuid,boolean)', 'execute')
      and not has_function_privilege('anon', 'public.meus_convites_atender_junto()', 'execute'), 'as funcoes novas nao abrem para anon');

select * from finish();
rollback;

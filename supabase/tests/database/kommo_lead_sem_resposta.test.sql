-- LEAD SEM RESPOSTA (migration 20270212700100).
--   1  tarefa aberta há dias (mais de 30 minutos de expediente) avisa quem administra
--   2  tarefa que acabou de nascer não avisa
--   3  conferir de novo não repete o aviso
--   4  quem não administra nem gere carteiras não recebe
--   5  o aviso diz o número do lead
--   6  o navegador não chama a função
begin;
\ir _helpers.psql

select plan(6);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-kommo-30', 'Kommo 30', false) as a;
create temporary table u on commit drop as
select tests.create_user('dona@kommo30.test', (select a from f)) as dona,
       tests.create_user('ana@kommo30.test', (select a from f)) as ana;
grant select on f, u to authenticated;
select tests.grant_role((select dona from u), 'admin');

create temporary view avisos as
select user_id, message from public.notifications
 where tenant_id = (select a from f) and type = 'lead_sem_resposta';

select is(public.kommo_avisar_sem_resposta((select a from f), jsonb_build_array(
  jsonb_build_object('id', 1, 'lead_id', 501, 'texto', 'Distribuidor triado', 'criada_em', extract(epoch from now() - interval '4 days')::bigint),
  jsonb_build_object('id', 2, 'lead_id', 502, 'texto', 'Salão fez pedido', 'criada_em', extract(epoch from now())::bigint))),
  1, 'só a tarefa antiga passou dos 30 minutos de expediente');
select is((select count(*)::int from avisos where user_id = (select dona from u)), 1, 'quem administra recebe o aviso da tarefa antiga');

select is(public.kommo_avisar_sem_resposta((select a from f), jsonb_build_array(
  jsonb_build_object('id', 1, 'lead_id', 501, 'texto', 'Distribuidor triado', 'criada_em', extract(epoch from now() - interval '4 days')::bigint))),
  0, 'conferir de novo não repete o aviso');

select is((select count(*)::int from avisos where user_id = (select ana from u)), 0, 'quem não administra nem gere carteiras não recebe');
select ok((select message from avisos limit 1) like 'Distribuidor triado · Lead nº 501 no Kommo%', 'o aviso diz o número do lead');

select tests.authenticate_as('ana@kommo30.test');
select throws_ok($$ select public.kommo_avisar_sem_resposta((select a from f), '[]'::jsonb) $$, '42501', null, 'o navegador não chama a função');
select tests.clear_authentication();

select * from finish();
rollback;

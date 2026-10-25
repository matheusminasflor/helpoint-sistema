-- LINHA DO TEMPO DO CHAMADO (migration 20270130040000): os eventos vêm de `audit_logs`, só para quem vê o chamado.
begin;
\ir _helpers.psql

select plan(5);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-linha', 'Linha', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@linha.test', (select a from f)) as ana,
       tests.create_user('tec@linha.test', (select a from f)) as tec,
       tests.create_user('zeca@linha.test', (select a from f)) as zeca;

create temporary table c on commit drop as
with t as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, created_by, priority, status)
  select a, 'tickets', 'Mouse quebrado', 'x', (select ana from u), (select ana from u), 'medium', 'open' from f
  returning id
) select id from t;
update public.tickets set assigned_to = (select tec from u), status = 'in_progress' where id = (select id from c);
update public.tickets set priority = 'high' where id = (select id from c);
grant select on f, u, c to authenticated;

select tests.authenticate_as('ana@linha.test');
select is((select count(*)::int from public.linha_do_tempo_do_chamado((select id from c)) where tipo = 'abriu'), 1,
  'a abertura aparece');
select is((select de || '→' || para from public.linha_do_tempo_do_chamado((select id from c)) where tipo = 'status'),
  'open→in_progress', 'a mudança de status aparece com o antes e o depois');
select is((select para_nome from public.linha_do_tempo_do_chamado((select id from c)) where tipo = 'atendente'),
  (select full_name from public.profiles where id = (select tec from u)), 'quem passou a atender aparece pelo nome');
select is((select count(*)::int from public.linha_do_tempo_do_chamado((select id from c)) where tipo = 'prioridade'), 1,
  'a troca de prioridade aparece');
select tests.clear_authentication();

select tests.authenticate_as('zeca@linha.test');
select throws_ok($$ select * from public.linha_do_tempo_do_chamado((select id from c)) $$, '42501', null,
  'quem não vê o chamado não vê a linha do tempo');
select tests.clear_authentication();

select * from finish();
rollback;

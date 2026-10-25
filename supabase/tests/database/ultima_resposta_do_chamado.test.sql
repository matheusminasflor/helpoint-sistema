-- ÚLTIMA RESPOSTA DO CHAMADO (migration 20270130060000).
begin;
\ir _helpers.psql

select plan(4);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-ultima', 'Ultima', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@ultima.test', (select a from f)) as ana,
       tests.create_user('zeca@ultima.test', (select a from f)) as zeca;
create temporary table c on commit drop as
with t as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, created_by, priority, status)
  select a, 'tickets', 'Rede caiu', 'x', (select ana from u), (select ana from u), 'medium', 'open' from f returning id
) select id from t;
grant select on f, u, c to authenticated;

insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
select a, (select id from c), (select ana from u), 'só para a equipe', true from f;
select is((select count(*)::int from public.chamado_ultima_resposta where ticket_id = (select id from c)), 0,
  'nota interna não conta como resposta');

insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
select a, (select id from c), (select ana from u), 'Ainda sem rede', false from f;
select is((select count(*)::int from public.chamado_ultima_resposta where ticket_id = (select id from c)), 1,
  'o comentário visível registra a última resposta');

select tests.authenticate_as('ana@ultima.test');
select is((select count(*)::int from public.chamado_ultima_resposta where ticket_id = (select id from c)), 1,
  'quem vê o chamado vê a hora da resposta');
select tests.clear_authentication();

select tests.authenticate_as('zeca@ultima.test');
select is((select count(*)::int from public.chamado_ultima_resposta where ticket_id = (select id from c)), 0,
  'quem não vê o chamado não vê a hora');
select tests.clear_authentication();

select * from finish();
rollback;

-- REUNIÕES NA AGENDA E LEITURA DA LYRA (migration 20270212600000).
--   1  a Agenda mostra a reunião de quem foi convidado
--   2  e não a de quem não foi
--   3  a leitura fica com quem é do canal
--   4  quem não é do canal não lê
--   5  a função não abre para anon
begin;
\ir _helpers.psql

select plan(5);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-agenda-reuniao', 'Agenda', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@agendareuniao.test', (select a from f)) as ana,
       tests.create_user('bia@agendareuniao.test', (select a from f)) as bia;
grant select on f, u to authenticated;

create temporary table c on commit drop as
with canal as (
  insert into public.chat_channels (tenant_id, nome, privado, tipo)
  select a, 'reuniao-agenda', true, 'reuniao' from f returning id, tenant_id
), s as (
  insert into public.reuniao_series (tenant_id, google_serie, titulo, canal_id)
  select tenant_id, 'titulo:agenda', 'Agenda', id from canal returning id, tenant_id, canal_id
), r as (
  insert into public.reunioes (tenant_id, serie_id, google_evento, titulo, inicio, link_meet)
  select tenant_id, id, 'evento-agenda', 'Agenda', now() + interval '1 day', 'https://meet.google.com/abc' from s returning id, tenant_id
), p as (
  insert into public.reuniao_presencas (tenant_id, reuniao_id, nome, user_id, convidado)
  select tenant_id, id, 'Ana', (select ana from u), true from r returning reuniao_id
), l as (
  insert into public.reuniao_leituras (serie_id, tenant_id, conteudo)
  select id, tenant_id, '{"resumo": "x"}'::jsonb from s returning serie_id
)
select s.canal_id as canal from s;

insert into public.chat_channel_members (tenant_id, channel_id, user_id)
select (select a from f), (select canal from c), (select ana from u);

select tests.authenticate_as('ana@agendareuniao.test');
select is((select count(*)::int from public.minhas_reunioes(now(), now() + interval '2 days')), 1, 'quem foi convidado vê na Agenda');
select is((select count(*)::int from public.reuniao_leituras), 1, 'quem é do canal lê a leitura');
select tests.clear_authentication();

select tests.authenticate_as('bia@agendareuniao.test');
select is((select count(*)::int from public.minhas_reunioes(now(), now() + interval '2 days')), 0, 'quem não foi convidado não vê');
select is((select count(*)::int from public.reuniao_leituras), 0, 'quem não é do canal não lê');
select tests.clear_authentication();

select ok(not has_function_privilege('anon', 'public.minhas_reunioes(timestamptz, timestamptz)', 'execute'), 'a função não abre para anon');

select * from finish();
rollback;

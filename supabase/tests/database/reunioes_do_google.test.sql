-- REUNIÕES DO GOOGLE (migration 20270212570000; dono, 2026-11-07).
--   1-2  quem é do canal vê a pauta; quem não é, não
--   3-4  quem entrou depois vê a pauta antiga, mas não a transcrição
--   5-6  quem participou vê transcrição e presença
--   7    colaborador não grava pauta pelo navegador
--   8    quem digita no chat não finge a mensagem automática
--   9    só o administrador liga nomes
--  10-11 ligar o nome dá acesso à reunião e ao canal
--  12    as funções não abrem para anon
--  13    ligar o nome junta o convite e quem entrou em uma linha só
--  14-15 a lista do Google: quem participou vê, quem entrou depois não
--  16    colaborador não grava pelo navegador
begin;
\ir _helpers.psql

select plan(16);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-reuniao', 'Reuniao', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@reuniao.test',  (select a from f)) as ana,
       tests.create_user('bia@reuniao.test',  (select a from f)) as bia,
       tests.create_user('caio@reuniao.test', (select a from f)) as caio,
       tests.create_user('dora@reuniao.test', (select a from f)) as dora;
grant select on f, u to authenticated;

create temporary table c on commit drop as
with canal as (
  insert into public.chat_channels (tenant_id, nome, privado, tipo)
  select a, 'reuniao-teste', true, 'reuniao' from f returning id, tenant_id
), s as (
  insert into public.reuniao_series (tenant_id, google_serie, titulo, canal_id)
  select tenant_id, 'serie-1', 'Estratégia', id from canal returning id, tenant_id, canal_id
), r as (
  insert into public.reunioes (tenant_id, serie_id, google_evento, titulo, inicio, pauta)
  select tenant_id, id, 'evento-1', 'Estratégia', now(), 'Resumo' from s returning id, tenant_id
), t as (
  insert into public.reuniao_transcricoes (reuniao_id, tenant_id, texto) select id, tenant_id, 'Ana: oi' from r returning reuniao_id
), p as (
  insert into public.reuniao_presencas (tenant_id, reuniao_id, nome, user_id, convidado, entrou)
  select tenant_id, id, 'Ana', (select ana from u), true, true from r returning reuniao_id
), lista as (
  insert into public.reuniao_listas (reuniao_id, tenant_id, csv) select id, tenant_id, 'Nome' from r returning reuniao_id
), n as (
  insert into public.reuniao_nomes (tenant_id, nome_google) select a, 'Dora Google' from f returning id
), z as (
  insert into public.reuniao_presencas (tenant_id, reuniao_id, nome, entrou)
  select tenant_id, id, 'Dora Google', true from r returning reuniao_id
), y as (
  insert into public.reuniao_presencas (tenant_id, reuniao_id, nome, user_id, convidado)
  select tenant_id, id, 'Dora Helpoint', (select dora from u), true from r returning reuniao_id
)
select r.id as reuniao, s.canal_id as canal from r, s;
grant select on c to authenticated;

insert into public.chat_channel_members (tenant_id, channel_id, user_id)
select (select a from f), (select canal from c), x from unnest(array[(select ana from u), (select bia from u)]) x;

select tests.authenticate_as('ana@reuniao.test');
select is((select count(*)::int from public.reunioes), 1, 'quem é do canal vê a pauta');
select is((select count(*)::int from public.reuniao_transcricoes), 1, 'quem participou vê a transcrição');
select is((select count(*)::int from public.reuniao_listas), 1, 'quem participou vê a lista do Google');
select ok(not has_table_privilege('authenticated', 'public.reunioes', 'update'), 'colaborador não grava pelo navegador');
select is((select count(*)::int from public.reuniao_presencas), 3, 'quem participou vê a presença');
select tests.clear_authentication();

select tests.authenticate_as('bia@reuniao.test');
select is((select count(*)::int from public.reunioes), 1, 'quem entrou depois vê a pauta antiga');
select is((select count(*)::int from public.reuniao_transcricoes), 0, 'quem entrou depois não vê a transcrição');
select is((select count(*)::int from public.reuniao_listas), 0, 'quem entrou depois não vê a lista');
select tests.clear_authentication();

select tests.authenticate_as('caio@reuniao.test');
select is((select count(*)::int from public.reunioes), 0, 'quem não é do canal não vê a pauta');
select throws_ok(
  format('insert into public.reuniao_nomes (tenant_id, nome_google) values (%L, %L)', (select a from f), 'Falso'),
  '42501'
);
select tests.clear_authentication();

select tests.authenticate_as('ana@reuniao.test');
select throws_ok(
  format('select public.reuniao_ligar_nome(%L, %L)', 'Dora Google', (select dora from u)),
  '42501', 'Só o administrador liga os nomes.'
);
insert into public.chat_messages (tenant_id, channel_id, author_id, conteudo, reuniao_id)
select (select a from f), (select canal from c), (select ana from u), 'Falsa', (select reuniao from c);
select is((select reuniao_id from public.chat_messages where conteudo = 'Falsa'), null, 'quem digita não finge a mensagem automática');
select tests.clear_authentication();

select tests.grant_role((select dora from u), 'admin');
select tests.authenticate_as('dora@reuniao.test');
select public.reuniao_ligar_nome('Dora Google', (select dora from u));
select is((select user_id from public.reuniao_presencas where nome = 'Dora Google'), (select dora from u), 'ligar o nome leva às reuniões guardadas');
select is((select count(*)::int from public.reuniao_presencas where user_id = (select dora from u) and convidado and entrou), 1, 'o convite e a entrada viram uma linha só');
select ok(public.chat_sou_membro((select canal from c)), 'ligar o nome coloca a pessoa no canal');
select tests.clear_authentication();

select ok(
  not has_function_privilege('anon', 'public.reuniao_ligar_nome(text, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.reuniao_participei(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.reuniao_da_diretoria()', 'execute'),
  'as funções não abrem para anon'
);

select * from finish();
rollback;

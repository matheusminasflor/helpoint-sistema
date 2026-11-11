-- "AGUARDANDO RESPOSTA" SEM O QUE JÁ FOI RESOLVIDO (20270212721000; dono, 2026-11-11).
--   1  o lead aberto cuja última mensagem é do cliente está esperando
--   2  conversa encerrada no Kommo deixa de esperar (Regiane)
--   3  ... e volta quando o Kommo reabre a conversa
--   4  lead apagado no Kommo deixa de esperar (Priscila)
--   5  ... e as mensagens dele param de contar
--   6  ... e volta se o Kommo devolver o lead
--   7  o robô confere só os leads abertos, não apagados, com mensagem nos últimos 7 dias
--   8  o navegador não chama a gravação das conversas
--   9  quem abre o Atendimento do CRM vê a hora da última leitura das conversas
begin;
\ir _helpers.psql

select plan(9);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-crm-encerrada', 'CRM encerrada', false) as a;
create temporary table u on commit drop as select tests.create_user('dona@crmencerrada.test', (select a from f)) as dona;
grant select on f, u to authenticated;
select tests.grant_role((select dona from u), 'admin');
insert into public.mkt_kommo_robo (tenant_id) values ((select a from f));

-- Lead 1 e 2 escreveram há 1 hora e ninguém respondeu; o 3 já fechou (venda) e o 4 escreveu há 10 dias.
select public.kommo_gravar_atendimento((select a from f),
  jsonb_build_array(
    jsonb_build_object('id', 'c1', 'lead_id', 1, 'quando', extract(epoch from now() - interval '1 hour')::bigint, 'entrou', true),
    jsonb_build_object('id', 'c2', 'lead_id', 2, 'quando', extract(epoch from now() - interval '1 hour')::bigint, 'entrou', true),
    jsonb_build_object('id', 'c3', 'lead_id', 3, 'quando', extract(epoch from now() - interval '1 hour')::bigint, 'entrou', true),
    jsonb_build_object('id', 'c4', 'lead_id', 4, 'quando', extract(epoch from now() - interval '10 days')::bigint, 'entrou', true)),
  jsonb_build_array(
    jsonb_build_object('lead_id', 1, 'nome', 'Regiane', 'funil', 'Entrada', 'etapa', 'Com atendente', 'link', 'k/1'),
    jsonb_build_object('lead_id', 2, 'nome', 'Priscila', 'funil', 'Entrada', 'etapa', 'Com atendente', 'link', 'k/2'),
    jsonb_build_object('lead_id', 3, 'nome', 'Fechou', 'funil', 'Salão de Beleza', 'fechado', true, 'link', 'k/3'),
    jsonb_build_object('lead_id', 4, 'nome', 'Antigo', 'funil', 'Entrada', 'link', 'k/4')),
  null, null);

create function pg_temp.esperando() returns text language sql as $$
  select coalesce(string_agg(lead_id::text, ',' order by lead_id), '') from public.kommo_esperando((select a from f))
$$;

select is(pg_temp.esperando(), '1,2', 'os leads 1 e 2 estão esperando');

select public.kommo_gravar_conversas((select a from f), array[1]::bigint[], array[]::bigint[], array[]::bigint[]);
select is(pg_temp.esperando(), '2', 'a conversa encerrada do lead 1 deixa de esperar');

select public.kommo_gravar_conversas((select a from f), array[]::bigint[], array[1]::bigint[], array[]::bigint[]);
select is(pg_temp.esperando(), '1,2', 'o Kommo reabriu a conversa: o lead 1 volta a esperar');

select public.kommo_gravar_conversas((select a from f), null, null, array[2]::bigint[]);
select is(pg_temp.esperando(), '1', 'o lead 2, apagado no Kommo, deixa de esperar');
select is((select count(*)::int from public.kommo_mensagens_com_quem((select a from f), now() - interval '7 days') where lead_id = 2), 0,
  'as mensagens do lead apagado param de contar');

select public.kommo_gravar_atendimento((select a from f), null,
  jsonb_build_array(jsonb_build_object('lead_id', 2, 'nome', 'Priscila', 'funil', 'Entrada', 'etapa', 'Com atendente', 'link', 'k/2')),
  null, null);
select is(pg_temp.esperando(), '1,2', 'o lead que o Kommo devolveu deixa de estar apagado');

select is((select string_agg(x::text, ',' order by x) from public.kommo_leads_para_conferir((select a from f)) x), '1,2',
  'o robô confere os abertos com mensagem nos últimos 7 dias (o fechado e o antigo não)');

select tests.authenticate_as('dona@crmencerrada.test');
select throws_ok($$ select public.kommo_gravar_conversas((select a from f), null, null, array[1]::bigint[]) $$, '42501', null,
  'o navegador não grava a situação das conversas');
select ok((public.crm_atualizado_em()->>'conversas')::timestamptz = now(), 'a dona vê a hora da última leitura das conversas');
select tests.clear_authentication();

select * from finish();
rollback;

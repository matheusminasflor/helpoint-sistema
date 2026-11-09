-- ATENDIMENTO DO CRM (migration 20270212710000; projeto do Kommo, parte 4b).
--   1  a gravação guarda as mensagens novas
--   2  ... e a mesma mensagem lida de novo não duplica
--   3  a pessoa do Kommo se liga à do Helpoint pelo primeiro nome (o e-mail do Kommo é outro)
--   4  o dono vê as conversas do período e quantas ficaram sem resposta de pessoa
--   5  a 1ª resposta é a média, em minutos de expediente, só das respondidas por uma pessoa
--   6  a linha da atendente: leads, mensagens, 1ª resposta, tarefas, ganhas e perdidas
--   7  a Lyra conta à parte
--   8  sem resposta por funil, com o nome do funil que não é de venda
--   9  para responder agora: só o lead aberto cuja última mensagem é do cliente
--  10  campos faltando: CNPJ, telefone, valor da ganha e motivo da perdida
--  11  a atendente vê só o dela, sem a Lyra e sem a outra atendente
--  12  ... e as conversas só dos leads dela
--  13  quem não tem os Indicadores do Comercial não abre
--  14  o navegador não lê as tabelas
begin;
\ir _helpers.psql

select plan(14);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-crm-atend', 'CRM atendimento', false) as a;
create temporary table u on commit drop as
select tests.create_user('dona@crmatend.test', (select a from f)) as dona,
       tests.create_user('thay@crmatend.test', (select a from f)) as thay,
       tests.create_user('bia@crmatend.test', (select a from f)) as bia;
grant select on f, u to authenticated;
select tests.grant_role((select dona from u), 'admin');
update public.profiles set full_name = 'Thayná Assunção' where id = (select thay from u);
update public.profiles set full_name = 'Bia Souza' where id = (select bia from u);
select tests.grant_module((select thay from u), (select a from f), 'comercial');
select tests.grant_profile((select thay from u), (select a from f), 'comercial', 'Operador');
update public.access_profiles
   set permissions = '{"reports": {"view": true, "view_team_metrics": false}, "carteiras": {"view": true, "equipe": false}}'::jsonb
 where tenant_id = (select a from f) and department = 'comercial' and name = 'Operador';

-- Quarta-feira, 04/11/2026, no horário de Brasília.
create temporary table h on commit drop as
select extract(epoch from timestamptz '2026-11-04 09:00-03')::bigint as nove;
grant select on h to authenticated;

create temporary table g on commit drop as
select public.kommo_gravar_atendimento((select a from f),
  jsonb_build_array(
    jsonb_build_object('id', 'm1', 'lead_id', 1, 'quando', (select nove from h), 'entrou', true, 'autor', 0, 'canal', 'waba'),
    jsonb_build_object('id', 'm2', 'lead_id', 1, 'quando', (select nove from h) + 60, 'entrou', false, 'autor', 0),
    jsonb_build_object('id', 'm3', 'lead_id', 1, 'quando', (select nove from h) + 1200, 'entrou', false, 'autor', 10),
    jsonb_build_object('id', 'm4', 'lead_id', 2, 'quando', (select nove from h), 'entrou', true, 'autor', 0),
    jsonb_build_object('id', 'm5', 'lead_id', 2, 'quando', (select nove from h) + 3600, 'entrou', false, 'autor', 20),
    jsonb_build_object('id', 'm6', 'lead_id', 4, 'quando', (select nove from h) + 7200, 'entrou', true, 'autor', 0),
    jsonb_build_object('id', 'm7', 'lead_id', 4, 'quando', (select nove from h) + 7260, 'entrou', false, 'autor', 0),
    -- Hoje: o lead 1 escreveu de novo e ninguém respondeu; o lead 3 também, mas já fechou.
    jsonb_build_object('id', 'm8', 'lead_id', 1, 'quando', extract(epoch from now() - interval '2 hours')::bigint, 'entrou', true, 'autor', 0),
    jsonb_build_object('id', 'm9', 'lead_id', 3, 'quando', extract(epoch from now() - interval '1 hour')::bigint, 'entrou', true, 'autor', 0)),
  jsonb_build_array(
    jsonb_build_object('lead_id', 1, 'nome', 'Salão da Ana', 'segmento', 'salao', 'funil', 'Salão de Beleza', 'etapa', 'Com atendente', 'responsavel', 10, 'link', 'k/1'),
    jsonb_build_object('lead_id', 2, 'nome', 'Distribuidora', 'segmento', 'distribuidor', 'funil', 'Distribuidor', 'responsavel', 20, 'link', 'k/2'),
    jsonb_build_object('lead_id', 3, 'nome', 'Fechado', 'segmento', 'consumidor', 'funil', 'Consumidor Final', 'fechado', true, 'responsavel', 10, 'link', 'k/3'),
    jsonb_build_object('lead_id', 4, 'nome', 'Aluna', 'funil', 'ENAD', 'responsavel', 10, 'link', 'k/4')),
  jsonb_build_array(
    jsonb_build_object('kommo_id', 10, 'nome', 'Thayná', 'email', 'thay.pessoal@gmail.test'),
    jsonb_build_object('kommo_id', 20, 'nome', 'Atendente 01', 'email', 'atendente@crmatend.test')),
  jsonb_build_array(jsonb_build_object('id', 1, 'responsavel', 10, 'feita_em', (select nove from h) + 10800))) as r;

select is((select (r->>'mensagens')::int from g), 9, 'grava as mensagens novas');
select is((public.kommo_gravar_atendimento((select a from f),
  jsonb_build_array(jsonb_build_object('id', 'm1', 'lead_id', 1, 'quando', (select nove from h), 'entrou', true)), null, null, null)->>'mensagens')::int,
  0, 'a mesma mensagem não duplica');
select is((select user_id from public.kommo_usuarios where tenant_id = (select a from f) and kommo_id = 10), (select thay from u),
  'liga a Thayná do Kommo à do Helpoint pelo primeiro nome');

select public.mkt_kommo_gravar_vendas((select a from f), '2026-11-01', jsonb_build_array(
  jsonb_build_object('lead_id', 1, 'nome', 'Salão da Ana', 'funil', 'salao', 'situacao', 'ganha', 'valor', 0, 'fechou', '2026-11-04', 'link', 'k/1', 'telefone', '11999998888', 'responsavel', 10),
  jsonb_build_object('lead_id', 3, 'nome', 'Fechado', 'funil', 'consumidor', 'situacao', 'perdida', 'valor', 0, 'fechou', '2026-11-04', 'link', 'k/3', 'documento', '12345678901', 'responsavel', 10),
  jsonb_build_object('lead_id', 2, 'nome', 'Distribuidora', 'funil', 'distribuidor', 'situacao', 'ganha', 'valor', 900, 'fechou', '2026-11-04', 'link', 'k/2', 'documento', '11222333000144', 'telefone', '3899990000', 'responsavel', 20)));

select tests.authenticate_as('dona@crmatend.test');
create temporary table d on commit drop as select public.crm_atendimento('2026-11-04', '2026-11-04') as v;

select is((select (v->>'conversas') || '/' || (v->>'sem_resposta') from d), '3/1', 'o dono vê 3 conversas, 1 sem resposta de pessoa');
select is((select (v->>'primeira_resposta')::int from d), 40, '1ª resposta: média de 20 e 60 minutos');
select is((select format('%s/%s/%s/%s/%s/%s', x->>'leads', x->>'mensagens', x->>'primeira_resposta', x->>'tarefas', x->>'ganhas', x->>'perdidas')
             from d, jsonb_array_elements(v->'atendentes') x where (x->>'kommo_id')::int = 10),
  '1/1/20/1/1/1', 'a linha da Thayná');
select is((select (v->'lyra'->>'leads') || '/' || (v->'lyra'->>'mensagens') from d), '2/2', 'a Lyra à parte');
select is((select v->'sem_resposta_por_funil' from d), '[{"funil": "ENAD", "quantos": 1, "segmento": null}]'::jsonb, 'sem resposta por funil');
select is((select string_agg(x->>'lead_id', ',') from d, jsonb_array_elements(v->'para_responder') x), '1',
  'para responder: o lead aberto que escreveu por último');
select is((select string_agg((x->>'lead_id') || ':' || array_to_string(array(select jsonb_array_elements_text(x->'faltam')), '+'), ',' order by x->>'lead_id')
             from d, jsonb_array_elements(v->'campos_faltando') x),
  '1:cnpj+valor,3:telefone+motivo', 'campos faltando');
select tests.clear_authentication();

select tests.authenticate_as('thay@crmatend.test');
create temporary table t on commit drop as select public.crm_atendimento('2026-11-04', '2026-11-04') as v;
select is((select string_agg(x->>'kommo_id', ',') || '/' || coalesce(v->>'lyra', 'sem lyra') from t, jsonb_array_elements(v->'atendentes') x group by v),
  '10/sem lyra', 'a atendente vê só a linha dela');
select is((select (v->>'conversas') || '/' || (v->>'sem_resposta') || '/' || (v->>'ganhas') from t), '2/1/1', 'e só os leads dela');
select tests.clear_authentication();

select tests.authenticate_as('bia@crmatend.test');
select throws_ok($$ select public.crm_atendimento('2026-11-04', '2026-11-04') $$, '42501', null, 'sem os Indicadores do Comercial não abre');
select throws_ok($$ select count(*) from public.kommo_mensagens $$, '42501', null, 'o navegador não lê as tabelas');
select tests.clear_authentication();

select * from finish();
rollback;

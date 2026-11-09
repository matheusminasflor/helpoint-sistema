-- ATENDIMENTO DO CRM (migrations 20270212710000 e 20270212720000; projeto do Kommo, parte 4b).
-- Antes da Lyra (08/11 18h56) não havia robô: toda mensagem que saiu é da atendente, com nome no Kommo ou sem.
--   1  a gravação guarda as mensagens novas
--   2  ... e a mesma mensagem lida de novo não duplica
--   3  a pessoa do Kommo se liga à do Helpoint pelo primeiro nome (o e-mail do Kommo é outro)
--   4  o dono vê as conversas do período e quantas ficaram sem resposta de pessoa
--   5  a 1ª resposta é a média, em minutos de expediente, só das respondidas por uma pessoa
--   6  a linha da atendente: leads, mensagens, 1ª resposta, tarefas, ganhas e perdidas
--   7  antes da Lyra não há linha do robô
--   8  sem resposta por funil, com o nome do funil que não é de venda
--   9  para responder agora: só o lead aberto cuja última mensagem é do cliente
--  10  campos faltando: CNPJ, telefone, valor da ganha e motivo da perdida
--  11  a atendente vê só o dela, sem o robô e sem a outra atendente
--  12  ... e as conversas só dos leads dela
--  13  quem não tem os Indicadores do Comercial não abre
--  14  o navegador não lê as tabelas
--  15  a troca de etapa é gravada (20270212720000)
--  16  com a Lyra: a vez da atendente começa em "Com atendente"; o que a Lyra resolveu sozinha não é sem resposta
--  17  ... o robô: a Lyra enquanto o lead está em "Com a Lyra" e a transmissão para 5 leads
--  18  ... e a linha da Thayná conta as sem nome
begin;
\ir _helpers.psql

select plan(18);

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
    jsonb_build_object('id', 'm2', 'lead_id', 1, 'quando', (select nove from h) + 10, 'entrou', false, 'autor', 0),
    jsonb_build_object('id', 'm3', 'lead_id', 1, 'quando', (select nove from h) + 1200, 'entrou', false, 'autor', 10),
    jsonb_build_object('id', 'm4', 'lead_id', 2, 'quando', (select nove from h), 'entrou', true, 'autor', 0),
    jsonb_build_object('id', 'm5', 'lead_id', 2, 'quando', (select nove from h) + 3600, 'entrou', false, 'autor', 20),
    jsonb_build_object('id', 'm6', 'lead_id', 4, 'quando', (select nove from h) + 7200, 'entrou', true, 'autor', 0),
    -- Agora (e nunca antes de 10/11, para não cair no dia da Lyra abaixo): o lead 1 escreveu de novo e ninguém respondeu;
    -- o lead 3 também, mas já fechou.
    jsonb_build_object('id', 'm8', 'lead_id', 1, 'quando', greatest(extract(epoch from timestamptz '2026-11-10 12:00-03'), extract(epoch from now() - interval '2 hours'))::bigint, 'entrou', true, 'autor', 0),
    jsonb_build_object('id', 'm9', 'lead_id', 3, 'quando', greatest(extract(epoch from timestamptz '2026-11-10 12:00-03'), extract(epoch from now() - interval '1 hour'))::bigint, 'entrou', true, 'autor', 0)),
  jsonb_build_array(
    jsonb_build_object('lead_id', 1, 'nome', 'Salão da Ana', 'segmento', 'salao', 'funil', 'Salão de Beleza', 'etapa', 'Com atendente', 'responsavel', 10, 'link', 'k/1'),
    jsonb_build_object('lead_id', 2, 'nome', 'Distribuidora', 'segmento', 'distribuidor', 'funil', 'Distribuidor', 'responsavel', 20, 'link', 'k/2'),
    jsonb_build_object('lead_id', 3, 'nome', 'Fechado', 'segmento', 'consumidor', 'funil', 'Consumidor Final', 'fechado', true, 'responsavel', 10, 'link', 'k/3'),
    -- Fechado para não cair em "para responder" (escreveu em 04/11 e ninguém respondeu).
    jsonb_build_object('lead_id', 4, 'nome', 'Aluna', 'funil', 'ENAD', 'fechado', true, 'responsavel', 10, 'link', 'k/4')),
  jsonb_build_array(
    jsonb_build_object('kommo_id', 10, 'nome', 'Thayná', 'email', 'thay.pessoal@gmail.test'),
    jsonb_build_object('kommo_id', 20, 'nome', 'Atendente 01', 'email', 'atendente@crmatend.test')),
  jsonb_build_array(jsonb_build_object('id', 1, 'responsavel', 10, 'feita_em', (select nove from h) + 10800))) as r;

select is((select (r->>'mensagens')::int from g), 8, 'grava as mensagens novas');
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
-- O lead 1 foi respondido sem nome 10 segundos depois (0 min): antes da Lyra, é a atendente.
select is((select (v->>'primeira_resposta')::int from d), 30, '1ª resposta: média de 0 e 60 minutos');
select is((select format('%s/%s/%s/%s/%s/%s', x->>'leads', x->>'mensagens', x->>'primeira_resposta', x->>'tarefas', x->>'ganhas', x->>'perdidas')
             from d, jsonb_array_elements(v->'atendentes') x where (x->>'kommo_id')::int = 10),
  '1/2/0/1/1/1', 'a linha da Thayná, com a resposta sem nome');
select is((select coalesce(v->>'robo', 'sem robô') from d), 'sem robô', 'antes da Lyra não há linha do robô');
select is((select v->'sem_resposta_por_funil' from d), '[{"funil": "ENAD", "quantos": 1, "segmento": null}]'::jsonb, 'sem resposta por funil');
select is((select string_agg(x->>'lead_id', ',') from d, jsonb_array_elements(v->'para_responder') x), '1',
  'para responder: o lead aberto que escreveu por último');
select is((select string_agg((x->>'lead_id') || ':' || array_to_string(array(select jsonb_array_elements_text(x->'faltam')), '+'), ',' order by x->>'lead_id')
             from d, jsonb_array_elements(v->'campos_faltando') x),
  '1:cnpj+valor,3:telefone+motivo', 'campos faltando');
select tests.clear_authentication();

select tests.authenticate_as('thay@crmatend.test');
create temporary table t on commit drop as select public.crm_atendimento('2026-11-04', '2026-11-04') as v;
select is((select string_agg(x->>'kommo_id', ',') || '/' || coalesce(v->>'robo', 'sem robo') from t, jsonb_array_elements(v->'atendentes') x group by v),
  '10/sem robo', 'a atendente vê só a linha dela');
select is((select (v->>'conversas') || '/' || (v->>'sem_resposta') || '/' || (v->>'ganhas') from t), '2/1/1', 'e só os leads dela');
select tests.clear_authentication();

select tests.authenticate_as('bia@crmatend.test');
select throws_ok($$ select public.crm_atendimento('2026-11-04', '2026-11-04') $$, '42501', null, 'sem os Indicadores do Comercial não abre');
select throws_ok($$ select count(*) from public.kommo_mensagens $$, '42501', null, 'o navegador não lê as tabelas');
select tests.clear_authentication();

-- Segunda, 09/11, com a Lyra no ar: o lead 6 não passou pela Lyra e é respondido sem nome em 11 min; o 7 cai com a Lyra,
-- passa para "Com atendente" às 9h03 (a despedida da Lyra sai logo depois) e a atendente responde sem nome às 9h30
-- (27 min); o 8 só recebe a transmissão; o 13 a Lyra resolveu sozinha (foi para "Link enviado"); o 14 escreveu no
-- Instagram e só a resposta automática dele, 5 segundos depois, respondeu (20270212720200); o 15 é da equipe (etiqueta
-- "Equipe interna", 20270212720300) e não entra em conta nenhuma, mesmo sem resposta.
create temporary table l on commit drop as select (select nove from h) + 5 * 86400 as dia;
grant select on l to authenticated;
select is(public.kommo_gravar_etapas((select a from f), jsonb_build_array(
  jsonb_build_object('id', 'e1', 'lead_id', 7, 'quando', (select dia from l) - 60, 'etapa', 'Com a Lyra'),
  jsonb_build_object('id', 'e2', 'lead_id', 7, 'quando', (select dia from l) + 180, 'etapa', 'Com atendente'),
  -- A Lyra responde (11h00min05s) antes de o Kommo mostrar a etapa (11h00min30s): 20270212720100.
  jsonb_build_object('id', 'e3', 'lead_id', 13, 'quando', (select dia from l) + 7230, 'etapa', 'Com a Lyra'),
  jsonb_build_object('id', 'e4', 'lead_id', 13, 'quando', (select dia from l) + 7500, 'etapa', 'Link enviado'))), 4,
  'grava a troca de etapa');
select public.kommo_gravar_atendimento((select a from f),
  jsonb_build_array(
    jsonb_build_object('id', 'n1', 'lead_id', 6, 'quando', (select dia from l), 'entrou', true),
    jsonb_build_object('id', 'n2', 'lead_id', 6, 'quando', (select dia from l) + 660, 'entrou', false),
    jsonb_build_object('id', 'n3', 'lead_id', 7, 'quando', (select dia from l), 'entrou', true),
    jsonb_build_object('id', 'n4', 'lead_id', 7, 'quando', (select dia from l) + 120, 'entrou', false),
    jsonb_build_object('id', 'n5', 'lead_id', 7, 'quando', (select dia from l) + 210, 'entrou', false),
    jsonb_build_object('id', 'n6', 'lead_id', 7, 'quando', (select dia from l) + 1800, 'entrou', false),
    jsonb_build_object('id', 'n7', 'lead_id', 8, 'quando', (select dia from l) + 3000, 'entrou', true),
    jsonb_build_object('id', 't8', 'lead_id', 8, 'quando', (select dia from l) + 3605, 'entrou', false),
    jsonb_build_object('id', 't9', 'lead_id', 9, 'quando', (select dia from l) + 3606, 'entrou', false),
    jsonb_build_object('id', 't10', 'lead_id', 10, 'quando', (select dia from l) + 3607, 'entrou', false),
    jsonb_build_object('id', 't11', 'lead_id', 11, 'quando', (select dia from l) + 3608, 'entrou', false),
    jsonb_build_object('id', 't12', 'lead_id', 12, 'quando', (select dia from l) + 3609, 'entrou', false),
    jsonb_build_object('id', 'n13', 'lead_id', 13, 'quando', (select dia from l) + 7200, 'entrou', true),
    jsonb_build_object('id', 'r13', 'lead_id', 13, 'quando', (select dia from l) + 7205, 'entrou', false),
    jsonb_build_object('id', 'n14', 'lead_id', 14, 'quando', (select dia from l) + 9000, 'entrou', true, 'canal', 'instagram_business'),
    jsonb_build_object('id', 'r14', 'lead_id', 14, 'quando', (select dia from l) + 9005, 'entrou', false, 'canal', 'instagram_business'),
    jsonb_build_object('id', 'n15', 'lead_id', 15, 'quando', (select dia from l) + 9100, 'entrou', true)),
  (select jsonb_agg(jsonb_build_object('lead_id', i, 'nome', 'Lead ' || i, 'funil', 'Consumidor Final', 'segmento', 'consumidor',
                                       'fechado', i >= 8, 'responsavel', 10, 'link', 'k/' || i))
     from generate_series(6, 14) i)
   || jsonb_build_array(jsonb_build_object('lead_id', 15, 'nome', 'Matheus', 'funil', 'Consumidor Final', 'segmento', 'consumidor',
                                           'responsavel', 10, 'link', 'k/15', 'interno', true)), null, null);

select tests.authenticate_as('dona@crmatend.test');
create temporary table q on commit drop as select public.crm_atendimento('2026-11-09', '2026-11-09') as v;
select is((select format('%s/%s/%s/%s', v->>'conversas', v->>'so_lyra', v->>'sem_resposta', v->>'primeira_resposta') from q), '5/1/2/19',
  'a vez da atendente começa em "Com atendente"; o que a Lyra resolveu sozinha e a equipe não são sem resposta');
select is((select (v->'robo'->>'leads') || '/' || (v->'robo'->>'mensagens') from q), '8/9', 'o robô: a Lyra nos leads 7 e 13, a transmissão e a resposta automática do Instagram');
select is((select (x->>'mensagens') || '/' || (x->>'sem_nome') from q, jsonb_array_elements(v->'atendentes') x where (x->>'kommo_id')::int = 10),
  '2/2', 'a Thayná com as duas sem nome');
select tests.clear_authentication();

select * from finish();
rollback;

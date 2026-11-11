-- A SAUDAÇÃO DA LYRA E O CADASTRO POR SEGMENTO (20270212721200; dono, 2026-11-11).
-- Quarta, 11/11, com a Lyra no ar. O lead 1 escreve às 10h, a Lyra põe em Entrada › Contato inicial e saúda 4 segundos
-- depois, sem nome, e o cliente não responde mais. O lead 2 estava em "Contato inicial" desde outubro (antes da Lyra),
-- escreve às 10h e a atendente responde sem nome às 10h10.
--   1  a saudação da Lyra é do robô, não da atendente
--   2  ... e a conversa do lead 1 é da Lyra (parou no meio), não "sem resposta"
--   3  o lead 2 continua da atendente: respondido em 10 minutos
--   4  cadastro: venda sem segmento cobra o segmento e o valor; consumidor sem telefone, o telefone; perda, só o motivo
--   5  a lista de leads traz a etapa
begin;
\ir _helpers.psql

select plan(5);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-crm-saudacao', 'CRM saudação', false) as a;
create temporary table u on commit drop as select tests.create_user('dona@crmsaudacao.test', (select a from f)) as dona;
grant select on f, u to authenticated;
select tests.grant_role((select dona from u), 'admin');

create temporary table h on commit drop as select extract(epoch from timestamptz '2026-11-11 10:00-03')::bigint as dez;
grant select on h to authenticated;

select public.kommo_gravar_etapas((select a from f), jsonb_build_array(
  jsonb_build_object('id', 'e1', 'lead_id', 1, 'quando', (select dez from h) + 3, 'etapa', 'Contato inicial'),
  jsonb_build_object('id', 'e2', 'lead_id', 2, 'quando', extract(epoch from timestamptz '2026-10-20 09:00-03')::bigint, 'etapa', 'Contato inicial')));

select public.kommo_gravar_atendimento((select a from f),
  jsonb_build_array(
    jsonb_build_object('id', 'm1', 'lead_id', 1, 'quando', (select dez from h), 'entrou', true, 'canal', 'waba'),
    jsonb_build_object('id', 'm2', 'lead_id', 1, 'quando', (select dez from h) + 4, 'entrou', false, 'autor', 0, 'canal', 'waba'),
    jsonb_build_object('id', 'm3', 'lead_id', 2, 'quando', (select dez from h), 'entrou', true, 'canal', 'waba'),
    jsonb_build_object('id', 'm4', 'lead_id', 2, 'quando', (select dez from h) + 600, 'entrou', false, 'autor', 0, 'canal', 'waba')),
  jsonb_build_array(
    jsonb_build_object('lead_id', 1, 'nome', 'Studio novo', 'segmento', 'sem_triagem', 'funil', 'Entrada', 'etapa', 'Contato inicial', 'responsavel', 10, 'link', 'k/1'),
    jsonb_build_object('lead_id', 2, 'nome', 'Cliente antigo', 'segmento', 'sem_triagem', 'funil', 'Entrada', 'etapa', 'Contato inicial', 'responsavel', 10, 'link', 'k/2')),
  jsonb_build_array(jsonb_build_object('kommo_id', 10, 'nome', 'Thayná', 'email', 'thay@crmsaudacao.test')),
  null);

select public.mkt_kommo_gravar_vendas((select a from f), '2026-11-01', jsonb_build_array(
  jsonb_build_object('lead_id', 3, 'nome', 'Ficou na Entrada', 'funil', 'sem_triagem', 'situacao', 'ganha', 'valor', 0, 'fechou', '2026-11-11', 'link', 'k/3', 'responsavel', 10),
  jsonb_build_object('lead_id', 4, 'nome', 'Consumidora', 'funil', 'consumidor', 'situacao', 'ganha', 'valor', 120, 'fechou', '2026-11-11', 'link', 'k/4', 'responsavel', 10),
  jsonb_build_object('lead_id', 5, 'nome', 'Perdeu', 'funil', 'salao', 'situacao', 'perdida', 'valor', 0, 'fechou', '2026-11-11', 'link', 'k/5', 'responsavel', 10)));

select is((select quem from public.kommo_mensagens_com_quem((select a from f), '2026-11-11') where lead_id = 1 and not entrou), 0::bigint,
  'a saudação da Lyra em "Contato inicial" é do robô');

select tests.authenticate_as('dona@crmsaudacao.test');
create temporary table d on commit drop as select public.crm_atendimento('2026-11-11', '2026-11-11') as v;
select is((select string_agg((x->>'lead_id') || ':' || coalesce(x->>'situacao', '-'), ',' order by (x->>'lead_id')::int)
             from d, jsonb_array_elements(v->'leads') x where (x->>'lead_id')::int in (1, 2)),
  '1:so_lyra,2:no_prazo', 'o lead 1 é da Lyra (parou no meio); o lead 2, da atendente');
select is((select (x->>'minutos')::int from d, jsonb_array_elements(v->'leads') x where (x->>'lead_id')::int = 2), 10,
  'o lead 2 foi respondido em 10 minutos');
select is((select string_agg((x->>'lead_id') || ':' || array_to_string(array(select jsonb_array_elements_text(x->'faltam')), '+'), ',' order by x->>'lead_id')
             from d, jsonb_array_elements(v->'campos_faltando') x),
  '3:segmento+valor,4:telefone,5:motivo', 'cadastro por segmento');
select is((select x->>'etapa' from d, jsonb_array_elements(v->'leads') x where (x->>'lead_id')::int = 1), 'Contato inicial',
  'a lista traz a etapa');
select tests.clear_authentication();

select * from finish();
rollback;

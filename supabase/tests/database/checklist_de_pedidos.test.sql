-- CHECKLIST DE PEDIDOS (migration 20261118010000) — as regras do manual do dono
-- (`docs/manual-checklist-pedidos.md`) pelo caminho que as pessoas percorrem: a vendedora lança e
-- envia pela função; o Financeiro decide, registra pagamento e finaliza com insert + RETURNING
-- (lição 11), como o PostgREST faz.
begin;
\ir _helpers.psql

select plan(29);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-ped-checklist', 'Checklist Pedidos', false) as a;
create temporary table u on commit drop as
select tests.create_user('vendedora@pedck.test', (select a from f)) as vendedora,
       tests.create_user('outra@pedck.test', (select a from f)) as outra,
       tests.create_user('financeiro@pedck.test', (select a from f)) as financeiro;
select tests.grant_module((select vendedora from u), (select a from f), 'comercial');
select tests.grant_module((select outra from u), (select a from f), 'comercial');
select tests.grant_module((select financeiro from u), (select a from f), 'financeiro');
select tests.grant_profile((select financeiro from u), (select a from f), 'financeiro', 'Operador');
-- Empresa nascida depois da migration: o perfil da semente não traz `conferencia` (ponytail
-- registrado na migration) — quem configura marca. Aqui, o que a pessoa marcaria.
update public.access_profiles
   set permissions = permissions || '{"conferencia": {"view": true, "decidir": true, "pagamento": true}}'::jsonb
 where tenant_id = (select a from f) and department = 'financeiro' and name = 'Operador';

insert into public.com_clientes (tenant_id, codigo, razao_social, carteira, origem)
values ((select a from f), '1203', 'ODIEL MOTA SOUSA', 'MG', 'cadastro');
insert into public.com_carteira_membros (tenant_id, user_id, carteira, responsavel)
values ((select a from f), (select vendedora from u), 'MG', true);
grant select on f, u to authenticated;

-- As respostas de um pedido: tudo "Sim", menos o que pede justificativa e o ST ("Não se aplica");
-- `p_troca` muda uma resposta pelo rótulo do item.
create function tests.ped_respostas(p_tenant uuid, p_troca jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object(
           'item_id', i.id,
           'resposta', coalesce(p_troca ->> i.rotulo,
                                case when i.pede_justificativa or i.regra = 'st' then 'Não se aplica' else 'Sim' end)))
    from public.ped_itens i where i.tenant_id = p_tenant and i.ativo;
$$;
create function tests.ped_dados(p_tenant uuid, p_troca jsonb default '{}', p_espelho jsonb default null)
returns jsonb language sql as $$
  select jsonb_build_object('contato', 'Maria', 'rota', 'Rota 1', 'pedidos', jsonb_build_array(
    jsonb_build_object('ordem', 1, 'tipo', 'Venda', 'serie', '1', 'filial', 'MF', 'numero', '5001', 'valor', 100,
                       'espelho', p_espelho, 'respostas', tests.ped_respostas(p_tenant, p_troca)),
    jsonb_build_object('ordem', 2, 'tipo', 'Bonificação', 'serie', '75', 'filial', 'MF', 'numero', '5002', 'valor', 50,
                       'respostas', tests.ped_respostas(p_tenant, '{"Justificar bonificação": "Não se aplica"}'))));
$$;
grant execute on all functions in schema tests to authenticated;

create temporary table ck (interacao uuid, checklist uuid, pedido1 uuid) on commit drop;
create temporary table cnt (n int) on commit drop;
grant select, insert, update, delete on ck, cnt to authenticated;

-- A vendedora lança e envia o checklist.
select tests.authenticate_as('vendedora@pedck.test');
with x as (insert into public.com_interacoes (cliente_codigo, data, status)
           values ('1203', current_date, 'concluido') returning id)
insert into ck (interacao) select id from x;

-- As validações que o sistema antigo só fazia na tela (dívida 5). Rodam no PRIMEIRO envio: depois
-- de enviado o checklist fica com o Financeiro e nem chega à validação (migration 20261120010000).
select throws_ok($$ select public.ped_salvar_checklist((select interacao from ck),
  tests.ped_dados((select a from f), '{"Transportadora": "Não"}')) $$,
  '23514', 'Pedido 1: "Transportadora" está como Não — corrija no Forteplus antes de enviar.',
  'item respondido Nao bloqueia o envio, no banco');
select throws_ok($$ select public.ped_salvar_checklist((select interacao from ck),
  jsonb_set(tests.ped_dados((select a from f)), '{pedidos,0,respostas}',
            (tests.ped_dados((select a from f)) #> '{pedidos,0,respostas}') - 0)) $$,
  '23514', null, 'item sem resposta bloqueia o envio');
select throws_ok($$ select public.ped_salvar_checklist((select interacao from ck),
  tests.ped_dados((select a from f), '{"Justificar cashback": "Sim"}')) $$,
  '23514', 'Pedido 1: "Justificar cashback" pede justificativa.', 'Sim em item que pede justificativa exige o texto');
select throws_ok($$ select public.ped_salvar_checklist((select interacao from ck),
  tests.ped_dados((select a from f), '{}', '{"total": 110, "st": 10}')) $$,
  '23514', null, 'espelho com ST e "Atualizar ST" como Nao se aplica: recusado');
-- A série (20270127070000, dono 2026-10-16): obrigatória e travada com o tipo.
select throws_ok($$ select public.ped_salvar_checklist((select interacao from ck),
  tests.ped_dados((select a from f)) #- '{pedidos,0,serie}') $$,
  '23514', 'Pedido 1: escolha a série do pedido no Forteplus (1, 75 ou 76).', 'pedido sem serie nao envia');
select throws_ok($$ select public.ped_salvar_checklist((select interacao from ck),
  jsonb_set(jsonb_set(tests.ped_dados((select a from f)), '{pedidos,1,tipo}', '"Cashback"'), '{pedidos,1,serie}', '"75"')) $$,
  '23514', 'Pedido 2: Cashback sai na série 76, e o pedido está na série 75. Refaça o pedido no Forteplus na série certa e troque aqui.',
  'cashback na serie 75 e barrado');

update ck set checklist = public.ped_salvar_checklist(interacao, tests.ped_dados((select a from f)));
update ck set pedido1 = (select p.id from public.ped_pedidos p where p.checklist_id = ck.checklist and p.ordem = 1);

-- Enviado, fica com o Financeiro até a decisão (decisão do dono, 2026-10-02).
select throws_ok($$ select public.ped_salvar_checklist((select interacao from ck), tests.ped_dados((select a from f))) $$,
  'P0001', 'Checklist em análise no Financeiro: só pode ser alterado se for devolvido.',
  'em analise a vendedora nao altera o checklist');
select tests.clear_authentication();

select is((select protocolo from public.ped_checklists where id = (select checklist from ck)),
  'CK-' || extract(year from (now() at time zone 'America/Sao_Paulo'))::int || '-00001',
  'o protocolo nasce CK-AAAA-00001, por empresa');
-- Desde 20270123010000 o pedido fechado é "A faturar": o valor da venda só entra com a nota fiscal.
select ok((select valor_venda is null from public.com_interacoes where id = (select interacao from ck)),
  'o checklist nao escreve o valor do pedido como venda (so com a nota fiscal)');

-- Outra vendedora não vê nem mexe.
select tests.authenticate_as('outra@pedck.test');
select is((select count(*)::int from public.ped_checklists_situacao), 0, 'outra vendedora nao ve o checklist');
select throws_ok($$ select public.ped_salvar_checklist((select interacao from ck), tests.ped_dados((select a from f))) $$,
  '42501', null, 'outra vendedora nao envia checklist do lancamento alheio');
select tests.clear_authentication();

-- A vendedora não decide.
select tests.authenticate_as('vendedora@pedck.test');
select throws_ok($$ insert into public.ped_decisoes (checklist_id, status) values ((select checklist from ck), 'Aprovado') returning id $$,
  '42501', null, 'a vendedora nao aprova o proprio checklist');
select tests.clear_authentication();

-- O Financeiro recusa com motivo.
select tests.authenticate_as('financeiro@pedck.test');
with x as (insert into public.ped_decisoes (checklist_id, status, motivos)
           values ((select checklist from ck), 'Recusado', array['Transportadora']) returning id)
insert into cnt select 1 from x;
select is((select situacao from public.ped_checklists_situacao where id = (select checklist from ck)), 'Recusado',
  'o Financeiro recusa (insert com RETURNING) e o checklist fica Recusado');
select throws_ok($$ insert into public.ped_decisoes (checklist_id, status) values ((select checklist from ck), 'Aprovado') $$,
  'P0001', null, 'decidir de novo na mesma versao e recusado');
select throws_ok($$ insert into public.ped_pagamentos (checklist_id, status) values ((select checklist from ck), 'Em negociação') $$,
  'P0001', null, 'pagamento antes da aprovacao e recusado');
select tests.clear_authentication();

-- A vendedora corrige e reenvia: versão sobe, volta a Em análise, a recusa fica contada.
select tests.authenticate_as('vendedora@pedck.test');
select public.ped_salvar_checklist((select interacao from ck), tests.ped_dados((select a from f)));
select is((select versao || '|' || situacao || '|' || recusas from public.ped_checklists_situacao where id = (select checklist from ck)),
  '2|Em análise|1', 'editar sobe a versao, volta a Em analise sozinho e a recusa continua contada');
select is((select p.id from public.ped_pedidos p where p.checklist_id = (select checklist from ck) and p.ordem = 1),
  (select pedido1 from ck), 'editar atualiza o pedido em vez de apagar e reinserir (divida 7)');
select tests.clear_authentication();

-- O Financeiro aprova: fica Em negociação.
select tests.authenticate_as('financeiro@pedck.test');
with x as (insert into public.ped_decisoes (checklist_id, status)
           values ((select checklist from ck), 'Aprovado') returning id)
insert into cnt select 1 from x;
select is((select situacao || '|' || pagamento_status from public.ped_checklists_situacao where id = (select checklist from ck)),
  'Aprovado|Em negociação', 'aprovado fica Em negociacao');
select ok((select snapshot is not null from public.ped_decisoes where checklist_id = (select checklist from ck) and status = 'Aprovado'),
  'a decisao guarda a foto dos pedidos daquela versao');
select tests.clear_authentication();

select tests.authenticate_as('vendedora@pedck.test');
select throws_ok($$ select public.ped_salvar_checklist((select interacao from ck), tests.ped_dados((select a from f))) $$,
  'P0001', 'Checklist já aprovado não pode ser alterado.', 'aprovado nao se edita');
select tests.clear_authentication();

select tests.authenticate_as('financeiro@pedck.test');
select throws_ok($$ insert into public.ped_finalizacoes (checklist_id) values ((select checklist from ck)) $$,
  'P0001', null, 'finalizar sem pagamento confirmado e recusado');
with x as (insert into public.ped_pagamentos (checklist_id, status, data_pagamento)
           values ((select checklist from ck), 'Pago', current_date) returning id)
insert into cnt select 1 from x;
select throws_ok($$ insert into public.ped_pagamentos (checklist_id, status) values ((select checklist from ck), 'Em negociação') $$,
  'P0001', null, 'depois de Pago o pagamento nao volta atras');
-- Pago, mas os pedidos ainda sem a nota: não finaliza ("trava o pedido até corrigir", dono 2026-10-16).
select throws_ok($$ insert into public.ped_finalizacoes (checklist_id) values ((select checklist from ck)) $$,
  'P0001', null, 'pedido sem o Nº da nota nao deixa finalizar');
select tests.clear_authentication();

-- A nota 9001 chegou do Forteplus na série 75; o pedido de venda disse série 1.
with imp as (insert into public.com_vendas_importacoes (tenant_id, tipo, file_name, linhas_lidas)
             values ((select a from f), 'vendas', 'fixture-serie.xlsx', 2) returning id)
insert into public.com_vendas_itens (tenant_id, importacao_id, filial, emissao, documento, serie, cfop, classe,
                                     cliente_codigo, produto_codigo, produto_nome, quantidade, valor_nota)
select (select a from f), imp.id, 'MF', current_date, v.doc, v.serie, '5101', 'venda', '1203', 'P1', 'Produto', 1, 100
  from imp, (values ('9001', '75'), ('9003', '1')) v(doc, serie);

select tests.authenticate_as('vendedora@pedck.test');
select public.ped_informar_nota((select pedido1 from ck), '009001');
select public.ped_informar_nota((select p.id from public.ped_pedidos p where p.checklist_id = (select checklist from ck) and p.ordem = 2), '9002');
select is((select string_agg(situacao, '|' order by ordem) from public.ped_situacao_das_notas((select checklist from ck))),
  'divergente|aguardando_importacao', 'a nota 9001 saiu na serie 75 (diverge) e a 9002 ainda nao chegou');
select tests.clear_authentication();

select tests.authenticate_as('financeiro@pedck.test');
select throws_ok($$ insert into public.ped_finalizacoes (checklist_id) values ((select checklist from ck)) $$,
  'P0001', null, 'nota na serie errada nao deixa finalizar');
-- Corrigido no Forteplus (nota 9003, série 1): finaliza; a 9002 ainda não importada não trava.
select public.ped_informar_nota((select pedido1 from ck), '9003');
select is((select situacao from public.ped_situacao_das_notas((select checklist from ck)) where ordem = 1), 'ok',
  'o Financeiro informa a nota certa e ela confere');
with x as (insert into public.ped_finalizacoes (checklist_id) values ((select checklist from ck)) returning checklist_id)
insert into cnt select 1 from x;
select is((select situacao from public.ped_checklists_situacao where id = (select checklist from ck)), 'Finalizado',
  'aprovado e pago, finaliza');

-- Só-inserção: update e delete afetam zero linhas (lição 12).
delete from cnt;
with m as (update public.ped_decisoes set observacao = 'mexi' where checklist_id = (select checklist from ck) returning 1)
insert into cnt select count(*) from m;
with m as (delete from public.ped_pagamentos where checklist_id = (select checklist from ck) returning 1)
insert into cnt select count(*) from m;
select is((select sum(n)::int from cnt), 0, 'decisao e pagamento nao se editam nem se apagam');
select tests.clear_authentication();

select ok(not has_function_privilege('anon', 'public.ped_salvar_checklist(uuid, jsonb)', 'execute'),
  'anon nao alcanca a funcao de gravar');

select * from finish();
rollback;

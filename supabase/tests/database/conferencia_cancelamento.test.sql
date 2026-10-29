-- CANCELAR O CHECKLIST (migration 20270212100000, dono 2026-10-29): definitivo, com motivo, só com a caixinha
-- "Cancelar checklist"; o Comercial é avisado; o lançamento sai das contas do Comercial e a Conferência conta à parte.
begin;
\ir _helpers.psql

select plan(19);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-ped-cancela', 'Cancela Pedidos', false) as a;
create temporary table u on commit drop as
select tests.create_user('vendedora@cancela.test', (select a from f)) as vendedora,
       tests.create_user('operador@cancela.test', (select a from f)) as operador,
       tests.create_user('gestorfin@cancela.test', (select a from f)) as gestorfin;
select tests.grant_module((select vendedora from u), (select a from f), 'comercial');
select tests.grant_module((select operador from u), (select a from f), 'financeiro');
select tests.grant_profile((select operador from u), (select a from f), 'financeiro', 'Operador');
select tests.grant_module((select gestorfin from u), (select a from f), 'financeiro');
select tests.grant_profile((select gestorfin from u), (select a from f), 'financeiro', 'Gestor');
update public.access_profiles
   set permissions = permissions || '{"conferencia": {"view": true, "decidir": true, "pagamento": true}}'::jsonb
 where tenant_id = (select a from f) and department = 'financeiro' and name = 'Operador';
update public.access_profiles
   set permissions = permissions || '{"conferencia": {"view": true, "decidir": true, "pagamento": true, "cancelar": true}}'::jsonb
 where tenant_id = (select a from f) and department = 'financeiro' and name = 'Gestor';

insert into public.com_clientes (tenant_id, codigo, razao_social, carteira, origem)
values ((select a from f), '1203', 'CLIENTE CANCELA', 'MG', 'cadastro');
insert into public.com_carteira_membros (tenant_id, user_id, carteira, responsavel)
values ((select a from f), (select vendedora from u), 'MG', true);
grant select on f, u to authenticated;

create function tests.canc_dados(p_tenant uuid)
returns jsonb language sql as $$
  select jsonb_build_object('contato', 'Maria', 'pedidos', jsonb_build_array(
    jsonb_build_object('ordem', 1, 'tipo', 'Venda', 'serie', '1', 'filial', 'MF', 'numero', '8001', 'valor', 250,
      'respostas', (select jsonb_agg(jsonb_build_object('item_id', i.id,
                      'resposta', case when i.pede_justificativa or i.regra = 'st' then 'Não se aplica' else 'Sim' end))
                      from public.ped_itens i where i.tenant_id = p_tenant and i.ativo))));
$$;
grant execute on all functions in schema tests to authenticated;

create temporary table ck (interacao uuid, checklist uuid) on commit drop;
create temporary table cnt (n int) on commit drop;
grant select, insert, update, delete on ck, cnt to authenticated;

-- Lançado, enviado, aprovado e com um reajuste aberto.
select tests.authenticate_as('vendedora@cancela.test');
with x as (insert into public.com_interacoes (cliente_codigo, data, status) values ('1203', current_date, 'concluido') returning id)
insert into ck (interacao) select id from x;
update ck set checklist = public.ped_salvar_checklist(interacao, tests.canc_dados((select a from f)));
select tests.clear_authentication();
select tests.authenticate_as('operador@cancela.test');
with x as (insert into public.ped_decisoes (checklist_id, status) values ((select checklist from ck), 'Aprovado') returning id)
insert into cnt select 1 from x;
select tests.clear_authentication();
select tests.authenticate_as('vendedora@cancela.test');
select public.ped_pedir_reajuste((select checklist from ck), 'Cliente desistiu de um item');
select is((select count(*)::int from public.com_interacoes_que_contam where id = (select interacao from ck)), 1,
  'antes do cancelamento o lancamento conta');
select tests.clear_authentication();

-- Quem cancela, e com que motivo.
select tests.authenticate_as('operador@cancela.test');
select throws_ok($$ insert into public.ped_cancelamentos (checklist_id, motivo) values ((select checklist from ck), 'O cliente desistiu do pedido') returning checklist_id $$,
  '42501', null, 'sem a caixinha "Cancelar checklist" nao se cancela (o Operador aprova, mas nao cancela)');
select tests.clear_authentication();

select tests.authenticate_as('gestorfin@cancela.test');
select throws_ok($$ insert into public.ped_cancelamentos (checklist_id, motivo) values ((select checklist from ck), 'curto') returning checklist_id $$,
  '23514', null, 'cancelar exige justificativa (ao menos 10 letras)');
with x as (insert into public.ped_cancelamentos (checklist_id, motivo)
           values ((select checklist from ck), 'O cliente desistiu do pedido inteiro') returning checklist_id)
insert into cnt select 1 from x;
select is((select situacao || '|' || coalesce(pagamento_status, '-') || '|' || cancelamento_motivo
             from public.ped_checklists_situacao where id = (select checklist from ck)),
  'Cancelado|-|O cliente desistiu do pedido inteiro', 'cancelado: a situacao vira Cancelado, com o motivo');
select throws_ok($$ insert into public.ped_cancelamentos (checklist_id, motivo) values ((select checklist from ck), 'de novo, outra vez') $$,
  'P0001', null, 'nao se cancela duas vezes');
select throws_ok($$ insert into public.ped_decisoes (checklist_id, status, motivos) values ((select checklist from ck), 'Recusado', array['Outro']) $$,
  'P0001', null, 'cancelado nao recebe decisao');
select throws_ok($$ insert into public.ped_pagamentos (checklist_id, status, data_pagamento) values ((select checklist from ck), 'Pago', current_date) $$,
  'P0001', null, 'cancelado nao recebe pagamento');
delete from cnt;
with m as (delete from public.ped_cancelamentos where checklist_id = (select checklist from ck) returning 1)
insert into cnt select count(*) from m;
select is((select sum(n)::int from cnt), 0, 'o cancelamento nao se apaga: e definitivo');
select is((select ped_indicadores -> 'cancelado' ->> 'qtd' from (select public.ped_indicadores(current_date - 1, current_date + 1)) x),
  '1', 'nos indicadores da Conferencia o cancelado aparece a parte');
select is((select ped_indicadores -> 'registrado' ->> 'qtd' from (select public.ped_indicadores(current_date - 1, current_date + 1)) x),
  '0', 'e sai das somas de registrado');
select tests.clear_authentication();

select is((select status || '|' || left(resposta, 35) from public.ped_reajustes where checklist_id = (select checklist from ck)),
  'recusado|Checklist cancelado pelo Financeiro', 'o reajuste aberto e fechado pelo cancelamento');
select is((select count(*)::int from public.notifications where user_id = (select vendedora from u) and reference_type = 'ped_cancelado'), 1,
  'a vendedora e avisada do cancelamento, com o motivo');

-- A vendedora: nada mais muda, e o lançamento sai das contas.
select tests.authenticate_as('vendedora@cancela.test');
select throws_ok($$ select public.ped_salvar_checklist((select interacao from ck), tests.canc_dados((select a from f))) $$,
  'P0001', null, 'a vendedora nao edita o checklist cancelado');
select throws_ok($$ select public.ped_pedir_reajuste((select checklist from ck), 'quero reabrir') $$,
  'P0001', null, 'nem pede reajuste dele');
select throws_ok($$ select public.ped_informar_nota((select p.id from public.ped_pedidos p where p.checklist_id = (select checklist from ck)), '123') $$,
  'P0001', null, 'nem troca a nota');
select is((select pedido_cancelado from public.com_interacoes where id = (select interacao from ck)), true,
  'o lancamento fica registrado, marcado "pedido cancelado"');
select is((select count(*)::int from public.com_interacoes_que_contam where id = (select interacao from ck)), 0,
  'e sai das contas do Comercial (nao sobe para os indicadores dela)');
select throws_ok($$ update public.com_interacoes set pedido_cancelado = false where id = (select interacao from ck) $$,
  '42501', null, 'a marca nao se tira pela tela');
select tests.clear_authentication();

select ok(not has_function_privilege('anon', 'public.ped_pode_cancelar()', 'execute'),
  'anon nao alcanca a funcao de cancelar');

select * from finish();
rollback;

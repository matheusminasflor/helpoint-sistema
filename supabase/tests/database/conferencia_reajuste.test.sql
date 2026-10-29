-- O COMERCIAL PEDE REAJUSTE (migration 20270212090000, dono 2026-10-29), pelo caminho das pessoas: a vendedora e o
-- gestor pedem pela função; o Financeiro responde pela função ou devolve pelo botão (insert com RETURNING, lição 11).
-- Vários reajustes no mesmo checklist: um por vez, cada um no histórico, e a conta de recusas não se mistura.
begin;
\ir _helpers.psql

select plan(19);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-ped-reajuste', 'Reajuste Pedidos', false) as a;
create temporary table u on commit drop as
select tests.create_user('vendedora@reajuste.test', (select a from f)) as vendedora,
       tests.create_user('outra@reajuste.test', (select a from f)) as outra,
       tests.create_user('gestor@reajuste.test', (select a from f)) as gestor,
       tests.create_user('financeiro@reajuste.test', (select a from f)) as financeiro;
select tests.grant_module((select vendedora from u), (select a from f), 'comercial');
select tests.grant_module((select outra from u), (select a from f), 'comercial');
select tests.grant_module((select gestor from u), (select a from f), 'comercial');
select tests.grant_profile((select gestor from u), (select a from f), 'comercial', 'Gestor');
select tests.grant_module((select financeiro from u), (select a from f), 'financeiro');
select tests.grant_profile((select financeiro from u), (select a from f), 'financeiro', 'Operador');
update public.access_profiles
   set permissions = permissions || '{"conferencia": {"view": true, "decidir": true, "pagamento": true}}'::jsonb
 where tenant_id = (select a from f) and department = 'financeiro' and name = 'Operador';
update public.access_profiles
   set permissions = permissions || '{"carteiras": {"view": true, "gerir": true}}'::jsonb
 where tenant_id = (select a from f) and department = 'comercial' and name = 'Gestor';

insert into public.com_clientes (tenant_id, codigo, razao_social, carteira, origem)
values ((select a from f), '1203', 'CLIENTE REAJUSTE', 'MG', 'cadastro');
insert into public.com_carteira_membros (tenant_id, user_id, carteira, responsavel)
values ((select a from f), (select vendedora from u), 'MG', true);
grant select on f, u to authenticated;

create function tests.reaj_dados(p_tenant uuid)
returns jsonb language sql as $$
  select jsonb_build_object('contato', 'Maria', 'pedidos', jsonb_build_array(
    jsonb_build_object('ordem', 1, 'tipo', 'Venda', 'serie', '1', 'filial', 'MF', 'numero', '7001', 'valor', 100,
      'respostas', (select jsonb_agg(jsonb_build_object('item_id', i.id,
                      'resposta', case when i.pede_justificativa or i.regra = 'st' then 'Não se aplica' else 'Sim' end))
                      from public.ped_itens i where i.tenant_id = p_tenant and i.ativo))));
$$;
grant execute on all functions in schema tests to authenticated;

create temporary table ck (interacao uuid, checklist uuid) on commit drop;
create temporary table cnt (n int) on commit drop;
grant select, insert, update, delete on ck, cnt to authenticated;

-- A vendedora lança e envia; o Financeiro aprova.
select tests.authenticate_as('vendedora@reajuste.test');
with x as (insert into public.com_interacoes (cliente_codigo, data, status) values ('1203', current_date, 'concluido') returning id)
insert into ck (interacao) select id from x;
update ck set checklist = public.ped_salvar_checklist(interacao, tests.reaj_dados((select a from f)));
select throws_ok($$ select public.ped_pedir_reajuste((select checklist from ck), 'trocar a tabela') $$,
  'P0001', null, 'em analise nao se pede reajuste (o Financeiro ainda decide)');
select tests.clear_authentication();

select tests.authenticate_as('financeiro@reajuste.test');
with x as (insert into public.ped_decisoes (checklist_id, status) values ((select checklist from ck), 'Aprovado') returning id)
insert into cnt select 1 from x;
select tests.clear_authentication();

-- Quem pede.
select tests.authenticate_as('outra@reajuste.test');
select throws_ok($$ select public.ped_pedir_reajuste((select checklist from ck), 'trocar a tabela') $$,
  '42501', null, 'outra vendedora nao pede reajuste do checklist alheio');
select tests.clear_authentication();

select tests.authenticate_as('vendedora@reajuste.test');
select throws_ok($$ select public.ped_pedir_reajuste((select checklist from ck), '  ') $$,
  '23514', null, 'reajuste sem motivo e recusado');
select lives_ok($$ select public.ped_pedir_reajuste((select checklist from ck), 'Tabela de preço errada') $$,
  'a vendedora pede reajuste do checklist aprovado');
select throws_ok($$ select public.ped_pedir_reajuste((select checklist from ck), 'de novo') $$,
  'P0001', null, 'um pedido por vez: o segundo espera o primeiro ser respondido');
select throws_ok($$ insert into public.ped_reajustes (tenant_id, checklist_id, versao, motivo)
                    values ((select a from f), (select checklist from ck), 1, 'por fora') $$,
  '42501', null, 'ninguem grava reajuste fora da funcao');
select throws_ok($$ select public.ped_responder_reajuste((select id from public.ped_reajustes where status = 'pendente'), true, null) $$,
  '42501', null, 'a vendedora nao responde o proprio reajuste');
select tests.clear_authentication();

select is((select count(*)::int from public.notifications where user_id = (select financeiro from u) and reference_type = 'ped_reajuste'), 1,
  'quem confere no Financeiro e avisado do pedido');

-- O Financeiro recusa: precisa do motivo; o checklist fica como estava.
select tests.authenticate_as('financeiro@reajuste.test');
select is((select reajuste_pendente ->> 'motivo' from public.ped_checklists_situacao where id = (select checklist from ck)),
  'Tabela de preço errada', 'o Financeiro ve o pedido aberto com o motivo');
select throws_ok($$ select public.ped_responder_reajuste((select id from public.ped_reajustes where status = 'pendente'), false, '') $$,
  '23514', null, 'recusar o reajuste exige o motivo do Financeiro');
select public.ped_responder_reajuste((select id from public.ped_reajustes where status = 'pendente'), false, 'A tabela está certa no Forteplus');
select is((select situacao || '|' || recusas || '|' || reajustes from public.ped_checklists_situacao where id = (select checklist from ck)),
  'Aprovado|0|0', 'recusado, o checklist continua aprovado e nada conta');
select tests.clear_authentication();

select is((select count(*)::int from public.notifications where user_id = (select vendedora from u) and reference_type = 'ped_reajuste_resposta'), 1,
  'a vendedora e avisada da resposta');

-- O gestor pede de novo; o Financeiro aceita: devolve, e conta como reajuste, nao como recusa.
select tests.authenticate_as('gestor@reajuste.test');
select lives_ok($$ select public.ped_pedir_reajuste((select checklist from ck), 'Cliente pediu outra transportadora') $$,
  'o gestor do Comercial pede reajuste pela vendedora');
select tests.clear_authentication();

select tests.authenticate_as('financeiro@reajuste.test');
select public.ped_responder_reajuste((select id from public.ped_reajustes where status = 'pendente'), true, 'ok, corrija');
select is((select situacao || '|' || recusas || '|' || reajustes || '|' || (reajuste_pendente is null)
             from public.ped_checklists_situacao where id = (select checklist from ck)),
  'Recusado|0|1|true', 'aceito: volta ao Comercial, conta 1 reajuste e 0 recusa');
select is((select string_agg(x ->> 'status', '|' order by ord) from public.ped_checklists_situacao s,
                  jsonb_array_elements(s.historico_reajustes) with ordinality as h(x, ord) where s.id = (select checklist from ck)),
  'recusado|aceito', 'os dois pedidos ficam no historico, na ordem');
select tests.clear_authentication();

-- A vendedora corrige; o Financeiro aprova; um terceiro pedido e atendido pelo botao "Devolver ao Comercial".
select tests.authenticate_as('vendedora@reajuste.test');
select public.ped_salvar_checklist((select interacao from ck), tests.reaj_dados((select a from f)));
select tests.clear_authentication();

select tests.authenticate_as('financeiro@reajuste.test');
with x as (insert into public.ped_decisoes (checklist_id, status) values ((select checklist from ck), 'Aprovado') returning id)
insert into cnt select 1 from x;
select tests.clear_authentication();
select tests.authenticate_as('vendedora@reajuste.test');
select public.ped_pedir_reajuste((select checklist from ck), 'Faltou o desconto');
select tests.clear_authentication();
select tests.authenticate_as('financeiro@reajuste.test');
with x as (insert into public.ped_decisoes (checklist_id, status, motivos) values ((select checklist from ck), 'Recusado', array['Valor divergente']) returning id)
insert into cnt select 1 from x;
select is((select count(*)::int from public.ped_reajustes where checklist_id = (select checklist from ck) and status = 'pendente'), 0,
  'devolver pelo botao fecha o pedido aberto: nenhum fica orfao');
select is((select reajustes || '|' || recusas from public.ped_checklists_situacao where id = (select checklist from ck)),
  '2|0', 'e ele conta como o segundo reajuste aceito');

-- Os indicadores separam as duas contas.
select is((select (x ->> 'recusas') || '|' || (x ->> 'reajustes')
             from jsonb_array_elements(public.ped_indicadores(current_date - 1, current_date + 1) -> 'por_vendedora') x
            where x ->> 'vendedor_id' = (select vendedora::text from u)),
  '0|2', 'nos indicadores da vendedora: 0 recusa do Financeiro, 2 reajustes');
select tests.clear_authentication();

select ok(not has_function_privilege('anon', 'public.ped_pedir_reajuste(uuid, text)', 'execute')
          and not has_function_privilege('anon', 'public.ped_responder_reajuste(uuid, boolean, text)', 'execute'),
  'anon nao alcanca as funcoes do reajuste');

select * from finish();
rollback;

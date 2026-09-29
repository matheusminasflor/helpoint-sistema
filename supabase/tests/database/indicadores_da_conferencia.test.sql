-- OS INDICADORES DA CONFERÊNCIA DE PEDIDOS (migration 20261118020000) — o painel 18.4 do dono.
-- Dois checklists no dia: A (Venda 100 + Bonificação 50) é recusado, corrigido, aprovado e pago;
-- B (Venda 300) fica em análise. E uma nota fiscal do cliente de A.
begin;
\ir _helpers.psql

select plan(4);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-ped-indicadores', 'Indicadores Pedidos', false) as a,
       (now() at time zone 'America/Sao_Paulo')::date as hoje;
create temporary table u on commit drop as
select tests.create_user('vendedora@pedind.test', (select a from f)) as vendedora,
       tests.create_user('financeiro@pedind.test', (select a from f)) as financeiro;
select tests.grant_module((select vendedora from u), (select a from f), 'comercial');
select tests.grant_module((select financeiro from u), (select a from f), 'financeiro');
select tests.grant_profile((select financeiro from u), (select a from f), 'financeiro', 'Operador');
update public.access_profiles
   set permissions = permissions || '{"conferencia": {"view": true, "decidir": true, "pagamento": true}}'::jsonb
 where tenant_id = (select a from f) and department = 'financeiro' and name = 'Operador';

insert into public.com_clientes (tenant_id, codigo, razao_social, carteira, origem) values
  ((select a from f), '1203', 'CLIENTE A', 'MG', 'cadastro'),
  ((select a from f), '1204', 'CLIENTE B', 'MG', 'cadastro');
insert into public.com_carteira_membros (tenant_id, user_id, carteira, responsavel)
values ((select a from f), (select vendedora from u), 'MG', true);

create temporary table imp on commit drop as
with nova as (
  insert into public.com_vendas_importacoes (tenant_id, tipo, file_name, linhas_lidas)
  select a, 'vendas', 'pgtap-conferencia.xls', 1 from f
  returning id
)
select id from nova;
insert into public.com_vendas_itens
  (tenant_id, importacao_id, filial, emissao, documento, serie, cfop, classe,
   cliente_codigo, produto_codigo, produto_nome, quantidade, valor_nota)
select (select a from f), (select id from imp), 'MF', (select hoje from f), 'N1', '1', '5102', 'venda',
       '1203', 'P1', 'Produto', 1, 120;
grant select on f, u to authenticated;

create function tests.ped_respostas(p_tenant uuid)
returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('item_id', i.id,
           'resposta', case when i.pede_justificativa or i.regra = 'st' then 'Não se aplica' else 'Sim' end))
    from public.ped_itens i where i.tenant_id = p_tenant and i.ativo;
$$;
create function tests.ped_pedido(p_ordem int, p_tipo text, p_valor numeric, p_tenant uuid)
returns jsonb language sql as $$
  select jsonb_build_object('ordem', p_ordem, 'tipo', p_tipo, 'filial', 'MF', 'numero', 'N' || p_ordem,
                            'valor', p_valor, 'respostas', tests.ped_respostas(p_tenant));
$$;
grant execute on all functions in schema tests to authenticated;

create temporary table ck (nome text, interacao uuid, checklist uuid) on commit drop;
grant select, insert, update on ck to authenticated;

select tests.authenticate_as('vendedora@pedind.test');
with x as (insert into public.com_interacoes (cliente_codigo, data, status) values
             ('1203', (select hoje from f), 'concluido'), ('1204', (select hoje from f), 'concluido')
           returning id, cliente_codigo)
insert into ck (nome, interacao) select case cliente_codigo when '1203' then 'A' else 'B' end, id from x;
update ck set checklist = public.ped_salvar_checklist(interacao, jsonb_build_object('contato', 'Maria', 'pedidos',
  case nome when 'A' then jsonb_build_array(tests.ped_pedido(1, 'Venda', 100, (select a from f)),
                                            tests.ped_pedido(2, 'Bonificação', 50, (select a from f)))
            else jsonb_build_array(tests.ped_pedido(1, 'Venda', 300, (select a from f))) end));
select tests.clear_authentication();

select tests.authenticate_as('financeiro@pedind.test');
insert into public.ped_decisoes (checklist_id, status, motivos)
select checklist, 'Recusado', array['Transportadora'] from ck where nome = 'A';
select tests.clear_authentication();
select tests.authenticate_as('vendedora@pedind.test');
select public.ped_salvar_checklist(interacao, jsonb_build_object('contato', 'Maria', 'pedidos',
  jsonb_build_array(tests.ped_pedido(1, 'Venda', 100, (select a from f)), tests.ped_pedido(2, 'Bonificação', 50, (select a from f)))))
  from ck where nome = 'A';
select tests.clear_authentication();
select tests.authenticate_as('financeiro@pedind.test');
insert into public.ped_decisoes (checklist_id, status) select checklist, 'Aprovado' from ck where nome = 'A';
insert into public.ped_pagamentos (checklist_id, status, data_pagamento) select checklist, 'Pago', (select hoje from f) from ck where nome = 'A';

create temporary table r on commit drop as select public.ped_indicadores((select hoje from f), (select hoje from f)) as j;
select tests.clear_authentication();

select is(
  (select j - 'faturado' - 'por_cliente' from r),
  '{"registrado": {"qtd": 2, "valor": 400}, "conciliado": {"qtd": 1, "valor": 100},
    "pendente": {"qtd": 1, "valor": 300}, "divergente": {"qtd": 1, "valor": 100},
    "recebido": {"qtd": 1, "valor": 100}, "percentual_conciliacao": 25.0,
    "motivos": [{"motivo": "Transportadora", "vezes": 1}]}'::jsonb,
  'registrado, conciliado, pendente, divergente, recebido, % e motivos — so pedidos tipo Venda somam');
select is((select (j ->> 'faturado')::numeric from r),
  (select sum(valor_curva) from public.com_vendas_itens where tenant_id = (select a from f)),
  'faturado e a nota fiscal do Forteplus dos clientes com checklist no periodo');
select is(
  (select jsonb_agg(c - 'nome' - 'faturado' order by c ->> 'codigo') from r, jsonb_array_elements(j -> 'por_cliente') c),
  '[{"codigo": "1203", "registrado": 100, "conciliado": 100, "recebido": 100},
    {"codigo": "1204", "registrado": 300, "conciliado": 0, "recebido": 0}]'::jsonb,
  'por cliente: registrado, conciliado e recebido lado a lado');

select tests.authenticate_as('vendedora@pedind.test');
select throws_ok($$ select public.ped_indicadores(current_date, current_date) $$, '42501', null,
  'a vendedora nao ve os indicadores da conferencia');
select tests.clear_authentication();

select * from finish();
rollback;

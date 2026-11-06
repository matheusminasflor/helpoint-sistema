-- VENDA TOTAL DA CONDIÇÃO (migration 20270212390000; dono, 2026-11-05).
--   1-4  a regra: as três tabelas contam de outubro de 2026 em diante, as outras não
--   5    a nota importada continua igual ao Forteplus
--   6    a Carteira lê o dobro para o cliente condição e o normal para o outro
--   7-9  a composição devolve Faturado, Condição e Venda total
--  10    setembro de 2026 não muda
--  11    o realizado da vendedora lê a Venda total
--  12    o realizado da Diretoria lê a Venda total
--  13    o cashback do mês lê a Venda total
begin;
\ir _helpers.psql

select plan(13);

select is(public.com_parte_da_condicao('VIP CONDICAO', '2026-10-01'), 1::numeric, 'VIP CONDICAO conta em outubro');
select is(public.com_parte_da_condicao('ATACADISTA CONDIÇÃO', '2026-12-31'), 1::numeric, 'com acento tambem conta');
select is(public.com_parte_da_condicao('VIP MAIS CONDICAO', '2026-09-30'), 0::numeric, 'antes de outubro nao conta');
select is(public.com_parte_da_condicao('VIP MAIS', '2026-10-01'), 0::numeric, 'outra tabela nao conta');

create temporary table f on commit drop as select tests.create_tenant('pgtap-condicao', 'Condicao', false) as a;
create temporary table u on commit drop as select tests.create_user('dono@condicao.test', (select a from f)) as dono;
select tests.grant_role((select dono from u), 'owner');
grant select on f, u to authenticated;

select tests.authenticate_as('dono@condicao.test');
select public.com_importar_vendas(
  'MF', 'fixture-condicao.xlsx', 3, '{}'::jsonb,
  $items$[
    {"emissao":"2026-10-05","documento":"1","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C1","cliente_nome":"Condicao","produto_codigo":"P","produto_nome":"Produto","quantidade":1,"valor_nota":1000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend"},
    {"emissao":"2026-10-06","documento":"2","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C2","cliente_nome":"Normal","produto_codigo":"P","produto_nome":"Produto","quantidade":1,"valor_nota":500,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend"},
    {"emissao":"2026-09-05","documento":"3","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C1","cliente_nome":"Condicao","produto_codigo":"P","produto_nome":"Produto","quantidade":1,"valor_nota":300,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend"}
  ]$items$::jsonb, false);
select tests.clear_authentication();

update public.com_clientes set carteira = 'X', tabela_preco = case codigo when 'C1' then 'VIP CONDICAO' else 'VIP MAIS' end
 where tenant_id = (select a from f);
insert into public.com_carteira_membros (tenant_id, user_id, carteira, responsavel) values ((select a from f), (select dono from u), 'X', true);
insert into public.com_faixas_cashback (tenant_id, tabela_base, valor_minimo, percentual) values ((select a from f), 'VIP', 0, 10);

select tests.authenticate_as('dono@condicao.test');
select is((select sum(valor_curva)::numeric from public.com_vendas_itens where cliente_codigo = 'C1' and emissao >= '2026-10-01'), 1000::numeric, 'a nota importada nao muda');
select is((select sum(valor)::numeric from public.com_vendas_unificadas(array['C1', 'C2'], '2026-10-01', '2026-11-01', null)), 2500::numeric, 'a Carteira le a Venda total');
select is((select faturado from public.com_composicao_da_venda('2026-10-01', '2026-10-31')), 1500::numeric, 'Faturado');
select is((select condicao from public.com_composicao_da_venda('2026-10-01', '2026-10-31')), 1000::numeric, 'Condicao');
select is((select venda_total from public.com_composicao_da_venda('2026-10-01', '2026-10-31')), 2500::numeric, 'Venda total');
select is((select venda_total from public.com_composicao_da_venda('2026-09-01', '2026-09-30')), 300::numeric, 'setembro nao muda');
select is((select sum(faturado)::numeric from public.com_venda_atribuida('2026-10-01', '2026-10-31')), 2500::numeric, 'o realizado da vendedora le a Venda total');
select is((select sum(realizado)::numeric from public.dir_realizado_carteiras(array[2026]) where mes = 10), 2500::numeric, 'a Diretoria le a Venda total');
select is((select cashback::numeric from public.com_cashback_mensal(2026, null, 'C1') where competencia = '2026-10-01'), 200::numeric, 'o cashback le a Venda total');

select * from finish();
rollback;

-- Frente 5b — a Conciliação sem o valor digitado
-- (.scratch/plano-frente5-ficha-e-conciliacao.md, seção "5b. A
-- Conciliação"). `com_conciliacao(p_ano)` passou a ler `total_realizado`
-- de `metas_ano` em vez de receber `p_apresentacao` digitado, e a
-- comparação do lado do ERP cobre só os meses com `total_realizado`
-- informado — nunca o ano inteiro (a armadilha dos meses desiguais). Ver
-- a migration 20261024010000_comercial_conciliacao_sem_apresentacao.sql.
--
-- Cada asserção usa um ano próprio, para que a mutação que prova uma não
-- vaze para as outras (ver comentário de cada bloco).
begin;
\ir _helpers.psql

select plan(6);

-- Dois tenants: o principal e um segundo, que existe só para provar o
-- isolamento (blocos 5 e 6). `com_conciliacao` é SECURITY DEFINER — ela
-- roda com os poderes de quem a criou, e a RLS de `metas_ano` e
-- `com_vendas_itens` NÃO a alcança. Quem separa as empresas ali dentro
-- são os dois `tenant_id = get_user_tenant_id()` escritos na própria
-- função, e é isso que os dois últimos blocos exercitam.
create temporary table f on commit drop as
select tests.create_tenant('com-conciliacao', 'Comercial Conciliacao', false) as tenant,
       tests.create_tenant('com-conciliacao-outro', 'Comercial Conciliacao Outro', false) as outro_tenant;

create temporary table u on commit drop as
select tests.create_user('owner@com-conciliacao.test', (select tenant from f)) as owner,
       tests.create_user('owner@com-conciliacao-outro.test', (select outro_tenant from f)) as owner_outro;

select tests.grant_role((select owner from u), 'owner');
select tests.grant_role((select owner_outro from u), 'owner');

grant select on f, u to authenticated;

select tests.authenticate_as('owner@com-conciliacao.test');

insert into public.com_clientes (codigo, razao_social, tabela_preco, ativo) values
  ('C1', 'Cliente Um', 'ATACADISTA', true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Ano com `total_realizado` informado devolve a diferença certa — sem
-- arredondar, sem esconder. Ano 2026, um único mês (6): sem mês importado
-- fora do informado, isola esta asserção da armadilha dos meses desiguais
-- (bloco 3).
--
-- Mutação (rodada e confirmada): trocar `erp.venda_liquida + erp.bonificacao
-- as soma` por `0::numeric as soma` na função faz esta asserção acusar —
-- `diferenca` passa a ser 900.00 em vez de -150.00. Função restaurada à
-- definição da migration antes de seguir.
-- ═══════════════════════════════════════════════════════════════════════════
select public.com_importar_vendas('MF', 'fixture-conciliacao-1.xlsx', 2, '{}'::jsonb,
  $items$[
    {"emissao":"2026-06-10","documento":"9501","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C1","cliente_nome":"Cliente Um","produto_codigo":"PCONC","produto_nome":"Produto Conciliação","quantidade":1,"valor_nota":1000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2026-06-15","documento":"9502","serie":"1","tipo_documento":"NFe","cfop":"5910","classe":"bonificacao","cliente_codigo":"C1","cliente_nome":"Cliente Um","produto_codigo":"PCONC","produto_nome":"Produto Conciliação","quantidade":1,"valor_nota":50.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb, false);

insert into public.metas_ano (ano, mes, total_realizado) values (2026, 6, 900.00);

select is(
  (select diferenca from public.com_conciliacao(2026)),
  900.00 - (1000.00 + 50.00),
  'com_conciliacao: diferença certa (informado − soma), sem meses a mais nem a menos'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Ano sem nenhum mês informado nas metas devolve `informado` e
-- `diferenca` NULOS, nunca zero — "sem dado" é diferente de "diferença
-- zero" (a regra que a Frente 2 existiu para estabelecer). Ano 2029:
-- nenhuma venda, nenhuma meta.
--
-- Mutação (rodada e confirmada): envolver `sum(ma.total_realizado)` da CTE
-- `totais` com `coalesce(..., 0)` faz esta asserção acusar — `informado` e
-- `diferenca` passam a ser 0 em vez de NULL. Função restaurada à definição
-- da migration antes de seguir.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select row(informado, diferenca) from public.com_conciliacao(2029)),
  row(null::numeric, null::numeric),
  'ano sem nenhum mês informado: informado e diferença nulos, nunca zero'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. A armadilha dos meses desiguais: venda importada em TRÊS meses de
-- 2027, `total_realizado` informado em só DOIS (1 e 3 — o mês 2 fica de
-- fora). A venda líquida devolvida tem que ser a dos dois meses
-- informados (4000.00), não a dos três (6000.00), e `meses_comparados`
-- tem que ser 2.
--
-- Mutação (rodada e confirmada): tirar o `join meses_informados` do lado
-- do ERP (somar o ano inteiro, como a função fazia antes da Frente 5b) faz
-- esta asserção acusar — `venda_liquida` passa a ser 6000.00. É a única
-- asserção desta suíte que pega esse defeito: os outros três anos (2026,
-- 2028, 2029) não têm mês importado fora do informado. Função restaurada à
-- definição da migration antes de seguir.
-- ═══════════════════════════════════════════════════════════════════════════
select public.com_importar_vendas('MF', 'fixture-conciliacao-3.xlsx', 3, '{}'::jsonb,
  $items$[
    {"emissao":"2027-01-10","documento":"9601","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C1","cliente_nome":"Cliente Um","produto_codigo":"PCONC","produto_nome":"Produto Conciliação","quantidade":1,"valor_nota":1000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2027-02-10","documento":"9602","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C1","cliente_nome":"Cliente Um","produto_codigo":"PCONC","produto_nome":"Produto Conciliação","quantidade":1,"valor_nota":2000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2027-03-10","documento":"9603","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C1","cliente_nome":"Cliente Um","produto_codigo":"PCONC","produto_nome":"Produto Conciliação","quantidade":1,"valor_nota":3000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb, false);

insert into public.metas_ano (ano, mes, total_realizado) values
  (2027, 1, 1000.00),
  (2027, 3, 3000.00);

select is(
  (select row(venda_liquida, meses_comparados) from public.com_conciliacao(2027)),
  row(4000.00::numeric, 2::int),
  'a venda líquida cobre só os meses informados (1 e 3), nunca o ano inteiro — meses_comparados confirma quantos'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Um mês com `total_realizado` NULO no meio do ano (não a ausência da
-- linha — a linha existe, com o valor nulo) não entra na comparação nem
-- derruba os outros dois meses informados. Ano 2028: o mês 2 tem venda e
-- bonificação bem maiores que os meses 1 e 3, de propósito — se vazasse
-- para a soma, a asserção abaixo veria o vazamento na hora.
--
-- Mutação: a mesma do bloco 3 (tirar o join do lado do ERP) também
-- derruba esta — o mês 2 vazaria para dentro. Não repetida aqui: a prova
-- já está no bloco 3.
-- ═══════════════════════════════════════════════════════════════════════════
select public.com_importar_vendas('MF', 'fixture-conciliacao-4.xlsx', 6, '{}'::jsonb,
  $items$[
    {"emissao":"2028-01-10","documento":"9701","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C1","cliente_nome":"Cliente Um","produto_codigo":"PCONC","produto_nome":"Produto Conciliação","quantidade":1,"valor_nota":500.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2028-01-12","documento":"9702","serie":"1","tipo_documento":"NFe","cfop":"5910","classe":"bonificacao","cliente_codigo":"C1","cliente_nome":"Cliente Um","produto_codigo":"PCONC","produto_nome":"Produto Conciliação","quantidade":1,"valor_nota":20.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2028-02-10","documento":"9703","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C1","cliente_nome":"Cliente Um","produto_codigo":"PCONC","produto_nome":"Produto Conciliação","quantidade":1,"valor_nota":999.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2028-02-12","documento":"9704","serie":"1","tipo_documento":"NFe","cfop":"5910","classe":"bonificacao","cliente_codigo":"C1","cliente_nome":"Cliente Um","produto_codigo":"PCONC","produto_nome":"Produto Conciliação","quantidade":1,"valor_nota":999.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2028-03-10","documento":"9705","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C1","cliente_nome":"Cliente Um","produto_codigo":"PCONC","produto_nome":"Produto Conciliação","quantidade":1,"valor_nota":300.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2028-03-12","documento":"9706","serie":"1","tipo_documento":"NFe","cfop":"5910","classe":"bonificacao","cliente_codigo":"C1","cliente_nome":"Cliente Um","produto_codigo":"PCONC","produto_nome":"Produto Conciliação","quantidade":1,"valor_nota":10.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb, false);

insert into public.metas_ano (ano, mes, total_realizado) values
  (2028, 1, 520.00),
  (2028, 2, null),
  (2028, 3, 280.00);

select is(
  (select row(venda_liquida, bonificacao) from public.com_conciliacao(2028)),
  row(800.00::numeric, 30.00::numeric),
  'mês com total_realizado nulo no meio do ano (mes 2) não entra na comparação nem derruba os meses 1 e 3'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5 e 6. O ISOLAMENTO ENTRE EMPRESAS, que é o que uma SECURITY DEFINER
-- pode perder sem ninguém ver. O segundo tenant informa 2026/06 com um
-- valor PRÓPRIO (77,00) e NÃO tem venda nenhuma importada — enquanto o
-- tenant principal tem, no mesmo ano e no mesmo mês, 900,00 informados e
-- R$ 1.000,00 de venda (bloco 1). Os dois valores são diferentes de
-- propósito: cada vazamento tem um número próprio, e a asserção diz qual
-- dos dois filtros caiu.
--
-- Esta suíte tinha quatro asserções e NENHUMA delas prendia os filtros de
-- `tenant_id`: a auditoria de 2026-09-23 apagou os dois, um de cada vez, e
-- as quatro seguiram verdes. Uma asserção de isolamento que passa porque a
-- outra empresa não tem dado nenhum não prova isolamento — prova ausência.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('owner@com-conciliacao-outro.test');

insert into public.metas_ano (ano, mes, total_realizado) values (2026, 6, 77.00);

-- Mutação (rodada e confirmada): tirar `ma.tenant_id = (select public.
-- get_user_tenant_id())` da CTE `meses_informados` faz esta acusar —
-- `informado` vira 977,00 (os 900,00 do outro tenant somados aos 77,00
-- desta empresa). Função restaurada antes de seguir.
select is(
  (select informado from public.com_conciliacao(2026)),
  77.00::numeric,
  'o informado é só o da própria empresa — o total_realizado do outro tenant não entra'
);

-- Mutação (rodada e confirmada): tirar `i.tenant_id = (select public.
-- get_user_tenant_id())` da CTE `erp` faz esta acusar — `venda_liquida`
-- vira 1000,00, a venda de junho do OUTRO tenant, numa empresa que nunca
-- importou nada. Função restaurada antes de seguir.
select is(
  (select venda_liquida from public.com_conciliacao(2026)),
  0::numeric,
  'empresa sem venda importada vê zero — a venda do outro tenant não atravessa a security definer'
);

select tests.clear_authentication();

select * from finish();
rollback;

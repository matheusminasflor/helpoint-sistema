-- Painel Diretor (L6f) — faturamento por cliente, evolução por faixa e a
-- matriz produto × cliente (itens 4, 5 e 6 do §14). Ver
-- .scratch/plano-l6f-tres-telas-do-diretor.md e
-- docs/instrucoes-painel-comercial.md §14.
--
-- Correção da auditoria (2026-09-22, .scratch/plano-l6f-correcoes.md):
-- `com_evolucao_por_faixa` e `com_matriz_produto_cliente` viraram de lado —
-- uma linha por cliente/produto, com os meses/clientes dentro de jsonb — e
-- este arquivo foi reescrito para a forma nova. As asserções de
-- `com_faturamento_por_cliente` e `com_curva_abc` não mudaram de forma,
-- só de número (renumeradas).
begin;
\ir _helpers.psql

select plan(25);

-- ═══════════════════════════════════════════════════════════════════════════
-- Fixtures — dois tenants (isolamento) e um owner em cada.
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table f on commit drop as
select tests.create_tenant('com-l6f', 'Comercial L6f', false) as tenant,
       tests.create_tenant('com-l6f-outro', 'Comercial L6f Outro Tenant', false) as outro_tenant;

create temporary table u on commit drop as
select tests.create_user('owner@com-l6f.test',       (select tenant from f)) as owner,
       tests.create_user('outro-tenant@com-l6f.test', (select outro_tenant from f)) as outro_user;

select tests.grant_role((select owner from u), 'owner');
select tests.grant_role((select outro_user from u), 'owner');

grant select on f, u to authenticated;

select tests.authenticate_as('owner@com-l6f.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- Lote único, filial MF, jan-fev/2025:
--
--   PAUM   — CLI1 compra em jan (2 notas: 800 + 50) e fev (100). Duas notas
--            no MESMO mês É de propósito: se `meses_ativos` contasse LINHA
--            em vez de competência DISTINTA, jan apareceria em dobro — o
--            erro da L6a que a regra proíbe repetir aqui. Total valor 950,
--            faixa A (dominante do lote).
--   PGRATIS — CLI1 compra em fev com valor_nota = 0 (quantidade 50): a
--            célula PGRATIS×CLI1 tem valor 0 mas quantidade positiva — a
--            correção do item 4 (2026-09-22) faz esta célula existir SOB OS
--            DOIS critérios (a existência é sobre "teve movimento", nunca
--            sobre o que o critério escolhido mede). O critério continua
--            decidindo o que a tela EXIBE e o `maximo`.
--   PNEG   — CLI1 vende 50 em jan e devolve 200 em fev: saldo líquido do
--            produto no período é -150 (fica fora da curva, faixa '-'),
--            mas cada mês entra com o sinal que teve — fev fica negativo,
--            provando que "faturamento líquido" e "soma das faixas =
--            total" valem também quando o total do mês é negativo.
--   PDOIS  — CLI2 compra em jan (200), faixa C.
--   PDEV   — CLI2 compra em jan (300) e devolve em fev (100): líquido 200,
--            faixa B. Também recebe bonificação de 50 em jan — a prova de
--            que bonificação nunca entra no faturamento nem na evolução
--            por faixa (`base` só olha classe venda/devolução).
--   PCLI3  — CLI3 "compra" com valor e quantidade zero, de propósito: essa
--            linha só existe para o `com_importar_vendas` criar CLI3 em
--            `com_clientes` (correção de 2026-09-22 — o nome do cliente em
--            `com_evolucao_por_faixa`), sem afetar nenhuma conta das
--            outras asserções (m = 0 nunca entra em `positivos`, nem em
--            célula com movimento da matriz, sob nenhum critério).
--   PMULTI — vendido a DOIS clientes novos e isolados (CLI5, CLI6, que não
--            aparecem em nenhuma outra asserção): valor 1+1 (irrelevante
--            para o Pareto de PAUM/PDOIS/PDEV, testado abaixo) e quantidade
--            600+600=1200. Existe só para provar, na prática, que `maximo`
--            é o maior valor de CÉLULA da matriz — nunca o maior TOTAL de
--            produto: sob "quantidade", total(PMULTI) = 1200 > maximo real
--            (1000, a célula PDOIS×CLI2). Sem um produto vendido a mais de
--            um cliente, total(produto) sempre coincide com sua única
--            célula, e a mutação "trocar maximo por max(total)" passaria
--            despercebida.
-- ═══════════════════════════════════════════════════════════════════════════
select public.com_importar_vendas(
  'MF', 'fixture-l6f-visao-diretor.xlsx', 14,
  '{}'::jsonb,
  $items$[
    {"emissao":"2025-01-05","documento":"7001","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CLI1","cliente_nome":"Cliente Um","produto_codigo":"PAUM","produto_nome":"Produto Um","quantidade":10,"valor_nota":800,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-01-06","documento":"7002","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CLI1","cliente_nome":"Cliente Um","produto_codigo":"PAUM","produto_nome":"Produto Um","quantidade":1,"valor_nota":50,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-02-05","documento":"7003","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CLI1","cliente_nome":"Cliente Um","produto_codigo":"PAUM","produto_nome":"Produto Um","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-02-06","documento":"7004","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CLI1","cliente_nome":"Cliente Um","produto_codigo":"PGRATIS","produto_nome":"Produto Grátis","quantidade":50,"valor_nota":0,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-01-07","documento":"7005","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CLI1","cliente_nome":"Cliente Um","produto_codigo":"PNEG","produto_nome":"Produto Fora Da Curva","quantidade":5,"valor_nota":50,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-02-07","documento":"7006","serie":"1","tipo_documento":"NFe","cfop":"1202","classe":"devolucao","cliente_codigo":"CLI1","cliente_nome":"Cliente Um","produto_codigo":"PNEG","produto_nome":"Produto Fora Da Curva","quantidade":20,"valor_nota":200,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-01-08","documento":"7007","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CLI2","cliente_nome":"Cliente Dois","produto_codigo":"PDOIS","produto_nome":"Produto Dois","quantidade":1000,"valor_nota":200,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-01-09","documento":"7008","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CLI2","cliente_nome":"Cliente Dois","produto_codigo":"PDEV","produto_nome":"Produto Devolvido","quantidade":3,"valor_nota":300,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-02-08","documento":"7009","serie":"1","tipo_documento":"NFe","cfop":"1202","classe":"devolucao","cliente_codigo":"CLI2","cliente_nome":"Cliente Dois","produto_codigo":"PDEV","produto_nome":"Produto Devolvido","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-01-10","documento":"7010","serie":"1","tipo_documento":"NFe","cfop":"5910","classe":"bonificacao","cliente_codigo":"CLI2","cliente_nome":"Cliente Dois","produto_codigo":"PDEV","produto_nome":"Produto Devolvido","quantidade":1,"valor_nota":50,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-01-11","documento":"7010B","serie":"75","tipo_documento":"NFe","cfop":"5910","classe":"bonificacao","cliente_codigo":"CLI2","cliente_nome":"Cliente Dois","produto_codigo":"PDEV","produto_nome":"Produto Devolvido","quantidade":1,"valor_nota":70,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-01-11","documento":"7011","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CLI3","cliente_nome":"Cliente Tres Sem Cadastro","produto_codigo":"PCLI3","produto_nome":"Produto Cli3","quantidade":0,"valor_nota":0,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-01-12","documento":"7012","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CLI5","cliente_nome":"Cliente Cinco","produto_codigo":"PMULTI","produto_nome":"Produto Multi Cliente","quantidade":600,"valor_nota":1,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-01-13","documento":"7013","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CLI6","cliente_nome":"Cliente Seis","produto_codigo":"PMULTI","produto_nome":"Produto Multi Cliente","quantidade":600,"valor_nota":1,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb,
  false
);

-- `com_importar_vendas` já criou CLI3 em `com_clientes` (origem 'venda',
-- razão social "Cliente Tres Sem Cadastro") — apaga-se essa linha para
-- simular o cliente sem cadastro (caso "sem tabela" da L6c). O DELETE
-- roda como o runner (fora de `authenticate_as`): `com_clientes` não tem
-- policy nem grant de DELETE para `authenticated`, de propósito.
select tests.clear_authentication();
delete from public.com_clientes where codigo = 'CLI3' and tenant_id = (select tenant from f);
select tests.authenticate_as('owner@com-l6f.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- com_faturamento_por_cliente
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Faturamento é líquido: CLI2 vendeu 500 (200 + 300) e devolveu 100 —
-- líquido 400, não 500. Mutação (trocar valor_curva por valor_nota na soma
-- do faturamento): a devolução para de ser negativa e soma 200+300+100 =
-- 600 — VERIFICADO na prática em 2026-09-22 (não é o 500 que um comentário
-- anterior desta suíte afirmava; é a quarta vez nesta sequência que um
-- comentário de mutação erra o número — rodar e escrever o que se viu).
select is(
  (select faturamento from public.com_faturamento_por_cliente('2025-01-01', '2025-02-28', 'MF', 'valor') where cliente_codigo = 'CLI2'),
  400::numeric,
  'faturamento de CLI2 é líquido (venda 500 - devolução 100 = 400)'
);
-- 2. Bonificação é coluna própria e NUNCA soma no faturamento: CLI2 recebeu
-- 50 na série 1 e 70 na série 75, e o faturamento (teste 1) continua 400 —
-- não 520.
--
-- A FIXTURE TEM AS DUAS SÉRIES de propósito, com valores diferentes (50 e
-- 70). Por algumas horas em 2026-09-25 esta função separou as duas, chamando
-- a série 1 de "publicidade"; era erro meu, e o que prende a volta é esta
-- asserção esperar a SOMA. Se alguém filtrar por série de novo, ela acusa
-- com 50 ou 70 em vez de 120.
select is(
  (select bonificacao from public.com_faturamento_por_cliente('2025-01-01', '2025-02-28', 'MF', 'valor') where cliente_codigo = 'CLI2'),
  120::numeric,
  'bonificação de CLI2 soma as duas séries (50 + 70) — a série não diz finalidade, e nada disso entra no faturamento'
);
-- 3. skus conta produto DISTINTO com venda — CLI1 vendeu 3 produtos
-- (PAUM, PGRATIS, PNEG), nunca 5 (o número de notas de venda: PAUM tem
-- três).
select is(
  (select skus from public.com_faturamento_por_cliente('2025-01-01', '2025-02-28', 'MF', 'valor') where cliente_codigo = 'CLI1'),
  3::bigint,
  'skus de CLI1 conta produto distinto (3), não o número de notas de venda (5)'
);
-- 4. meses_ativos conta competência DISTINTA com venda — CLI1 vendeu em
-- jan (3 notas: PAUM×2 + PNEG) e fev (2 notas: PAUM + PGRATIS); é o erro da
-- L6a (somar linha em vez de contar mês distinto) que não pode repetir
-- aqui. Mutação: trocar `count(distinct i.competencia)` por `count(*)`
-- faz este número virar 5.
select is(
  (select meses_ativos from public.com_faturamento_por_cliente('2025-01-01', '2025-02-28', 'MF', 'valor') where cliente_codigo = 'CLI1'),
  2::bigint,
  'meses_ativos de CLI1 conta competência distinta (2: jan e fev), não o número de notas (5)'
);
-- 5. Faturamento com produto fora da curva incluso: CLI1 = 950 (PAUM) + 0
-- (PGRATIS) - 150 (PNEG, devolução > venda) = 800. Prova que o faturamento
-- por cliente nunca filtra por faixa — "todos, sem filtro de faixa" (§14).
select is(
  (select faturamento from public.com_faturamento_por_cliente('2025-01-01', '2025-02-28', 'MF', 'valor') where cliente_codigo = 'CLI1'),
  800::numeric,
  'faturamento de CLI1 soma também o produto fora da curva (950 + 0 - 150 = 800)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- com_evolucao_por_faixa — uma linha por CLIENTE (correção de 2026-09-22,
-- item 5): `meses` é um jsonb com um item por competência.
-- ═══════════════════════════════════════════════════════════════════════════

-- 6. Um mês pode fechar negativo quando a devolução supera a venda no
-- período: CLI1 em fevereiro é PAUM (+100, faixa A) + PGRATIS (0, fora da
-- curva) + devolução de PNEG (-200, fora da curva) = -100.
select is(
  (select (mes->>'total')::numeric
     from public.com_evolucao_por_faixa('2025-01-01', '2025-02-28', 'MF', 'valor') e,
          jsonb_array_elements(e.meses) as mes
    where e.cliente_codigo = 'CLI1' and mes->>'competencia' = '2025-02-01'),
  -100::numeric,
  'total de CLI1 em fevereiro é -100 (devolução do produto fora da curva supera a venda do mês)'
);
-- 7. ASSERÇÃO OBRIGATÓRIA (plano §3.2 e correção do item 7.2): valor_a +
-- valor_b + valor_c + valor_outros = total, para TODO cliente e TODO mês —
-- não só um par escolhido. Mutação (tirar valor_outros da soma): o mês de
-- CLI1 em fevereiro (100 + 0 + 0 = 100) já não fecha com -100.
select is_empty(
  $$
  select 1
  from public.com_evolucao_por_faixa('2025-01-01', '2025-02-28', 'MF', 'valor') e,
       jsonb_array_elements(e.meses) as mes
  where (mes->>'valor_a')::numeric + (mes->>'valor_b')::numeric + (mes->>'valor_c')::numeric + (mes->>'valor_outros')::numeric
        <> (mes->>'total')::numeric
  $$,
  'a soma das três faixas mais outros fecha com o total do mês, para todo cliente e todo mês'
);
-- 8/9. A faixa usada é a MESMA que com_curva_abc dá no mesmo recorte —
-- nunca uma segunda classificação dentro desta função. PDEV é faixa B e
-- PDOIS é faixa C nesse lote (conferido contra com_curva_abc abaixo, testes
-- 13/14); aqui, o valor de cada um só aparece na coluna certa se a função
-- reusou a mesma faixa. Mutação: fixar a faixa (por exemplo, sempre 'A')
-- faz valor_b e valor_c virarem 0 e valor_a virar 500.
select is(
  (select (mes->>'valor_b')::numeric
     from public.com_evolucao_por_faixa('2025-01-01', '2025-02-28', 'MF', 'valor') e,
          jsonb_array_elements(e.meses) as mes
    where e.cliente_codigo = 'CLI2' and mes->>'competencia' = '2025-01-01'),
  300::numeric,
  'a compra de PDEV (faixa B) por CLI2 em janeiro aparece em valor_b'
);
select is(
  (select (mes->>'valor_c')::numeric
     from public.com_evolucao_por_faixa('2025-01-01', '2025-02-28', 'MF', 'valor') e,
          jsonb_array_elements(e.meses) as mes
    where e.cliente_codigo = 'CLI2' and mes->>'competencia' = '2025-01-01'),
  200::numeric,
  'a compra de PDOIS (faixa C) por CLI2 em janeiro aparece em valor_c'
);
-- 10. Cliente que ESTÁ no cadastro sai com a razão social — agora um campo
-- de nível de cliente (não mais por mês, desde a virada de forma).
select is(
  (select nome from public.com_evolucao_por_faixa('2025-01-01', '2025-02-28', 'MF', 'valor') where cliente_codigo = 'CLI1'),
  'Cliente Um',
  'CLI1, que está em com_clientes, sai com a razão social'
);
-- 11. Cliente que NÃO ESTÁ no cadastro (CLI3, apagado de com_clientes
-- acima) sai com o próprio código, nunca nulo.
select is(
  (select nome from public.com_evolucao_por_faixa('2025-01-01', '2025-02-28', 'MF', 'valor') where cliente_codigo = 'CLI3'),
  'CLI3',
  'CLI3, que não está em com_clientes, sai com o próprio código — nunca nulo'
);
-- 12. Ordenação por total decrescente (item 5 do plano): comparar a lista
-- na ordem NATURAL da função com a mesma lista explicitamente ordenada por
-- total. Mutação: tirar o `order by` da função faz as duas divergirem.
select is(
  (select array_agg(cliente_codigo) from public.com_evolucao_por_faixa('2025-01-01', '2025-02-28', 'MF', 'valor')),
  (select array_agg(cliente_codigo order by total desc, cliente_codigo) from public.com_evolucao_por_faixa('2025-01-01', '2025-02-28', 'MF', 'valor')),
  'com_evolucao_por_faixa devolve os clientes ordenados por total decrescente'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- com_curva_abc — prova de que trocar o critério muda a faixa (plano §5,
-- asserção 6), no MESMO lote que as demais funções usam. PMULTI (valor 1+1
-- = 2) não desloca PAUM da faixa A: ver comentário da fixture.
-- ═══════════════════════════════════════════════════════════════════════════

-- 13. Sob "valor", PAUM domina o lote e fica A.
select is(
  (select faixa from public.com_curva_abc('2025-01-01', '2025-02-28', 'MF', 'valor') where produto_codigo = 'PAUM'),
  'A',
  'sob critério valor, PAUM (950) é a faixa A do lote'
);
-- 14. Sob "quantidade", PAUM (12 unidades) é ofuscado por PDOIS (1000
-- unidades) e PMULTI (1200 unidades, 600+600) e cai para C — a MESMA
-- função dando faixa diferente para o mesmo produto, só porque o critério
-- mudou.
select is(
  (select faixa from public.com_curva_abc('2025-01-01', '2025-02-28', 'MF', 'quantidade') where produto_codigo = 'PAUM'),
  'C',
  'sob critério quantidade, PAUM (12 unidades) cai para a faixa C — trocar o critério muda a faixa'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- com_matriz_produto_cliente — uma linha por PRODUTO (correção de
-- 2026-09-22, item 1): `celulas` é um jsonb com um item por cliente. Item 4:
-- a célula existe por ter movimento em QUALQUER métrica, não pelo que o
-- critério escolhido mede.
-- ═══════════════════════════════════════════════════════════════════════════

-- 15/16. 7 células com movimento SOB OS DOIS critérios: PAUM×CLI1,
-- PGRATIS×CLI1 (valor 0, quantidade 50 — a correção do item 4),
-- PNEG×CLI1, PDOIS×CLI2, PDEV×CLI2, PMULTI×CLI5, PMULTI×CLI6. Trocar o
-- critério muda o que a matriz EXIBE (teste 18/19), nunca o que existe.
select is(
  (select coalesce(sum(jsonb_array_length(celulas)), 0)::int from public.com_matriz_produto_cliente('2025-01-01', '2025-02-28', 'MF', 'valor')),
  7,
  'sob critério valor, a matriz tem 7 células com movimento (a correção do item 4 inclui PGRATIS×CLI1, valor 0 mas quantidade 50)'
);
select is(
  (select coalesce(sum(jsonb_array_length(celulas)), 0)::int from public.com_matriz_produto_cliente('2025-01-01', '2025-02-28', 'MF', 'quantidade')),
  7,
  'sob critério quantidade, a matriz também tem 7 células — o critério não decide o que existe, só o que se exibe e o máximo'
);
-- 17. A célula PGRATIS×CLI1 aparece explicitamente sob "valor" — a prova
-- direta do item 4 (mutação: voltar ao filtro por critério faz esta célula
-- desaparecer sob "valor").
select ok(
  exists (
    select 1
    from public.com_matriz_produto_cliente('2025-01-01', '2025-02-28', 'MF', 'valor') m,
         jsonb_array_elements(m.celulas) as cel
    where m.produto_codigo = 'PGRATIS' and cel->>'cliente_codigo' = 'CLI1'
  ),
  'a célula PGRATIS×CLI1 (valor 0, quantidade 50) aparece sob o critério valor — existir é sobre movimento, nunca sobre o que o critério mede'
);
-- 18. O máximo devolvido é o maior valor de fato presente numa CÉLULA —
-- aqui, PAUM×CLI1 (950), maior que qualquer outra.
select is(
  (select distinct maximo from public.com_matriz_produto_cliente('2025-01-01', '2025-02-28', 'MF', 'valor')),
  950::numeric,
  'o máximo sob critério valor é a maior célula real da matriz (PAUM×CLI1 = 950)'
);
-- 19. Sob "quantidade", o máximo é a célula PDOIS×CLI2 (1000 unidades) —
-- NUNCA o maior TOTAL de produto: PMULTI soma 1200 (600 a CLI5 + 600 a
-- CLI6), mas nenhuma célula dele chega a 1000. Mutação (trocar `maximo`
-- por `max(total)`): este número viraria 1200.
select is(
  (select distinct maximo from public.com_matriz_produto_cliente('2025-01-01', '2025-02-28', 'MF', 'quantidade')),
  1000::numeric,
  'o máximo sob critério quantidade é a maior célula real (PDOIS×CLI2 = 1000), não o maior total de produto (PMULTI = 1200)'
);
-- 20/21. A soma dos valores/quantidades dentro de `celulas` bate com o
-- `total` da linha — provado em PMULTI, o único produto com mais de uma
-- célula (1+1=2 em valor; 600+600=1200 em quantidade).
select is(
  (select total from public.com_matriz_produto_cliente('2025-01-01', '2025-02-28', 'MF', 'valor') where produto_codigo = 'PMULTI'),
  (select coalesce(sum((cel->>'valor')::numeric), 0)
     from public.com_matriz_produto_cliente('2025-01-01', '2025-02-28', 'MF', 'valor') m,
          jsonb_array_elements(m.celulas) as cel
    where m.produto_codigo = 'PMULTI'),
  'PMULTI: a soma dos valores dentro de celulas bate com o total da linha'
);
select is(
  (select total from public.com_matriz_produto_cliente('2025-01-01', '2025-02-28', 'MF', 'quantidade') where produto_codigo = 'PMULTI'),
  (select coalesce(sum((cel->>'quantidade')::numeric), 0)
     from public.com_matriz_produto_cliente('2025-01-01', '2025-02-28', 'MF', 'quantidade') m,
          jsonb_array_elements(m.celulas) as cel
    where m.produto_codigo = 'PMULTI'),
  'PMULTI sob quantidade: a soma das quantidades dentro de celulas bate com o total da linha'
);
-- 22. Ordenação por total decrescente (item 1 do plano), mesma técnica do
-- teste 12. Mutação: tirar o `order by` da função faz as duas divergirem.
select is(
  (select array_agg(produto_codigo) from public.com_matriz_produto_cliente('2025-01-01', '2025-02-28', 'MF', 'valor')),
  (select array_agg(produto_codigo order by total desc, produto_codigo) from public.com_matriz_produto_cliente('2025-01-01', '2025-02-28', 'MF', 'valor')),
  'com_matriz_produto_cliente devolve os produtos ordenados por total decrescente'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Isolamento entre empresas (ADR-005): usuário de outro tenant, sem
-- nenhuma venda própria, não vê nenhuma linha das três funções — mesmo
-- pedindo o mesmo período com dado no tenant principal.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('outro-tenant@com-l6f.test');

-- 23.
select is_empty(
  $$select * from public.com_faturamento_por_cliente('2025-01-01', '2025-02-28', 'MF', 'valor')$$,
  'usuário de outro tenant não vê nenhuma linha de com_faturamento_por_cliente'
);
-- 24.
select is_empty(
  $$select * from public.com_evolucao_por_faixa('2025-01-01', '2025-02-28', 'MF', 'valor')$$,
  'usuário de outro tenant não vê nenhuma linha de com_evolucao_por_faixa'
);
-- 25.
select is_empty(
  $$select * from public.com_matriz_produto_cliente('2025-01-01', '2025-02-28', 'MF', 'valor')$$,
  'usuário de outro tenant não vê nenhuma linha de com_matriz_produto_cliente'
);

select tests.clear_authentication();

select * from finish();
rollback;

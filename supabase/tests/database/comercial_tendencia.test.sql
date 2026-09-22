-- Painel Diretor (L6e) — tendência produto a produto e detalhe do produto.
-- Ver .scratch/plano-l6e-simulador-e-tendencia.md §2.4 e
-- docs/instrucoes-painel-comercial.md §14.
begin;
\ir _helpers.psql

select plan(14);

-- ═══════════════════════════════════════════════════════════════════════════
-- Fixtures — dois tenants (isolamento) e um owner em cada.
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table f on commit drop as
select tests.create_tenant('com-l6e', 'Comercial L6e', false) as tenant,
       tests.create_tenant('com-l6e-outro', 'Comercial L6e Outro Tenant', false) as outro_tenant;

create temporary table u on commit drop as
select tests.create_user('owner@com-l6e.test',       (select tenant from f)) as owner,
       tests.create_user('outro-tenant@com-l6e.test', (select outro_tenant from f)) as outro_user;

select tests.grant_role((select owner from u), 'owner');
select tests.grant_role((select outro_user from u), 'owner');

grant select on f, u to authenticated;

select tests.authenticate_as('owner@com-l6e.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- com_tendencia_produtos — ano inteiro de 2025 (12 meses, 1ª metade
-- jan-jun, 2ª metade jul-dez), tudo no MESMO lote, filial MF:
--
--   PNOVO             — sem venda na 1ª metade, vende em ago (2ª metade).
--   PDESC             — vende em jan (1ª metade), zerado na 2ª metade.
--   PESPORADICO_ORDEM — vende em fev (100) e ago (400): 2 de 12 meses, e a
--                        2ª metade é 300% acima da 1ª — a PROVA DA ORDEM
--                        (§2.4): sem Esporádico checado antes da variação,
--                        isto viraria "Crescendo 300%".
--   PCRESCENDO        — jan+fev = 200 (1ª), ago+set = 300 (2ª): +50%.
--   PCAINDO           — jan+fev = 400 (1ª), ago+set = 200 (2ª): -50%.
--   PESTAVEL          — jan+fev = 200 (1ª), ago+set = 210 (2ª): +5%.
--   PCONCENTRADO      — jan = 600, fev = 400 (total 1000): 60% num mês só.
--
-- Os quatro últimos vendem em pelo menos 4 dos 12 meses (>30%), para não
-- cair em Esporádico por acidente.
-- ═══════════════════════════════════════════════════════════════════════════
select public.com_importar_vendas(
  'MF', 'fixture-l6e-tendencia.xlsx', 18,
  '{}'::jsonb,
  $items$[
    {"emissao":"2025-08-05","documento":"9001","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PNOVO","produto_nome":"Produto Novo","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},

    {"emissao":"2025-01-05","documento":"9002","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PDESC","produto_nome":"Produto Descontinuado","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},

    {"emissao":"2025-02-05","documento":"9003","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PESPORADICO_ORDEM","produto_nome":"Produto Esporádico","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-08-06","documento":"9004","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PESPORADICO_ORDEM","produto_nome":"Produto Esporádico","quantidade":1,"valor_nota":400,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},

    {"emissao":"2025-01-05","documento":"9005","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PCRESCENDO","produto_nome":"Produto Crescendo","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-02-05","documento":"9006","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PCRESCENDO","produto_nome":"Produto Crescendo","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-08-05","documento":"9007","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PCRESCENDO","produto_nome":"Produto Crescendo","quantidade":1,"valor_nota":150,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-09-05","documento":"9008","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PCRESCENDO","produto_nome":"Produto Crescendo","quantidade":1,"valor_nota":150,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},

    {"emissao":"2025-01-05","documento":"9009","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PCAINDO","produto_nome":"Produto Caindo","quantidade":1,"valor_nota":200,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-02-05","documento":"9010","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PCAINDO","produto_nome":"Produto Caindo","quantidade":1,"valor_nota":200,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-08-05","documento":"9011","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PCAINDO","produto_nome":"Produto Caindo","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-09-05","documento":"9012","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PCAINDO","produto_nome":"Produto Caindo","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},

    {"emissao":"2025-01-05","documento":"9013","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PESTAVEL","produto_nome":"Produto Estável","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-02-05","documento":"9014","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PESTAVEL","produto_nome":"Produto Estável","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-08-05","documento":"9015","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PESTAVEL","produto_nome":"Produto Estável","quantidade":1,"valor_nota":105,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-09-05","documento":"9016","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PESTAVEL","produto_nome":"Produto Estável","quantidade":1,"valor_nota":105,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},

    {"emissao":"2025-01-05","documento":"9017","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PCONCENTRADO","produto_nome":"Produto Concentrado","quantidade":1,"valor_nota":600,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-02-05","documento":"9018","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PCONCENTRADO","produto_nome":"Produto Concentrado","quantidade":1,"valor_nota":400,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb,
  false
);

-- 1. Novo — sem venda na 1ª metade, com venda na 2ª. Mutação (executada e
-- confirmada): trocar a ordem do CASE pondo a checagem de Esporádico antes
-- de Novo/Descontinuado faz este produto (1 de 12 meses com venda) virar
-- 'Esporádico'.
select is(
  (select situacao from public.com_tendencia_produtos('2025-01-01', '2025-12-31', 'MF', 'valor') where produto_codigo = 'PNOVO'),
  'Novo',
  'produto sem venda na 1ª metade e com venda na 2ª é classificado Novo'
);
-- 2. Descontinuado — vendia na 1ª metade, zerado na 2ª. A MESMA mutação do
-- teste 1 (rodada junto) também derruba este: 1 de 12 meses com venda,
-- viraria 'Esporádico' em vez de 'Descontinuado'.
select is(
  (select situacao from public.com_tendencia_produtos('2025-01-01', '2025-12-31', 'MF', 'valor') where produto_codigo = 'PDESC'),
  'Descontinuado',
  'produto que vendia na 1ª metade e zerou na 2ª é classificado Descontinuado'
);
-- 3. A PROVA DA ORDEM (§2.4): 2 de 12 meses com venda, 2ª metade 300% acima
-- da 1ª — ainda assim Esporádico, não Crescendo. Mutação (executada e
-- confirmada): mover a checagem de Esporádico para DEPOIS das regras de
-- variação faz este produto virar 'Crescendo'.
select is(
  (select situacao from public.com_tendencia_produtos('2025-01-01', '2025-12-31', 'MF', 'valor') where produto_codigo = 'PESPORADICO_ORDEM'),
  'Esporádico',
  'produto que vendeu em 2 de 12 meses é Esporádico, mesmo com a 2ª metade 300% acima da 1ª'
);
-- 4. Crescendo — 2ª metade ≥25% acima da 1ª (aqui, +50%). Mutação
-- (executada e confirmada): trocar o limiar `1.25` por `1.6` faz este
-- produto virar 'Estável' (50% de alta não alcança 60%).
select is(
  (select situacao from public.com_tendencia_produtos('2025-01-01', '2025-12-31', 'MF', 'valor') where produto_codigo = 'PCRESCENDO'),
  'Crescendo',
  '2ª metade 50% acima da 1ª é Crescendo'
);
-- 5. Caindo — 2ª metade ≥25% abaixo da 1ª (aqui, -50%).
select is(
  (select situacao from public.com_tendencia_produtos('2025-01-01', '2025-12-31', 'MF', 'valor') where produto_codigo = 'PCAINDO'),
  'Caindo',
  '2ª metade 50% abaixo da 1ª é Caindo'
);
-- 6. Estável — variação dentro de ±25% (aqui, +5%).
select is(
  (select situacao from public.com_tendencia_produtos('2025-01-01', '2025-12-31', 'MF', 'valor') where produto_codigo = 'PESTAVEL'),
  'Estável',
  'variação de +5% entre as metades é Estável'
);

-- 7 (ressalva §14) — concentração: 60% do faturamento (600 de 1000) saiu
-- num único mês. Mutação (executada e confirmada): trocar o limiar `0.5`
-- por `0.6` faz concentrado virar false (600 não é > 600).
select is(
  (select concentrado from public.com_tendencia_produtos('2025-01-01', '2025-12-31', 'MF', 'valor') where produto_codigo = 'PCONCENTRADO'),
  true,
  'produto com 60% do faturamento num único mês fica concentrado = true'
);

-- 8 — a faixa devolvida é a MESMA que com_curva_abc dá no mesmo recorte
-- (prova que não há segunda implementação da curva dentro desta função).
select is(
  (select faixa from public.com_tendencia_produtos('2025-01-01', '2025-12-31', 'MF', 'valor') where produto_codigo = 'PCRESCENDO'),
  (select faixa from public.com_curva_abc('2025-01-01', '2025-12-31', 'MF', 'valor') where produto_codigo = 'PCRESCENDO'),
  'a faixa de com_tendencia_produtos é a mesma que com_curva_abc dá no mesmo recorte'
);

-- 9 (ressalva §14) — com um único mês selecionado não existe tendência:
-- situação e variação saem nulas, nunca 'Estável'. Mutação (executada e
-- confirmada): tirar a checagem `v_total_meses <= 1` do CASE de situação
-- faz este produto virar 'Novo' (primeira_metade cai em 0 com v_meio = 0,
-- e a checagem de Novo é a próxima da lista) — deixa de ser nulo.
select is(
  (select situacao from public.com_tendencia_produtos('2025-01-01', '2025-01-31', 'MF', 'valor') where produto_codigo = 'PCRESCENDO'),
  null::text,
  'com um único mês no período, situação é nula — nunca ''Estável'''
);
select is(
  (select variacao from public.com_tendencia_produtos('2025-01-01', '2025-01-31', 'MF', 'valor') where produto_codigo = 'PCRESCENDO'),
  null::numeric,
  'com um único mês no período, variação também é nula'
);

-- 10 — isolamento entre tenants (ADR-005): usuário de outro tenant não vê
-- nenhuma linha, mesmo pedindo o mesmo período com dado no tenant principal.
select tests.clear_authentication();
select tests.authenticate_as('outro-tenant@com-l6e.test');
select is(
  (select count(*)::int from public.com_tendencia_produtos('2025-01-01', '2025-12-31', 'MF', 'valor')),
  0,
  'usuário de outro tenant não vê nenhuma linha de com_tendencia_produtos'
);
select tests.clear_authentication();
select tests.authenticate_as('owner@com-l6e.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- com_detalhe_produto — o mesmo produto (PDETALHE) comprado por CLI_X (com
-- devolução parcial em março) e CLI_Y (em abril), mais CLI_Z na filial
-- INBRAS (para o teste de filtro). Meses diferentes dos usados acima
-- (jan/fev/ago/set) — `com_importar_vendas` recusa reimportar a mesma
-- competência+filial no mesmo lote.
-- ═══════════════════════════════════════════════════════════════════════════
select public.com_importar_vendas(
  'MF', 'fixture-l6e-detalhe-mf.xlsx', 3,
  '{}'::jsonb,
  $items$[
    {"emissao":"2025-03-05","documento":"9101","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CLI_X","cliente_nome":"Cliente X","produto_codigo":"PDETALHE","produto_nome":"Produto Detalhe","quantidade":1,"valor_nota":1000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-03-06","documento":"9102","serie":"1","tipo_documento":"NFe","cfop":"1202","classe":"devolucao","cliente_codigo":"CLI_X","cliente_nome":"Cliente X","produto_codigo":"PDETALHE","produto_nome":"Produto Detalhe","quantidade":1,"valor_nota":200,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-04-05","documento":"9103","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CLI_Y","cliente_nome":"Cliente Y","produto_codigo":"PDETALHE","produto_nome":"Produto Detalhe","quantidade":1,"valor_nota":300,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb,
  false
);
select public.com_importar_vendas(
  'INBRAS', 'fixture-l6e-detalhe-inbras.xlsx', 1,
  '{}'::jsonb,
  '[{"emissao":"2025-03-10","documento":"9104","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CLI_Z","cliente_nome":"Cliente Z","produto_codigo":"PDETALHE","produto_nome":"Produto Detalhe","quantidade":1,"valor_nota":500,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}]'::jsonb,
  false
);

-- 11. Mensal: março líquido é 800 (venda 1000 − devolução 200), não 1000
-- e não 1200. Mutação (executada e confirmada): trocar `valor_curva` por
-- `valor_nota` na CTE do mensal faz março virar 1200 (devolução deixa de
-- abater, soma como se fosse venda).
select is(
  ((select x->>'faturamento' from jsonb_array_elements(
    public.com_detalhe_produto('PDETALHE', '2025-03-01', '2025-04-30', 'MF')->'mensal'
  ) x where x->>'competencia' = '2025-03-01')::numeric),
  800::numeric,
  'com_detalhe_produto: março líquido é 800 (devolução abate), não o valor bruto de venda'
);
-- 12. Lista de clientes: CLI_Y aparece com o valor certo (300) e o nome
-- resolvido pelo join com com_clientes.
select is(
  ((select x->>'valor' from jsonb_array_elements(
    public.com_detalhe_produto('PDETALHE', '2025-03-01', '2025-04-30', 'MF')->'clientes'
  ) x where x->>'cliente_codigo' = 'CLI_Y')::numeric),
  300::numeric,
  'com_detalhe_produto: CLI_Y aparece na lista de clientes com o valor comprado'
);
-- 13. Filtro de filial: CLI_Z (INBRAS) não aparece quando p_filial = 'MF'.
-- Mutação (executada e confirmada): tirar o filtro de `p_filial` na CTE de
-- clientes faz a lista virar 3 clientes (traz CLI_Z da INBRAS também).
select is(
  (select jsonb_array_length(public.com_detalhe_produto('PDETALHE', '2025-03-01', '2025-04-30', 'MF')->'clientes')),
  2,
  'com_detalhe_produto com p_filial = MF não traz o cliente da INBRAS (2 clientes, não 3)'
);

select * from finish();
rollback;

-- Painel Comercial (L6b) — curva ABC, clientes a trabalhar, bonificação por
-- cliente e pedidos em condição. Ver .scratch/plano-l6b-curva-e-condicao.md §5.
begin;
\ir _helpers.psql

select plan(21);

-- ═══════════════════════════════════════════════════════════════════════════
-- Fixtures — dois tenants (isolamento) e um owner em cada (bypassa a
-- permissão granular via is_admin_or_higher, como a suíte da L6a já faz).
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table f on commit drop as
select tests.create_tenant('com-l6b', 'Comercial L6b', false) as tenant,
       tests.create_tenant('com-l6b-outro', 'Comercial L6b Outro Tenant', false) as outro_tenant;

create temporary table u on commit drop as
select tests.create_user('owner@com-l6b.test',       (select tenant from f)) as owner,
       tests.create_user('outro-tenant@com-l6b.test', (select outro_tenant from f)) as outro_user;

select tests.grant_role((select owner from u), 'owner');
select tests.grant_role((select outro_user from u), 'owner');

grant select on f, u to authenticated;

select tests.authenticate_as('owner@com-l6b.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- 1/2/6/7 — fronteira A/B/C e produto com saldo negativo, tudo no MESMO
-- lote (2025-04, MF): total dos três produtos POSITIVOS é 1000, cravado —
-- PBOUND1 acumula exatamente 80,00% (fronteira A), PBOUND2 fecha em
-- exatamente 95,00% (fronteira B). PBOUND4NEG vende 100 e devolve 250
-- (líquido -150): fica de fora da classificação, numa faixa própria '-', e
-- por estar no MESMO lote prova que não desloca a fronteira dos outros —
-- se ele contaminasse o total, PBOUND1 não fecharia em 80,00% cravado.
-- ═══════════════════════════════════════════════════════════════════════════
select public.com_importar_vendas(
  'MF', 'fixture-l6b-fronteira.xlsx', 5,
  '{}'::jsonb,
  $items$[
    {"emissao":"2025-04-05","documento":"1001","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PBOUND1","produto_nome":"Produto Fronteira 1","quantidade":1,"valor_nota":800,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-04-06","documento":"1002","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PBOUND2","produto_nome":"Produto Fronteira 2","quantidade":1,"valor_nota":150,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-04-07","documento":"1003","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PBOUND3","produto_nome":"Produto Fronteira 3","quantidade":1,"valor_nota":50,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-04-08","documento":"1004","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PBOUND4NEG","produto_nome":"Produto Negativo","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-04-09","documento":"1005","serie":"1","tipo_documento":"NFe","cfop":"1202","classe":"devolucao","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PBOUND4NEG","produto_nome":"Produto Negativo","quantidade":1,"valor_nota":250,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb,
  false
);

-- 1. Fronteira A em exatamente 80,00% — o primeiro produto (800 de 1000)
-- cai em A, não em B. Mutação: trocar `<= 80` por `< 80` na função.
select is(
  (select faixa from public.com_curva_abc('2025-04-01', '2025-04-30', 'MF', 'valor') where produto_codigo = 'PBOUND1'),
  'A',
  'produto com acumulado EXATAMENTE 80,00% cai em A, não em B'
);
-- 2. Fronteira B em exatamente 95,00% — o segundo produto (800+150=950 de
-- 1000) cai em B, não em C. Mutação: trocar `<= 95` por `< 95`.
select is(
  (select faixa from public.com_curva_abc('2025-04-01', '2025-04-30', 'MF', 'valor') where produto_codigo = 'PBOUND2'),
  'B',
  'produto com acumulado EXATAMENTE 95,00% cai em B, não em C'
);
-- 6a. Saldo negativo (vendeu 100, devolveu 250 — líquido -150) fica fora da
-- classificação: faixa própria '-'. Mutação corrigida (achado A2 da
-- auditoria: a mutação anterior, `m > 0`/`m <= 0` → `m >= 0`/`m < 0`, não
-- mata — com a fixture em -150 os dois pares de predicado classificam
-- igual, e as 18 ficavam verdes). A que mata de verdade: na CTE `base`,
-- somar `i.valor_nota` em vez de `i.valor_curva` — devolução deixaria de
-- abater (valor_nota é sempre positivo, mesmo em devolução) e PBOUND4NEG
-- passaria a m = 100+250 = 350 (positivo), ganhando uma faixa A/B/C de
-- verdade em vez de '-'. Rodada e confirmada (relatório do executor).
select is(
  (select faixa from public.com_curva_abc('2025-04-01', '2025-04-30', 'MF', 'valor') where produto_codigo = 'PBOUND4NEG'),
  '-',
  'produto com saldo líquido negativo fica na faixa própria (-), fora de A/B/C'
);
-- 6b. E não leva participação/acumulado nenhum — nulo, nunca zero (zero
-- sugeriria "existe, mas não vendeu nada", que é uma afirmação diferente).
select is(
  (select participacao from public.com_curva_abc('2025-04-01', '2025-04-30', 'MF', 'valor') where produto_codigo = 'PBOUND4NEG'),
  null::numeric,
  'produto fora da classificação tem participação nula, nunca zero'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3 — a curva muda quando muda o período: PPERIODO domina em janeiro/2025
-- (750 de 1000 = 75% → A) e vira periférico em fevereiro/2025 (10 de 1000,
-- perdendo para PPERIODO_Z que sozinho é 990 → C). Mutação: ignorar
-- p_de/p_ate (não filtrar por emissao) faria os dois meses se misturarem e
-- os dois resultados baterem no mesmo valor.
-- ═══════════════════════════════════════════════════════════════════════════
select public.com_importar_vendas(
  'MF', 'fixture-l6b-periodo.xlsx', 4,
  '{}'::jsonb,
  $items$[
    {"emissao":"2025-01-10","documento":"2001","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PPERIODO","produto_nome":"Produto Período","quantidade":1,"valor_nota":750,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-01-11","documento":"2002","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PPERIODO_W","produto_nome":"Produto Período W","quantidade":1,"valor_nota":250,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-02-10","documento":"2003","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PPERIODO","produto_nome":"Produto Período","quantidade":1,"valor_nota":10,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-02-11","documento":"2004","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PPERIODO_Z","produto_nome":"Produto Período Z","quantidade":1,"valor_nota":990,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb,
  false
);

select is(
  (select faixa from public.com_curva_abc('2025-01-01', '2025-01-31', 'MF', 'valor') where produto_codigo = 'PPERIODO'),
  'A',
  'PPERIODO domina janeiro (75% do período) e cai em A'
);
select is(
  (select faixa from public.com_curva_abc('2025-02-01', '2025-02-28', 'MF', 'valor') where produto_codigo = 'PPERIODO'),
  'C',
  'o MESMO produto (PPERIODO) é periférico em fevereiro (1% do período) e cai em C — a curva mudou com o período'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4 — a curva muda quando muda a filial: mesma competência (2025-03), o
-- mesmo produto PFILIAL domina em MF (75%) e é periférico em INBRAS (1%).
-- Mutação: ignorar p_filial faria os dois lotes se misturarem.
-- ═══════════════════════════════════════════════════════════════════════════
select public.com_importar_vendas(
  'MF', 'fixture-l6b-filial-mf.xlsx', 2,
  '{}'::jsonb,
  $items$[
    {"emissao":"2025-03-10","documento":"3001","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PFILIAL","produto_nome":"Produto Filial","quantidade":1,"valor_nota":750,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-03-11","documento":"3002","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PFILIAL_W","produto_nome":"Produto Filial W","quantidade":1,"valor_nota":250,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb,
  false
);
select public.com_importar_vendas(
  'INBRAS', 'fixture-l6b-filial-inbras.xlsx', 2,
  '{}'::jsonb,
  $items$[
    {"emissao":"2025-03-10","documento":"3003","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PFILIAL","produto_nome":"Produto Filial","quantidade":1,"valor_nota":10,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-03-11","documento":"3004","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PFILIAL_Z","produto_nome":"Produto Filial Z","quantidade":1,"valor_nota":990,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb,
  false
);

select is(
  (select faixa from public.com_curva_abc('2025-03-01', '2025-03-31', 'MF', 'valor') where produto_codigo = 'PFILIAL'),
  'A',
  'PFILIAL domina a MF na mesma competência (75%) e cai em A'
);
select is(
  (select faixa from public.com_curva_abc('2025-03-01', '2025-03-31', 'INBRAS', 'valor') where produto_codigo = 'PFILIAL'),
  'C',
  'o MESMO produto (PFILIAL), na MESMA competência, é periférico na INBRAS (1%) e cai em C — a curva mudou com a filial'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5 — devolução abate na curva: PDEV2 vende 1.000 e devolve 900 — líquido
-- 100, não 1.900. Mutação: somar `valor_nota` em vez de `valor_curva`
-- (devolução com valor positivo na origem passaria a SOMAR, não abater).
-- ═══════════════════════════════════════════════════════════════════════════
select public.com_importar_vendas(
  'MF', 'fixture-l6b-devolucao.xlsx', 3,
  '{}'::jsonb,
  $items$[
    {"emissao":"2025-05-05","documento":"4001","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PDEV1","produto_nome":"Produto Sem Devolução","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-05-06","documento":"4002","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PDEV2","produto_nome":"Produto Com Devolução","quantidade":1,"valor_nota":1000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-05-07","documento":"4003","serie":"1","tipo_documento":"NFe","cfop":"1202","classe":"devolucao","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PDEV2","produto_nome":"Produto Com Devolução","quantidade":1,"valor_nota":900,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb,
  false
);
select is(
  (select valor from public.com_curva_abc('2025-05-01', '2025-05-31', 'MF', 'valor') where produto_codigo = 'PDEV2'),
  100::numeric,
  'devolução com valor positivo na origem abate o valor da curva (1000 venda − 900 devolução = 100 líquido, não 1900)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 7 — p_criterio inválido levanta exceção nomeando os dois aceitos, nunca
-- cai num padrão silencioso.
-- ═══════════════════════════════════════════════════════════════════════════
select throws_like(
  $sql$ select * from public.com_curva_abc('2025-01-01', '2025-01-31', null, 'unidades') $sql$,
  '%valor%quantidade%',
  'p_criterio inválido levanta exceção nomeando os dois valores aceitos'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 13 (A3, correção da auditoria) — com_curva_abc_faixas: a contagem por
-- faixa é feita no banco, sobre a base INTEIRA do período, não sobre uma
-- lista que a tela cortou. Doze produtos no MESMO lote (onze positivos, um
-- com saldo negativo) — mais de dez, de propósito, para o teste do "sem
-- limit" ter alguma coisa para pegar.
-- ═══════════════════════════════════════════════════════════════════════════
select public.com_importar_vendas(
  'MF', 'fixture-l6b-faixas.xlsx', 12,
  '{}'::jsonb,
  $items$[
    {"emissao":"2025-08-05","documento":"8001","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PF01","produto_nome":"Produto Faixa 1","quantidade":1,"valor_nota":1000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-08-05","documento":"8002","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PF02","produto_nome":"Produto Faixa 2","quantidade":1,"valor_nota":900,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-08-05","documento":"8003","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PF03","produto_nome":"Produto Faixa 3","quantidade":1,"valor_nota":800,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-08-05","documento":"8004","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PF04","produto_nome":"Produto Faixa 4","quantidade":1,"valor_nota":700,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-08-05","documento":"8005","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PF05","produto_nome":"Produto Faixa 5","quantidade":1,"valor_nota":600,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-08-05","documento":"8006","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PF06","produto_nome":"Produto Faixa 6","quantidade":1,"valor_nota":500,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-08-05","documento":"8007","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PF07","produto_nome":"Produto Faixa 7","quantidade":1,"valor_nota":400,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-08-05","documento":"8008","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PF08","produto_nome":"Produto Faixa 8","quantidade":1,"valor_nota":300,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-08-05","documento":"8009","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PF09","produto_nome":"Produto Faixa 9","quantidade":1,"valor_nota":200,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-08-05","documento":"8010","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PF10","produto_nome":"Produto Faixa 10","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-08-05","documento":"8011","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PF11","produto_nome":"Produto Faixa 11","quantidade":1,"valor_nota":50,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-08-05","documento":"8012","serie":"1","tipo_documento":"NFe","cfop":"1202","classe":"devolucao","cliente_codigo":"CGEN","cliente_nome":"Cliente Genérico","produto_codigo":"PF12NEG","produto_nome":"Produto Faixa Negativo","quantidade":1,"valor_nota":300,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb,
  false
);
-- 13a. A soma das contagens por faixa é o total de produtos do período.
-- Mutação: filtrar `com_curva_abc_faixas` para só contar os positivos
-- (`where valor > 0` antes do group by) — a faixa '-' some da soma.
select is(
  (select coalesce(sum(produtos), 0)::int from public.com_curva_abc_faixas('2025-08-01', '2025-08-31', 'MF', 'valor')),
  12,
  'com_curva_abc_faixas soma 12 produtos (11 positivos + 1 fora da curva), a base inteira do período'
);
-- 13b. com_curva_abc_faixas não tem limit: os doze aparecem inteiros, não
-- só os primeiros dez. Mutação: envolver a chamada a com_curva_abc num
-- `limit 10` antes do group by.
select is(
  (select coalesce(sum(produtos), 0)::int from public.com_curva_abc_faixas('2025-08-01', '2025-08-31', 'MF', 'valor')),
  12,
  'com_curva_abc_faixas não tem limit — a contagem não muda quando a tela pediria menos linhas'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 8 — condição exige as DUAS coisas (série 75 E em_condicao), três clientes
-- separados para não esconder qual das duas quebrou. C_A tem em_condicao
-- mas vende em série 1 (não entra). C_B vende em série 75 mas é cliente
-- comum (não entra). C_C tem em_condicao E vende em série 75 (entra).
-- ═══════════════════════════════════════════════════════════════════════════
select public.com_importar_vendas(
  'MF', 'fixture-l6b-condicao.xlsx', 3,
  '{}'::jsonb,
  $items$[
    {"emissao":"2025-06-05","documento":"5001","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C_A","cliente_nome":"Cliente Condição Série 1","produto_codigo":"PCOND","produto_nome":"Produto Condição","quantidade":1,"valor_nota":500,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-06-06","documento":"5002","serie":"75","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C_B","cliente_nome":"Cliente Comum Série 75","produto_codigo":"PCOND","produto_nome":"Produto Condição","quantidade":1,"valor_nota":300,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-06-07","documento":"5003","serie":"75","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C_C","cliente_nome":"Cliente Condição Série 75","produto_codigo":"PCOND","produto_nome":"Produto Condição","quantidade":1,"valor_nota":400,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb,
  false
);
-- com_importar_vendas já criou os três em com_clientes (origem 'venda',
-- tabela_preco nulo) — agora marca a tabela de cada um, como owner.
update public.com_clientes set tabela_preco = 'ATACADISTA CONDICAO' where codigo = 'C_A' and tenant_id = (select tenant from f);
update public.com_clientes set tabela_preco = 'ATACADISTA' where codigo = 'C_B' and tenant_id = (select tenant from f);
update public.com_clientes set tabela_preco = 'ATACADISTA CONDICAO' where codigo = 'C_C' and tenant_id = (select tenant from f);

-- 8a. em_condicao SEM série 75 não entra. Mutação: tirar `i.serie = '75'`
-- da função (deixar só `c.em_condicao`).
select is(
  (select count(*)::int from public.com_pedidos_em_condicao('2025-06-01', '2025-06-30', 'MF') where cliente_codigo = 'C_A'),
  0,
  'cliente em_condicao com venda em série 1 não entra em pedidos em condição'
);
-- 8b. série 75 SEM em_condicao não entra. Mutação: tirar `c.em_condicao`
-- da função (deixar só `i.serie = '75'`).
select is(
  (select count(*)::int from public.com_pedidos_em_condicao('2025-06-01', '2025-06-30', 'MF') where cliente_codigo = 'C_B'),
  0,
  'cliente comum (sem em_condicao) com venda em série 75 não entra em pedidos em condição'
);
-- 8c. As DUAS coisas juntas: entra, com o valor certo.
select is(
  (select venda from public.com_pedidos_em_condicao('2025-06-01', '2025-06-30', 'MF') where cliente_codigo = 'C_C'),
  400::numeric,
  'cliente em_condicao COM venda em série 75 entra em pedidos em condição'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 9 — com_bonificacao_por_cliente: percentual é NULO quando o cliente só
-- recebeu bonificação (comprado = 0) — nunca zero, nunca divisão por zero.
-- ═══════════════════════════════════════════════════════════════════════════
select public.com_importar_vendas(
  'MF', 'fixture-l6b-bonificacao-nula.xlsx', 1,
  '{}'::jsonb,
  '[{"emissao":"2025-07-05","documento":"6001","serie":"1","tipo_documento":"NFe","cfop":"5910","classe":"bonificacao","cliente_codigo":"C_SOBONIFICADO","cliente_nome":"Cliente Só Bonificação","produto_codigo":"PBONI","produto_nome":"Produto Bonificado","quantidade":1,"valor_nota":200,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}]'::jsonb,
  false
);
select is(
  (select percentual from public.com_bonificacao_por_cliente('2025-07-01', '2025-07-31', 'MF', null) where cliente_codigo = 'C_SOBONIFICADO'),
  null::numeric,
  'percentual é NULO quando o cliente só recebeu bonificação (comprado = 0) — nunca zero'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 10/11 — com_clientes_a_trabalhar: 2 de 3 meses, não 1 de 3; e não comprar
-- no último mês desqualifica mesmo quem comprou nos três anteriores. Tudo
-- em 2024 (o "sistema" roda em 2026) — ancorado no ÚLTIMO MÊS COM
-- MOVIMENTO do recorte, nunca em current_date (regra 10 do pgTAP): se a
-- âncora fosse current_date, não haveria dado nenhum perto de 2026-09 e a
-- lista viria vazia mesmo com CLI_2OF3 qualificado. Mutação: trocar a
-- âncora por current_date e ver a lista esvaziar (relatado à parte).
-- ═══════════════════════════════════════════════════════════════════════════
select public.com_importar_vendas(
  'MF', 'fixture-l6b-clientes-a-trabalhar.xlsx', 9,
  '{}'::jsonb,
  $items$[
    {"emissao":"2024-01-10","documento":"7001","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CLI_2OF3","cliente_nome":"Cliente Dois de Três","produto_codigo":"PGEN","produto_nome":"Produto Genérico","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2024-01-11","documento":"7002","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CLI_1OF3","cliente_nome":"Cliente Um de Três","produto_codigo":"PGEN","produto_nome":"Produto Genérico","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2024-01-12","documento":"7003","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CLI_ACTIVE","cliente_nome":"Cliente Ativo","produto_codigo":"PGEN","produto_nome":"Produto Genérico","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2024-01-13","documento":"7008","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CLI_POS_ANCORA","cliente_nome":"Cliente Compra Depois da Âncora","produto_codigo":"PGEN","produto_nome":"Produto Genérico","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2024-02-10","documento":"7004","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CLI_2OF3","cliente_nome":"Cliente Dois de Três","produto_codigo":"PGEN","produto_nome":"Produto Genérico","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2024-02-11","documento":"7005","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CLI_ACTIVE","cliente_nome":"Cliente Ativo","produto_codigo":"PGEN","produto_nome":"Produto Genérico","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2024-02-12","documento":"7009","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CLI_POS_ANCORA","cliente_nome":"Cliente Compra Depois da Âncora","produto_codigo":"PGEN","produto_nome":"Produto Genérico","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2024-03-11","documento":"7006","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CLI_ACTIVE","cliente_nome":"Cliente Ativo","produto_codigo":"PGEN","produto_nome":"Produto Genérico","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2024-04-11","documento":"7007","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CLI_ACTIVE","cliente_nome":"Cliente Ativo","produto_codigo":"PGEN","produto_nome":"Produto Genérico","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb,
  false
);
-- CLI_POS_ANCORA compra de novo em 2025-09 — bem depois do mês-âncora
-- (abril/2024), e num mês/filial que nenhum outro bloco desta suíte usa
-- (evita colidir com a reserva de competência das seções 1-13, que já
-- ocupam MF de 2025-01 a 2025-08). Ano diferente: não entra no
-- `extract(year from competencia) = 2024` que decide `v_ultimo_mes`, então
-- não desloca a âncora dos outros clientes; só existe para `ultima_compra`
-- ter uma data posterior ao recorte para não vazar (achado A6 da
-- auditoria).
select public.com_importar_vendas(
  'MF', 'fixture-l6b-pos-ancora.xlsx', 1,
  '{}'::jsonb,
  '[{"emissao":"2025-09-10","documento":"7010","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CLI_POS_ANCORA","cliente_nome":"Cliente Compra Depois da Âncora","produto_codigo":"PGEN","produto_nome":"Produto Genérico","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}]'::jsonb,
  false
);

-- 10a. Comprou em Jan e Fev (2 dos 3 meses anteriores a abril, o último mês
-- com movimento) e não comprou em abril — aparece.
select is(
  (select count(*)::int from public.com_clientes_a_trabalhar(2024, 'MF') where cliente_codigo = 'CLI_2OF3'),
  1,
  'cliente que comprou em 2 dos 3 meses anteriores (e não no último) aparece em clientes a trabalhar'
);
-- 10b. Comprou só em janeiro (1 dos 3 meses anteriores) — não aparece.
-- Mutação: trocar `>= 2` por `>= 1`.
select is(
  (select count(*)::int from public.com_clientes_a_trabalhar(2024, 'MF') where cliente_codigo = 'CLI_1OF3'),
  0,
  'cliente que comprou em só 1 dos 3 meses anteriores NÃO aparece — a regra é 2 de 3, não 1 de 3'
);
-- 11. Comprou nos três meses anteriores E no último mês (abril) — mesmo
-- qualificando por "2 de 3", comprar no último mês desqualifica. É esta
-- linha que prova a âncora: só existe dado em abril/2024 porque a função
-- achou o último mês DENTRO do recorte de 2024, não perto de 2026-09.
select is(
  (select count(*)::int from public.com_clientes_a_trabalhar(2024, 'MF') where cliente_codigo = 'CLI_ACTIVE'),
  0,
  'cliente que comprou no último mês com movimento (abril/2024) não aparece, mesmo tendo 3 de 3 nos meses anteriores'
);

-- 14 (A6, correção da auditoria) — ultima_compra fica no fim do mês-âncora
-- (2024-04-30), nunca na compra de 2025: CLI_POS_ANCORA comprou em
-- jan/fev de 2024 (2 de 3, qualifica) e não comprou em abril (não é
-- excluído), mas comprou de novo em 2025-09 — bem depois do recorte. Se
-- `ultima_compra` fosse `max(emissao)` sobre todo o histórico (o defeito
-- original), a resposta seria 2025-09-10, não a compra mais recente DENTRO
-- do recorte. Mutação: tirar `and emissao <= v_fim_ancora` da CTE `ultima`
-- (voltar ao `max` sem limite).
select is(
  (select ultima_compra from public.com_clientes_a_trabalhar(2024, 'MF') where cliente_codigo = 'CLI_POS_ANCORA'),
  '2024-02-12'::date,
  'ultima_compra fica no fim do mês-âncora — a compra de 2025 (depois do recorte) não aparece'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 12 — isolamento entre tenants (ADR-005): usuário de outro tenant não vê
-- nenhuma linha das funções novas, mesmo pedindo o mesmo período que tem
-- dado no tenant principal.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('outro-tenant@com-l6b.test');
select is(
  (select count(*)::int from public.com_curva_abc('2025-04-01', '2025-04-30', 'MF', 'valor')),
  0,
  'usuário de outro tenant não vê nenhuma linha de com_curva_abc, mesmo pedindo o período com dado no tenant principal'
);
select tests.clear_authentication();

select * from finish();
rollback;

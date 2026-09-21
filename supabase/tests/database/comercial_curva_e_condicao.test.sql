-- Painel Comercial (L6b) — curva ABC, clientes a trabalhar, bonificação por
-- cliente e pedidos em condição. Ver .scratch/plano-l6b-curva-e-condicao.md §5.
begin;
\ir _helpers.psql

select plan(18);

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
-- classificação: faixa própria '-'. Mutação: trocar `m > 0`/`m <= 0` por
-- `m >= 0`/`m < 0` (o produto entraria na classificação com m = 0 em outro
-- cenário, ou este ficaria dentro com sinal invertido).
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
  'MF', 'fixture-l6b-clientes-a-trabalhar.xlsx', 7,
  '{}'::jsonb,
  $items$[
    {"emissao":"2024-01-10","documento":"7001","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CLI_2OF3","cliente_nome":"Cliente Dois de Três","produto_codigo":"PGEN","produto_nome":"Produto Genérico","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2024-01-11","documento":"7002","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CLI_1OF3","cliente_nome":"Cliente Um de Três","produto_codigo":"PGEN","produto_nome":"Produto Genérico","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2024-01-12","documento":"7003","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CLI_ACTIVE","cliente_nome":"Cliente Ativo","produto_codigo":"PGEN","produto_nome":"Produto Genérico","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2024-02-10","documento":"7004","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CLI_2OF3","cliente_nome":"Cliente Dois de Três","produto_codigo":"PGEN","produto_nome":"Produto Genérico","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2024-02-11","documento":"7005","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CLI_ACTIVE","cliente_nome":"Cliente Ativo","produto_codigo":"PGEN","produto_nome":"Produto Genérico","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2024-03-11","documento":"7006","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CLI_ACTIVE","cliente_nome":"Cliente Ativo","produto_codigo":"PGEN","produto_nome":"Produto Genérico","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2024-04-11","documento":"7007","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CLI_ACTIVE","cliente_nome":"Cliente Ativo","produto_codigo":"PGEN","produto_nome":"Produto Genérico","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb,
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

-- A TENDÊNCIA COMPARA SÓ OS MESES QUE EXISTEM
-- (migration 20261102020000_tendencia_so_com_os_meses_que_existem.sql)
--
-- Leva E (2026-09-26), achado ao desenhar a visão simplificada de Produtos.
--
-- O DEFEITO. `com_tendencia_produtos` divide a janela pedida em duas metades e
-- compara a segunda com a primeira — é daí que saem `variacao` e `situacao`. A
-- divisão era pelo CALENDÁRIO da janela, não pelos meses com dado. O padrão da
-- tela é "ano todo" (janeiro a **dezembro**) e os dados do test-helpoint vão até
-- **setembro**, então a segunda metade tinha três meses de venda contra seis, e
-- mais três meses que ainda não aconteceram somando zero.
--
-- Medido no banco, antes e depois:
--
--                    Jan–Dez antes   Jan–Dez depois
--   "Caindo"              175              46
--   "Crescendo"             1             115
--   variação média      −67,0%          +70,0%
--
-- Quatro vezes mais produtos acusados de cair, e a variação média trocando de
-- sinal. Nenhum erro, nenhum aviso — só um outubro que não chegou.
--
-- POR QUE A FIXTURE TEM OITO MESES DE DADO NUMA JANELA DE DOZE. Porque é o defeito
-- em miniatura: pedir o ano todo quando só parte dele foi importada. Com os meses
-- batendo com a janela, todas as asserções abaixo passariam mesmo com a função
-- errada — é a mesma razão de a suíte do farol do cashback usar um cliente que
-- compra em três meses.
--
-- Oito meses, e não quatro, porque 'Esporádico' precisa de espaço para existir: a
-- regra é `meses_com_venda / total_meses <= 0.30`, e numa janela de quatro meses
-- nenhum produto pode ter venda nas duas metades e ainda ficar abaixo de 30%.
begin;
\ir _helpers.psql

select plan(6);

create temporary table f on commit drop as
select tests.create_tenant('tendencia-janela', 'Tendencia Janela', false) as tenant;

create temporary table u on commit drop as
select tests.create_user('owner@tendencia-janela.test', (select tenant from f)) as owner;

select tests.grant_role((select owner from u), 'owner');
grant select on f, u to authenticated;

select tests.authenticate_as('owner@tendencia-janela.test');

insert into public.com_clientes (codigo, razao_social, tabela_preco, ativo) values
  ('TJ1', 'Cliente Tendencia', 'ATACADISTA', true);

-- ═══════════════════════════════════════════════════════════════════════════
-- A FIXTURE: vendas de JANEIRO A AGOSTO de 2031. As consultas pedem
-- JANEIRO A DEZEMBRO — quatro meses que não existem, como na tela.
--
-- Com a janela corrigida (Jan–Ago, oito meses), o meio cai entre abril e maio:
--   primeira metade = Jan, Fev, Mar, Abr
--   segunda  metade = Mai, Jun, Jul, Ago
--
--   PEST  1.000 em cada um dos oito meses
--         → 4.000 contra 4.000 → Estável, variação 0
--         → com a janela velha: 4.000 contra 0 → Descontinuado, variação −100%
--
--   PCAI  1.000 em Jan–Abr, 100 em Mai–Ago
--         → 4.000 contra 400 → Caindo, variação −90%
--         (o sinal que a correção NÃO pode apagar: queda de verdade continua queda)
--
--   PESP  1.000 em janeiro e 1.000 em maio — dois meses dos oito
--         → 2/8 = 0,25 ≤ 0,30 → Esporádico
--         → com a janela velha: 2/12 = 0,167, e ainda por cima Jan e Mai caem
--           os dois na primeira metade (Jan–Jun) → Descontinuado
--
--   PTRE  1.000 em janeiro, fevereiro e maio — três meses dos oito
--         → 3/8 = 0,375 > 0,30 → NÃO é Esporádico
--         → com a janela velha: 3/12 = 0,25 ≤ 0,30 → Esporádico. É o par que
--           separa o denominador certo do errado.
-- ═══════════════════════════════════════════════════════════════════════════
select public.com_importar_vendas('MF', 'fixture-tendencia-janela.xlsx', 21, '{}'::jsonb,
  $items$[
    {"emissao":"2031-01-05","documento":"T01","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"TJ1","cliente_nome":"Cliente Tendencia","produto_codigo":"PEST","produto_nome":"Produto Estavel","quantidade":10,"valor_nota":1000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-02-05","documento":"T02","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"TJ1","cliente_nome":"Cliente Tendencia","produto_codigo":"PEST","produto_nome":"Produto Estavel","quantidade":10,"valor_nota":1000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-03-05","documento":"T03","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"TJ1","cliente_nome":"Cliente Tendencia","produto_codigo":"PEST","produto_nome":"Produto Estavel","quantidade":10,"valor_nota":1000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-04-05","documento":"T04","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"TJ1","cliente_nome":"Cliente Tendencia","produto_codigo":"PEST","produto_nome":"Produto Estavel","quantidade":10,"valor_nota":1000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-05-05","documento":"T05","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"TJ1","cliente_nome":"Cliente Tendencia","produto_codigo":"PEST","produto_nome":"Produto Estavel","quantidade":10,"valor_nota":1000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-06-05","documento":"T06","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"TJ1","cliente_nome":"Cliente Tendencia","produto_codigo":"PEST","produto_nome":"Produto Estavel","quantidade":10,"valor_nota":1000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-07-05","documento":"T07","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"TJ1","cliente_nome":"Cliente Tendencia","produto_codigo":"PEST","produto_nome":"Produto Estavel","quantidade":10,"valor_nota":1000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-08-05","documento":"T08","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"TJ1","cliente_nome":"Cliente Tendencia","produto_codigo":"PEST","produto_nome":"Produto Estavel","quantidade":10,"valor_nota":1000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},

    {"emissao":"2031-01-06","documento":"T09","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"TJ1","cliente_nome":"Cliente Tendencia","produto_codigo":"PCAI","produto_nome":"Produto Caindo","quantidade":10,"valor_nota":1000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-02-06","documento":"T10","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"TJ1","cliente_nome":"Cliente Tendencia","produto_codigo":"PCAI","produto_nome":"Produto Caindo","quantidade":10,"valor_nota":1000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-03-06","documento":"T11","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"TJ1","cliente_nome":"Cliente Tendencia","produto_codigo":"PCAI","produto_nome":"Produto Caindo","quantidade":10,"valor_nota":1000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-04-06","documento":"T12","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"TJ1","cliente_nome":"Cliente Tendencia","produto_codigo":"PCAI","produto_nome":"Produto Caindo","quantidade":10,"valor_nota":1000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-05-06","documento":"T13","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"TJ1","cliente_nome":"Cliente Tendencia","produto_codigo":"PCAI","produto_nome":"Produto Caindo","quantidade":1,"valor_nota":100.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-06-06","documento":"T14","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"TJ1","cliente_nome":"Cliente Tendencia","produto_codigo":"PCAI","produto_nome":"Produto Caindo","quantidade":1,"valor_nota":100.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-07-06","documento":"T15","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"TJ1","cliente_nome":"Cliente Tendencia","produto_codigo":"PCAI","produto_nome":"Produto Caindo","quantidade":1,"valor_nota":100.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-08-06","documento":"T16","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"TJ1","cliente_nome":"Cliente Tendencia","produto_codigo":"PCAI","produto_nome":"Produto Caindo","quantidade":1,"valor_nota":100.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},

    {"emissao":"2031-01-07","documento":"T17","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"TJ1","cliente_nome":"Cliente Tendencia","produto_codigo":"PESP","produto_nome":"Produto Esporadico","quantidade":10,"valor_nota":1000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-05-07","documento":"T18","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"TJ1","cliente_nome":"Cliente Tendencia","produto_codigo":"PESP","produto_nome":"Produto Esporadico","quantidade":10,"valor_nota":1000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},

    {"emissao":"2031-01-08","documento":"T19","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"TJ1","cliente_nome":"Cliente Tendencia","produto_codigo":"PTRE","produto_nome":"Produto Tres Meses","quantidade":10,"valor_nota":1000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-02-08","documento":"T20","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"TJ1","cliente_nome":"Cliente Tendencia","produto_codigo":"PTRE","produto_nome":"Produto Tres Meses","quantidade":10,"valor_nota":1000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-05-08","documento":"T21","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"TJ1","cliente_nome":"Cliente Tendencia","produto_codigo":"PTRE","produto_nome":"Produto Tres Meses","quantidade":10,"valor_nota":1000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb, false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. A JANELA ENCOLHEU. `serie_mensal` tem uma posição por mês da janela usada —
-- então ela é a prova mais direta de que a função parou de olhar dezembro.
--
-- Mutação: voltar o `generate_series` para `p_de .. p_ate` faz isto virar 12.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select jsonb_array_length(serie_mensal)
     from public.com_tendencia_produtos('2031-01-01', '2031-12-31', null, 'valor')
    where produto_codigo = 'PEST'),
  8,
  'pedindo Jan–Dez com dado até agosto, a série mensal tem OITO posições — não doze'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. O CASO QUE DAVA A RESPOSTA OPOSTA. O PEST vendeu o mesmo valor nos oito
-- meses: ele é o retrato de "nada mudou". A função errada o chamava de
-- **Descontinuado**, com variação de −100%, porque comparava Jan–Jun com
-- Jul–Dez e metade do Jul–Dez não existe.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select row(situacao, variacao, primeira_metade, segunda_metade)
     from public.com_tendencia_produtos('2031-01-01', '2031-12-31', null, 'valor')
    where produto_codigo = 'PEST'),
  row('Estável'::text, 0::numeric, 4000.00::numeric, 4000.00::numeric),
  'produto que vendeu igual nos oito meses é Estável, com as duas metades em 4.000 — não Descontinuado'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. E A QUEDA DE VERDADE CONTINUA QUEDA. Esta é a asserção que impede a
-- correção de virar cegueira: encolher a janela não pode apagar o sinal. O PCAI
-- caiu de 1.000 para 100 por mês DENTRO dos meses que existem.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select row(situacao, variacao)
     from public.com_tendencia_produtos('2031-01-01', '2031-12-31', null, 'valor')
    where produto_codigo = 'PCAI'),
  row('Caindo'::text, (-0.9000)::numeric),
  'queda real dentro da janela continua sendo Caindo, com −90%'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4 e 5. O DENOMINADOR DO "ESPORÁDICO", que era o segundo efeito do mesmo
-- defeito: `meses_com_venda / total_meses <= 0.30`. Com o total em 12 e só oito
-- meses possíveis, a conta subestimava a regularidade de todo produto.
--
--   PESP  2 de 8 = 0,250 → Esporádico  (certo)
--   PTRE  3 de 8 = 0,375 → não é       (com 12: 3/12 = 0,25 → seria)
--
-- É o par que separa o denominador certo do errado. Uma asserção só não separa:
-- com 12 no denominador, o PESP também daria "Esporádico" — pelo motivo errado.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select situacao from public.com_tendencia_produtos('2031-01-01', '2031-12-31', null, 'valor')
    where produto_codigo = 'PESP'),
  'Esporádico'::text,
  'vendeu em 2 dos 8 meses (25%) — é Esporádico'
);

select isnt(
  (select situacao from public.com_tendencia_produtos('2031-01-01', '2031-12-31', null, 'valor')
    where produto_codigo = 'PTRE'),
  'Esporádico'::text,
  'vendeu em 3 dos 8 meses (37,5%) — NÃO é Esporádico, e com o denominador em 12 seria'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. JANELA SEM DADO NENHUM devolve zero linha, como antes. A correção pôs um
-- `return` explícito no início; sem esta asserção, um erro ali (devolver uma
-- linha de nulos, por exemplo) só apareceria numa tela vazia com "—" em toda
-- coluna, que se parece muito com "ainda não importei".
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select count(*)::int from public.com_tendencia_produtos('2035-01-01', '2035-12-31', null, 'valor')),
  0,
  'ano sem venda nenhuma devolve zero linha, não uma linha de nulos'
);

select tests.clear_authentication();

select * from finish();
rollback;

-- O FAROL DO CASHBACK — e as duas coisas que ele existe para não deixar mentir
-- (migration 20261101010000_cashback_farol.sql)
--
-- Leva D, desenhada com o dono em 2026-09-26 sobre os dados reais de 2026 e
-- confirmada por ele: corte em **um quarto da faixa**, e o bloco de tabela sem
-- faixa como informação, não alerta.
--
-- AS DUAS PROPRIEDADES QUE ESTA SUÍTE PRENDE, e nenhuma delas é "a função
-- devolve o que eu escrevi":
--
-- 1. **O CORTE CORTA.** O farol tem de deixar de fora quem faltou muito. Uma
--    lista ordenada por distância NÃO é um farol — a tabela do analítico já era
--    isso, com 20 nomes dos quais 17 faltaram de 44% a 99% da faixa (um comprou
--    R$ 33 contra R$ 5.000). A fixture põe um cliente de cada lado da linha e a
--    asserção 2 prova que o de longe não entra;
--
-- 2. **O MÊS FECHA COM A FAIXA.** `comprado_no_mes + faltou = minimo`, SEMPRE.
--    Esta é a que importa mais, porque o defeito que ela previne já estava na
--    tela: o analítico mostrava a compra do ANO ao lado do que faltou num MÊS, e
--    para 12 dos 20 clientes de 2026 os dois não somavam a faixa. A fixture
--    abaixo tem um cliente comprando em TRÊS meses de propósito — com um mês só,
--    ano e mês coincidem e a asserção passaria sem provar nada.
begin;
\ir _helpers.psql

select plan(9);

create temporary table f on commit drop as
select tests.create_tenant('cashback-farol', 'Cashback Farol', false) as tenant;

create temporary table u on commit drop as
select tests.create_user('owner@cashback-farol.test', (select tenant from f)) as owner;

select tests.grant_role((select owner from u), 'owner');
grant select on f, u to authenticated;

select tests.authenticate_as('owner@cashback-farol.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- AS FAIXAS. O `trg_com_semear_faixas_cashback` já semeou as três tabelas
-- padrão no INSERT do tenant (ATACADISTA mínimo 5.000, VIP 5.000, VIP MAIS
-- 3.000). Uma tabela SEM faixa é o que a asserção 7 precisa, e ela não se
-- cadastra: basta um cliente numa tabela que a semente não cobre.
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.com_clientes (codigo, razao_social, tabela_preco, ativo) values
  -- Perto de bater: um mês só, para o número ser fácil de ler na asserção.
  ('CF1', 'Perto Num Mes',        'ATACADISTA', true),
  -- Perto de bater comprando em TRÊS meses — o caso que prova o mês.
  ('CF2', 'Perto Em Tres Meses',  'VIP MAIS',   true),
  -- Longe: comprou pouco, tem de ficar FORA do farol.
  ('CF3', 'Longe Da Faixa',       'ATACADISTA', true),
  -- Bateu a faixa: ganhou cashback, não é caso de farol.
  ('CF4', 'Bateu A Faixa',        'ATACADISTA', true),
  -- Tabela que a semente não cobre: sem faixa nenhuma.
  ('CF5', 'Tabela Sem Faixa',     'REVENDA',    true),
  -- Sem tabela no cadastro: `tabela_preco` nulo.
  ('CF6', 'Sem Tabela Nenhuma',   null,         true);

-- ═══════════════════════════════════════════════════════════════════════════
-- AS VENDAS de 2031. Uma nota por linha; `valor_curva` = `valor_nota` porque
-- tudo é classe `venda` (CFOP 5101).
--
--   CF1  jan  4.000,00  → faixa 5.000, faltou 1.000 = 20% → ACENDE
--   CF2  jan  1.000,00
--        fev  2.400,00  → faixa 3.000, faltou   600 = 20% → ACENDE pelo MÊS
--        mar    500,00     (ano = 3.900, que PASSA de 3.000 — a armadilha)
--   CF3  jan  1.000,00  → faixa 5.000, faltou 4.000 = 80% → não acende
--   CF4  jan  6.000,00  → passou de 5.000, ganhou cashback → não acende
--   CF5  jan    700,00  → REVENDA não tem faixa → tabela, não cliente
--   CF6  jan  1.500,00  → sem tabela → acende como `sem_tabela`
--
-- O CF2 É O CORAÇÃO DA SUÍTE. No ano ele comprou R$ 3.900, MAIS que a faixa de
-- R$ 3.000 — quem olhasse o ano concluiria que ele bateu. Ele não bateu em mês
-- nenhum: o melhor mês foi fevereiro, com R$ 2.400. Se o farol usasse o ano, o
-- CF2 sairia da lista (ou entraria com número errado); usando o mês, ele entra
-- com R$ 2.400 + R$ 600 = R$ 3.000.
-- ═══════════════════════════════════════════════════════════════════════════
select public.com_importar_vendas('MF', 'fixture-cashback-farol.xlsx', 8, '{}'::jsonb,
  $items$[
    {"emissao":"2031-01-10","documento":"F1","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CF1","cliente_nome":"Perto Num Mes","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":4000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-01-11","documento":"F2","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CF2","cliente_nome":"Perto Em Tres Meses","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":1000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-02-11","documento":"F3","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CF2","cliente_nome":"Perto Em Tres Meses","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":2400.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-03-11","documento":"F4","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CF2","cliente_nome":"Perto Em Tres Meses","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":500.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-01-12","documento":"F5","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CF3","cliente_nome":"Longe Da Faixa","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":1000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-01-13","documento":"F6","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CF4","cliente_nome":"Bateu A Faixa","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":6000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-01-14","documento":"F7","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CF5","cliente_nome":"Tabela Sem Faixa","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":700.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-01-15","documento":"F8","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CF6","cliente_nome":"Sem Tabela Nenhuma","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":1500.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb, false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. QUEM ACENDE, e só eles. Dois de "perto de bater" e um de "sem tabela" —
-- e nenhum dos outros três.
--
-- Mutação: tirar `and a.cashback_no_ano = 0` da função faz o CF4 (que BATEU a
-- faixa) entrar como "perto de bater", porque o melhor mês dele sem cashback
-- não existe… na verdade ele sai do `melhor_mes` por não ter mês com cashback
-- zero, e a asserção segue verde. A que pega o CF4 é a 4.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select array_agg(cliente_codigo order by cliente_codigo)
     from public.com_cashback_farol_clientes(2031)),
  array['CF1','CF2','CF6'],
  'acendem só os dois que chegaram perto e o que não tem tabela — e mais ninguém'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. O CORTE CORTA. O CF3 comprou R$ 1.000 contra uma faixa de R$ 5.000:
-- faltou 80%. Chamar isso de "perto de bater" seria mentir com rótulo gentil, e
-- é exatamente o que uma lista sem corte faz.
--
-- Mutação: trocar `* 0.25` por `* 1` (sem corte) faz o CF3 entrar e esta acusar.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select count(*)::int from public.com_cashback_farol_clientes(2031)
    where cliente_codigo = 'CF3'),
  0,
  'quem faltou 80% da faixa NÃO é "perto de bater" — o corte é um quarto'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3 e 4. O MÊS, E A ARMADILHA DO ANO. O CF2 comprou R$ 3.900 no ano — MAIS que
-- a faixa de R$ 3.000 — em três meses, e não bateu em nenhum. Quem somasse o ano
-- diria que ele bateu.
--
-- A asserção 3 prende os números do MÊS certo (fevereiro, R$ 2.400, faltou
-- R$ 600) e a 4 prende a propriedade que faz o farol não mentir:
-- **comprado_no_mes + faltou = minimo**, para toda linha de "perto de bater".
--
-- Mutação: usar `a.comprado_no_ano` em vez de `mm.comprado` no cálculo do
-- `faltou` faz a 4 acusar na hora — 3.900 + (3.000 − 3.900) não é 3.000, e o
-- sinal fica negativo.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select row(competencia, comprado_no_mes, minimo, faltou, comprou_da_faixa, comprado_no_ano)
     from public.com_cashback_farol_clientes(2031) where cliente_codigo = 'CF2'),
  row('2031-02-01'::date, 2400.00::numeric, 3000.00::numeric, 600.00::numeric, 80.0::numeric, 3900.00::numeric),
  'o melhor MÊS do CF2 é fevereiro (2.400 de 3.000), e o ano dele (3.900) vai em coluna própria'
);

select is(
  (select bool_and(comprado_no_mes + faltou = minimo)
     from public.com_cashback_farol_clientes(2031) where motivo = 'perto_de_bater'),
  true,
  'em toda linha de "perto de bater", comprado_no_mes + faltou = a faixa — os números FECHAM'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. QUEM BATEU NÃO ACENDE. O CF4 comprou R$ 6.000 e ganhou cashback. Sem esta,
-- uma função que esquecesse o filtro de `cashback_no_ano` encheria o farol de
-- bons clientes — e farol que acende para todo mundo não acende para ninguém.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select count(*)::int from public.com_cashback_farol_clientes(2031)
    where cliente_codigo = 'CF4'),
  0,
  'quem bateu a faixa e ganhou cashback não aparece no farol'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. SEM TABELA É AUSÊNCIA, NÃO ZERO. O CF6 comprou R$ 1.500 e não tem tabela
-- no cadastro: ele nem foi MEDIDO. As colunas de faixa vêm nulas de propósito —
-- `0` ali diria "a faixa dele é zero", que é outra afirmação, e falsa.
--
-- É a mesma distinção que a Frente 2 existiu para estabelecer, e a razão de o
-- analítico ter cartão separado para "sem tabela" e "sem programa".
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select row(motivo, competencia, comprado_no_mes, minimo, faltou, comprou_da_faixa, comprado_no_ano)
     from public.com_cashback_farol_clientes(2031) where cliente_codigo = 'CF6'),
  -- `'sem_tabela'::text` e não `'sem_tabela'` solto: dentro de `row(...)` o
  -- literal chega como `unknown` e o `is` do pgTAP estoura com "cannot compare
  -- dissimilar column types text and unknown". Mesma pedra do farol da
  -- bonificação, e ela não avisa — o erro fala de tipo, não de aspas.
  row('sem_tabela'::text, null::date, null::numeric, null::numeric, null::numeric, null::numeric, 1500.00::numeric),
  'sem tabela no cadastro: as colunas de faixa são NULAS, nunca zero — ele não foi medido'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 7 e 8. AS TABELAS. O CF5 está em REVENDA, que a semente não cobre. Ele tem de
-- aparecer no farol de TABELAS e **não** no de clientes: a decisão é por tabela
-- ("REVENDA tem cashback ou não?"), e um cliente por linha daria seis linhas para
-- uma pergunta só.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select row(tabela_base, clientes, comprado) from public.com_cashback_farol_tabelas(2031)),
  row('REVENDA'::text, 1::bigint, 700.00::numeric),
  'a tabela sem faixa aparece agrupada, com quantos clientes e quanto compraram'
);

select is(
  (select count(*)::int from public.com_cashback_farol_clientes(2031)
    where cliente_codigo = 'CF5'),
  0,
  'e o cliente dela NÃO aparece no farol de clientes — a pergunta é sobre a tabela'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. `anon` NÃO EXECUTA nenhuma das duas. Catálogo, não dado — e é a regra 14
-- do pgTAP no CLAUDE.md: função nasce aberta para PUBLIC, e as duas nascem nesta
-- migration. Sem isto, o farol do cashback seria a próxima porta destrancada.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  array[
    has_function_privilege('anon', 'public.com_cashback_farol_clientes(integer,text)', 'execute'),
    has_function_privilege('anon', 'public.com_cashback_farol_tabelas(integer,text)', 'execute')
  ],
  array[false, false],
  'anon não executa nenhuma das duas funções do farol'
);

select tests.clear_authentication();

select * from finish();
rollback;

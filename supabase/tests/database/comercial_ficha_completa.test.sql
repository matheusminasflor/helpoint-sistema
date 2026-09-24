-- Frente 5a — a ficha do cliente completa (§11 do documento do dono). Ver
-- .scratch/plano-frente5-ficha-e-conciliacao.md §5a e a migration
-- 20261025010000_comercial_ficha_completa.sql. Uma asserção por bloco, cada
-- uma com fixture verificada à mão (ou por consulta direta) antes de virar
-- asserção — nenhuma decorativa.
--
-- Correções da auditoria (.scratch/plano-frente5a-correcoes.md,
-- 20261025020000_comercial_ficha_completa_correcoes.sql): a fixture do
-- período anterior (item 1) foi refeita para a fórmula em MESES — o antigo
-- `PDEZ` em 2024-12-31 só existia para "cobrir" a fórmula em DIAS, que
-- estava errada; com a fórmula certa dezembro não entra no anterior de
-- abril-junho, e o item virou `PJAN` (janeiro de 2025, comprado por
-- OUTRO-COMPRADOR — nunca por FICHA5A, para não quebrar a asserção do
-- bloco 3 de que janeiro não tem venda DELE). As seções novas do fim do
-- arquivo (itens 1 a 6.2) provam as correções; nenhuma mexe na fórmula para
-- a fixture passar.
begin;
\ir _helpers.psql

select plan(45);

-- ═══════════════════════════════════════════════════════════════════════════
-- Fixtures — dois tenants. O segundo NÃO fica vazio (lição da 5b, auditoria
-- de 2026-09-23): ele tem o MESMO código de cliente ('FICHA5A'), no MESMO
-- período, com valor DIFERENTE — isolamento provado por número próprio, não
-- por ausência.
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table f on commit drop as
select tests.create_tenant('com-ficha5a', 'Comercial Ficha5a', false) as tenant,
       tests.create_tenant('com-ficha5a-outro', 'Comercial Ficha5a Outro', false) as outro_tenant;
create temporary table u on commit drop as
select tests.create_user('owner@com-ficha5a.test', (select tenant from f)) as owner,
       tests.create_user('outro-owner@com-ficha5a.test', (select outro_tenant from f)) as outro_owner;
select tests.grant_role((select owner from u), 'owner');
select tests.grant_role((select outro_owner from u), 'owner');
grant select on f, u to authenticated;

select tests.authenticate_as('owner@com-ficha5a.test');

-- Bloco 1 — identificação: um cliente comum e um de tabela CONDICAO.
insert into public.com_clientes (codigo, razao_social, tabela_preco, ativo) values
  ('FICHA5A', 'Cliente Ficha Cinco A', 'ATACADISTA', true),
  ('FICHACOND', 'Cliente Em Condicao', 'ATACADISTA CONDICAO', true);

-- Produtos usados pelos blocos de faixa (curva/mix/comprou/evolução) —
-- precisam existir em com_produtos para aparecer em nunca_comprou (mesma
-- exigência da com_ficha_cliente antiga, migration 20261016010000).
insert into public.com_produtos (codigo, nome) values
  ('PIND', 'Indicador'), ('PMEU', 'Meu'), ('PZA', 'ZA'), ('PMIN', 'Min'),
  ('PFLIP2', 'Flip2'), ('PFLIPX', 'FlipX'), ('PFLIPY', 'FlipY'),
  ('PNOVO', 'Novo'), ('PZEROU', 'Zerou'), ('PJAN', 'Janeiro'),
  ('PNC_A', 'NcA'), ('PNC_B', 'NcB'), ('PNC_C', 'NcC'),
  ('PBON', 'Bonificado'), ('PSTOP5', 'Parou'), ('PONE5', 'UmMesSo'), ('POK5', 'Ok');

insert into public.com_vendas_importacoes (tipo, filial, file_name, linhas_lidas)
values ('vendas', 'MF', 'fixture-ficha5a', 1);

with imp as (select id from public.com_vendas_importacoes order by created_at desc limit 1)
insert into public.com_vendas_itens (
  importacao_id, filial, emissao, documento, serie, cfop, classe,
  cliente_codigo, produto_codigo, produto_nome, quantidade, valor_nota
)
select imp.id, x.filial, x.emissao::date, x.documento, '1', '5101', x.classe,
       x.cliente_codigo, x.produto_codigo, x.produto_nome, 1, x.valor_nota
from imp, (values
  -- Indicadores (bloco 2): FICHA5A com os 3 meses anteriores completos.
  ('MF','2025-03-10','D1','venda','FICHA5A','PIND','Indicador',100),
  ('MF','2025-04-10','D2','venda','FICHA5A','PIND','Indicador',200),
  ('MF','2025-05-10','D3','venda','FICHA5A','PIND','Indicador',300),
  ('MF','2025-06-10','D4','venda','FICHA5A','PMEU','Meu',800),
  ('MF','2025-06-11','D5','venda','FICHA5A','PZA','ZA',150),
  ('MF','2025-06-12','D6','venda','FICHA5A','PMIN','Min',50),
  -- Indicadores (bloco 2): FICHA5B só tem abril dos 3 meses anteriores.
  ('MF','2025-04-15','D7','venda','FICHA5B','PIND','Indicador',200),
  ('MF','2025-06-15','D8','venda','FICHA5B','PIND','Indicador',500),
  -- Mix por faixa (bloco 4): PFLIP2 constante (50) nos dois lados; o ruído
  -- do mercado muda entre os trimestres.
  ('MF','2025-02-10','D9','venda','FICHA5A','PFLIP2','Flip2',50),
  ('MF','2025-02-11','D10','venda','OUTRO-COMPRADOR','PFLIPX','FlipX',30),
  ('MF','2025-02-12','D11','venda','OUTRO-COMPRADOR','PFLIPY','FlipY',20),
  ('MF','2025-06-13','D12','venda','FICHA5A','PFLIP2','Flip2',50),
  ('MF','2025-06-14','D13','venda','OUTRO-COMPRADOR','PFLIPBIGX','FlipBigX',10000),
  -- Nunca comprou (bloco 9): OUTRO-COMPRADOR compra, FICHA5A nunca. Num
  -- trimestre PRÓPRIO (3º), isolado do 2º trimestre — a curva geral do 2º
  -- trimestre já tem PFLIPBIGX (10000) e outros produtos deste fixture
  -- misturados, e testar aqui faria as três faixas colapsarem em C
  -- (verificado: com o ruído do 2º trimestre, as três caem em C — a
  -- fixture ficaria decorativa).
  ('MF','2025-07-05','D14','venda','OUTRO-COMPRADOR','PNC_A','NcA',70),
  ('MF','2025-07-06','D15','venda','OUTRO-COMPRADOR','PNC_B','NcB',20),
  ('MF','2025-07-07','D16','venda','OUTRO-COMPRADOR','PNC_C','NcC',10),
  -- Evolução produtos (bloco 6) e período anterior (bloco 5): PJAN em
  -- janeiro de 2025 mantém o INÍCIO do que foi importado em MF em janeiro
  -- (para o anterior de abril-junho, que é janeiro-março, "existir e estar
  -- completo"). Comprado por OUTRO-COMPRADOR — nunca por FICHA5A — porque
  -- se fosse dele, janeiro deixaria de estar "sem venda" no bloco 3.
  -- PNOVO só no atual, PZEROU só no anterior (fevereiro).
  ('MF','2025-01-15','D17','venda','OUTRO-COMPRADOR','PJAN','Janeiro',5),
  ('MF','2025-06-19','D18','venda','FICHA5A','PNOVO','Novo',500),
  ('MF','2025-02-20','D19','venda','FICHA5A','PZEROU','Zerou',300),
  -- Bonificado (bloco 8a).
  ('MF','2025-05-20','D20','bonificacao','FICHA5A','PBON','Bonificado',40),
  -- Parou de comprar (bloco 8b): comprou em 2 dos 3 meses anteriores ao
  -- último mês com movimento (junho) e não comprou em junho; PONE5 comprou
  -- só 1 dos 3 (não deve aparecer).
  ('MF','2025-04-25','D21','venda','FICHA5A','PSTOP5','Parou',60),
  ('MF','2025-05-25','D22','venda','FICHA5A','PSTOP5','Parou',60),
  ('MF','2025-04-26','D23','venda','FICHA5A','PONE5','UmMesSo',60),
  ('MF','2025-06-26','D24','venda','FICHA5A','POK5','Ok',60)
) as x(filial, emissao, documento, classe, cliente_codigo, produto_codigo, produto_nome, valor_nota);

-- ═══════════════════════════════════════════════════════════════════════════
-- Bloco 1 — identificação. `em_condicao` reusa a coluna gerada de
-- com_clientes (mesmo critério de com_faturamento_por_cliente).
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select em_condicao from public.com_ficha_identificacao('FICHA5A')),
  false,
  'FICHA5A (tabela ATACADISTA, sem CONDICAO) não é marcado em_condicao'
);
select is(
  (select em_condicao from public.com_ficha_identificacao('FICHACOND')),
  true,
  'FICHACOND (tabela ATACADISTA CONDICAO) é marcado em_condicao'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Bloco 2 — indicadores. FICHA5A tem os 3 meses anteriores completos: mar=
-- 100 (PIND), abr=320 (PIND 200 + PSTOP5 60 + PONE5 60), mai=360 (PIND 300
-- + PSTOP5 60) — média=260. Junho (último mês)=1610 (PMEU 800+PZA 150+
-- PMIN 50+PFLIP2 50+PNOVO 500+POK5 60). Variação = (1610-260)/260 =
-- 5.1923.
--
-- FICHA5B comprou só em abril (200) e junho (500, último mês) — mas março
-- e maio, mesmo SEM compra DELE, estão dentro do que foi importado para MF
-- (outros clientes compraram nesses meses) e contam como ZERO REAL (item 4
-- das correções): média = (200+0+0)/3 = 66,6667; variação =
-- (500-66,6667)/66,6667 = 6.5 — nunca NULL só porque o cliente não
-- comprou. A prova de "menos de 3 meses COBERTOS PELO IMPORTADO → NULL"
-- (o outro lado da mesma regra) mora agora na fixture de INBRAS, com
-- FICHA5D — ver a seção das correções, mais abaixo.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select variacao from public.com_ficha_indicadores('FICHA5A', '2025-04-01', '2025-06-30', 'MF')),
  5.1923::numeric,
  'FICHA5A com os 3 meses anteriores completos: variação = (1610-260)/260 = 5.1923'
);
select is(
  (select variacao from public.com_ficha_indicadores('FICHA5B', '2025-04-01', '2025-06-30', 'MF')),
  6.5::numeric,
  'FICHA5B: março e maio sem compra DELE mas dentro do importado contam como zero real — variação = (500-66,6667)/66,6667 = 6.5, nunca NULL por falta de compra'
);
select is(
  (select media_3_anteriores from public.com_ficha_indicadores('FICHA5B', '2025-04-01', '2025-06-30', 'MF')),
  (200::numeric / 3),
  'FICHA5B: media_3_anteriores leva os zeros reais de março e maio — (200+0+0)/3 = 66,6667, nunca ignora os meses sem compra'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Bloco 3 — mensal_do_ano. Janeiro (sem venda DE FICHA5A — PJAN é de OUTRO-
-- COMPRADOR) é NULL, não 0; junho (com venda) traz o valor real.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select valor from public.com_ficha_mensal_do_ano('FICHA5A', '2025-06-30', 'MF') where mes = '2025-01-01'),
  null::numeric,
  'mensal_do_ano: janeiro sem venda de FICHA5A é NULL, não zero'
);
select is(
  (select valor from public.com_ficha_mensal_do_ano('FICHA5A', '2025-06-30', 'MF') where mes = '2025-06-01'),
  1610::numeric,
  'mensal_do_ano: junho com venda traz o valor real (800+150+50+50+500+60)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Bloco 4 — mix_por_faixa é relativo ao período, nunca gravado. No 1º
-- trimestre (mercado pequeno: PZEROU+PIND dominam), PFLIP2 (50) cai na
-- faixa A/B junto do resto; no 2º trimestre (PFLIPBIGX=10000 dominando o
-- mercado), a faixa A desaparece da ficha de FICHA5A por completo — o
-- MESMO cliente, o MESMO produto, faixas diferentes.
-- ═══════════════════════════════════════════════════════════════════════════
select ok(
  (select bool_or(faixa = 'A') from public.com_ficha_mix_por_faixa('FICHA5A', '2025-01-01', '2025-03-31', 'MF')),
  'mix_por_faixa no 1º trimestre: FICHA5A tem produto na faixa A — mutação executada: fixar o com_curva_abc interno em ''2025-01-01''/''2025-12-31'' (ano inteiro) faz este have virar false (confirmado; a mutação dilui tudo atrás de PFLIPBIGX no ano inteiro, e nenhum produto de FICHA5A sobra na faixa A)'
);
select is(
  (select bool_or(faixa = 'A') from public.com_ficha_mix_por_faixa('FICHA5A', '2025-04-01', '2025-06-30', 'MF')),
  false,
  'mix_por_faixa no 2º trimestre (mercado dominado por PFLIPBIGX): FICHA5A NÃO tem produto na faixa A — a faixa mudou porque o PERÍODO mudou, nunca por gravação'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Bloco 5 — evolução por faixa: total do período atual bate com o
-- faturamento (2290); o mês de fevereiro do anterior (corrigido para
-- janeiro-março — item 1 das correções) mostra PZEROU (300, faixa A dele
-- mesmo) e PFLIP2 (50, faixa B), não gravado. A prova principal (fora do
-- teto de 500) vem depois, com uma fixture própria.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select (public.com_ficha_evolucao_faixa('FICHA5A', '2025-04-01', '2025-06-30', '2025-01-01', '2025-03-31', 'MF') ->> 'total')::numeric),
  2290::numeric,
  'evolucao_faixa: o total do período atual bate com o faturamento (2290)'
);
select is(
  (select (elem ->> 'valor_a')::numeric
   from jsonb_array_elements(public.com_ficha_evolucao_faixa('FICHA5A', '2025-04-01', '2025-06-30', '2025-01-01', '2025-03-31', 'MF') -> 'anterior') elem
   where elem ->> 'competencia' = '2025-02-01'),
  300::numeric,
  'evolucao_faixa: fevereiro (anterior corrigido para janeiro-março) mostra PZEROU (300) na faixa A dele mesmo, calculada sobre a própria janela anterior'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Bloco 6 — evolução produto a produto: PNOVO (só no atual) marca 'novo',
-- PZEROU (só no anterior) marca 'zerou'. `anterior_existe`/`anterior_
-- completo` respondem ao que foi IMPORTADO — MF tem janeiro (cobre o
-- anterior inteiro, corrigido para janeiro-março — item 1 das correções);
-- INBRAS não tem nenhuma linha desta empresa.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select elem ->> 'marca'
   from jsonb_array_elements(public.com_ficha_evolucao_produtos('FICHA5A', '2025-04-01', '2025-06-30', '2025-01-01', '2025-03-31', 'MF') -> 'produtos') elem
   where elem ->> 'produto_codigo' = 'PNOVO'),
  'novo',
  'evolucao_produtos: PNOVO (0 no anterior, 500 no atual) marca ''novo'''
);
select is(
  (select elem ->> 'marca'
   from jsonb_array_elements(public.com_ficha_evolucao_produtos('FICHA5A', '2025-04-01', '2025-06-30', '2025-01-01', '2025-03-31', 'MF') -> 'produtos') elem
   where elem ->> 'produto_codigo' = 'PZEROU'),
  'zerou',
  'evolucao_produtos: PZEROU (300 no anterior, 0 no atual) marca ''zerou'''
);
select is(
  (public.com_ficha_evolucao_produtos('FICHA5A', '2025-04-01', '2025-06-30', '2025-01-01', '2025-03-31', 'MF') ->> 'anterior_completo')::boolean,
  true,
  'evolucao_produtos: MF tem janeiro importado — o período anterior (janeiro-março) está completo'
);
select is(
  (public.com_ficha_evolucao_produtos('FICHA5A', '2025-04-01', '2025-06-30', '2025-01-01', '2025-03-31', 'INBRAS') ->> 'anterior_existe')::boolean,
  false,
  'evolucao_produtos: INBRAS não tem NADA importado para esta empresa — anterior_existe é false, contra o que foi importado, não contra o calendário'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Bloco 7 — comprou com as duas faixas. PMEU é o produto mais comprado
-- POR ELE (faixa_cliente = A), mas no mercado (PIND também vendido para
-- FICHA5B, e o total geral do período) PMEU cai na faixa B — as duas
-- faixas DIFEREM, provando que a fixture não é decorativa.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select faixa_cliente from public.com_ficha_comprou('FICHA5A', '2025-04-01', '2025-06-30', 'MF') where produto_codigo = 'PMEU'),
  'A',
  'comprou: PMEU é A na curva DELE (faixa_cliente)'
);
select is(
  (select faixa_geral from public.com_ficha_comprou('FICHA5A', '2025-04-01', '2025-06-30', 'MF') where produto_codigo = 'PMEU'),
  'B',
  'comprou: PMEU é B na curva GERAL da empresa (faixa_geral) — as duas faixas existem e diferem'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Bloco 8a — bonificado, sem mudança de regra (extraído da função antiga).
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select valor from public.com_ficha_bonificado('FICHA5A', '2025-04-01', '2025-06-30', 'MF') where produto_codigo = 'PBON'),
  40::numeric,
  'bonificado: PBON aparece com o valor bonificado no período'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Bloco 8b — parou de comprar, sem mudança de regra. PSTOP5 comprou em 2
-- dos 3 meses anteriores a junho (abril e maio) e não comprou em junho.
-- PONE5 comprou só 1 dos 3 (abril) — não pode aparecer.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select (select count(*) from public.com_ficha_parou_de_comprar('FICHA5A', '2025-04-01', '2025-06-30', 'MF') where produto_codigo = 'PSTOP5') > 0),
  true,
  'parou_de_comprar: PSTOP5 (2 de 3 meses anteriores, nada em junho) aparece'
);
select is(
  (select count(*) from public.com_ficha_parou_de_comprar('FICHA5A', '2025-04-01', '2025-06-30', 'MF') where produto_codigo = 'PONE5'),
  0::bigint,
  'parou_de_comprar: PONE5 (só 1 dos 3 meses anteriores) NÃO aparece'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Bloco 9 — nunca comprou, das TRÊS faixas (A/B/C), nunca só da C. PNC_A/
-- B/C são comprados só por OUTRO-COMPRADOR, no 3º trimestre (período
-- isolado); FICHA5A nunca os comprou.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select faixa from public.com_ficha_nunca_comprou('FICHA5A', '2025-07-01', '2025-09-30', 'MF') where produto_codigo = 'PNC_A'),
  'A',
  'nunca_comprou: PNC_A (comprado só por outro cliente) aparece na faixa A'
);
select is(
  (select faixa from public.com_ficha_nunca_comprou('FICHA5A', '2025-07-01', '2025-09-30', 'MF') where produto_codigo = 'PNC_B'),
  'B',
  'nunca_comprou: PNC_B aparece na faixa B'
);
select is(
  (select faixa from public.com_ficha_nunca_comprou('FICHA5A', '2025-07-01', '2025-09-30', 'MF') where produto_codigo = 'PNC_C'),
  'C',
  'nunca_comprou: PNC_C aparece na faixa C — as três faixas aparecem, não só a C'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Item 6.3 da correção — o teto de 100 por faixa em com_ficha_nunca_comprou
-- só era provado por comercial_cashback (#22/23); a prova mora também
-- aqui, junto da regra. No ANO INTEIRO (não no trimestre — é o que garante
-- que todo outro produto do fixture já tem venda para alguém e classifica
-- em A/B/C): só os 105 PFTETO*, sem venda nenhuma, mais PBON (que só sai
-- como bonificação, nunca como venda/devolução — por isso cai fora da
-- curva do mesmo jeito), caem na faixa '-' — 106 no total, cortados em
-- 100.
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.com_produtos (codigo, nome)
select 'PFTETO' || i, 'Produto Teto Ficha ' || i from generate_series(1, 105) as i;

select is(
  (select count(*)::int from public.com_ficha_nunca_comprou('FICHA5A', '2025-01-01', '2025-12-31', 'MF') where faixa = '-'),
  100,
  'nunca_comprou: o teto de 100 por faixa corta os PFTETO* + PBON (106, sem venda/devolução nenhuma no ano) em 100 na faixa ''-'''
);
select is(
  (select total_da_faixa from public.com_ficha_nunca_comprou('FICHA5A', '2025-01-01', '2025-12-31', 'MF') where faixa = '-' limit 1),
  106::bigint,
  'nunca_comprou: total_da_faixa mostra os 106 de antes do corte (105 PFTETO* + PBON)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Bloco 5 (prova principal) — evolucao_faixa de um cliente que NÃO está
-- entre os 500 primeiros de com_evolucao_por_faixa (que ordena por
-- cliente_codigo — 'ZZTARGET' fica depois de 500 clientes 'BULK0001'..
-- 'BULK0500' em qualquer ordenação alfabética) mesmo assim vem preenchida.
-- Período próprio (4º trimestre) para não interferir nos outros blocos.
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.com_vendas_importacoes (tipo, filial, file_name, linhas_lidas)
values ('vendas', 'MF', 'fixture-ficha5a-bulk', 501);

with imp as (select id from public.com_vendas_importacoes order by created_at desc limit 1)
insert into public.com_vendas_itens (importacao_id, filial, emissao, documento, serie, cfop, classe, cliente_codigo, produto_codigo, produto_nome, quantidade, valor_nota)
select imp.id, 'MF', '2025-11-15', 'DBULK' || gs, '1', '5101', 'venda',
       'BULK' || lpad(gs::text, 4, '0'), 'PBULK5A', 'Bulk', 1, 10
from imp, generate_series(1, 500) as gs;

with imp as (select id from public.com_vendas_importacoes order by created_at desc limit 1)
insert into public.com_vendas_itens (importacao_id, filial, emissao, documento, serie, cfop, classe, cliente_codigo, produto_codigo, produto_nome, quantidade, valor_nota)
select imp.id, 'MF', '2025-11-16', 'DBULKTARGET', '1', '5101', 'venda', 'ZZTARGET', 'PBULK5A', 'Bulk', 1, 10
from imp;

select is(
  (select (public.com_ficha_evolucao_faixa('ZZTARGET', '2025-10-01', '2025-12-31', pa.ant_de, pa.ant_ate, 'MF') ->> 'total')::numeric
   from public.com_periodo_anterior('2025-10-01', '2025-12-31') pa),
  10::numeric,
  'evolucao_faixa: ZZTARGET (501º em ordem alfabética, fora do teto de 500 de com_evolucao_por_faixa) vem preenchida — o filtro por cliente é do BANCO, não corta pelo navegador'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Isolamento — a segunda empresa tem o MESMO código de cliente ('FICHA5A'),
-- no MESMO período, com valor DIFERENTE (999, contra 2290 da principal).
-- Isolamento provado por número próprio — a lição da auditoria da 5b
-- (2026-09-23): uma empresa vazia não provaria nada. As duas asserções de
-- `mensal_do_ano`/`comprou` são o item 3 das correções: a mesma prova que
-- já existia para `indicadores`, estendida às duas funções que a auditoria
-- mutou para `security definer` e enxergaram a outra empresa.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('outro-owner@com-ficha5a.test');

insert into public.com_vendas_importacoes (tipo, filial, file_name, linhas_lidas)
values ('vendas', 'MF', 'fixture-ficha5a-outro', 1);
with imp as (select id from public.com_vendas_importacoes order by created_at desc limit 1)
insert into public.com_vendas_itens (importacao_id, filial, emissao, documento, serie, cfop, classe, cliente_codigo, produto_codigo, produto_nome, quantidade, valor_nota)
select imp.id, 'MF', '2025-06-05', 'DOUTRO', '1', '5101', 'venda', 'FICHA5A', 'POUTRO', 'Outro Produto', 1, 999
from imp;

select is(
  (select faturamento from public.com_ficha_indicadores('FICHA5A', '2025-04-01', '2025-06-30', 'MF')),
  999::numeric,
  'isolamento: a empresa OUTRA vê o SEU PRÓPRIO FICHA5A (999) — não o da empresa principal (2290)'
);
select is(
  (select valor from public.com_ficha_mensal_do_ano('FICHA5A', '2025-06-30', 'MF') where mes = '2025-06-01'),
  999::numeric,
  'isolamento (item 3): mensal_do_ano — a empresa OUTRA vê o SEU FICHA5A de junho (999), não os 1610 do principal (bloco 3)'
);
select is(
  (select valor from public.com_ficha_comprou('FICHA5A', '2025-04-01', '2025-06-30', 'MF') where produto_codigo = 'POUTRO'),
  999::numeric,
  'isolamento (item 3): comprou — a empresa OUTRA vê o SEU produto (POUTRO, 999), que nunca aparece na ficha do principal (bloco 7, só PMEU)'
);

select tests.clear_authentication();
select tests.authenticate_as('owner@com-ficha5a.test');

select is(
  (select faturamento from public.com_ficha_indicadores('FICHA5A', '2025-04-01', '2025-06-30', 'MF')),
  2290::numeric,
  'isolamento: a empresa principal continua vendo só o SEU FICHA5A (2290) depois de a outra empresa gravar o dela'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Item 1 da correção — com_periodo_anterior conta MESES, nunca dias. As
-- quatro linhas da tabela da auditoria, como asserções diretas da função
-- pura: é o teste que teria pego o defeito no primeiro dia. Mutação
-- executada contra o banco (revertendo para a fórmula em dias) antes deste
-- commit — as quatro deram exatamente os valores errados da tabela da
-- auditoria (31/mai-30/jun em julho; 02/jan/2024-31/dez/2024 em 2025;
-- 31/dez/2022-31/dez/2023 em 2024 bissexto).
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select format('%s|%s', ant_de, ant_ate) from public.com_periodo_anterior('2025-07-01', '2025-07-31')),
  '2025-06-01|2025-06-30',
  'com_periodo_anterior: julho (1 mês) tem anterior junho — nunca 31/mai-30/jun'
);
select is(
  (select format('%s|%s', ant_de, ant_ate) from public.com_periodo_anterior('2025-05-01', '2025-07-31')),
  '2025-02-01|2025-04-30',
  'com_periodo_anterior: maio-julho (3 meses) tem anterior fevereiro-abril — nunca 29/jan-30/abr'
);
select is(
  (select format('%s|%s', ant_de, ant_ate) from public.com_periodo_anterior('2025-01-01', '2025-12-31')),
  '2024-01-01|2024-12-31',
  'com_periodo_anterior: o ano de 2025 tem anterior o ano de 2024 inteiro — nunca 02/jan/2024-31/dez/2024'
);
select is(
  (select format('%s|%s', ant_de, ant_ate) from public.com_periodo_anterior('2024-01-01', '2024-12-31')),
  '2023-01-01|2023-12-31',
  'com_periodo_anterior: o ano BISSEXTO de 2024 tem anterior o ano de 2023 inteiro — era o caso que a fórmula em dias errava pior (31/dez/2022 em vez de 01/jan/2023)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Itens 2, 4, 5 e 6.2 da correção — usam uma fixture própria em INBRAS
-- (isolada de tudo em MF acima), com um mês SEM venda (outubro) no meio de
-- um período importado (junho a dezembro) para provar a distinção entre
-- "nunca importado" (NULL) e "importado sem compra" (zero real).
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.com_vendas_importacoes (tipo, filial, file_name, linhas_lidas)
values ('vendas', 'INBRAS', 'fixture-ficha5a-correcoes', 4);

with imp as (select id from public.com_vendas_importacoes order by created_at desc limit 1)
insert into public.com_vendas_itens (importacao_id, filial, emissao, documento, serie, cfop, classe, cliente_codigo, produto_codigo, produto_nome, quantidade, valor_nota)
select imp.id, 'INBRAS', x.emissao::date, x.documento, '1', '5101', 'venda', x.cliente, x.produto, x.produto, 1, x.valor
from imp, (values
  -- item 5: junho é o único mês antes de setembro — maio (anterior) fica
  -- fora de tudo que foi importado.
  ('2025-06-15', 'DINBJUN', 'PINJUN', 'FICHA5A', 55),
  -- item 4: setembro/novembro/dezembro têm venda; OUTUBRO não tem — mas
  -- está DENTRO do que foi importado (entre junho e dezembro).
  ('2025-09-10', 'DINBSET', 'PINSET', 'FICHA5A', 200),
  ('2025-11-10', 'DINBNOV', 'PINNOV', 'FICHA5A', 100),
  ('2025-12-10', 'DINBDEZ', 'PINDEZ', 'FICHA5A', 400),
  -- FICHA5D: histórico mais curto que o que foi importado (o mesmo
  -- item 4, do outro lado) — julho, quando o importado já cobre
  -- junho-dezembro. Maio e abril (2 dos 3 meses anteriores) ficam FORA
  -- do que foi importado — nunca contam como zero.
  --
  -- A compra de JUNHO (90) existe por causa da auditoria de 2026-09-24: sem
  -- ela, o único mês coberto valia 0, a média dava 0 pela regra certa (só
  -- junho) E pela errada (junho+maio+abril, todos zero), e média 0 força
  -- variação NULL nos dois casos — as duas asserções abaixo passavam sem
  -- distinguir regra nenhuma. Com 90, a regra certa dá média 90 e variação
  -- NULL (1 mês coberto de 3); a errada daria média 30 e variação 9,7.
  ('2025-06-20', 'DINBJUND', 'PJUNINB', 'FICHA5D', 90),
  ('2025-07-20', 'DINBJUL', 'PJULINB', 'FICHA5D', 321)
) as x(emissao, documento, produto, cliente, valor);

-- ═══════════════════════════════════════════════════════════════════════════
-- A FIAÇÃO, pelo compositor (achado da auditoria de 2026-09-24): todas as
-- asserções desta suíte chamam as funções de bloco DIRETO, passando as
-- datas do período anterior na mão. Nenhuma passava por
-- `com_ficha_cliente`, que é quem chama `com_periodo_anterior` e repassa o
-- resultado aos blocos — ou seja, o defeito original (período anterior em
-- dias) podia voltar na fiação sem nenhuma asserção acusar.
--
-- O período escolhido (abril-junho, 3 meses em MF) é o que DISTINGUE as
-- duas fórmulas: contando meses, o anterior é janeiro-março, todo dentro
-- do importado em MF — `anterior_completo` é true. Contando dias, seriam
-- 91 dias para trás a partir de 01/04, e o anterior começaria em
-- 31/12/2024 — um mês fora do importado, e `anterior_completo` viraria
-- false. (Um período de UM mês não serviria: para janeiro as duas
-- fórmulas dão a mesma janela, e a asserção não provaria nada.)
--
-- Mutação (rodada e confirmada em 2026-09-24, dentro da transação da
-- suíte): voltar `com_periodo_anterior` à fórmula em dias faz esta
-- asserção acusar — have false, want true.
select is(
  (public.com_ficha_cliente('FICHA5A', '2025-04-01', '2025-06-30', 'MF') -> 'evolucao_produtos' ->> 'anterior_completo')::boolean,
  true,
  'com_ficha_cliente (o compositor) monta o período anterior pela própria com_periodo_anterior e o repassa aos blocos — a fiação tem prova, não só as peças'
);

-- Item 2 — "anterior incompleto" acusava falso quando a janela terminava
-- EXATAMENTE no último mês importado (competência dia 1 comparada direto
-- com o fim do mês, dia 30/31). Aqui o anterior (out-dez) termina no mesmo
-- mês do último importado (dezembro) — tem de dar completo = true.
select is(
  (public.com_ficha_evolucao_produtos('FICHA5A', '2026-01-01', '2026-01-31', '2025-10-01', '2025-12-31', 'INBRAS') ->> 'anterior_completo')::boolean,
  true,
  'evolucao_produtos: janela anterior termina EXATAMENTE no último mês importado (dezembro) — completo é true (competência contra competência, nunca dia-do-mês contra competência)'
);

-- Item 4 — outubro sem venda do cliente, mas DENTRO do que foi importado
-- (entre junho e dezembro), conta como ZERO REAL e entra na média — nunca
-- some do cálculo como "sem dado".
select is(
  (select variacao from public.com_ficha_indicadores('FICHA5A', '2025-09-01', '2025-12-31', 'INBRAS')),
  3::numeric,
  'indicadores: outubro sem venda (mas dentro do importado) conta como zero real — variação = (400-100)/100 = 3, nunca NULL por "faltar" outubro'
);
select is(
  (select media_3_anteriores from public.com_ficha_indicadores('FICHA5A', '2025-09-01', '2025-12-31', 'INBRAS')),
  100::numeric,
  'indicadores: media_3_anteriores leva o zero de outubro na média — (200+0+100)/3 = 100'
);

-- Item 4 (outro lado da mesma regra) — FICHA5D compra em junho (90) e em
-- julho (321), e o importado em INBRAS começa em junho: dos 3 meses
-- anteriores a julho, só junho está coberto; maio e abril ficam FORA do
-- que foi importado e nunca contam como zero. É a distinção que o bloco 2
-- (FICHA5B) deixou de provar depois do item 4 corrigido.
--
-- Mutação (rodada e confirmada em 2026-09-24, dentro da transação da
-- suíte): tirar o recorte `mes between v_comp_de and v_comp_ate` de
-- `com_ficha_indicadores` — isto é, tratar TODO mês como zero real,
-- ignorando o que foi importado — faz as DUAS asserções abaixo acusarem:
-- a média vai de 90 para 30 (junho 90 + maio 0 + abril 0) e a variação
-- deixa de ser NULL e vira 9,7, porque passa a haver "3 meses com dado".
-- Antes desta fixture as duas passavam sob essa mutação: o único mês
-- coberto valia 0, e 0 é a mesma média nas duas regras.
select is(
  (select variacao from public.com_ficha_indicadores('FICHA5D', '2025-07-01', '2025-07-31', 'INBRAS')),
  null::numeric,
  'indicadores: FICHA5D com só 1 dos 3 meses anteriores cobertos pelo importado (junho) — variação é NULL, nunca a de uma média inventada com maio e abril como zero'
);
select is(
  (select media_3_anteriores from public.com_ficha_indicadores('FICHA5D', '2025-07-01', '2025-07-31', 'INBRAS')),
  90::numeric,
  'indicadores: FICHA5D — media_3_anteriores é a média só do que está coberto (junho, 90), nunca (90+0+0)/3 com maio e abril fora do importado'
);

-- Item 6.2 — período (janeiro) inteiramente FORA do que foi importado em
-- INBRAS (que só começa em junho): faturamento é NULL, nunca "R$ 0,00".
select is(
  (select faturamento from public.com_ficha_indicadores('FICHA5A', '2025-01-01', '2025-01-31', 'INBRAS')),
  null::numeric,
  'indicadores: período sem NADA importado (janeiro, antes de qualquer importação em INBRAS) é NULL, nunca R$ 0,00'
);

-- Item 5 — sem período anterior coberto (maio é anterior a junho, que é o
-- início de tudo que foi importado em INBRAS), valor_anterior/marca são
-- NULL — nunca 0/'novo'. Ausência de base não é crescimento de 100%.
select is(
  (select elem ->> 'valor_anterior'
   from jsonb_array_elements(public.com_ficha_evolucao_produtos('FICHA5A', '2025-06-01', '2025-06-30', '2025-05-01', '2025-05-31', 'INBRAS') -> 'produtos') elem
   where elem ->> 'produto_codigo' = 'PINJUN'),
  null::text,
  'evolucao_produtos: sem período anterior coberto (maio, antes de qualquer importação em INBRAS), valor_anterior é NULL — nunca 0'
);
select is(
  (select elem ->> 'marca'
   from jsonb_array_elements(public.com_ficha_evolucao_produtos('FICHA5A', '2025-06-01', '2025-06-30', '2025-05-01', '2025-05-31', 'INBRAS') -> 'produtos') elem
   where elem ->> 'produto_codigo' = 'PINJUN'),
  null::text,
  'evolucao_produtos: sem anterior coberto, marca é NULL — não marca ''novo'' por falta de base de comparação'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Item 3 da correção — isolamento: uma asserção estrutural cobre as dez
-- funções (mais com_periodo_anterior) de uma vez, porque a RLS de
-- com_vendas_itens/com_clientes/com_produtos é a ÚNICA barreira entre
-- empresas — nenhuma delas filtra tenant_id sozinha. Toda função futura da
-- ficha entra sob esta asserção sem ninguém lembrar de nada.
--
-- Provada por mutação DENTRO da transação da suíte: a mutação nunca
-- escapa para o schema real (rollback no fim do arquivo). `alter function`
-- exige ser dono da função — o papel `authenticated` (ligado por
-- `authenticate_as`, ainda em vigor) não tem esse privilégio; por isso a
-- mutação sai e volta pelo papel do runner (`clear_authentication`), como
-- as fábricas do início do arquivo já fazem.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (p.proname like 'com\_ficha\_%' or p.proname = 'com_periodo_anterior')
     and p.prosecdef),
  0::bigint,
  'nenhuma função com_ficha_% (nem com_periodo_anterior) é security definer — a RLS das tabelas de baixo é a única barreira entre empresas'
);

select tests.clear_authentication();
alter function public.com_ficha_mensal_do_ano(text, date, text) security definer;
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (p.proname like 'com\_ficha\_%' or p.proname = 'com_periodo_anterior')
     and p.prosecdef),
  1::bigint,
  'mutação: com_ficha_mensal_do_ano virada security definer é pega pela asserção estrutural acima — o count sai de 0 para 1'
);
alter function public.com_ficha_mensal_do_ano(text, date, text) security invoker;

select * from finish();
rollback;

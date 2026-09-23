-- Frente 5a — a ficha do cliente completa (§11 do documento do dono). Ver
-- .scratch/plano-frente5-ficha-e-conciliacao.md §5a e a migration
-- 20261025010000_comercial_ficha_completa.sql. Uma asserção por bloco, cada
-- uma com fixture verificada à mão (ou por consulta direta) antes de virar
-- asserção — nenhuma decorativa.
begin;
\ir _helpers.psql

select plan(26);

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
  ('PNOVO', 'Novo'), ('PZEROU', 'Zerou'), ('PDEZ', 'Dezembro'),
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
  -- Evolução produtos (bloco 6): PDEZ em dezembro (cobre o anterior de
  -- MF), PNOVO só no atual, PZEROU só no anterior.
  ('MF','2024-12-31','D17','venda','FICHA5A','PDEZ','Dezembro',5),
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
-- 5.1923. FICHA5B só tem abril (200) dos 3 anteriores: com menos de 3
-- meses com dado, a variação é NULL — nunca 0%.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select variacao from public.com_ficha_indicadores('FICHA5A', '2025-04-01', '2025-06-30', 'MF')),
  5.1923::numeric,
  'FICHA5A com os 3 meses anteriores completos: variação = (1610-260)/260 = 5.1923'
);
select is(
  (select variacao from public.com_ficha_indicadores('FICHA5B', '2025-04-01', '2025-06-30', 'MF')),
  null::numeric,
  'FICHA5B com só 1 dos 3 meses anteriores: variação é NULL, nunca 0% — mutação: envolver o sum() mensal em coalesce(...,0) faz este have virar um número'
);
select is(
  (select media_3_anteriores from public.com_ficha_indicadores('FICHA5B', '2025-04-01', '2025-06-30', 'MF')),
  200::numeric,
  'FICHA5B: media_3_anteriores é a média só do que existe (200), a ausência dos outros dois não é um zero disfarçado'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Bloco 3 — mensal_do_ano. Janeiro (sem venda) é NULL, não 0; junho (com
-- venda) traz o valor real.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select valor from public.com_ficha_mensal_do_ano('FICHA5A', '2025-06-30', 'MF') where mes = '2025-01-01'),
  null::numeric,
  'mensal_do_ano: janeiro sem venda é NULL, não zero'
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
-- faturamento (2290); o mês de dezembro do anterior mostra PDEZ na faixa
-- '-'/C dele mesmo (não gravado). A prova principal (fora do teto de 500)
-- vem depois, com uma fixture própria.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select (public.com_ficha_evolucao_faixa('FICHA5A', '2025-04-01', '2025-06-30', '2024-12-31', '2025-03-31', 'MF') ->> 'total')::numeric),
  2290::numeric,
  'evolucao_faixa: o total do período atual bate com o faturamento (2290)'
);
select is(
  (select (elem ->> 'valor_c')::numeric
   from jsonb_array_elements(public.com_ficha_evolucao_faixa('FICHA5A', '2025-04-01', '2025-06-30', '2024-12-31', '2025-03-31', 'MF') -> 'anterior') elem
   where elem ->> 'competencia' = '2024-12-01'),
  5::numeric,
  'evolucao_faixa: dezembro (anterior) mostra PDEZ (5) na faixa C dele mesmo, calculada sobre a própria janela anterior'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Bloco 6 — evolução produto a produto: PNOVO (só no atual) marca 'novo',
-- PZEROU (só no anterior) marca 'zerou'. `anterior_existe`/`anterior_
-- completo` respondem ao que foi IMPORTADO — MF tem dezembro (cobre o
-- anterior inteiro); INBRAS não tem nenhuma linha desta empresa.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select elem ->> 'marca'
   from jsonb_array_elements(public.com_ficha_evolucao_produtos('FICHA5A', '2025-04-01', '2025-06-30', '2024-12-31', '2025-03-31', 'MF') -> 'produtos') elem
   where elem ->> 'produto_codigo' = 'PNOVO'),
  'novo',
  'evolucao_produtos: PNOVO (0 no anterior, 500 no atual) marca ''novo'''
);
select is(
  (select elem ->> 'marca'
   from jsonb_array_elements(public.com_ficha_evolucao_produtos('FICHA5A', '2025-04-01', '2025-06-30', '2024-12-31', '2025-03-31', 'MF') -> 'produtos') elem
   where elem ->> 'produto_codigo' = 'PZEROU'),
  'zerou',
  'evolucao_produtos: PZEROU (300 no anterior, 0 no atual) marca ''zerou'''
);
select is(
  (public.com_ficha_evolucao_produtos('FICHA5A', '2025-04-01', '2025-06-30', '2024-12-31', '2025-03-31', 'MF') ->> 'anterior_completo')::boolean,
  true,
  'evolucao_produtos: MF tem dezembro importado — o período anterior está completo'
);
select is(
  (public.com_ficha_evolucao_produtos('FICHA5A', '2025-04-01', '2025-06-30', '2024-12-31', '2025-03-31', 'INBRAS') ->> 'anterior_existe')::boolean,
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
-- (2026-09-23): uma empresa vazia não provaria nada.
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

select tests.clear_authentication();
select tests.authenticate_as('owner@com-ficha5a.test');

select is(
  (select faturamento from public.com_ficha_indicadores('FICHA5A', '2025-04-01', '2025-06-30', 'MF')),
  2290::numeric,
  'isolamento: a empresa principal continua vendo só o SEU FICHA5A (2290) depois de a outra empresa gravar o dela'
);

select * from finish();
rollback;

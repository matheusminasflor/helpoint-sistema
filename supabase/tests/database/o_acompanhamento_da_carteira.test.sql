-- O ACOMPANHAMENTO POR CARTEIRA E O GRUPO DE CLIENTE (migration 20261114020000, LEVA O parte 2)
--
--   1 e 2 — o grupo junta os códigos: três CNPJs de "CLARA & BELLA" viram UMA linha, com os três
--           códigos nela. É a decisão do dono ("meta e carteira por grupo");
--   2     — e a venda do mês da carteira inclui a que a COLEGA lançou pelo escape "fora da minha
--           carteira". É a razão de as leituras serem `security definer` com porta própria: pelo
--           RLS a vendedora só lê os próprios lançamentos, e o total da carteira dela ficaria
--           menor do que é;
--   3     — o histórico é o faturado do Forteplus (o único que existe), 12 meses antes;
--   4 e 6 — a vendedora não abre a carteira de outra; o gestor abre todas;
--   5     — o cabeçalho compara a meta da DIRETORIA (`com_metas`) com a venda lançada.
begin;
\ir _helpers.psql

select plan(6);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-acomp', 'Acompanhamento', false) as a;

create temporary table u on commit drop as
select tests.create_user('ana@acomp.test',   (select a from f)) as ana,
       tests.create_user('bia@acomp.test',   (select a from f)) as bia,
       tests.create_user('chefe@acomp.test', (select a from f)) as chefe;

select tests.grant_module((select ana from u),   (select a from f), 'comercial');
select tests.grant_module((select bia from u),   (select a from f), 'comercial');
select tests.grant_module((select chefe from u), (select a from f), 'comercial');
select tests.grant_role((select chefe from u), 'admin');
grant select on f, u to authenticated;

insert into public.com_carteira_membros (tenant_id, user_id, carteira)
values ((select a from f), (select ana from u), 'NORTE'),
       ((select a from f), (select bia from u), 'SUL');

-- Três CNPJs do mesmo dono, escritos com caixa diferente no grupo — a chave normaliza.
insert into public.com_clientes (tenant_id, codigo, razao_social, carteira, grupo, ativo, origem)
values ((select a from f), 'G1a', 'CLARA LTDA',     'NORTE', 'Clara & Bella', true, 'cadastro'),
       ((select a from f), 'G1b', 'BELLA ME',       'NORTE', 'CLARA & BELLA', true, 'cadastro'),
       ((select a from f), 'G1c', 'IVETE COSMETICOS','NORTE', 'clara & bella ', true, 'cadastro'),
       ((select a from f), 'N2',  'OUTRO CLIENTE',  'NORTE', null, true, 'cadastro'),
       ((select a from f), 'S1',  'CLIENTE DO SUL', 'SUL',   null, true, 'cadastro');

create temporary table imp on commit drop as
with nova as (
  insert into public.com_vendas_importacoes (tenant_id, tipo, file_name, linhas_lidas)
  select a, 'vendas', 'pgtap-acomp.xls', 2 from f
  returning id
)
select id from nova;

-- Histórico: o grupo comprou em março e em abril (dois meses → recompra), R$ 300 no total.
insert into public.com_vendas_itens
  (tenant_id, importacao_id, filial, emissao, documento, serie, cfop, classe,
   cliente_codigo, produto_codigo, produto_nome, quantidade, valor_nota)
values ((select a from f), (select id from imp), 'MF', '2026-04-10', 'H1', '1', '5102', 'venda', 'G1a', 'P1', 'Produto', 1, 100),
       ((select a from f), (select id from imp), 'MF', '2026-03-10', 'H2', '1', '5102', 'venda', 'G1b', 'P1', 'Produto', 1, 200);

-- A meta da Diretoria para NORTE em maio.
insert into public.com_metas (tenant_id, ano, mes, carteira, valor)
values ((select a from f), 2026, 5, 'NORTE', 3000);

-- Ana vende R$ 1.000 a um CNPJ do grupo; a Bia, pelo escape, R$ 500 a outro CNPJ do mesmo grupo.
select tests.authenticate_as('ana@acomp.test');
select public.com_salvar_interacao(null, '{"cliente_codigo":"G1a","data":"2026-05-10","status":"concluido","valor_venda":"1000"}'::jsonb, null);
select public.com_salvar_interacao(null, '{"cliente_codigo":"N2","data":"2026-05-11","status":"agendado"}'::jsonb, null);
select tests.clear_authentication();
select tests.authenticate_as('bia@acomp.test');
select public.com_salvar_interacao(null, '{"cliente_codigo":"G1c","data":"2026-05-12","status":"concluido","valor_venda":"500","fora_da_carteira":true}'::jsonb, null);
select tests.clear_authentication();

select tests.authenticate_as('ana@acomp.test');

-- 1. Três CNPJs do grupo + um cliente sozinho = duas linhas.
select is(
  (select count(*)::int from public.com_acompanhamento_da_carteira('NORTE', '2026-05-01')),
  2,
  'o grupo junta os tres CNPJs numa linha so: a carteira tem duas linhas, nao quatro'
);

-- 2. A linha do grupo leva os três códigos e a venda do mês inteira — inclusive a da Bia.
select ok(
  (select codigos = array['G1a', 'G1b', 'G1c'] and venda_mes = 1500
     from public.com_acompanhamento_da_carteira('NORTE', '2026-05-01') where 'G1a' = any (codigos)),
  'a linha do grupo tem os tres codigos e soma a venda que a colega lancou pelo escape: 1.500'
);

-- 3. O histórico é o faturado do Forteplus, 12 meses antes.
select ok(
  (select faturado_12m = 300 and meses_com_compra = 2 and recompra
     from public.com_acompanhamento_da_carteira('NORTE', '2026-05-01') where 'G1a' = any (codigos)),
  'historico do faturado: R$ 300 em 2 meses, e comprou de novo (recompra)'
);

-- 4. A carteira da colega, não.
select throws_ok($$
  select * from public.com_acompanhamento_da_carteira('SUL', '2026-05-01')
$$, '42501', null,
  'a vendedora nao abre o acompanhamento da carteira de outra');

-- 5. O cabeçalho: meta da Diretoria × venda lançada, em maio.
--    A cor vem pronta do banco, pela mesma régua do painel: 1.500 de 3.000 = 50% → vermelho.
select ok(
  (select meta = 3000 and venda = 1500 and cor = 'vermelho'
     from public.com_carteira_mes_a_mes('norte', 2026) where mes = 5),
  'o cabecalho compara a meta da Diretoria (3.000) com a venda lancada (1.500): 50%, vermelho'
);
select tests.clear_authentication();

-- 6. O gestor abre qualquer carteira.
select tests.authenticate_as('chefe@acomp.test');
select lives_ok($$
  select * from public.com_acompanhamento_da_carteira('SUL', '2026-05-01')
$$, 'o gestor abre o acompanhamento de qualquer carteira');
select tests.clear_authentication();

select * from finish();
rollback;

-- QUANDO A NOTA NÃO TEM VENDEDOR DE VERDADE, QUEM ASSINA É A CARTEIRA
-- (migration 20261107010000)
--
-- 2026-09-26, pedido do dono, com as três decisões dele: o cliente é atrelado a
-- uma das carteiras que já existem; a troca acontece **na leitura**; e o sistema
-- sabe quem é gente ligando os códigos que SÃO vendedor.
--
-- O QUE ISTO RESOLVE, medido antes: `1638 FINANCEIRO APROVADO` assina
-- R$ 5.017.738,47 de 168 clientes e `1637 FINANCEIRO CONFERENCIA` outros
-- R$ 770.936,66 — 56% do faturamento do histórico em etapas do processo
-- financeiro. E adivinhar pelo histórico não servia: dos 186 clientes com nota
-- nesses códigos, 109 (R$ 4.884.387,13) foram atendidos por VÁRIAS pessoas.
--
-- AS QUATRO PROPRIEDADES QUE ESTA SUÍTE PRENDE:
--
-- 1. **as três situações** que o dono descreveu: sem carteira, com carteira e sem
--    responsável, e com responsável;
-- 2. **o histórico não é reescrito** — a nota continua dizendo "FINANCEIRO
--    APROVADO", com `e_vendedor = false`. É a decisão 2, e é o que mantém o banco
--    conferindo com o ERP linha por linha;
-- 3. **um responsável por carteira**, garantido por índice. Sem isso, "o vendedor
--    da carteira" seria `limit 1` sem `order by`: o Postgres devolveria qualquer
--    um e mudaria de resposta entre duas execuções;
-- 4. **o primeiro membro vira responsável sozinho** — o caso comum (uma pessoa por
--    carteira) não pede clique nenhum.
begin;
\ir _helpers.psql

select plan(12);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-vend', 'Vendedor do cliente', false) as a;

create temporary table u on commit drop as
select tests.create_user('gestor@vend.test',  (select a from f)) as gestor,
       tests.create_user('micaele@vend.test', (select a from f)) as micaele,
       tests.create_user('rachel@vend.test',  (select a from f)) as rachel;
select tests.grant_module((select gestor from u),  (select a from f), 'comercial');
select tests.grant_module((select micaele from u), (select a from f), 'comercial');
select tests.grant_module((select rachel from u),  (select a from f), 'comercial');
grant select on f, u to authenticated;

-- Um cliente, e notas assinadas pelos dois tipos de código.
insert into public.com_clientes (tenant_id, codigo, razao_social, ativo, origem)
select a, 'C1', 'Cliente do MG', true, 'cadastro' from f;

create temporary table imp on commit drop as
with ins as (
  insert into public.com_vendas_importacoes (tenant_id, tipo, file_name, linhas_lidas)
  select a, 'vendas', 'fixture.xlsx', 2 from f returning id
) select id from ins;
grant select on imp to authenticated;

insert into public.com_vendas_itens
  (tenant_id, importacao_id, filial, emissao, documento, serie, tipo_documento,
   cfop, classe, cliente_codigo, produto_codigo, produto_nome, quantidade, valor_nota, desconto,
   vendedor_codigo, vendedor_nome)
select a, (select id from imp), 'MF', '2026-03-10', 'NF1', '1', 'NFe',
       '5101', 'venda', 'C1', 'P1', 'Shampoo', 10, 1000.00, 0, '1638', 'FINANCEIRO APROVADO'
from f;
insert into public.com_vendas_itens
  (tenant_id, importacao_id, filial, emissao, documento, serie, tipo_documento,
   cfop, classe, cliente_codigo, produto_codigo, produto_nome, quantidade, valor_nota, desconto,
   vendedor_codigo, vendedor_nome)
select a, (select id from imp), 'MF', '2026-04-10', 'NF2', '1', 'NFe',
       '5101', 'venda', 'C1', 'P1', 'Shampoo', 5, 500.00, 0, '1273', 'Micaele Camile'
from f;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. As três situações
-- ═══════════════════════════════════════════════════════════════════════════
select tests.authenticate_as('gestor@vend.test');

select is(
  (select situacao from public.com_atendimento_do_cliente('C1')),
  'sem_carteira',
  'cliente sem carteira: a tela pede para atrelar, e nao inventa um vendedor'
);
select tests.clear_authentication();

update public.com_clientes set carteira = 'MG' where codigo = 'C1';
select tests.authenticate_as('gestor@vend.test');
select is(
  (select situacao from public.com_atendimento_do_cliente('C1')),
  'carteira_sem_responsavel',
  'na carteira e sem ninguem respondendo por ela: a tela diz isso, em vez de ficar em branco'
);
select tests.clear_authentication();

-- O trigger marca o primeiro membro da carteira como responsável, sozinho.
insert into public.com_carteira_membros (tenant_id, user_id, carteira)
select a, (select micaele from u), 'MG' from f;
select is(
  (select responsavel from public.com_carteira_membros
    where user_id = (select micaele from u)),
  true,
  'o PRIMEIRO membro da carteira vira responsavel sozinho — o caso comum nao pede clique'
);

select tests.authenticate_as('gestor@vend.test');
select is(
  (select row(situacao, carteira, responsavel_nome) from public.com_atendimento_do_cliente('C1')),
  row('vendedor'::text, 'MG'::text, 'micaele@vend.test'::text),
  'com responsavel: quem atende o cliente e ele — a nota assinada por FINANCEIRO APROVADO conta para a carteira'
);
select tests.clear_authentication();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. O histórico NÃO é reescrito (decisão 2 do dono)
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select vendedor_nome from public.com_vendas_itens where documento = 'NF1'),
  'FINANCEIRO APROVADO',
  'a linha da venda continua dizendo o que o Forteplus mandou: o banco segue copia fiel do ERP'
);

select tests.authenticate_as('gestor@vend.test');
select is(
  (select e_vendedor from public.com_quem_atende_cliente('C1', '2026-01-01', '2026-12-31')
    where vendedor_codigo = '1638'),
  false,
  'e a ficha marca esse codigo como NAO sendo vendedor — porque ninguem o ligou a uma pessoa'
);
select is(
  (select e_vendedor from public.com_quem_atende_cliente('C1', '2026-01-01', '2026-12-31')
    where vendedor_codigo = '1273'),
  false,
  'nem o codigo da Micaele, ANTES de alguem ligar: a lista comeca vazia de proposito'
);
select tests.clear_authentication();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Ligar o código muda o que a ficha diz
-- ═══════════════════════════════════════════════════════════════════════════
select tests.authenticate_as('gestor@vend.test');
select lives_ok(
  $$ insert into public.com_vendedores (tenant_id, codigo, nome, user_id)
     select a, '1273', 'Micaele Camile', (select micaele from u) from f returning id $$,
  'quem tem o Comercial liga um codigo a uma pessoa'
);
select is(
  (select e_vendedor from public.com_quem_atende_cliente('C1', '2026-01-01', '2026-12-31')
    where vendedor_codigo = '1273'),
  true,
  'e o codigo ligado passa a contar como vendedor'
);
select is(
  (select vendedor_nome from public.com_quem_atende_cliente('C1', '2026-01-01', '2026-12-31')
    where vendedor_codigo = '1273'),
  'Micaele Camile',
  'com o nome do CADASTRO, e nao o que o Forteplus escreveu — ele grava login em algumas linhas'
);
select throws_ok(
  $$ insert into public.com_vendedores (tenant_id, codigo, nome)
     select a, '1273', 'Outra pessoa' from f $$,
  '23505', null,
  'o mesmo codigo nao se liga duas vezes'
);
select tests.clear_authentication();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Um responsável por carteira
-- ═══════════════════════════════════════════════════════════════════════════
-- É o que impede "o vendedor da carteira" de ser `limit 1` sem `order by`.
select throws_ok(
  $$ insert into public.com_carteira_membros (tenant_id, user_id, carteira, responsavel)
     select a, (select rachel from u), 'MG', true from f $$,
  '23505', null,
  'duas pessoas assinando a MESMA carteira e recusado pelo banco'
);

select * from finish();
rollback;

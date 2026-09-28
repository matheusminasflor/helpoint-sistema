-- COMPRAS É MÓDULO PRÓPRIO (migrations 20261110010000 a 20261110030000)
--
-- Pedido do dono em 2026-09-27: tirar Compras de dentro do Financeiro, porque o
-- módulo estava "poluído demais" — eram 4 das 10 telas dele.
--
-- AS ASSERÇÕES 1 E 2 SÃO A RAZÃO DESTE ARQUIVO, e nenhuma delas estava no pedido:
-- ao ler as policies para reescrevê-las, apareceu que **as compras eram abertas para
-- qualquer pessoa logada** (`tenant_id = get_user_tenant_id()` e mais nada). Quem
-- tinha só o RH lia toda solicitação de compra da empresa, com valor, fornecedor e
-- laudo. Testar só "quem tem Compras vê" não provaria o conserto: prova é quem NÃO
-- tem deixar de ver.
--
-- A 3 é a outra metade da mesma moeda: quem PEDIU continua vendo o que pediu, mesmo
-- sem o módulo. Fechar sem essa exceção transformaria o conserto em outro defeito —
-- pedir uma compra é direito de qualquer setor (o dono decidiu que a solicitação já é
-- o pedido, sem fila de chamado separada), e quem pede acompanha.
--
-- E a 6 guarda a decisão dele sobre o teto: *"o Financeiro define; Compras
-- respeita"*. Regra 12 do pgTAP — UPDATE barrado por policy não levanta erro, conta
-- zero linha.
begin;
\ir _helpers.psql

select plan(8);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-compras', 'Compras Modulo', false) as a;

create temporary table u on commit drop as
select tests.create_user('compradora@cmp.test', (select a from f)) as compradora,
       tests.create_user('dorh@cmp.test',        (select a from f)) as do_rh,
       tests.create_user('dofin@cmp.test',       (select a from f)) as do_fin;

-- Ninguém leva cargo: cargo de gestor abriria tudo por `is_supervisor_or_higher` e o
-- teste mediria outra coisa.
select tests.grant_module((select compradora from u), (select a from f), 'compras');
select tests.grant_module((select do_rh from u),      (select a from f), 'rh');
select tests.grant_module((select do_fin from u),     (select a from f), 'financeiro');

-- Uma solicitação aberta por quem é do RH: ele pediu um mouse.
insert into public.compras_solicitacoes
  (id, tenant_id, product_name, estimated_amount, status, created_by, department)
select 'cccccccc-0000-4000-8000-000000000001', a, 'Mouse', 150, 'pending_approval',
       (select do_rh from u), 'rh'
  from f;

-- ── 1. Quem tem Compras vê ───────────────────────────────────────────────────
select tests.authenticate_as('compradora@cmp.test');
select is(
  (select count(*)::int from public.compras_solicitacoes),
  1,
  'quem tem o modulo Compras ve a solicitacao'
);
select tests.clear_authentication();

-- ── 2. Quem tem SÓ o Financeiro NÃO vê mais ──────────────────────────────────
-- Antes da separação veria: a policy não olhava módulo nenhum. É o conserto que a
-- leva N trouxe sem ter sido pedido.
select tests.authenticate_as('dofin@cmp.test');
select is(
  (select count(*)::int from public.compras_solicitacoes),
  0,
  'quem tem so o Financeiro NAO ve mais solicitacao de compra'
);
select tests.clear_authentication();

-- ── 3. Mas quem PEDIU vê o que pediu ─────────────────────────────────────────
select tests.authenticate_as('dorh@cmp.test');
select is(
  (select count(*)::int from public.compras_solicitacoes),
  1,
  'quem abriu a solicitacao ve a dela, mesmo sem o modulo Compras'
);

-- ── 4. E não vê a de outra pessoa ────────────────────────────────────────────
insert into public.compras_solicitacoes
  (tenant_id, product_name, estimated_amount, status, created_by, department)
select a, 'Teclado', 90, 'pending_approval', (select compradora from u), 'compras' from f;

select is(
  (select count(*)::int from public.compras_solicitacoes),
  1,
  'e continua vendo SO a dela: a do vizinho nao aparece'
);
select tests.clear_authentication();

-- ── 5. O catálogo é de todo mundo ────────────────────────────────────────────
-- Esconder faria o formulário de solicitação nascer sem opção nenhuma.
insert into public.compras_produtos (tenant_id, name, is_active)
select a, 'Papel A4', true from f;

select tests.authenticate_as('dorh@cmp.test');
select is(
  (select count(*)::int from public.compras_produtos),
  1,
  'o catalogo de produtos e legivel por toda a empresa: e a lista do que se pode pedir'
);
select tests.clear_authentication();

-- ── 6. O teto: o Financeiro escreve, Compras só lê ───────────────────────────
insert into public.fin_department_budgets (tenant_id, department, monthly_limit)
select a, 'rh', 1000 from f;

select tests.authenticate_as('compradora@cmp.test');

select is(
  (select count(*)::int from public.fin_department_budgets),
  1,
  'Compras LE o teto: precisa saber quanto sobrou'
);

-- Regra 12: UPDATE barrado por policy nao levanta erro — conta zero.
with t as (
  update public.fin_department_budgets set monthly_limit = 99999
   where department = 'rh' returning 1
)
select is((select count(*)::int from t), 0, 'e NAO escreve: quem define o teto e o Financeiro');

select tests.clear_authentication();

-- ── 7. O setor novo existe ───────────────────────────────────────────────────
select lives_ok(
  $$ insert into public.compras_solicitacoes
       (tenant_id, product_name, estimated_amount, status, created_by, department)
     select a, 'Cafe', 30, 'pending_approval', (select compradora from u), 'compras' from f
     returning id $$,
  'o setor "compras" e aceito pelo CHECK: virou o decimo'
);

select * from finish();
rollback;

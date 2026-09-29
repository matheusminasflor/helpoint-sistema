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

select plan(11);

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

-- TODA COMPRA TEM UM CHAMADO POR BAIXO: `compras_solicitacoes.ticket_id` é NOT NULL.
-- Descobri isso ao rodar esta prova, e foi o que revelou a segunda metade da poluição
-- que o dono pediu para tirar: as telas saíram do Financeiro, o chamado não, e a caixa
-- de entrada dele continuava mostrando compra. Em 2026-09-28 ele pediu o chamado em
-- Compras, e a migration `20261111010000` fez — então a categoria e o chamado nascem
-- com `module = 'compras'`, que é o que o sistema faz agora.
create temporary table cat on commit drop as
with ins as (
  insert into public.ti_categories (tenant_id, module, name, is_purchase)
  select a, 'compras', 'Compra de material', true from f
  returning id
) select id from ins;

create temporary table ch on commit drop as
with ins as (
  insert into public.tickets (tenant_id, module, title, description, priority, status, requester_id, category_id)
  select a, 'compras', 'Comprar mouse', 'x', 'medium', 'open', (select do_rh from u), (select id from cat) from f
  returning id
) select id from ins;
grant select on cat, ch to authenticated;

-- Uma solicitação aberta por quem é do RH: ele pediu um mouse.
insert into public.compras_solicitacoes
  (id, tenant_id, ticket_id, product_name, estimated_amount, status, created_by, department)
select 'cccccccc-0000-4000-8000-000000000001', a, (select id from ch), 'Mouse', 150,
       'pending_approval', (select do_rh from u), 'rh'
  from f;

-- ── 1. Quem tem Compras vê ───────────────────────────────────────────────────
select tests.authenticate_as('compradora@cmp.test');
select is(
  (select count(*)::int from public.compras_solicitacoes),
  1,
  'quem tem o modulo Compras ve a solicitacao'
);

-- E VÊ O CHAMADO DELA, que é onde ficam a conversa, os anexos e o prazo. Esta é a
-- asserção que prova a segunda metade do pedido do dono (2026-09-28, "quero o chamado
-- da compra em Compras"): sem o par `('compras','compras')` em
-- `modulos_de_chamado_visiveis`, o chamado nasceria num módulo que ninguém alcança e
-- só o requisitante o veria — comprador nenhum aprovaria nada.
select ok(
  'compras' = any (public.modulos_de_chamado_visiveis()),
  'e o modulo compras esta na lista de chamados que ele alcanca'
);
select is(
  (select count(*)::int from public.tickets where module = 'compras'),
  1,
  'entao ele ve o chamado da compra'
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

-- E NEM O CHAMADO DELA — é isto que tira a compra da caixa de entrada do Financeiro.
-- `FinTickets` filtra `module = 'financeiro'`, então a tela para de mostrar compra
-- sozinha, sem ninguém mexer nela.
select is(
  (select count(*)::int from public.tickets where module = 'compras'),
  0,
  'e nem o chamado da compra: a caixa de entrada do Financeiro fica sem compra'
);
select tests.clear_authentication();

-- A segunda compra, de OUTRA pessoa — criada **antes** de autenticar, e é de
-- propósito: autenticado, o insert passaria pela policy, que exige
-- `created_by = auth.uid()`. Fixture se monta sem identidade; asserção se faz com
-- ela. Misturar os dois foi o erro que este arquivo levou na primeira escrita.
--
-- Chamado NOVO: `ticket_id` é único em `compras_solicitacoes` (uma compra por
-- chamado), então reusar o de cima daria erro de chave e o teste mediria outra coisa.
create temporary table ch2 on commit drop as
with ins as (
  insert into public.tickets (tenant_id, module, title, description, priority, status, requester_id, category_id)
  select a, 'compras', 'Comprar teclado', 'x', 'medium', 'open', (select compradora from u), (select id from cat) from f
  returning id
) select id from ins;
grant select on ch2 to authenticated;

insert into public.compras_solicitacoes
  (tenant_id, ticket_id, product_name, estimated_amount, status, created_by, department)
select a, (select id from ch2), 'Teclado', 90, 'pending_approval', (select compradora from u), 'compras' from f;

-- ── 3 e 4. Quem PEDIU vê o que pediu — e só o que pediu ──────────────────────
select tests.authenticate_as('dorh@cmp.test');
select is(
  (select count(*)::int from public.compras_solicitacoes),
  1,
  'quem abriu a solicitacao ve a dela, mesmo sem o modulo Compras'
);
select is(
  (select product_name from public.compras_solicitacoes),
  'Mouse',
  'e e a DELA: a do vizinho, com as duas na base, nao aparece'
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
select is((select count(*)::int from t), 0, 'e NAO escreve: quem define o teto e quem altera a aba Teto de gasto');

select tests.clear_authentication();

-- ── 7. O setor novo existe ───────────────────────────────────────────────────
create temporary table ch3 on commit drop as
with ins as (
  insert into public.tickets (tenant_id, module, title, description, priority, status, requester_id, category_id)
  select a, 'compras', 'Comprar cafe', 'x', 'medium', 'open', (select compradora from u), (select id from cat) from f
  returning id
) select id from ins;

select lives_ok(
  $$ insert into public.compras_solicitacoes
       (tenant_id, ticket_id, product_name, estimated_amount, status, created_by, department)
     select a, (select id from ch3), 'Cafe', 30, 'pending_approval', (select compradora from u), 'compras' from f
     returning id $$,
  'o setor "compras" e aceito pelo CHECK: virou o decimo'
);

select * from finish();
rollback;

-- O SETOR DA COMPRA — a raiz do que a leva I encontrou
-- (migrations 20261103010000 e 20261103030000)
--
-- Leva I (Compras), 2026-09-26. Decisão do dono: o solicitante escolhe o setor,
-- com o dele sugerido.
--
-- O QUE ESTA SUÍTE PRENDE, e por que cada asserção existe:
--
-- 1. **Setor é uma lista, não texto livre.** O banco tinha `ti` em 3 perfis e
--    `TI` em 2 — dois setores para o mesmo setor. É por texto que o teto de
--    gasto encontra o setor, então `TI` nunca casaria com um teto gravado em
--    `ti`. As asserções 1 a 4 põem o CHECK à prova nas quatro tabelas onde
--    "setor" é gravado.
--
-- 2. **O setor da compra chega à conta a pagar como centro de custo.** Esta é a
--    corrente inteira (regra 8): inserir a compra, aprovar, concluir, e olhar a
--    conta. Não basta testar o UPDATE — o que importa é o caminho que o usuário
--    percorre.
--
-- 3. **Compra sem setor continua possível, e a conta nasce sem centro de custo.**
--    Compra antiga não tem culpa, e inventar um setor para satisfazer uma coluna
--    seria pior — foi o que a L8 registrou. A asserção prova que o nulo
--    atravessa em vez de virar a palavra "Sem setor".
--
-- O que esta suíte NÃO alcança: que o formulário leia o setor do lugar certo.
-- O defeito de origem era `user_metadata.department` no front — nada neste
-- sistema escreve ali, e 5 de 5 pessoas tinham setor só em `profiles`. Isso é
-- Vitest (`src/lib/setores.test.ts`) e navegação real; aqui prende-se o que o
-- banco garante.
begin;
\ir _helpers.psql

select plan(10);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-setor-a', 'Setor A', false) as a;

create temporary table u on commit drop as
select tests.create_user('comprador@setor.test', (select a from f)) as pa;
select tests.grant_module((select pa from u), (select a from f), 'financeiro');
select tests.grant_role((select pa from u), 'manager');
grant select on f, u to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Setor é uma das nove palavras, nas quatro tabelas que o gravam
-- ───────────────────────────────────────────────────────────────────────────
-- `TI` em caixa alta é o caso REAL que estava no banco, não um inventado.
select throws_ok(
  format($$ update public.profiles set department = 'TI' where id = %L::uuid $$,
         (select pa from u)),
  '23514',
  null,
  'setor em caixa alta e recusado no perfil — era o dado real: ti (3) e TI (2)'
);

select lives_ok(
  format($$ update public.profiles set department = 'producao' where id = %L::uuid $$,
         (select pa from u)),
  'e Producao e um setor valido, apesar de nao ser modulo com perfil de acesso'
);

select throws_ok(
  $$ insert into public.fin_department_budgets (tenant_id, department, monthly_limit)
     select a, 'Vendas', 1000 from f $$,
  '23514',
  null,
  'teto para um setor que nao existe e recusado — seria dinheiro reservado para ninguem'
);

select throws_ok(
  $$ insert into public.tenant_invites (tenant_id, email, role, department)
     select a, 'novo@setor.test', 'member', 'Producao' from f $$,
  '23514',
  null,
  'convite com setor fora da lista e recusado — e por ele que o perfil nasce'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. A corrente: compra com setor → conta a pagar com centro de custo
-- ───────────────────────────────────────────────────────────────────────────
create temporary table cat on commit drop as
with ins as (
  insert into public.ti_categories (tenant_id, module, name, is_purchase)
  select a, 'financeiro', 'Compra de material', true from f
  returning id
) select id from ins;

create temporary table ch on commit drop as
with ins as (
  insert into public.tickets (tenant_id, module, title, description, priority, status, requester_id, category_id)
  select a, 'financeiro', 'Comprar bancada', 'x', 'medium', 'open', (select pa from u), (select id from cat) from f
  returning id
) select id from ins;
grant select on cat, ch to authenticated;

select throws_ok(
  $$ insert into public.fin_purchase_requests
       (tenant_id, ticket_id, product_name, department, estimated_amount, status, created_by)
     select a, (select id from ch), 'Bancada', 'Expedicao', 500.00, 'pending_approval', (select pa from u) from f $$,
  '23514',
  null,
  'e a compra tambem nao aceita setor fora da lista'
);

create temporary table req on commit drop as
with ins as (
  insert into public.fin_purchase_requests
    (tenant_id, ticket_id, product_name, department, estimated_amount, status, created_by)
  select a, (select id from ch), 'Bancada', 'expedicao', 500.00, 'pending_approval', (select pa from u) from f
  returning id
) select id from ins;

create temporary table q1 on commit drop as
with ins as (
  insert into public.fin_purchase_quotes (tenant_id, request_id, supplier, amount, position)
  select a, (select id from req), 'Marcenaria do Zé', 480.00, 1 from f
  returning id
) select id from ins;
-- Três orçamentos, para a regra da L8 não pedir motivo e este teste falar de
-- uma coisa só.
insert into public.fin_purchase_quotes (tenant_id, request_id, supplier, amount, position)
select a, (select id from req), 'Marcenaria B', 520.00, 2 from f;
insert into public.fin_purchase_quotes (tenant_id, request_id, supplier, amount, position)
select a, (select id from req), 'Marcenaria C', 610.00, 3 from f;
grant select on req, q1 to authenticated;

update public.fin_purchase_requests
   set status = 'approved', approved_quote_id = (select id from q1),
       approved_by = (select pa from u), approved_at = now(), estimated_amount = 480.00
 where id = (select id from req);

update public.fin_purchase_requests
   set status = 'completed', purchase_report = 'Comprado na marcenaria',
       executed_by = (select pa from u), executed_at = now()
 where id = (select id from req);

select is(
  (select cost_center from public.fin_entries where purchase_request_id = (select id from req)),
  'expedicao',
  'o setor ESCOLHIDO na compra vira o centro de custo da conta a pagar'
);

-- E o setor escolhido pode não ser o de quem pediu: é a decisão do dono nesta
-- leva. Quem abriu está em `producao` (asserção 2) e a compra é da `expedicao`.
select is(
  (select p.department from public.profiles p where p.id = (select pa from u)),
  'producao',
  'e ele nao precisa ser o setor de quem abriu — a TI compra cabo para o Comercial'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Compra sem setor: o nulo atravessa, e é a verdade sobre ela
-- ───────────────────────────────────────────────────────────────────────────
create temporary table ch2 on commit drop as
with ins as (
  insert into public.tickets (tenant_id, module, title, description, priority, status, requester_id, category_id)
  select a, 'financeiro', 'Comprar sem setor', 'x', 'medium', 'open', (select pa from u), (select id from cat) from f
  returning id
) select id from ins;
create temporary table req2 on commit drop as
with ins as (
  insert into public.fin_purchase_requests
    (tenant_id, ticket_id, product_name, department, estimated_amount, status, created_by)
  select a, (select id from ch2), 'Caixa de papel', null, 100.00, 'pending_approval', (select pa from u) from f
  returning id
) select id from ins;
grant select on ch2, req2 to authenticated;

insert into public.fin_purchase_quotes (tenant_id, request_id, supplier, amount, position)
select a, (select id from req2), 'Papelaria 1', 100.00, 1 from f;
insert into public.fin_purchase_quotes (tenant_id, request_id, supplier, amount, position)
select a, (select id from req2), 'Papelaria 2', 110.00, 2 from f;
insert into public.fin_purchase_quotes (tenant_id, request_id, supplier, amount, position)
select a, (select id from req2), 'Papelaria 3', 120.00, 3 from f;

update public.fin_purchase_requests
   set status = 'approved',
       approved_quote_id = (select id from public.fin_purchase_quotes
                             where request_id = (select id from req2) and position = 1),
       approved_by = (select pa from u), approved_at = now()
 where id = (select id from req2);
update public.fin_purchase_requests
   set status = 'completed', purchase_report = 'x',
       executed_by = (select pa from u), executed_at = now()
 where id = (select id from req2);

select is(
  (select cost_center from public.fin_entries where purchase_request_id = (select id from req2)),
  null,
  'compra sem setor gera conta com centro de custo NULO — nao a palavra "Sem setor"'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. O dado velho foi normalizado, não apagado
-- ───────────────────────────────────────────────────────────────────────────
-- A migration faz `lower(trim(...))` e, se sobrar setor fora da lista, PARA e
-- diz qual. Aqui prova-se o que ela garantiu: nenhuma linha viva está fora da
-- lista — em qualquer banco onde esta suíte rode, inclusive o do CI, criado do
-- zero pelas migrations.
select is(
  (select count(*)::int from public.profiles
    where department is not null
      and department not in ('ti','marketing','comercial','rh','financeiro',
                            'producao','expedicao','educacional','qualidade')),
  0,
  'nenhum perfil ficou com setor fora da lista'
);
select is(
  (select count(*)::int from public.fin_department_budgets
    where department not in ('ti','marketing','comercial','rh','financeiro',
                            'producao','expedicao','educacional','qualidade')),
  0,
  'nenhum teto ficou apontando para setor que nao existe'
);

select * from finish();
rollback;

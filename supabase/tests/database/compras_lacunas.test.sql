-- L8: Compras — as lacunas fechadas onde ela já está (migration 20261009010000).
--
-- Prova:
--   - aprovar com menos de três orçamentos exige o motivo escrito; com três,
--     não exige nada
--   - concluir a compra faz nascer a **conta a pagar**, com o valor do
--     orçamento aprovado, o fornecedor do cadastro e o setor como centro de
--     custo (D8)
--   - concluir duas vezes não lança duas contas
--   - compra sem valor nenhum não vira conta — inventar zero seria pior
--   - o fornecedor é cadastro, e o mesmo nome não entra duas vezes na empresa
--   - fornecedor de outra empresa não entra num orçamento desta
--   - "é compra" é marcação na categoria, e não o nome dela
--   - o cadastro de fornecedor é de quem tem o Financeiro, e não existe para
--     quem não tem, para a outra empresa nem para o anônimo
--
-- E os achados da auditoria da própria leva, que este arquivo passou a prender:
--   - pedido de uma empresa não aprova o orçamento de outra (a conta a pagar
--     nascia aqui com o valor e o fornecedor de lá)
--   - nem pela porta do INSERT se aprova compra sem orçamento e sem motivo
--   - o motivo dos poucos orçamentos vale para **uma** decisão: reprovar o
--     apaga, e aprovar com três também
--   - desfazer a conclusão cancela a conta a pagar — inclusive a que está em
--     atraso —, e concluir de novo devolve a mesma conta à vida em vez de
--     abrir outra
--   - conta **já paga** não se mexe, e refazer a compra por outro valor para e
--     manda acertar no Financeiro, em vez de sair em silêncio
--   - compra não nasce concluída
begin;
\ir _helpers.psql

select plan(34);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-cmp-a', 'Compras A') as a,
       tests.create_tenant('pgtap-cmp-b', 'Compras B') as b;

create temporary table u on commit drop as
select tests.create_user('comprador@cmp.test', (select a from f)) as pa,
       tests.create_user('outro@cmp.test',     (select b from f)) as pb,
       -- Sem módulo **e sem cargo**, de propósito: `has_fin_access` cai no
       -- `is_supervisor_or_higher`, e um cargo de gestor abriria o Financeiro
       -- por trás, sem ninguém ter concedido o módulo.
       tests.create_user('semfin@cmp.test',    (select a from f)) as sem_fin;
select tests.grant_module((select pa from u), (select a from f), 'financeiro');
select tests.grant_role((select pa from u), 'manager');
select tests.grant_role((select pb from u), 'manager');
grant select on f, u to authenticated, anon;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Fornecedor vira cadastro
-- ───────────────────────────────────────────────────────────────────────────
create temporary table forn on commit drop as
with ins as (
  insert into public.fin_suppliers (tenant_id, name, cnpj)
  select a, 'Kalunga', '11.111.111/0001-11' from f
  returning id
) select id from ins;
create temporary table forn_b on commit drop as
with ins as (
  insert into public.fin_suppliers (tenant_id, name) select b, 'Fornecedor da B' from f
  returning id
) select id from ins;
grant select on forn, forn_b to authenticated, anon;

select throws_ok(
  $$ insert into public.fin_suppliers (tenant_id, name) select a, 'Kalunga' from f $$,
  '23505',
  null,
  'o mesmo fornecedor nao entra duas vezes na mesma empresa'
);
select lives_ok(
  $$ insert into public.fin_suppliers (tenant_id, name) select b, 'Kalunga' from f returning id $$,
  'mas outra empresa pode ter um fornecedor com o mesmo nome'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. A solicitação de compra
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
  select a, 'financeiro', 'Comprar cadeiras', 'x', 'medium', 'open', (select pa from u), (select id from cat) from f
  returning id
) select id from ins;

create temporary table req on commit drop as
with ins as (
  insert into public.fin_purchase_requests
    (tenant_id, ticket_id, product_name, department, estimated_amount, status, created_by)
  select a, (select id from ch), 'Cadeira de escritório', 'ti', 900.00, 'pending_approval', (select pa from u) from f
  returning id
) select id from ins;
grant select on cat, ch, req to authenticated, anon;

create temporary table q1 on commit drop as
with ins as (
  insert into public.fin_purchase_quotes (tenant_id, request_id, supplier_id, supplier, amount, position)
  select a, (select id from req), (select id from forn), 'Kalunga', 850.00, 1 from f
  returning id
) select id from ins;
grant select on q1 to authenticated, anon;

-- Fornecedor de outra empresa num orçamento desta: a chave composta recusa.
select throws_ok(
  $$ insert into public.fin_purchase_quotes (tenant_id, request_id, supplier_id, supplier, amount, position)
     select a, (select id from req), (select id from forn_b), 'Alheio', 100.00, 9 from f $$,
  '23503',
  null,
  'orcamento nao aponta para fornecedor de outra empresa'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Três orçamentos: regra do banco, não combinado
-- ───────────────────────────────────────────────────────────────────────────
-- A política existia na cabeça de quem aprova, e o banco aceitava um só. Não é
-- proibição: é exigir a justificativa, porque urgência e fornecedor exclusivo
-- existem — o que não pode é passarem despercebidos.
select throws_ok(
  format($$ update public.fin_purchase_requests
               set status = 'approved', approved_quote_id = %L::uuid
             where id = %L::uuid $$,
         (select id from q1), (select id from req)),
  '23514',
  null,
  'aprovar com um orcamento so, sem motivo, e recusado'
);
select lives_ok(
  format($$ update public.fin_purchase_requests
               set status = 'approved', approved_quote_id = %L::uuid,
                   few_quotes_reason = 'fornecedor exclusivo'
             where id = %L::uuid $$,
         (select id from q1), (select id from req)),
  'com o motivo escrito, aprova'
);
select is(
  (select few_quotes_reason from public.fin_purchase_requests where id = (select id from req)),
  'fornecedor exclusivo',
  'e o motivo fica registrado na solicitacao'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Compra concluída vira conta a pagar (D8)
-- ───────────────────────────────────────────────────────────────────────────
-- Antes a compra acabava no laudo e o dinheiro nunca chegava ao Financeiro:
-- alguém lançava a conta à mão, ou ninguém lançava.
update public.fin_purchase_requests
   set status = 'completed', purchase_report = 'Comprado na loja',
       executed_by = (select pa from u), executed_at = now()
 where id = (select id from req);

create temporary table conta on commit drop as
select * from public.fin_entries where purchase_request_id = (select id from req);
grant select on conta to authenticated, anon;

select is((select count(*)::int from conta), 1, 'concluir a compra faz nascer uma conta a pagar');
select is((select kind::text from conta), 'payable', 'e ela e uma conta a **pagar**');
select is((select amount from conta), 850.00::numeric, 'com o valor do orcamento aprovado, nao o estimado');
select is((select counterparty from conta), 'Kalunga', 'e o fornecedor vem do cadastro');
select is((select cost_center from conta), 'ti',
  'o centro de custo e o setor que pediu — e como o teto de gasto e a conta falam do mesmo dinheiro');
select is((select status::text from conta), 'pending', 'nasce pendente: quem paga e o Financeiro');
select is((select source from conta), 'compra', 'e diz de onde veio');

select is(
  (select competence from conta),
  date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date,
  'e a competencia e o primeiro dia do mes, como em toda a importacao'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 4b. Desfazer a conclusão não pode deixar a conta viva
-- ───────────────────────────────────────────────────────────────────────────
-- Sem isto o Financeiro pagava uma conta cujo pedido dizia "reprovada".
update public.fin_purchase_requests set status = 'rejected', rejection_reason = 'errei'
 where id = (select id from req);
select is(
  (select status::text from public.fin_entries where purchase_request_id = (select id from req)),
  'cancelled',
  'compra que deixa de estar concluida tem a conta cancelada, nao apagada'
);
-- Reprovar desfaz a aprovação, e o motivo dos poucos orçamentos vai junto: ele
-- explicava *aquela* decisão.
select is(
  (select few_quotes_reason from public.fin_purchase_requests where id = (select id from req)),
  null,
  'e o motivo dos poucos orcamentos e apagado com ela'
);
select throws_ok(
  format($$ update public.fin_purchase_requests set status = 'approved' where id = %L::uuid $$,
         (select id from req)),
  '23514',
  null,
  'entao reaprovar exige escrever o motivo de novo — a regra nao vale so uma vez'
);

-- Concluir de novo devolve a mesma conta à vida, e não uma segunda.
update public.fin_purchase_requests
   set status = 'approved', few_quotes_reason = 'urgencia' where id = (select id from req);
update public.fin_purchase_requests set status = 'completed' where id = (select id from req);
select is(
  (select count(*)::int from public.fin_entries where purchase_request_id = (select id from req)),
  1,
  'concluir duas vezes nao lanca duas contas'
);
select is(
  (select status::text from public.fin_entries where purchase_request_id = (select id from req)),
  'pending',
  'e a conta cancelada volta a pendente em vez de nascer outra'
);

-- Compra sem valor nenhum não vira conta: inventar zero seria pior do que não
-- lançar, porque uma conta de R$ 0 some no meio das outras.
-- Toda solicitação nasce de um chamado (`ticket_id` é NOT NULL): compra neste
-- sistema é chamado, e não formulário solto.
create temporary table ch0 on commit drop as
with ins as (
  insert into public.tickets (tenant_id, module, title, description, priority, status, requester_id, category_id)
  select a, 'financeiro', 'Comprar coisa sem preco', 'x', 'medium', 'open',
         (select pa from u), (select id from cat) from f
  returning id
) select id from ins;

create temporary table req0 on commit drop as
with ins as (
  insert into public.fin_purchase_requests
    (tenant_id, ticket_id, product_name, department, status, created_by)
  select a, (select id from ch0), 'Coisa sem preco', 'ti', 'pending_approval', (select pa from u) from f
  returning id
) select id from ins;
grant select on ch0, req0 to authenticated, anon;

update public.fin_purchase_requests
   set status = 'approved', few_quotes_reason = 'nao tem o que cotar'
 where id = (select id from req0);
update public.fin_purchase_requests set status = 'completed' where id = (select id from req0);
select is(
  (select count(*)::int from public.fin_entries where purchase_request_id = (select id from req0)),
  0,
  'compra sem valor nenhum nao vira conta'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 4c. As duas portas dos fundos que a auditoria achou
-- ───────────────────────────────────────────────────────────────────────────
-- A regra dos três orçamentos era `before update of status`: um INSERT direto
-- com `status = 'approved'` entrava sem orçamento nenhum e sem motivo.
select throws_ok(
  $$ insert into public.fin_purchase_requests
       (tenant_id, ticket_id, product_name, department, status, created_by)
     select a, (select id from ch0), 'Entrando ja aprovado', 'ti', 'approved', (select pa from u) from f $$,
  '23514',
  null,
  'nem pela porta do INSERT se aprova compra sem orcamento e sem motivo'
);
-- E a primeira correção fechou a porta só para `approved`: nascer **concluída**
-- pulava a aprovação inteira, que é o assunto desta leva.
select throws_ok(
  $$ insert into public.fin_purchase_requests
       (tenant_id, ticket_id, product_name, department, estimated_amount, status, created_by)
     select a, (select id from ch0), 'Nascendo concluida', 'ti', 500.00, 'completed', (select pa from u) from f $$,
  '23514',
  null,
  'nem nasce concluida: concluida e onde a compra chega, nao de onde ela parte'
);

-- E `approved_quote_id` era chave de coluna única: um pedido desta empresa
-- apontando para o orçamento de OUTRA fazia a conta a pagar nascer aqui com o
-- valor e o fornecedor de lá. A chave composta impede a linha existir.
create temporary table req_b on commit drop as
with ins as (
  insert into public.tickets (tenant_id, module, title, description, priority, status, requester_id)
  select b, 'financeiro', 'Compra da B', 'x', 'medium', 'open', (select pb from u) from f
  returning id, tenant_id
), pedido as (
  insert into public.fin_purchase_requests
    (tenant_id, ticket_id, product_name, department, estimated_amount, status, created_by)
  select tenant_id, id, 'Coisa da B', 'ti', 50.00, 'pending_approval', (select pb from u) from ins
  returning id
) select id from pedido;
create temporary table q_b on commit drop as
with ins as (
  insert into public.fin_purchase_quotes (tenant_id, request_id, supplier, amount, position)
  select b, (select id from req_b), 'Fornecedor secreto da B', 77777.77, 1 from f
  returning id
) select id from ins;
grant select on req_b, q_b to authenticated, anon;

select throws_ok(
  format($$ update public.fin_purchase_requests
               set approved_quote_id = %L::uuid, few_quotes_reason = 'tentativa'
             where id = %L::uuid $$,
         (select id from q_b), (select id from req0)),
  '23503',
  null,
  'pedido de uma empresa nao aprova o orcamento de outra'
);

-- Com três orçamentos o motivo não faz sentido, e o banco o apaga: sem isso a
-- tela dizia "aprovada com menos de três orçamentos" numa compra bem cotada.
insert into public.fin_purchase_quotes (tenant_id, request_id, supplier, amount, position)
select a, (select id from req0), 'Loja 2', 10.00, 2 from f;
insert into public.fin_purchase_quotes (tenant_id, request_id, supplier, amount, position)
select a, (select id from req0), 'Loja 3', 20.00, 3 from f;
insert into public.fin_purchase_quotes (tenant_id, request_id, supplier, amount, position)
select a, (select id from req0), 'Loja 4', 30.00, 4 from f;

update public.fin_purchase_requests set status = 'pending_approval' where id = (select id from req0);
select lives_ok(
  format($$ update public.fin_purchase_requests set status = 'approved' where id = %L::uuid $$,
         (select id from req0)),
  'com tres orcamentos, aprova sem motivo nenhum'
);
select is(
  (select few_quotes_reason from public.fin_purchase_requests where id = (select id from req0)),
  null,
  'e o motivo antigo e apagado, para a tela nao mentir depois'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 4d. A conta em atraso, e a conta já paga
-- ───────────────────────────────────────────────────────────────────────────
-- Cancelar só o que está `pending` deixava viva a conta **em atraso** — e
-- "Atrasado" é um status que se escolhe à mão no lançamento.
update public.fin_entries set status = 'overdue' where purchase_request_id = (select id from req);
update public.fin_purchase_requests set status = 'rejected', rejection_reason = 'de novo'
 where id = (select id from req);
select is(
  (select status::text from public.fin_entries where purchase_request_id = (select id from req)),
  'cancelled',
  'conta em atraso tambem e cancelada quando a compra e desfeita'
);

-- Conta **paga** é dinheiro que saiu, e nenhum trigger o traz de volta.
-- Concluir de novo com outro valor não pode passar em silêncio: o pedido e o
-- Financeiro ficariam contando histórias diferentes sobre a mesma compra.
update public.fin_purchase_requests
   set status = 'approved', few_quotes_reason = 'ainda exclusivo' where id = (select id from req);
update public.fin_purchase_requests set status = 'completed' where id = (select id from req);
update public.fin_entries set status = 'paid' where purchase_request_id = (select id from req);
update public.fin_purchase_requests set status = 'rejected', rejection_reason = 'terceira vez'
 where id = (select id from req);
select is(
  (select status::text from public.fin_entries where purchase_request_id = (select id from req)),
  'paid',
  'mas conta ja paga nao se mexe: o dinheiro saiu'
);
-- Renegociou: o orçamento aprovado passa a valer outro valor.
update public.fin_purchase_quotes set amount = 1200.00 where id = (select id from q1);
update public.fin_purchase_requests
   set status = 'approved', few_quotes_reason = 'ainda exclusivo' where id = (select id from req);
select throws_ok(
  format($$ update public.fin_purchase_requests set status = 'completed' where id = %L::uuid $$,
         (select id from req)),
  '23514',
  null,
  'e concluir de novo por outro valor para e manda acertar no Financeiro'
);
-- Pelo valor que já foi pago, não há o que acertar: passa, e continua uma conta.
update public.fin_purchase_quotes set amount = 850.00 where id = (select id from q1);
update public.fin_purchase_requests set status = 'completed' where id = (select id from req);
select is(
  (select count(*)::int from public.fin_entries where purchase_request_id = (select id from req)),
  1,
  'pelo mesmo valor, concluir de novo nao lanca nada nem reclama'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. "É compra" é marcação, não o nome
-- ───────────────────────────────────────────────────────────────────────────
-- Com o teste pelo nome, renomear a categoria desligava o formulário de compra
-- inteiro — sumia produto, orçamento e aprovação — sem nada acusar.
update public.ti_categories set name = 'Aquisição de material' where id = (select id from cat);
select is(
  (select is_purchase from public.ti_categories where id = (select id from cat)),
  true,
  'renomear a categoria nao desliga o formulario de compra'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 6. O cadastro de fornecedor é do Financeiro (RLS)
-- ───────────────────────────────────────────────────────────────────────────
-- Tudo acima roda com o papel do runner, onde a RLS não existe. Fornecedor tem
-- CNPJ, contato e o que a empresa paga a quem: quem **vê** isso é pergunta
-- separada de quem grava — e é ela que separa uma empresa da outra.
select tests.authenticate_as('comprador@cmp.test');
select is(
  (select count(*)::int from public.fin_suppliers),
  1,
  'quem tem o Financeiro ve o fornecedor da sua empresa — e so o dela'
);

select tests.clear_authentication();
select tests.authenticate_as('semfin@cmp.test');
select is(
  (select count(*)::int from public.fin_suppliers),
  0,
  'quem nao tem o Financeiro nao ve fornecedor nenhum'
);

select tests.clear_authentication();
select tests.authenticate_as('outro@cmp.test');
select is(
  (select count(*)::int from public.fin_suppliers where tenant_id = (select a from f)),
  0,
  'e a outra empresa nao ve o fornecedor desta'
);
select tests.clear_authentication();

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon' and table_name = 'fin_suppliers'),
  0,
  'anonimo nao tem privilegio nenhum no cadastro de fornecedor'
);

select * from finish();
rollback;

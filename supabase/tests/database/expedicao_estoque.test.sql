-- EXP-1: Expedição com estoque por lote (migration 20260920010000). Prova a
-- corrente que o usuário percorre, não cada função solta:
--   - pedido pago aparece na fila como "a separar"; pedido em rascunho não
--   - quem não tem o módulo não vê a fila nem os lotes
--   - a separação agrupa o mesmo produto e já nasce com a linha avulsa separada
--     (sem isso o pedido ficava preso na fila para sempre)
--   - bipar escolhe o lote que VENCE PRIMEIRO (FEFO, padrão) e, trocando a regra,
--     o que ENTROU primeiro (FIFO)
--   - bipar mais do que o pedido pede, ou mais do que há no lote, é recusado
--   - no "manual" o sistema NÃO escolhe: pede o código do lote
--   - movimentação apontando lote de outra empresa é recusada pelo banco
--   - despachar sem separar tudo é recusado; separando tudo, despacha e a baixa
--     sai dos lotes certos; desfazer devolve ao estoque
--
-- As tabelas temporárias nascem antes do login simulado (quem escreve nelas
-- depois é o papel `authenticated`, que só precisa do INSERT concedido).
begin;
\ir _helpers.psql

select plan(17);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-exp-a', 'Exp A') as a,
       tests.create_tenant('pgtap-exp-b', 'Exp B') as b;

create temporary table u on commit drop as
select tests.create_user('expedicao@exp.test',  (select a from f)) as expedicao,
       tests.create_user('rh@exp.test',         (select a from f)) as rh,
       tests.create_user('gerente@exp.test',    (select a from f)) as gerente,
       tests.create_user('expedicaob@exp.test', (select b from f)) as expedicao_b;
select tests.grant_module((select expedicao from u),   (select a from f), 'expedicao');
select tests.grant_module((select rh from u),          (select a from f), 'rh');
select tests.grant_module((select expedicao_b from u), (select b from f), 'expedicao');
select tests.grant_role((select gerente from u), 'manager');

create temporary table s on commit drop as
select gen_random_uuid() as produto, gen_random_uuid() as produto2, gen_random_uuid() as contato,
       gen_random_uuid() as pedido, gen_random_uuid() as pedido2, gen_random_uuid() as rascunho,
       gen_random_uuid() as lote_novo, gen_random_uuid() as lote_velho, gen_random_uuid() as lote2,
       gen_random_uuid() as produto_b;

create temporary table sep  (id uuid)          on commit drop;
create temporary table sep2 (id uuid)          on commit drop;
create temporary table bips (tag text, r jsonb) on commit drop;
grant select on f, u, s to authenticated;
grant select, insert on sep, sep2, bips to authenticated;

-- Produto que controla lote, com dois lotes: o que entrou DEPOIS vence ANTES.
insert into public.crm_products (id, tenant_id, name, sku, barcode, unit, price, track_lots)
select produto, (select a from f), 'Creme 1 kg', 'CR-1KG', '7890000000017', 'un', 85, true from s
union all
select produto2, (select a from f), 'Sabonete', 'SAB', '7890000000024', 'un', 10, true from s
union all
select produto_b, (select b from f), 'Produto da B', 'PB', '7890000000031', 'un', 5, true from s;

insert into public.exp_lots (id, tenant_id, product_id, code, expires_on, received_on)
select lote_novo,  (select a from f), produto,  'L-NOVO',  '2027-12-31', '2026-09-01' from s
union all
select lote_velho, (select a from f), produto,  'L-VELHO', '2026-11-30', '2026-09-05' from s
union all
select lote2,      (select a from f), produto2, 'L-SAB',   '2027-01-31', '2026-09-01' from s;
insert into public.exp_stock_moves (tenant_id, product_id, lot_id, kind, quantity, reason)
select (select a from f), produto,  lote_novo,  'in', 100, 'entrada' from s
union all
select (select a from f), produto,  lote_velho, 'in', 10,  'entrada' from s
union all
select (select a from f), produto2, lote2,      'in', 1,   'entrada' from s;

-- Pedido pago (vai para a fila), um em rascunho (não vai) e um segundo pago.
insert into public.crm_contacts (id, tenant_id, name, carrier)
select contato, (select a from f), 'Distribuidora Norte', 'Transportes Amazônia' from s;
insert into public.crm_orders (id, tenant_id, contact_id, status, created_by)
select pedido,   (select a from f), contato, 'draft', (select gerente from u) from s
union all
select pedido2,  (select a from f), contato, 'draft', (select gerente from u) from s
union all
select rascunho, (select a from f), contato, 'draft', (select gerente from u) from s;
-- O pedido 1 tem o mesmo produto em DUAS linhas e uma linha avulsa (frete).
insert into public.crm_order_items (tenant_id, order_id, product_id, description, quantity, unit_price, position)
select (select a from f), pedido,   produto,  'Creme 1 kg', 2, 85, 0 from s
union all
select (select a from f), pedido,   produto,  'Creme 1 kg', 1, 85, 1 from s
union all
select (select a from f), pedido,   null,     'Frete',      1, 30, 2 from s
union all
select (select a from f), pedido2,  produto2, 'Sabonete',   2, 10, 0 from s
union all
select (select a from f), rascunho, produto,  'Creme 1 kg', 1, 85, 0 from s;
update public.crm_orders set status = 'paid' where id in (select pedido from s);

-- ───────────────────────────────────────────────────────────────────────────
-- A fila e quem a enxerga
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('expedicao@exp.test');
select is(
  (select string_agg(q.status || ':' || q.order_number::text, ',' order by q.order_number) from public.exp_queue() q),
  'a_separar:1',
  'so o pedido pago entra na fila da expedicao'
);
select tests.clear_authentication();

select tests.authenticate_as('rh@exp.test');
select is((select count(*)::int from public.exp_queue()), 0, 'quem nao tem o modulo nao ve a fila');
select is((select count(*)::int from public.exp_lots), 0, 'nem os lotes');
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- Separar
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('expedicao@exp.test');

insert into sep (id) select public.exp_start((select pedido from s));
select is(
  (select string_agg(i.description || ':' || i.quantity::text || ':' || i.picked::text, ' | ' order by i.position)
     from public.exp_shipment_items i where i.shipment_id = (select id from sep)),
  'Creme 1 kg:3.000:0.000 | Frete:1.000:1.000',
  'o mesmo produto vira uma linha so, e a linha avulsa ja nasce separada'
);

-- FEFO (padrão): o lote que vence antes é o L-VELHO, mesmo tendo entrado depois.
insert into bips (tag, r) select 'fefo', public.exp_scan((select id from sep), '7890000000017', 1);
select is((select r->>'lot' from bips where tag = 'fefo'), 'L-VELHO', 'FEFO escolhe o lote que vence primeiro');
select is((select r->>'remaining' from bips where tag = 'fefo'), '2.000', 'e diz quanto falta do item');

select throws_ok(
  format($$ select public.exp_scan(%L::uuid, 'CR-1KG', 99) $$, (select id from sep)),
  'P0001', null,
  'bipar mais do que o pedido pede e recusado'
);
select throws_ok(
  format($$ select public.exp_ship(%L::uuid, 'X', 'Y') $$, (select id from sep)),
  'P0001', null,
  'despachar com item faltando e recusado'
);

select tests.clear_authentication();

-- FIFO: trocando a regra, quem sai primeiro é o que entrou primeiro (L-NOVO).
update public.tenants set settings = coalesce(settings, '{}'::jsonb) || '{"expedicao":{"picking":"fifo"}}'::jsonb
 where id = (select a from f);

select tests.authenticate_as('expedicao@exp.test');
insert into bips (tag, r) select 'fifo', public.exp_scan((select id from sep), 'CR-1KG', 2);
select is((select r->>'lot' from bips where tag = 'fifo'), 'L-NOVO', 'FIFO escolhe o lote que entrou primeiro');

select lives_ok(
  format($$ select public.exp_ship(%L::uuid, 'Transportes Amazônia', 'BR123456789BR') $$, (select id from sep)),
  'com tudo separado, despacha'
);
select is(
  (select string_agg(b.code || '=' || b.balance::text, ', ' order by b.code)
     from public.exp_lot_balances b where b.product_id = (select produto from s)),
  'L-NOVO=98.000, L-VELHO=9.000',
  'a baixa saiu dos lotes certos: 1 do que vence antes e 2 do que entrou antes'
);
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- O estoque não fura: saldo, empresa e "manual"
-- ───────────────────────────────────────────────────────────────────────────
update public.crm_orders set status = 'paid' where id = (select pedido2 from s);

select tests.authenticate_as('expedicao@exp.test');
insert into sep2 (id) select public.exp_start((select pedido2 from s));
-- O pedido pede 2 e o lote tem 1: o pedido não manda no estoque.
select throws_ok(
  format($$ select public.exp_scan(%L::uuid, 'SAB', 2) $$, (select id from sep2)),
  'P0001', null,
  'bipar mais do que ha no lote e recusado (o saldo nao fica negativo)'
);
select tests.clear_authentication();

-- "manual": o sistema não escolhe lote nenhum.
update public.tenants set settings = coalesce(settings, '{}'::jsonb) || '{"expedicao":{"picking":"manual"}}'::jsonb
 where id = (select a from f);
select tests.authenticate_as('expedicao@exp.test');
select throws_ok(
  format($$ select public.exp_scan(%L::uuid, 'SAB', 1) $$, (select id from sep2)),
  'P0001', null,
  'no manual o sistema nao escolhe: pede o codigo do lote'
);
-- Bipando o lote, separa.
insert into bips (tag, r) select 'manual', public.exp_scan((select id from sep2), 'L-SAB', 1);
select is((select r->>'lot' from bips where tag = 'manual'), 'L-SAB', 'bipar o lote manda na escolha');

-- Desfazer devolve ao estoque.
select lives_ok(
  format($$ select public.exp_cancel(%L::uuid, 'prova') $$, (select id from sep2)),
  'desfazer a separacao'
);
select is(
  (select b.balance::text from public.exp_lot_balances b where b.lot_id = (select lote2 from s)),
  '1.000',
  'o que tinha saido voltou ao estoque'
);
select tests.clear_authentication();

-- Empresa B não encosta no lote da empresa A (chave composta, não confiança).
select tests.authenticate_as('expedicaob@exp.test');
select throws_ok(
  format($$ insert into public.exp_stock_moves (tenant_id, product_id, lot_id, kind, quantity, reason)
            values (%L::uuid, %L::uuid, %L::uuid, 'adjust', -999, 'sabotagem') $$,
         (select b from f), (select produto from s), (select lote_velho from s)),
  '23503', null,
  'empresa B nao lanca movimentacao contra o lote da empresa A'
);
select tests.clear_authentication();

select * from finish();
rollback;

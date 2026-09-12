-- EXP-1: Expedição com estoque por lote (migration 20260920010000). Prova a
-- corrente que o usuário percorre, não cada função solta:
--   - pedido pago aparece na fila como "a separar"; pedido em rascunho não
--   - quem não tem o módulo não vê a fila nem os lotes
--   - bipar o código de barras escolhe o lote que VENCE PRIMEIRO (FEFO, padrão)
--   - trocando a regra para FIFO, escolhe o que ENTROU primeiro
--   - bipar mais do que o pedido pede é recusado
--   - despachar sem separar tudo é recusado; separando tudo, despacha e a baixa
--     sai dos lotes certos
--
-- As tabelas temporárias nascem antes do login simulado (quem escreve nelas
-- depois é o papel `authenticated`, que só precisa do INSERT concedido).
begin;
\ir _helpers.psql

select plan(10);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-exp-a', 'Exp A') as a;

create temporary table u on commit drop as
select tests.create_user('expedicao@exp.test', (select a from f)) as expedicao,
       tests.create_user('rh@exp.test',        (select a from f)) as rh,
       tests.create_user('gerente@exp.test',   (select a from f)) as gerente;
select tests.grant_module((select expedicao from u), (select a from f), 'expedicao');
select tests.grant_module((select rh from u),        (select a from f), 'rh');
select tests.grant_role((select gerente from u), 'manager');

create temporary table s on commit drop as
select gen_random_uuid() as produto, gen_random_uuid() as contato,
       gen_random_uuid() as pedido, gen_random_uuid() as rascunho,
       gen_random_uuid() as lote_novo, gen_random_uuid() as lote_velho;

create temporary table sep  on commit drop (id uuid);
create temporary table bips on commit drop (tag text, r jsonb);
grant select on f, u, s to authenticated;
grant select, insert on sep, bips to authenticated;

-- Produto que controla lote, com dois lotes: o que entrou DEPOIS vence ANTES.
insert into public.crm_products (id, tenant_id, name, sku, barcode, unit, price, track_lots)
select produto, (select a from f), 'Creme 1 kg', 'CR-1KG', '7890000000017', 'un', 85, true from s;
insert into public.exp_lots (id, tenant_id, product_id, code, expires_on, received_on)
select lote_novo,  (select a from f), produto, 'L-NOVO',  '2027-12-31', '2026-09-01' from s
union all
select lote_velho, (select a from f), produto, 'L-VELHO', '2026-11-30', '2026-09-05' from s;
insert into public.exp_stock_moves (tenant_id, product_id, lot_id, kind, quantity, reason)
select (select a from f), produto, lote_novo,  'in', 100, 'entrada' from s
union all
select (select a from f), produto, lote_velho, 'in', 10,  'entrada' from s;

-- Um pedido pago (vai para a fila) e um em rascunho (não vai).
insert into public.crm_contacts (id, tenant_id, name, carrier)
select contato, (select a from f), 'Distribuidora Norte', 'Transportes Amazônia' from s;
insert into public.crm_orders (id, tenant_id, contact_id, status, created_by)
select pedido,   (select a from f), contato, 'draft', (select gerente from u) from s
union all
select rascunho, (select a from f), contato, 'draft', (select gerente from u) from s;
insert into public.crm_order_items (tenant_id, order_id, product_id, description, quantity, unit_price, position)
select (select a from f), pedido,   produto, 'Creme 1 kg', 3, 85, 0 from s
union all
select (select a from f), rascunho, produto, 'Creme 1 kg', 1, 85, 0 from s;
update public.crm_orders set status = 'paid' where id = (select pedido from s);

-- ───────────────────────────────────────────────────────────────────────────
-- A fila
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
-- Separar: o lote é escolhido pela regra da empresa
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('expedicao@exp.test');

insert into sep (id) select public.exp_start((select pedido from s));
select is(
  (select count(*)::int from public.exp_shipment_items where shipment_id = (select id from sep)),
  1,
  'a separacao nasce com os itens do pedido'
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

-- ───────────────────────────────────────────────────────────────────────────
-- Despachar e o saldo
-- ───────────────────────────────────────────────────────────────────────────
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

select * from finish();
rollback;

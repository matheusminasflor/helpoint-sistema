-- Leva EXP-1: módulo Expedição com estoque por lote. 2026-09-12 (ADR-009).
--
-- O ciclo que fecha a venda: pedido pago → a Expedição separa (bipando os
-- itens) → o sistema escolhe o lote pela validade (FEFO) ou pela entrada
-- (FIFO), conforme a empresa configurar → despacha com transportadora e
-- rastreio. Estoque por lote entra na mesma leva porque separar sem saber de
-- que lote saiu não serve a quem tem validade.
--
-- A Expedição **não tem fila de chamados** (como o CRM, ADR-009): tem domínio
-- próprio. Quem quiser chamado de expedição abre no Comercial ou na TI.
--
-- O que este arquivo cria, em uma frase cada:
--   has_expedicao_access(user)  quem tem o módulo `expedicao` concedido, ou é supervisor/acima
--   crm_products.barcode/track_lots  o código que se bipa e se o produto controla lote
--   exp_lots                    um lote de um produto: código, validade, quando entrou
--   exp_stock_moves             toda entrada, saída e ajuste — o saldo é a soma delas
--   exp_lot_balances            saldo por lote (view)
--   exp_product_balances        saldo por produto, com a validade mais próxima (view)
--   exp_shipments               a separação de um pedido, com transportadora e rastreio
--   exp_shipment_items          o que separar e o que já foi separado, e de que lote
--   exp_pick_lot()              qual lote usar agora: FEFO (validade) ou FIFO (entrada)
--   exp_start(order)            cria a separação com os itens do pedido pago
--   exp_scan(shipment, code)    a bipagem: acha o produto, escolhe o lote, dá baixa
--   exp_ship(shipment, …)       despacha: transportadora, rastreio, baixa o que faltava
--   exp_queue()                 a fila: pedidos pagos ainda sem separação + as separações abertas

-- ───────────────────────────────────────────────────────────────────────────
-- Acesso
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.has_expedicao_access(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_module_access
    where user_id = _user_id and module = 'expedicao'
  ) or public.is_supervisor_or_higher(_user_id);
$$;
revoke all on function public.has_expedicao_access(uuid) from public, anon;
grant execute on function public.has_expedicao_access(uuid) to authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- Produto: o que se bipa e se controla lote
-- ───────────────────────────────────────────────────────────────────────────
alter table public.crm_products
  add column barcode    text,                                  -- EAN/GTIN ou o que a etiqueta da empresa usa
  add column track_lots boolean not null default false;         -- produto com validade/rastreio por lote
create unique index crm_products_barcode_idx on public.crm_products (tenant_id, barcode) where barcode is not null;

-- ───────────────────────────────────────────────────────────────────────────
-- Estoque por lote
-- ───────────────────────────────────────────────────────────────────────────
create table public.exp_lots (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  product_id  uuid not null references public.crm_products(id) on delete cascade,
  code        text not null check (length(trim(code)) between 1 and 60),
  expires_on  date,
  received_on date not null default (now() at time zone 'America/Sao_Paulo')::date,
  notes       text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, product_id, code)
);
create index exp_lots_pick_idx on public.exp_lots (tenant_id, product_id, expires_on nulls last, received_on);

create table public.exp_stock_moves (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  product_id  uuid not null references public.crm_products(id) on delete cascade,
  lot_id      uuid references public.exp_lots(id) on delete restrict,
  -- `quantity` é assinada: entrada positiva, saída negativa. O saldo é `sum(quantity)`.
  kind        text not null check (kind in ('in', 'out', 'adjust')),
  quantity    numeric(12,3) not null check (quantity <> 0),
  reason      text,
  order_id    uuid references public.crm_orders(id) on delete set null,
  shipment_id uuid,                                            -- FK adiada: exp_shipments nasce abaixo
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint exp_stock_moves_sign check (
    (kind = 'in' and quantity > 0) or (kind = 'out' and quantity < 0) or kind = 'adjust')
);
create index exp_stock_moves_lot_idx     on public.exp_stock_moves (tenant_id, lot_id);
create index exp_stock_moves_product_idx on public.exp_stock_moves (tenant_id, product_id, created_at desc);

create view public.exp_lot_balances
with (security_invoker = true) as
select l.tenant_id, l.id as lot_id, l.product_id, l.code, l.expires_on, l.received_on,
       coalesce(sum(m.quantity), 0)::numeric(12,3) as balance
  from public.exp_lots l
  left join public.exp_stock_moves m on m.lot_id = l.id
 group by l.tenant_id, l.id, l.product_id, l.code, l.expires_on, l.received_on;

create view public.exp_product_balances
with (security_invoker = true) as
select p.tenant_id, p.id as product_id, p.name, p.sku, p.barcode, p.unit, p.track_lots,
       coalesce(sum(m.quantity), 0)::numeric(12,3) as balance,
       (select min(b.expires_on) from public.exp_lot_balances b
         where b.product_id = p.id and b.balance > 0 and b.expires_on is not null) as next_expiry
  from public.crm_products p
  left join public.exp_stock_moves m on m.product_id = p.id
 group by p.tenant_id, p.id, p.name, p.sku, p.barcode, p.unit, p.track_lots;

-- ───────────────────────────────────────────────────────────────────────────
-- A separação de um pedido
-- ───────────────────────────────────────────────────────────────────────────
create table public.exp_shipments (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  number        integer not null,                               -- sequencial por empresa (trigger)
  order_id      uuid not null references public.crm_orders(id) on delete cascade,
  -- pending = a separar; picking = separando; packed = separado, pronto para despachar;
  -- shipped = despachado; cancelled = cancelado
  status        text not null default 'pending' check (status in ('pending', 'picking', 'packed', 'shipped', 'cancelled')),
  assigned_to   uuid references public.profiles(id) on delete set null,
  carrier       text,                                           -- transportadora (a do contato entra como sugestão)
  tracking_code text,
  label_url     text,                                           -- etiqueta (Melhor Envio entra na leva dos encaixes)
  packed_at     timestamptz,
  shipped_at    timestamptz,
  notes         text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, number),
  unique (order_id)                                             -- um pedido, uma separação
);
create index exp_shipments_queue_idx on public.exp_shipments (tenant_id, status, created_at);

create table public.exp_shipment_items (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  shipment_id   uuid not null references public.exp_shipments(id) on delete cascade,
  order_item_id uuid references public.crm_order_items(id) on delete set null,
  product_id    uuid references public.crm_products(id) on delete set null,
  description   text not null,
  quantity      numeric(12,3) not null check (quantity > 0),     -- o que o pedido pede
  picked        numeric(12,3) not null default 0 check (picked >= 0),
  lot_id        uuid references public.exp_lots(id) on delete set null,  -- o último lote usado (o rastro fica nas movimentações)
  position      integer not null default 0
);
create index exp_shipment_items_shipment_idx on public.exp_shipment_items (shipment_id, position);

alter table public.exp_stock_moves
  add constraint exp_stock_moves_shipment_fkey foreign key (shipment_id) references public.exp_shipments(id) on delete set null;

-- ───────────────────────────────────────────────────────────────────────────
-- Triggers de casa
-- ───────────────────────────────────────────────────────────────────────────
create trigger inject_tenant_id_exp_lots           before insert on public.exp_lots           for each row execute function public.inject_tenant_id();
create trigger inject_tenant_id_exp_stock_moves    before insert on public.exp_stock_moves    for each row execute function public.inject_tenant_id();
create trigger inject_tenant_id_exp_shipments      before insert on public.exp_shipments      for each row execute function public.inject_tenant_id();
create trigger inject_tenant_id_exp_shipment_items before insert on public.exp_shipment_items for each row execute function public.inject_tenant_id();

create trigger handle_exp_lots_updated_at      before update on public.exp_lots      for each row execute function public.handle_updated_at();
create trigger handle_exp_shipments_updated_at before update on public.exp_shipments for each row execute function public.handle_updated_at();

create trigger audit_exp_shipments_trigger after insert or update or delete on public.exp_shipments for each row execute function public.audit_trigger_fn();

-- Número da separação: sequencial por empresa (mesmo molde de `crm_orders_set_number`;
-- o UNIQUE transforma colisão em erro visível, não em número repetido).
create or replace function public.exp_shipments_set_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.number is null then
    select coalesce(max(number), 0) + 1 into new.number
      from public.exp_shipments where tenant_id = new.tenant_id;
  end if;
  return new;
end;
$$;
create trigger trg_exp_shipments_set_number before insert on public.exp_shipments
  for each row execute function public.exp_shipments_set_number();

-- ───────────────────────────────────────────────────────────────────────────
-- Regras que vivem no banco
-- ───────────────────────────────────────────────────────────────────────────

/**
 * Qual lote usar agora. A empresa escolhe em Configurações da Expedição
 * (`tenants.settings.expedicao.picking`):
 *   fefo (padrão) — vence primeiro, sai primeiro. É o que importa para quem tem validade.
 *   fifo          — entrou primeiro, sai primeiro.
 *   manual        — o sistema não escolhe; quem separa informa o lote.
 * Só lotes com saldo entram. Sem lote com saldo, devolve null (o chamador decide).
 */
create or replace function public.exp_pick_lot(p_tenant uuid, p_product uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select b.lot_id
    from public.exp_lot_balances b
    join public.tenants t on t.id = p_tenant
   where b.tenant_id = p_tenant and b.product_id = p_product and b.balance > 0
   order by
     case when coalesce(t.settings #>> '{expedicao,picking}', 'fefo') = 'fifo'
          then b.received_on else coalesce(b.expires_on, 'infinity'::date) end,
     b.received_on,
     b.code
   limit 1;
$$;

/** Cria a separação de um pedido pago, com os itens dele. Devolve o id (ou o que já existia). */
create or replace function public.exp_start(p_order uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.crm_orders;
  v_id uuid;
begin
  select * into o from public.crm_orders where id = p_order;
  if o.id is null or o.tenant_id is distinct from public.get_user_tenant_id()
     or not public.has_expedicao_access(auth.uid()) then
    raise exception 'pedido não encontrado';
  end if;
  if o.status <> 'paid' then
    raise exception 'só pedido pago vai para a expedição (este está "%")', o.status;
  end if;

  select id into v_id from public.exp_shipments where order_id = p_order;
  if v_id is not null then return v_id; end if;

  insert into public.exp_shipments (tenant_id, order_id, status, assigned_to, carrier, created_by)
  values (o.tenant_id, o.id, 'picking', auth.uid(),
          (select c.carrier from public.crm_contacts c where c.id = o.contact_id),
          auth.uid())
  returning id into v_id;

  insert into public.exp_shipment_items (tenant_id, shipment_id, order_item_id, product_id, description, quantity, position)
  select o.tenant_id, v_id, i.id, i.product_id, i.description, i.quantity, i.position
    from public.crm_order_items i where i.order_id = o.id order by i.position;

  return v_id;
end;
$$;

/**
 * A bipagem. `p_code` é o código de barras ou o SKU do produto; pode ser
 * também o código de um lote (aí o lote é esse, e não o que o FEFO escolheria).
 * Dá baixa no estoque e soma em `picked`. Devolve o que aconteceu, para a tela
 * dizer em voz alta: produto, lote, quanto falta.
 */
create or replace function public.exp_scan(p_shipment uuid, p_code text, p_quantity numeric default 1)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s        public.exp_shipments;
  v_item   public.exp_shipment_items;
  v_prod   public.crm_products;
  v_lot    uuid;
  v_code   text := trim(p_code);
  v_left   numeric;
begin
  select * into s from public.exp_shipments where id = p_shipment;
  if s.id is null or s.tenant_id is distinct from public.get_user_tenant_id()
     or not public.has_expedicao_access(auth.uid()) then
    raise exception 'separação não encontrada';
  end if;
  if s.status not in ('pending', 'picking') then
    raise exception 'esta separação já está "%"', s.status;
  end if;
  if coalesce(p_quantity, 0) <= 0 then raise exception 'quantidade precisa ser maior que zero'; end if;

  -- Achar o produto: por código de barras, por SKU, ou pelo código de um lote.
  select * into v_prod from public.crm_products
   where tenant_id = s.tenant_id and (barcode = v_code or sku = v_code) limit 1;
  if v_prod.id is null then
    select p.* into v_prod
      from public.exp_lots l join public.crm_products p on p.id = l.product_id
     where l.tenant_id = s.tenant_id and l.code = v_code
     order by l.received_on desc limit 1;
    if v_prod.id is not null then
      select id into v_lot from public.exp_lots
       where tenant_id = s.tenant_id and code = v_code and product_id = v_prod.id
       order by received_on desc limit 1;
    end if;
  end if;
  if v_prod.id is null then
    raise exception 'código "%" não é de nenhum produto nem lote desta empresa', v_code;
  end if;

  select * into v_item from public.exp_shipment_items
   where shipment_id = p_shipment and product_id = v_prod.id limit 1;
  if v_item.id is null then
    raise exception '% não está neste pedido', v_prod.name;
  end if;
  v_left := v_item.quantity - v_item.picked;
  if v_left <= 0 then
    raise exception '% já foi separado por inteiro', v_prod.name;
  end if;
  if p_quantity > v_left then
    raise exception 'o pedido pede % % de % e faltam %', v_item.quantity, v_prod.unit, v_prod.name, v_left;
  end if;

  -- Lote: o bipado, senão o que a regra da empresa escolhe. Produto sem controle de lote não precisa.
  if v_lot is null and v_prod.track_lots then
    v_lot := public.exp_pick_lot(s.tenant_id, v_prod.id);
    if v_lot is null then
      raise exception '% controla lote e não há lote com saldo', v_prod.name;
    end if;
  end if;

  insert into public.exp_stock_moves (tenant_id, product_id, lot_id, kind, quantity, reason, order_id, shipment_id, created_by)
  values (s.tenant_id, v_prod.id, v_lot, 'out', -p_quantity, 'Separação #' || s.number, s.order_id, s.id, auth.uid());

  update public.exp_shipment_items
     set picked = picked + p_quantity, lot_id = coalesce(v_lot, lot_id)
   where id = v_item.id;

  update public.exp_shipments set status = 'picking' where id = s.id and status = 'pending';

  return jsonb_build_object(
    'product', v_prod.name,
    'unit', v_prod.unit,
    'picked', v_item.picked + p_quantity,
    'quantity', v_item.quantity,
    'remaining', v_left - p_quantity,
    'lot', (select code from public.exp_lots where id = v_lot),
    'expires_on', (select expires_on from public.exp_lots where id = v_lot),
    'complete', not exists (
      select 1 from public.exp_shipment_items
       where shipment_id = s.id and picked < quantity and id <> v_item.id)
      and (v_left - p_quantity) = 0
  );
end;
$$;

/** Despacha: transportadora e rastreio. Só com tudo separado. */
create or replace function public.exp_ship(p_shipment uuid, p_carrier text default null, p_tracking text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.exp_shipments;
  v_pending int;
begin
  select * into s from public.exp_shipments where id = p_shipment;
  if s.id is null or s.tenant_id is distinct from public.get_user_tenant_id()
     or not public.has_expedicao_access(auth.uid()) then
    raise exception 'separação não encontrada';
  end if;
  if s.status = 'shipped' then return; end if;
  if s.status = 'cancelled' then raise exception 'separação cancelada'; end if;

  select count(*) into v_pending from public.exp_shipment_items
   where shipment_id = s.id and picked < quantity;
  if v_pending > 0 then
    raise exception 'ainda faltam % item(ns) para separar', v_pending;
  end if;

  update public.exp_shipments
     set status = 'shipped',
         carrier = coalesce(nullif(trim(p_carrier), ''), carrier),
         tracking_code = coalesce(nullif(trim(p_tracking), ''), tracking_code),
         packed_at = coalesce(packed_at, now()),
         shipped_at = now()
   where id = s.id;

  -- A linha do tempo do negócio conta que saiu (quando o pedido veio de um negócio).
  insert into public.crm_deal_activities (tenant_id, deal_id, author_id, kind, content, meta)
  select s.tenant_id, o.deal_id, auth.uid(), 'system',
         'Pedido #' || o.number || ' despachado' ||
         coalesce(' por ' || nullif(trim(coalesce(p_carrier, s.carrier)), ''), '') ||
         coalesce(' — rastreio ' || nullif(trim(coalesce(p_tracking, s.tracking_code)), ''), ''),
         jsonb_build_object('shipment_id', s.id, 'order_id', o.id)
    from public.crm_orders o
   where o.id = s.order_id and o.deal_id is not null;
end;
$$;

/**
 * A fila da Expedição, numa consulta só: pedido pago ainda sem separação
 * (status 'a_separar') e as separações que não foram despachadas.
 */
create or replace function public.exp_queue()
returns table (
  shipment_id uuid, number integer, status text, order_id uuid, order_number integer,
  contact_name text, carrier text, tracking_code text, items bigint, picked_items bigint,
  paid_at timestamptz, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.number, s.status, o.id, o.number,
         c.name, coalesce(s.carrier, c.carrier), s.tracking_code,
         (select count(*) from public.exp_shipment_items i where i.shipment_id = s.id),
         (select count(*) from public.exp_shipment_items i where i.shipment_id = s.id and i.picked >= i.quantity),
         o.paid_at, s.created_at
    from public.exp_shipments s
    join public.crm_orders o   on o.id = s.order_id
    join public.crm_contacts c on c.id = o.contact_id
   where s.tenant_id = public.get_user_tenant_id()
     and public.has_expedicao_access(auth.uid())
     and s.status in ('pending', 'picking', 'packed')
  union all
  select null, null, 'a_separar', o.id, o.number,
         c.name, c.carrier, null,
         (select count(*) from public.crm_order_items i where i.order_id = o.id), 0,
         o.paid_at, o.created_at
    from public.crm_orders o
    join public.crm_contacts c on c.id = o.contact_id
   where o.tenant_id = public.get_user_tenant_id()
     and public.has_expedicao_access(auth.uid())
     and o.status = 'paid'
     and not exists (select 1 from public.exp_shipments s where s.order_id = o.id)
   order by 11 nulls last, 12;
$$;

revoke all on function public.exp_pick_lot(uuid, uuid) from public, anon;
revoke all on function public.exp_start(uuid) from public, anon;
revoke all on function public.exp_scan(uuid, text, numeric) from public, anon;
revoke all on function public.exp_ship(uuid, text, text) from public, anon;
revoke all on function public.exp_queue() from public, anon;
grant execute on function public.exp_pick_lot(uuid, uuid) to authenticated, service_role;
grant execute on function public.exp_start(uuid) to authenticated, service_role;
grant execute on function public.exp_scan(uuid, text, numeric) to authenticated, service_role;
grant execute on function public.exp_ship(uuid, text, text) to authenticated, service_role;
grant execute on function public.exp_queue() to authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- RLS: quem tem o módulo Expedição (ou é supervisor) lê e escreve na própria
-- empresa; apagar é de gerente para cima. Movimentação de estoque não se
-- apaga nem se altera — o histórico é o saldo (ajuste se corrige com ajuste).
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['exp_lots', 'exp_shipments', 'exp_shipment_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "Expedicao reads %1$s" on public.%1$I for select to authenticated
      using (tenant_id = public.get_user_tenant_id() and public.has_expedicao_access(auth.uid()))$p$, t);
    execute format($p$create policy "Expedicao inserts %1$s" on public.%1$I for insert to authenticated
      with check (tenant_id = public.get_user_tenant_id() and public.has_expedicao_access(auth.uid()))$p$, t);
    execute format($p$create policy "Expedicao updates %1$s" on public.%1$I for update to authenticated
      using (tenant_id = public.get_user_tenant_id() and public.has_expedicao_access(auth.uid()))
      with check (tenant_id = public.get_user_tenant_id() and public.has_expedicao_access(auth.uid()))$p$, t);
    execute format($p$create policy "Managers delete %1$s" on public.%1$I for delete to authenticated
      using (tenant_id = public.get_user_tenant_id() and public.is_manager_or_higher(auth.uid()))$p$, t);
  end loop;
end $$;

alter table public.exp_stock_moves enable row level security;
create policy "Expedicao reads exp_stock_moves" on public.exp_stock_moves for select to authenticated
  using (tenant_id = public.get_user_tenant_id() and public.has_expedicao_access(auth.uid()));
-- Entrada e ajuste pela tela; a saída da separação nasce dentro de `exp_scan` (definer).
create policy "Expedicao inserts exp_stock_moves" on public.exp_stock_moves for insert to authenticated
  with check (tenant_id = public.get_user_tenant_id() and public.has_expedicao_access(auth.uid()) and kind in ('in', 'adjust'));

-- A Expedição precisa ver o pedido, o contato e o produto que vai separar, sem
-- ter o CRM inteiro: uma policy de leitura a mais, sem escrita.
create policy "Expedicao reads crm_orders" on public.crm_orders for select to authenticated
  using (tenant_id = public.get_user_tenant_id() and public.has_expedicao_access(auth.uid()));
create policy "Expedicao reads crm_order_items" on public.crm_order_items for select to authenticated
  using (tenant_id = public.get_user_tenant_id() and public.has_expedicao_access(auth.uid()));
create policy "Expedicao reads crm_contacts" on public.crm_contacts for select to authenticated
  using (tenant_id = public.get_user_tenant_id() and public.has_expedicao_access(auth.uid()));
create policy "Expedicao reads crm_products" on public.crm_products for select to authenticated
  using (tenant_id = public.get_user_tenant_id() and public.has_expedicao_access(auth.uid()));

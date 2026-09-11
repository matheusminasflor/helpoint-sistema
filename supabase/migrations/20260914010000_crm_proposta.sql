-- Leva CRM-1c: pedido ao vivo e "Enviar proposta". 2026-09-11.
-- Base: docs/proposta-fluxo-comercial.md (bloco C) e as decisões do dono de
-- 2026-09-11: proposta como página pública com link (+ WhatsApp), frete como
-- campo do pedido, ciclo "proposta enviada → aceita → pago" para quem não
-- paga por link (o distribuidor).
--
-- O que muda, em uma frase cada:
--   crm_orders.shipping             frete; entra no total (subtotal − desconto + frete, nunca < 0)
--   crm_orders.public_token         o link público da proposta (/proposta/<token>); nasce com o pedido
--   crm_orders.proposal_valid_until, proposal_sent_at, accepted_at
--   status                          ganha proposal_sent e accepted
--   crm_orders_on_status            (era crm_orders_on_paid) proposta enviada → linha do tempo;
--                                   aceita → Ganho + aviso; paga → como antes
--   crm_public_proposal(token)      o que a página pública mostra; anon chama a função, não lê tabela

alter table public.crm_orders
  add column shipping             numeric(14,2) not null default 0 check (shipping >= 0),
  add column public_token         text not null default encode(extensions.gen_random_bytes(12), 'hex'),
  add column proposal_valid_until date,
  add column proposal_sent_at     timestamptz,
  add column accepted_at          timestamptz;
create unique index crm_orders_public_token_idx on public.crm_orders (public_token);

alter table public.crm_orders drop constraint crm_orders_status_check;
alter table public.crm_orders add constraint crm_orders_status_check
  check (status in ('draft', 'proposal_sent', 'accepted', 'sent', 'paid', 'expired', 'cancelled'));

-- ───────────────────────────────────────────────────────────────────────────
-- Total com frete
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.crm_recompute_order_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order uuid := coalesce(new.order_id, old.order_id);
begin
  update public.crm_orders o
     set subtotal = s.subtotal,
         total    = greatest(s.subtotal - o.discount + o.shipping, 0)
    from (select coalesce(sum(total), 0) as subtotal from public.crm_order_items where order_id = v_order) s
   where o.id = v_order;
  return coalesce(new, old);
end;
$$;

create or replace function public.crm_orders_apply_discount()
returns trigger
language plpgsql
as $$
begin
  new.total := greatest(new.subtotal - new.discount + new.shipping, 0);
  return new;
end;
$$;
drop trigger if exists trg_crm_orders_apply_discount on public.crm_orders;
create trigger trg_crm_orders_apply_discount
  before insert or update of discount, subtotal, shipping on public.crm_orders
  for each row execute function public.crm_orders_apply_discount();

-- ───────────────────────────────────────────────────────────────────────────
-- Mudança de status: enviada, aceita, paga
-- ───────────────────────────────────────────────────────────────────────────
alter type public.notification_type add value if not exists 'order_accepted';

drop trigger if exists trg_crm_orders_on_paid on public.crm_orders;
drop function if exists public.crm_orders_on_paid();

-- O ciclo do pedido. De cada status, para onde pode ir; o resto o banco recusa
-- (a policy de UPDATE deixa qualquer um do Comercial gravar `status` pelo
-- PostgREST — o front só esconde botões). Pago e cancelado são finais.
create or replace function public.crm_order_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select p_to = any(case p_from
    when 'draft'         then array['proposal_sent', 'sent', 'paid', 'cancelled']  -- pago direto: quem cobra "por fora" (e o webhook)
    when 'proposal_sent' then array['proposal_sent', 'accepted', 'sent', 'paid', 'expired', 'cancelled']
    when 'sent'          then array['proposal_sent', 'accepted', 'paid', 'expired', 'cancelled']
    when 'accepted'      then array['paid', 'cancelled']
    when 'expired'       then array['proposal_sent', 'sent', 'cancelled']
    else array[]::text[] end);
$$;

create or replace function public.crm_orders_on_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_won    uuid;
  v_deal   public.crm_deals;
  v_resend boolean := old.status = 'proposal_sent' and new.status = 'proposal_sent'
                      and new.proposal_valid_until is distinct from old.proposal_valid_until;
begin
  if new.status = old.status and not v_resend then
    return new;
  end if;
  if not public.crm_order_transition_allowed(old.status, new.status) then
    raise exception 'o pedido #% não pode ir de "%" para "%"', new.number, old.status, new.status;
  end if;

  if new.deal_id is not null then
    select * into v_deal from public.crm_deals where id = new.deal_id;
  end if;

  if new.status = 'proposal_sent' then
    new.proposal_sent_at := now();
    if new.deal_id is not null then
      insert into public.crm_deal_activities (tenant_id, deal_id, author_id, kind, content, meta)
      values (new.tenant_id, new.deal_id, auth.uid(), 'order',
              'Proposta #' || new.number || case when v_resend then ' reenviada' else ' enviada' end || ' — R$ ' || public.fmt_brl(new.total)
              || case when new.proposal_valid_until is not null then ', válida até ' || to_char(new.proposal_valid_until, 'DD/MM/YYYY') else '' end,
              jsonb_build_object('order_id', new.id, 'public_token', new.public_token));
    end if;
    return new;
  end if;

  if new.status not in ('accepted', 'paid') then
    return new;
  end if;

  if new.status = 'accepted' then
    new.accepted_at := coalesce(new.accepted_at, now());
  else
    new.paid_at := coalesce(new.paid_at, now());
  end if;

  if new.deal_id is not null then
    -- O "ganho" é o do funil em que o negócio está.
    select w.id into v_won
      from public.crm_pipeline_stages cur
      join public.crm_pipeline_stages w on w.pipeline_id = cur.pipeline_id and w.kind = 'won'
     where cur.id = v_deal.stage_id;

    insert into public.crm_deal_activities (tenant_id, deal_id, author_id, kind, content, meta)
    values (new.tenant_id, new.deal_id, case when new.status = 'accepted' then auth.uid() end,
            case when new.status = 'accepted' then 'order' else 'payment' end,
            case when new.status = 'accepted'
                 then 'Proposta #' || new.number || ' aceita — R$ ' || public.fmt_brl(new.total)
                 else 'Pedido #' || new.number || ' pago — R$ ' || public.fmt_brl(new.total) end,
            jsonb_build_object('order_id', new.id));

    if v_won is not null and v_deal.stage_id is distinct from v_won then
      update public.crm_deals set stage_id = v_won where id = new.deal_id;
    end if;

    perform public.notify_users(
      new.tenant_id,
      array[coalesce(v_deal.owner_id, new.created_by)],
      (case when new.status = 'accepted' then 'order_accepted' else 'order_paid' end)::public.notification_type,
      'crm_deal', new.deal_id,
      case when new.status = 'accepted' then 'Proposta #' || new.number || ' foi aceita' else 'Pedido #' || new.number || ' foi pago' end,
      coalesce(v_deal.title, 'Negócio') || ' — R$ ' || public.fmt_brl(new.total)
    );
  end if;
  return new;
end;
$$;
create trigger trg_crm_orders_on_status
  before update of status, proposal_valid_until on public.crm_orders
  for each row execute function public.crm_orders_on_status();

-- ───────────────────────────────────────────────────────────────────────────
-- A proposta pública: uma função, não uma tabela aberta
-- ───────────────────────────────────────────────────────────────────────────
-- Quem tem o link vê a proposta (é o cliente). Rascunho, vencida e cancelada
-- não aparecem. O link de pagamento só vai junto enquanto vale.
create or replace function public.crm_public_proposal(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'number',      o.number,
    'status',      o.status,
    'company',     jsonb_build_object('name', t.name, 'logo_url', t.logo_url),
    'contact',     jsonb_build_object('name', c.name, 'company', c.company),
    'seller',      p.full_name,
    'items',       (select coalesce(jsonb_agg(jsonb_build_object(
                       'description', i.description, 'quantity', i.quantity,
                       'unit_price', i.unit_price, 'total', i.total) order by i.position), '[]'::jsonb)
                      from public.crm_order_items i where i.order_id = o.id),
    'subtotal',    o.subtotal,
    'discount',    o.discount,
    'shipping',    o.shipping,
    'total',       o.total,
    'notes',       o.notes,
    'valid_until', o.proposal_valid_until,
    'sent_at',     o.proposal_sent_at,
    'link_url',    case when o.status in ('proposal_sent', 'accepted', 'sent')
                          and o.link_url is not null
                          and (o.link_expires_at is null or o.link_expires_at > now())
                          and (o.proposal_valid_until is null or o.proposal_valid_until >= current_date)
                        then o.link_url end
  )
  from public.crm_orders o
  join public.tenants t on t.id = o.tenant_id
  join public.crm_contacts c on c.id = o.contact_id
  left join public.profiles p on p.id = o.created_by
  where o.public_token = p_token
    and o.status in ('proposal_sent', 'accepted', 'sent', 'paid');
$$;
grant execute on function public.crm_public_proposal(text) to anon, authenticated;

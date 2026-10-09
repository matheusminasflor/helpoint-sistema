-- COMPRAS: QUANTIDADE, VALOR UNITÁRIO, FRETE, PRAZO, O ORÇAMENTO RECOMENDADO E A QUANTIDADE APROVADA
-- (dono, 2026-10-09).
--
-- "Ter a quantidade que deseja da compra do item, valor unitário e total; o frete grátis ou pago e quanto; o
-- prazo da entrega. Quem envia os orçamentos pode indicar qual recomenda e o motivo (opcional). E o aprovador
-- decide quantas aprovar — em vez de 4, aprova 2." Decisões (múltipla escolha): a quantidade é do PEDIDO e o
-- valor unitário de cada ORÇAMENTO; quem aprova escolhe qualquer quantidade (menor ou maior).
--
-- `compras_orcamentos.amount` continua sendo o TOTAL do orçamento (quantidade × unitário + frete), calculado
-- aqui — assim o teto, os três orçamentos e o histórico seguem lendo a mesma coluna. Na aprovação, o total
-- APROVADO (quantidade aprovada × unitário do orçamento escolhido + frete) vai para `estimated_amount`, e é
-- dele que nasce a conta a pagar.

-- ─── 1. As colunas ───────────────────────────────────────────────────────────────────────────────
alter table public.compras_solicitacoes
  add column if not exists quantidade numeric(12,3) not null default 1,
  add column if not exists quantidade_aprovada numeric(12,3),
  add column if not exists orcamento_recomendado_id uuid references public.compras_orcamentos (id) on delete set null,
  add column if not exists motivo_recomendacao text;
alter table public.compras_solicitacoes drop constraint if exists compras_quantidade_positiva;
alter table public.compras_solicitacoes add constraint compras_quantidade_positiva
  check (quantidade > 0 and (quantidade_aprovada is null or quantidade_aprovada > 0));

alter table public.compras_orcamentos
  add column if not exists valor_unitario numeric(14,2),
  add column if not exists frete numeric(14,2) not null default 0,
  add column if not exists prazo_entrega_dias integer;
alter table public.compras_orcamentos drop constraint if exists compras_orcamento_valores_validos;
alter table public.compras_orcamentos add constraint compras_orcamento_valores_validos
  check ((valor_unitario is null or valor_unitario > 0) and frete >= 0 and (prazo_entrega_dias is null or prazo_entrega_dias >= 0));

-- ─── 2. O total de cada orçamento ────────────────────────────────────────────────────────────────
-- Orçamento antigo (sem unitário) mantém o `amount` que tinha.
create or replace function public.compras_orcamento_total()
returns trigger language plpgsql set search_path = public as $$
declare v_qtd numeric;
begin
  if new.valor_unitario is null then return new; end if;
  select quantidade into v_qtd from public.compras_solicitacoes where id = new.request_id;
  new.amount := round(new.valor_unitario * coalesce(v_qtd, 1) + coalesce(new.frete, 0), 2);
  return new;
end;
$$;
revoke all on function public.compras_orcamento_total() from public, anon, authenticated;
drop trigger if exists trg_compras_orcamento_total on public.compras_orcamentos;
create trigger trg_compras_orcamento_total before insert or update of valor_unitario, frete, amount on public.compras_orcamentos
  for each row execute function public.compras_orcamento_total();

-- A quantidade mudou (no ajuste): os totais dos orçamentos acompanham. A estimativa é refeita no reenvio (3).
create or replace function public.compras_quantidade_recalcula()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.compras_orcamentos set amount = amount where request_id = new.id and valor_unitario is not null;
  return null;
end;
$$;
revoke all on function public.compras_quantidade_recalcula() from public, anon, authenticated;
drop trigger if exists trg_compras_quantidade_recalcula on public.compras_solicitacoes;
create trigger trg_compras_quantidade_recalcula after update of quantidade on public.compras_solicitacoes
  for each row when (new.quantidade is distinct from old.quantidade) execute function public.compras_quantidade_recalcula();

-- ─── 3. Na aprovação: a quantidade aprovada e o total aprovado ───────────────────────────────────
-- Antes de `trg_compras_respeita_teto` (ordem alfabética): o teto confere o total APROVADO.
create or replace function public.compras_calcula_total_aprovado()
returns trigger language plpgsql set search_path = public as $$
declare q public.compras_orcamentos%rowtype; v_unit numeric;
begin
  if new.status <> 'approved' or old.status = 'approved' then
    if new.status in ('pending_approval', 'adjustment_requested', 'rejected') then new.quantidade_aprovada := null; end if;
    -- Reenviada após ajuste: a estimativa volta a ser o menor total dos orçamentos corrigidos.
    if new.status = 'pending_approval' and old.status is distinct from 'pending_approval' then
      new.estimated_amount := (select min(amount) from public.compras_orcamentos where request_id = new.id);
    end if;
    return new;
  end if;
  new.quantidade_aprovada := coalesce(new.quantidade_aprovada, new.quantidade);
  select * into q from public.compras_orcamentos where id = new.approved_quote_id;
  if q.id is null then return new; end if;
  -- Orçamento sem unitário (antigo): o unitário é o total sem frete dividido pela quantidade pedida.
  v_unit := coalesce(q.valor_unitario, (q.amount - coalesce(q.frete, 0)) / nullif(new.quantidade, 0));
  new.estimated_amount := round(v_unit * new.quantidade_aprovada + coalesce(q.frete, 0), 2);
  return new;
end;
$$;
revoke all on function public.compras_calcula_total_aprovado() from public, anon, authenticated;
drop trigger if exists trg_compras_calcula_total_aprovado on public.compras_solicitacoes;
create trigger trg_compras_calcula_total_aprovado before update of status, approved_quote_id, quantidade_aprovada on public.compras_solicitacoes
  for each row execute function public.compras_calcula_total_aprovado();

-- ─── 4. A conta a pagar nasce do total APROVADO ──────────────────────────────────────────────────
create or replace function public.compras_vira_conta_a_pagar()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_valor numeric(14,2);
  v_fornecedor text;
  v_vencimento date;
  v_antes text := case when tg_op = 'UPDATE' then old.status::text else null end;
  v_conta public.fin_entries%rowtype;
begin
  if v_antes = 'completed' and new.status::text <> 'completed' then
    update public.fin_entries
       set status = 'cancelled',
           notes = trim(both E'\n' from coalesce(notes, '') || E'\n' || 'Cancelada: a compra deixou de estar concluída.')
     where purchase_request_id = new.id and status in ('pending', 'overdue');
    return new;
  end if;
  if new.status::text <> 'completed' or v_antes = 'completed' then
    return new;
  end if;
  select q.amount, coalesce(nullif(trim(s.name), ''), nullif(trim(q.supplier), ''))
    into v_valor, v_fornecedor
    from public.compras_orcamentos q
    left join public.suppliers s on s.id = q.supplier_id and s.tenant_id = q.tenant_id
   where q.id = new.approved_quote_id and q.tenant_id = new.tenant_id;
  -- O total aprovado (com a quantidade que quem aprovou decidiu) vem antes do total do orçamento (2026-10-09).
  v_valor := coalesce(new.estimated_amount, v_valor);
  if v_valor is null or v_valor <= 0 then
    return new;
  end if;
  select * into v_conta from public.fin_entries where purchase_request_id = new.id and status = 'paid';
  if found then
    if v_conta.amount = v_valor then return new; end if;
    raise exception 'esta compra já tem conta paga de R$ % e agora vale R$ %: acerte a diferença no Financeiro antes de concluir de novo',
      to_char(v_conta.amount, 'FM999G999G990D00'), to_char(v_valor, 'FM999G999G990D00') using errcode = '23514';
  end if;
  v_vencimento := coalesce(new.payment_due_date, (now() at time zone 'America/Sao_Paulo')::date);
  insert into public.fin_entries (
    tenant_id, kind, description, category, counterparty, amount, due_date, status,
    cost_center, competence, source, notes, purchase_request_id, created_by
  ) values (
    new.tenant_id, 'payable', 'Compra: ' || left(coalesce(new.product_name, 'sem descrição'), 140),
    'compras', v_fornecedor, v_valor, v_vencimento, 'pending',
    nullif(trim(new.department), ''), date_trunc('month', v_vencimento)::date, 'compra',
    nullif(trim(new.purchase_report), ''), new.id, new.executed_by
  )
  on conflict (purchase_request_id) where purchase_request_id is not null do update
     set status = 'pending', amount = excluded.amount, counterparty = excluded.counterparty,
         description = excluded.description, due_date = excluded.due_date, competence = excluded.competence,
         cost_center = excluded.cost_center, notes = excluded.notes
   where public.fin_entries.status = 'cancelled';
  return new;
end;
$$;

-- ─── 5. Abrir o pedido com quantidade, unitário, frete, prazo e a recomendação ───────────────────
create or replace function public.compras_abrir_pedido(p_chamado jsonb, p_pedido jsonb, p_orcamentos jsonb)
returns uuid language plpgsql set search_path to 'public' as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_eu uuid := auth.uid();
  v_ticket uuid;
  v_pedido uuid;
  v_atribuido uuid := nullif(p_chamado ->> 'assigned_to', '')::uuid;
  v_qtd numeric := coalesce(nullif(p_pedido ->> 'quantidade', '')::numeric, 1);
  v_estimado numeric;
begin
  if v_tenant is null or v_eu is null then
    raise exception 'Entre no sistema para pedir uma compra.' using errcode = '42501';
  end if;
  if coalesce(trim(p_pedido ->> 'product_name'), '') = '' then
    raise exception 'Informe o produto da solicitação de compra.' using errcode = '23514';
  end if;
  if v_qtd <= 0 then
    raise exception 'A quantidade precisa ser maior que zero.' using errcode = '23514';
  end if;

  -- O menor total é a estimativa — já no insert, porque o aviso a quem aprova a mostra.
  select min(coalesce(round(nullif(o ->> 'valor_unitario', '')::numeric * v_qtd + coalesce(nullif(o ->> 'frete', '')::numeric, 0), 2),
                      nullif(o ->> 'amount', '')::numeric))
    into v_estimado
    from jsonb_array_elements(coalesce(p_orcamentos, '[]'::jsonb)) o
   where coalesce(trim(o ->> 'supplier'), '') <> ''
     and coalesce(nullif(o ->> 'valor_unitario', '')::numeric, nullif(o ->> 'amount', '')::numeric, 0) > 0;

  insert into public.tickets (
    tenant_id, title, description, category_id, category, subcategory, priority,
    due_date, assigned_to, status, first_response_at, requester_id, created_by, module
  ) values (
    v_tenant, p_chamado ->> 'title', p_chamado ->> 'description',
    nullif(p_chamado ->> 'category_id', '')::uuid, p_chamado ->> 'category', p_chamado ->> 'subcategory',
    coalesce(nullif(p_chamado ->> 'priority', ''), 'medium')::public.ticket_priority,
    nullif(p_chamado ->> 'due_date', '')::timestamptz, v_atribuido,
    case when v_atribuido is not null then 'in_progress'::public.ticket_status else 'open'::public.ticket_status end,
    case when v_atribuido is not null then now() end,
    v_eu, v_eu, 'compras'
  )
  returning id into v_ticket;

  insert into public.compras_solicitacoes (
    tenant_id, ticket_id, product_id, product_name, product_link, department, quantidade,
    motivo_recomendacao, estimated_amount, created_by
  ) values (
    v_tenant, v_ticket,
    nullif(p_pedido ->> 'product_id', '')::uuid,
    trim(p_pedido ->> 'product_name'),
    nullif(trim(p_pedido ->> 'product_link'), ''),
    nullif(p_pedido ->> 'department', ''),
    v_qtd,
    nullif(trim(coalesce(p_pedido ->> 'motivo_recomendacao', '')), ''),
    v_estimado, v_eu
  )
  returning id into v_pedido;

  -- O total de cada um sai de `compras_orcamento_total`; sem unitário (chamada antiga), vale o `amount`.
  insert into public.compras_orcamentos (
    tenant_id, request_id, supplier, supplier_id, amount, valor_unitario, frete, prazo_entrega_dias,
    link, notes, file_path, position
  )
  select v_tenant, v_pedido,
         trim(o ->> 'supplier'),
         nullif(o ->> 'supplier_id', '')::uuid,
         coalesce(nullif(o ->> 'amount', '')::numeric, nullif(o ->> 'valor_unitario', '')::numeric * v_qtd),
         nullif(o ->> 'valor_unitario', '')::numeric,
         coalesce(nullif(o ->> 'frete', '')::numeric, 0),
         nullif(o ->> 'prazo_entrega_dias', '')::integer,
         nullif(trim(o ->> 'link'), ''),
         nullif(trim(o ->> 'notes'), ''),
         nullif(o ->> 'file_path', ''),
         n::int
    from jsonb_array_elements(coalesce(p_orcamentos, '[]'::jsonb)) with ordinality as x(o, n)
   where coalesce(trim(o ->> 'supplier'), '') <> ''
     and coalesce(nullif(o ->> 'valor_unitario', '')::numeric, nullif(o ->> 'amount', '')::numeric, 0) > 0;

  -- O recomendado é o orçamento marcado por quem pediu (opcional).
  update public.compras_solicitacoes s
     set orcamento_recomendado_id = (
           select q.id from public.compras_orcamentos q
             join jsonb_array_elements(coalesce(p_orcamentos, '[]'::jsonb)) with ordinality as x(o, n) on q.position = x.n
            where q.request_id = v_pedido and coalesce((x.o ->> 'recomendado')::boolean, false)
            limit 1)
   where s.id = v_pedido;

  return v_ticket;
end;
$$;

-- ─── 6. O aviso da aprovação diz a quantidade aprovada ───────────────────────────────────────────
create or replace function public.compras_registra_decisao()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_decisao text;
  v_obs text;
  v_quem uuid;
  v_compras uuid[];
  v_produto text := coalesce(new.product_name, '');
  v_qtd text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  v_quem := coalesce(auth.uid(), new.approved_by, new.rejected_by, new.executed_by);
  case new.status
    when 'approved' then v_decisao := 'aprovada'; v_obs := new.approval_notes;
    when 'rejected' then v_decisao := 'recusada'; v_obs := new.rejection_reason;
    when 'adjustment_requested' then v_decisao := 'ajuste'; v_obs := new.adjustment_reason;
    when 'completed' then v_decisao := 'concluida'; v_obs := new.purchase_report;
    when 'pending_approval' then
      if old.status <> 'adjustment_requested' then return new; end if;
      v_decisao := 'reenviada'; v_obs := new.adjustment_response;
    else return new;
  end case;
  insert into public.compras_decisoes (tenant_id, request_id, decisao, user_id, observacao)
  values (new.tenant_id, new.id, v_decisao, v_quem, nullif(trim(v_obs), ''));

  select case when t.assigned_to is not null then array[t.assigned_to]
              else public.notification_team(new.tenant_id, 'compras') end
    into v_compras from public.tickets t where t.id = new.ticket_id;

  if v_decisao = 'aprovada' then
    v_qtd := case when new.quantidade_aprovada is distinct from new.quantidade
                  then 'Aprovadas ' || replace(trim_scale(new.quantidade_aprovada)::text, '.', ',') || ' de '
                       || replace(trim_scale(new.quantidade)::text, '.', ',') || ' pedidas. '
                  else '' end;
    perform public.notify_ticket(new.ticket_id, 'purchase_decided', array[new.created_by],
      'Compra aprovada — ' || v_produto,
      v_qtd || coalesce(nullif(btrim(new.approval_notes), ''), 'Aguardando a compra pelo setor de Compras.'), true);
    perform public.notify_ticket(new.ticket_id, 'purchase_decided', v_compras,
      'Compra aprovada, pode comprar — ' || v_produto,
      v_qtd || coalesce(nullif(btrim(new.approval_notes), ''), 'Registre a compra feita no chamado.'), true,
      new.created_by);
  elsif v_decisao = 'recusada' then
    perform public.notify_ticket(new.ticket_id, 'purchase_decided', array[new.created_by],
      'Compra recusada — ' || v_produto, coalesce(new.rejection_reason, ''), true);
  elsif v_decisao = 'ajuste' then
    perform public.notify_ticket(new.ticket_id, 'purchase_decided', array[new.created_by],
      'Ajuste pedido na compra — ' || v_produto, 'Corrija os orçamentos e reenvie: ' || coalesce(new.adjustment_reason, ''), true);
  elsif v_decisao = 'reenviada' then
    perform public.notify_ticket(new.ticket_id, 'purchase_requested', public.aprovadores_de_compra(new.tenant_id),
      'Compra reenviada após ajuste — ' || v_produto,
      coalesce(nullif(trim(new.adjustment_response), ''), 'O solicitante ajustou os orçamentos.'), true);
  elsif v_decisao = 'concluida' then
    perform public.notify_ticket(new.ticket_id, 'purchase_decided', array[new.created_by],
      'Compra realizada — ' || v_produto, coalesce(nullif(btrim(new.purchase_report), ''), 'O chamado foi resolvido.'), true);
  end if;
  return new;
end;
$$;

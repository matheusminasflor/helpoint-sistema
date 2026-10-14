-- FORMA DE PAGAMENTO E FILIAL NA APROVAÇÃO (dono, 2026-10-14): "obrigatório o aprovador de compras colocar a
-- forma de pagamento cartão, boleto ou pix e qual filial, INBRAS ou MF. Sempre que aprovar."
--
-- As duas valem em toda aprovação: quem aprova escolhe de novo depois de um ajuste — a volta para "aguardando
-- aprovação" apaga as da aprovação anterior, o mesmo desenho de `few_quotes_reason`. Compra aprovada antes
-- desta migration fica sem as duas. A filial usa os mesmos códigos do Comercial (`com_vendas_*`).
-- A conta a pagar que nasce da compra leva a forma de pagamento e a filial.

alter table public.compras_solicitacoes
  add column if not exists forma_pagamento text check (forma_pagamento in ('cartao', 'boleto', 'pix')),
  add column if not exists filial text check (filial in ('INBRAS', 'MF'));

create or replace function public.compras_aprovar_exige_pagamento_e_filial()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.status::text = 'pending_approval' then
    new.forma_pagamento := null;
    new.filial := null;
  elsif new.status::text = 'approved' and old.status::text <> 'approved'
        and (new.forma_pagamento is null or new.filial is null) then
    raise exception 'Para aprovar, escolha a forma de pagamento (cartão, boleto ou pix) e a filial (INBRAS ou MF).'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.compras_aprovar_exige_pagamento_e_filial() from public, anon, authenticated;
-- O nome ordena depois de `trg_compras_guarda_o_status`: quem não pode aprovar ouve primeiro o "não pode".
drop trigger if exists trg_compras_pagamento_e_filial on public.compras_solicitacoes;
create trigger trg_compras_pagamento_e_filial before update of status on public.compras_solicitacoes
  for each row execute function public.compras_aprovar_exige_pagamento_e_filial();

-- A conta a pagar leva a forma de pagamento e a filial (o resto igual a 20261225010000).
create or replace function public.compras_vira_conta_a_pagar()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_valor numeric(14,2);
  v_fornecedor text;
  v_vencimento date;
  v_antes text := case when tg_op = 'UPDATE' then old.status::text else null end;
  v_conta public.fin_entries%rowtype;
  v_notas text := nullif(trim(both E'\n' from
    coalesce('Filial: ' || new.filial, '') || E'\n' || coalesce(trim(new.purchase_report), '')), '');
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
  select round(coalesce(q.valor_unitario, (q.amount - q.frete) / nullif(new.quantidade, 0))
               * coalesce(new.quantidade_aprovada, new.quantidade) + q.frete, 2),
         coalesce(nullif(trim(s.name), ''), nullif(trim(q.supplier), ''))
    into v_valor, v_fornecedor
    from public.compras_orcamentos q
    left join public.suppliers s on s.id = q.supplier_id and s.tenant_id = q.tenant_id
   where q.id = new.approved_quote_id and q.tenant_id = new.tenant_id;
  v_valor := coalesce(v_valor, new.estimated_amount);
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
    tenant_id, kind, description, category, counterparty, amount, due_date, status, payment_method,
    cost_center, competence, source, notes, purchase_request_id, created_by
  ) values (
    new.tenant_id, 'payable', 'Compra: ' || left(coalesce(new.product_name, 'sem descrição'), 140),
    'compras', v_fornecedor, v_valor, v_vencimento, 'pending',
    case new.forma_pagamento when 'cartao' then 'Cartão' when 'boleto' then 'Boleto' when 'pix' then 'Pix' end,
    nullif(trim(new.department), ''), date_trunc('month', v_vencimento)::date, 'compra',
    v_notas, new.id, new.executed_by
  )
  on conflict (purchase_request_id) where purchase_request_id is not null do update
     set status = 'pending', amount = excluded.amount, counterparty = excluded.counterparty,
         description = excluded.description, due_date = excluded.due_date, competence = excluded.competence,
         cost_center = excluded.cost_center, notes = excluded.notes, payment_method = excluded.payment_method
   where public.fin_entries.status = 'cancelled';
  return new;
end;
$$;

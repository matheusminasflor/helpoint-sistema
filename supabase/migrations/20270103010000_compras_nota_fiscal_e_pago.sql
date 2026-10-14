-- NOTA FISCAL E COMPRA JÁ PAGA (dono, 2026-10-14): "é obrigatório quem faz as compras [anexar a] nota fiscal, e
-- se for cartão de crédito não tem vencimento, afinal já foi comprado; no financeiro não precisa marcar
-- liquidado, apenas se for boleto. PIX e crédito já devem vir liquidados."
--
-- 1. Registrar a compra exige o anexo da nota fiscal (`purchase_file_path`).
-- 2. Pix e cartão não têm vencimento: a conta a pagar nasce PAGA, no dia (a data vem de
--    `fin_conta_paga_tem_data`). Boleto continua como era: pendente, no vencimento informado (vazio = hoje).
--    Compra aprovada sem forma de pagamento (antes de 20270102010000) também continua como era.

create or replace function public.compras_registrar_exige_nota_fiscal()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.status::text = 'completed' and old.status::text <> 'completed' then
    if nullif(trim(new.purchase_file_path), '') is null then
      raise exception 'Para registrar a compra, anexe a nota fiscal.' using errcode = '23514';
    end if;
    if new.forma_pagamento in ('pix', 'cartao') then
      new.payment_due_date := null;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.compras_registrar_exige_nota_fiscal() from public, anon, authenticated;
-- O nome ordena depois de `trg_compras_guarda_o_status`: quem não pode registrar ouve primeiro o "não pode".
drop trigger if exists trg_compras_registrar_exige_nota_fiscal on public.compras_solicitacoes;
create trigger trg_compras_registrar_exige_nota_fiscal before update of status on public.compras_solicitacoes
  for each row execute function public.compras_registrar_exige_nota_fiscal();

-- A conta a pagar: Pix e cartão nascem pagas (o resto igual a 20270102010000).
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
  v_ja_paga boolean := coalesce(new.forma_pagamento in ('pix', 'cartao'), false);
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
  v_vencimento := case when v_ja_paga then null else new.payment_due_date end;
  v_vencimento := coalesce(v_vencimento, (now() at time zone 'America/Sao_Paulo')::date);
  insert into public.fin_entries (
    tenant_id, kind, description, category, counterparty, amount, due_date, status, payment_method,
    cost_center, competence, source, notes, purchase_request_id, created_by
  ) values (
    new.tenant_id, 'payable', 'Compra: ' || left(coalesce(new.product_name, 'sem descrição'), 140),
    'compras', v_fornecedor, v_valor, v_vencimento,
    case when v_ja_paga then 'paid' else 'pending' end::public.fin_entry_status,
    case new.forma_pagamento when 'cartao' then 'Cartão' when 'boleto' then 'Boleto' when 'pix' then 'Pix' end,
    nullif(trim(new.department), ''), date_trunc('month', v_vencimento)::date, 'compra',
    v_notas, new.id, new.executed_by
  )
  on conflict (purchase_request_id) where purchase_request_id is not null do update
     set status = excluded.status, amount = excluded.amount, counterparty = excluded.counterparty,
         description = excluded.description, due_date = excluded.due_date, competence = excluded.competence,
         cost_center = excluded.cost_center, notes = excluded.notes, payment_method = excluded.payment_method
   where public.fin_entries.status = 'cancelled';
  return new;
end;
$$;

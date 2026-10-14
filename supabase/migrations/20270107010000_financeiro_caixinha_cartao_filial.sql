-- AVALIAÇÃO DO FINANCEIRO (dono, 2026-10-14). Três ajustes, decididos em múltipla escolha:
--   1. a Caixinha é dinheiro da empresa: cada ENTRADA (o repasse) vira no Financeiro uma saída já paga,
--      "Reposição da Caixinha" — é assim que o Fluxo de Caixa e os Indicadores passam a ver esse dinheiro. Os
--      gastos do dia a dia ficam só na Caixinha, com os recibos: o dinheiro conta uma vez só;
--   2. cartão de crédito vence NA FATURA: cada parcela fica em aberto até a baixa da fatura do mês (antes a 1ª
--      entrava paga no dia da compra, e o Fluxo de Caixa adiantava a saída). O dia em que a fatura fecha e o dia
--      em que vence ficam em Compras › Configurações › Quem compra e Caixinha;
--   3. a filial (INBRAS/MF) vira campo da conta a pagar, para filtrar e somar — antes estava só no texto.

-- ─── 1. Filial na conta ──────────────────────────────────────────────────────────────────────────
alter table public.fin_entries add column if not exists filial text check (filial in ('INBRAS', 'MF'));
update public.fin_entries e set filial = s.filial
  from public.compras_solicitacoes s
 where e.purchase_request_id = s.id and e.filial is null and s.filial is not null;

-- ─── 2. O cartão da empresa: quando a fatura fecha e quando vence ───────────────────────────────
alter table public.compras_config
  add column if not exists cartao_fecha_dia smallint check (cartao_fecha_dia between 1 and 28),
  add column if not exists cartao_vence_dia smallint check (cartao_vence_dia between 1 and 28);

/**
 * O vencimento da fatura em que cai a parcela `p_parcela` (1 = a primeira) de uma compra feita em `p_dia`.
 * Comprou antes do fechamento: entra na fatura que fecha neste mês; no dia do fechamento ou depois, na do mês
 * seguinte. A fatura vence no mesmo mês do fechamento se o dia de vencimento vem depois; senão, no mês seguinte.
 * Sem os dias cadastrados: a parcela vence no mesmo dia da compra, mês a mês.
 */
create or replace function public.vencimento_da_fatura(p_tenant uuid, p_dia date, p_parcela int)
returns date language plpgsql stable security definer set search_path = public as $$
declare
  v_fecha int;
  v_vence int;
  v_fechamento date;
begin
  select cartao_fecha_dia, cartao_vence_dia into v_fecha, v_vence from public.compras_config where tenant_id = p_tenant;
  if v_fecha is null or v_vence is null then
    return (p_dia + make_interval(months => p_parcela - 1))::date;
  end if;
  v_fechamento := make_date(extract(year from p_dia)::int, extract(month from p_dia)::int, v_fecha);
  if p_dia >= v_fechamento then
    v_fechamento := (v_fechamento + interval '1 month')::date;
  end if;
  v_fechamento := (v_fechamento + make_interval(months => p_parcela - 1))::date;
  return case when v_vence > v_fecha
              then make_date(extract(year from v_fechamento)::int, extract(month from v_fechamento)::int, v_vence)
              else (make_date(extract(year from v_fechamento)::int, extract(month from v_fechamento)::int, v_vence) + interval '1 month')::date
         end;
end;
$$;
revoke all on function public.vencimento_da_fatura(uuid, date, int) from public, anon;
grant execute on function public.vencimento_da_fatura(uuid, date, int) to authenticated;

-- A conta a pagar da compra (20270105010000) com o cartão na fatura e a filial no campo.
create or replace function public.compras_vira_conta_a_pagar()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_valor numeric(14,2);
  v_fornecedor text;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_vencimento date;
  v_antes text := case when tg_op = 'UPDATE' then old.status::text else null end;
  v_pago numeric(14,2);
  v_vale numeric(14,2);
  v_notas text := nullif(trim(both E'\n' from
    coalesce('Filial: ' || new.filial, '') || E'\n' || coalesce(trim(new.purchase_report), '')), '');
  v_do_caixa boolean := new.caixinha or new.forma_pagamento = 'caixinha';
  v_n int := case when new.forma_pagamento = 'cartao' then coalesce(new.parcelas, 1) else 1 end;
  v_parcela numeric(14,2);
  v_metodo text := case new.forma_pagamento
    when 'cartao' then case when coalesce(new.parcelas, 1) > 1 then 'Cartão ' || new.parcelas || 'x' else 'Cartão à vista' end
    when 'boleto' then 'Boleto' when 'pix' then 'Pix' end;
begin
  if v_antes = 'completed' and new.status::text <> 'completed' then
    if v_do_caixa then
      delete from public.caixinha_movimentos where purchase_request_id = new.id;
      return new;
    end if;
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
  if v_do_caixa then
    insert into public.caixinha_movimentos (tenant_id, tipo, valor, descricao, recibo_path, purchase_request_id, created_by)
    values (new.tenant_id, 'saida', v_valor,
            left('Compra: ' || coalesce(new.product_name, 'sem descrição') || coalesce(' (' || v_fornecedor || ')', ''), 200),
            new.purchase_file_path, new.id, new.executed_by)
    on conflict (purchase_request_id) do nothing;
    return new;
  end if;

  select coalesce(sum(amount) filter (where status = 'paid'), 0), coalesce(sum(amount) filter (where status <> 'cancelled'), 0)
    into v_pago, v_vale from public.fin_entries where purchase_request_id = new.id;
  if v_pago > 0 then
    if v_vale = v_valor then return new; end if;
    raise exception 'esta compra já tem conta paga de R$ % e agora vale R$ %: acerte a diferença no Financeiro antes de concluir de novo',
      to_char(v_pago, 'FM999G999G990D00'), to_char(v_valor, 'FM999G999G990D00') using errcode = '23514';
  end if;

  v_parcela := round(v_valor / v_n, 2);
  for i in 1..v_n loop
    -- Cartão: a fatura de cada parcela, em aberto até a baixa; pix: pago hoje; boleto: o vencimento informado.
    v_vencimento := case
      when new.forma_pagamento = 'cartao' then public.vencimento_da_fatura(new.tenant_id, v_hoje, i)
      when new.forma_pagamento = 'pix' then v_hoje
      else coalesce(new.payment_due_date, v_hoje) end;
    insert into public.fin_entries (
      tenant_id, kind, description, category, counterparty, amount, due_date, status, payment_method,
      cost_center, competence, source, notes, purchase_request_id, parcela, filial, created_by
    ) values (
      new.tenant_id, 'payable',
      'Compra: ' || left(coalesce(new.product_name, 'sem descrição'), 140) || case when v_n > 1 then ' (' || i || '/' || v_n || ')' else '' end,
      'compras', v_fornecedor,
      case when i = v_n then v_valor - v_parcela * (v_n - 1) else v_parcela end,
      v_vencimento,
      case when new.forma_pagamento = 'pix' then 'paid' else 'pending' end::public.fin_entry_status,
      v_metodo,
      nullif(trim(new.department), ''), date_trunc('month', v_vencimento)::date, 'compra',
      v_notas, new.id, i, new.filial, new.executed_by
    )
    on conflict (purchase_request_id, parcela) where purchase_request_id is not null do update
       set status = excluded.status, amount = excluded.amount, counterparty = excluded.counterparty,
           description = excluded.description, due_date = excluded.due_date, competence = excluded.competence,
           cost_center = excluded.cost_center, notes = excluded.notes, payment_method = excluded.payment_method,
           filial = excluded.filial
     where public.fin_entries.status = 'cancelled';
  end loop;

  if new.forma_pagamento = 'boleto' then
    perform public.notify_ticket(new.ticket_id, 'purchase_decided', public.notification_team(new.tenant_id, 'financeiro'),
      'Boleto para pagar — ' || coalesce(new.product_name, ''),
      'R$ ' || to_char(v_valor, 'FM999G999G990D00') || ', vence em ' || to_char(coalesce(new.payment_due_date, v_hoje), 'DD/MM/YYYY')
        || coalesce(' · ' || v_fornecedor, '') || '. Está em Contas a Pagar; a nota está no chamado da compra.',
      true, new.executed_by);
  end if;
  return new;
end;
$$;

-- ─── 3. O repasse da Caixinha no Financeiro ─────────────────────────────────────────────────────
alter table public.caixinha_movimentos
  add column if not exists fin_entry_id uuid references public.fin_entries(id) on delete set null;

create or replace function public.caixinha_reposicao_no_financeiro()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_conta uuid;
begin
  if tg_op = 'DELETE' then
    if old.fin_entry_id is not null then
      delete from public.fin_entries where id = old.fin_entry_id;
    end if;
    return old;
  end if;
  if new.tipo <> 'entrada' then
    return new;
  end if;
  insert into public.fin_entries (
    tenant_id, kind, description, category, amount, due_date, settled_at, status, payment_method,
    competence, source, notes, created_by
  ) values (
    new.tenant_id, 'payable', 'Reposição da Caixinha', 'caixinha', new.valor, new.data, new.data, 'paid', 'Dinheiro',
    date_trunc('month', new.data)::date, 'caixinha', nullif(btrim(new.descricao), ''), new.created_by
  ) returning id into v_conta;
  update public.caixinha_movimentos set fin_entry_id = v_conta where id = new.id;
  return new;
end;
$$;
revoke all on function public.caixinha_reposicao_no_financeiro() from public, anon, authenticated;
drop trigger if exists trg_caixinha_reposicao_no_financeiro on public.caixinha_movimentos;
create trigger trg_caixinha_reposicao_no_financeiro after insert or delete on public.caixinha_movimentos
  for each row execute function public.caixinha_reposicao_no_financeiro();

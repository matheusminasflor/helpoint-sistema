-- PARCELAS, BOLETO E CAIXINHA COMO FORMA DE PAGAMENTO (dono, 2026-10-14). Pedido: "se selecionar cartão, informar
-- à vista ou parcelado de quantas vezes; quando for boleto, ir pro Financeiro para pagamento; na forma de
-- pagamento ter caixinha também". Decisões (múltipla escolha, as recomendadas):
--   1. cartão parcelado = uma conta por parcela, uma em cada mês; a 1ª entra paga, as outras em aberto até o
--      Financeiro dar baixa na fatura;
--   2. boleto: além de entrar pendente em Contas a Pagar, a equipe do Financeiro recebe o aviso.
-- "Caixinha" como forma: a compra comum paga com o dinheiro do caixa — registrada, vira saída do Caixinha (com a
-- nota), não conta a pagar. Diferente do PEDIDO na categoria Caixinha (20270104010000), que é do aprovador dela.

alter table public.compras_solicitacoes drop constraint if exists compras_solicitacoes_forma_pagamento_check;
alter table public.compras_solicitacoes
  add constraint compras_solicitacoes_forma_pagamento_check check (forma_pagamento in ('cartao', 'boleto', 'pix', 'caixinha')),
  add column if not exists parcelas smallint check (parcelas between 1 and 24);

-- Uma conta por parcela: a chave da conta da compra passa a ser (compra, parcela).
alter table public.fin_entries add column if not exists parcela smallint not null default 1;
drop index if exists public.fin_entries_por_compra_idx;
create unique index fin_entries_por_compra_idx on public.fin_entries (purchase_request_id, parcela)
  where purchase_request_id is not null;

-- Aprovar: cartão pede em quantas vezes (1 = à vista); fora do cartão, parcela não existe.
create or replace function public.compras_aprovar_exige_pagamento_e_filial()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.status::text = 'pending_approval' then
    new.forma_pagamento := null;
    new.filial := null;
    new.parcelas := null;
  elsif new.status::text = 'approved' and old.status::text <> 'approved' and not new.caixinha then
    if new.forma_pagamento is null or new.filial is null then
      raise exception 'Para aprovar, escolha a forma de pagamento (cartão, boleto, pix ou caixinha) e a filial (INBRAS ou MF).'
        using errcode = '23514';
    end if;
    if new.forma_pagamento = 'cartao' and new.parcelas is null then
      raise exception 'No cartão, diga se é à vista ou em quantas vezes.' using errcode = '23514';
    end if;
    if new.forma_pagamento <> 'cartao' then
      new.parcelas := null;
    end if;
  end if;
  return new;
end;
$$;

-- Registrar: pix, cartão e caixinha não têm vencimento.
create or replace function public.compras_registrar_exige_nota_fiscal()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.status::text = 'completed' and old.status::text <> 'completed' then
    if nullif(trim(new.purchase_file_path), '') is null then
      raise exception 'Para registrar a compra, anexe a nota fiscal.' using errcode = '23514';
    end if;
    if new.forma_pagamento in ('pix', 'cartao', 'caixinha') then
      new.payment_due_date := null;
    end if;
  end if;
  return new;
end;
$$;

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

  -- Já houve conta paga (a compra foi reaberta e concluída de novo): só segue se o valor não mudou.
  select coalesce(sum(amount) filter (where status = 'paid'), 0), coalesce(sum(amount) filter (where status <> 'cancelled'), 0)
    into v_pago, v_vale from public.fin_entries where purchase_request_id = new.id;
  if v_pago > 0 then
    if v_vale = v_valor then return new; end if;
    raise exception 'esta compra já tem conta paga de R$ % e agora vale R$ %: acerte a diferença no Financeiro antes de concluir de novo',
      to_char(v_pago, 'FM999G999G990D00'), to_char(v_valor, 'FM999G999G990D00') using errcode = '23514';
  end if;

  v_parcela := round(v_valor / v_n, 2);
  for i in 1..v_n loop
    -- Cartão: uma parcela por mês a partir de hoje; pix: hoje; boleto: o vencimento informado (vazio = hoje).
    v_vencimento := case
      when new.forma_pagamento = 'cartao' then (v_hoje + make_interval(months => i - 1))::date
      when new.forma_pagamento = 'pix' then v_hoje
      else coalesce(new.payment_due_date, v_hoje) end;
    insert into public.fin_entries (
      tenant_id, kind, description, category, counterparty, amount, due_date, status, payment_method,
      cost_center, competence, source, notes, purchase_request_id, parcela, created_by
    ) values (
      new.tenant_id, 'payable',
      'Compra: ' || left(coalesce(new.product_name, 'sem descrição'), 140) || case when v_n > 1 then ' (' || i || '/' || v_n || ')' else '' end,
      'compras', v_fornecedor,
      -- A última parcela leva o centavo do arredondamento.
      case when i = v_n then v_valor - v_parcela * (v_n - 1) else v_parcela end,
      v_vencimento,
      case when new.forma_pagamento = 'pix' or (new.forma_pagamento = 'cartao' and i = 1) then 'paid' else 'pending' end::public.fin_entry_status,
      v_metodo,
      nullif(trim(new.department), ''), date_trunc('month', v_vencimento)::date, 'compra',
      v_notas, new.id, i, new.executed_by
    )
    on conflict (purchase_request_id, parcela) where purchase_request_id is not null do update
       set status = excluded.status, amount = excluded.amount, counterparty = excluded.counterparty,
           description = excluded.description, due_date = excluded.due_date, competence = excluded.competence,
           cost_center = excluded.cost_center, notes = excluded.notes, payment_method = excluded.payment_method
     where public.fin_entries.status = 'cancelled';
  end loop;

  -- Boleto vai para o Financeiro pagar: a equipe é avisada.
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

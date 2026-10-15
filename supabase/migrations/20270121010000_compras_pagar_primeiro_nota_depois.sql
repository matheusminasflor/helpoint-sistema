-- COMPRAS: PAGAR PRIMEIRO, NOTA DEPOIS, E SEM PRAZO (dono, 2026-10-15). O dono: "em compra a nota fiscal só será
-- anexada depois do pagamento, seja cartão de crédito ou demais"; "por isso acho que não vale a pena o setor de Compras
-- ter SLA". Fluxo desenhado e aprovado (artifact "Fluxo de Compras Minasflor"):
--   pedido → aprovação → PAGAR → a nota chega → encerra.
--
--   1. PAGAR (`pagamento_em`), com a compra aprovada, por quem compra: cartão ("Comprei no cartão"), Pix ("Paguei",
--      comprovante opcional), boleto (anexo + vencimento, "Enviar ao Financeiro") ou Caixinha. A conta a pagar (ou a
--      saída da Caixinha) nasce AQUI, e quem pediu é avisado. Dá para juntar as compras que quiser no mesmo pagamento
--      (`pago_junto_com`): a parceira passa à forma da principal e só a principal vira conta, com a soma;
--   2. BOLETO: o Financeiro paga e dá baixa → quem enviou é avisado em cada compra do boleto (`boleto_pago_em`);
--   3. A NOTA CHEGA: o registro (`completed`) pede a nota — ou o recibo, com o motivo (`sem_nota_motivo`) — e não
--      gera conta nova. O boleto enviado só registra depois de pago. Cada compra com a sua nota;
--   4. NOTA QUE NÃO CHEGA: 15 dias depois de paga sem a nota, quem pagou recebe um aviso (uma vez; não é atraso);
--   5. SEM PRAZO: o chamado de compra não tem prazo de solução nem de 1ª resposta.
-- ponytail: a compra aprovada que é registrada SEM passar pelo pagamento continua como antes (a conta nasce no
-- registro). É o caminho das compras de antes desta migration e dos testes antigos; a tela só oferece o novo. Se
-- ninguém mais registrar sem pagar, tirar o caminho antigo de `compras_vira_conta_a_pagar`.

alter table public.compras_solicitacoes
  add column if not exists pagamento_em timestamptz,
  add column if not exists pagamento_por uuid references public.profiles(id) on delete set null,
  -- O boleto (obrigatório no boleto) ou o comprovante (opcional nas outras formas).
  add column if not exists pagamento_path text,
  -- Marcado quando o Financeiro paga o boleto: quem compra nem sempre lê Contas a Pagar.
  add column if not exists boleto_pago_em timestamptz,
  -- Encerrou com recibo no lugar da nota: por quê.
  add column if not exists sem_nota_motivo text,
  add column if not exists aviso_nota_em timestamptz;

-- O boleto vai junto na conta: quem paga no Financeiro nem sempre lê as compras.
alter table public.fin_entries add column if not exists anexo_path text;

-- ─── 1. Pagar ────────────────────────────────────────────────────────────────────────────────────
create or replace function public.compras_pagamento_confere()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  p public.compras_solicitacoes%rowtype;
begin
  if new.pagamento_em is not distinct from old.pagamento_em then
    return new;
  end if;
  if old.pagamento_em is not null then
    raise exception 'O pagamento desta compra já foi registrado.' using errcode = '23514';
  end if;
  if pg_trigger_depth() = 1 and current_user = 'authenticated'
     and not (public.pode_no_setor('compras', 'solicitacoes', 'execute') or public.pode_decidir_compra(old.caixinha)) then
    raise exception 'Registrar o pagamento pede a permissão "Executar compra" de Compras.' using errcode = '42501';
  end if;
  if old.status::text <> 'approved' then
    raise exception 'Só a compra aprovada, ainda não registrada, é paga.' using errcode = '23514';
  end if;
  if new.pago_junto_com is not null then
    -- Entrou no pagamento de outra: paga do mesmo jeito que a principal (o relatório mostraria a forma errada).
    select * into p from public.compras_solicitacoes where id = new.pago_junto_com;
    if (new.forma_pagamento, new.parcelas) is distinct from (p.forma_pagamento, p.parcelas) then
      new.troca_motivo := coalesce(nullif(btrim(new.troca_motivo), ''), 'Entrou no pagamento de outra compra.');
      new.forma_pagamento := p.forma_pagamento;
      new.parcelas := p.parcelas;
    end if;
    new.pagamento_path := coalesce(new.pagamento_path, p.pagamento_path);
    new.payment_due_date := coalesce(new.payment_due_date, p.payment_due_date);
  elsif not new.caixinha then
    if new.forma_pagamento is null then
      raise exception 'A compra não tem forma de pagamento: peça a quem aprova.' using errcode = '23514';
    end if;
    if new.forma_pagamento = 'boleto' and (nullif(btrim(new.pagamento_path), '') is null or new.payment_due_date is null) then
      raise exception 'No boleto, anexe o boleto e diga o vencimento para enviar ao Financeiro.' using errcode = '23514';
    end if;
  end if;
  if new.forma_pagamento in ('pix', 'cartao', 'caixinha') or new.caixinha then
    new.payment_due_date := null;
  end if;
  new.pagamento_por := coalesce(new.pagamento_por, auth.uid());
  return new;
end;
$$;
revoke all on function public.compras_pagamento_confere() from public, anon, authenticated;
drop trigger if exists trg_compras_pagamento_confere on public.compras_solicitacoes;
create trigger trg_compras_pagamento_confere before update of pagamento_em on public.compras_solicitacoes
  for each row execute function public.compras_pagamento_confere();

-- ─── 2. Registrar (a nota chega) ─────────────────────────────────────────────────────────────────
create or replace function public.compras_registrar_exige_nota_fiscal()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.status::text = 'completed' and old.status::text <> 'completed' then
    if nullif(trim(new.purchase_file_path), '') is null then
      raise exception 'Para registrar a compra, anexe a nota fiscal (ou o recibo, dizendo por que não veio nota).' using errcode = '23514';
    end if;
    if new.pagamento_em is not null and new.forma_pagamento = 'boleto' and new.boleto_pago_em is null then
      raise exception 'O boleto ainda não foi pago pelo Financeiro: anexe a nota depois do aviso de pagamento.' using errcode = '23514';
    end if;
    if new.forma_pagamento in ('pix', 'cartao', 'caixinha') and new.pagamento_em is null then
      new.payment_due_date := null;
    end if;
  end if;
  return new;
end;
$$;

-- ─── 3. A conta nasce no pagamento ───────────────────────────────────────────────────────────────
-- 20270120010000 + o pagamento: a conta (ou a saída da Caixinha) nasce quando `pagamento_em` é marcado; o registro da
-- compra paga não gera outra.
create or replace function public.compras_vira_conta_a_pagar()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_valor numeric(14,2);
  v_fornecedor text;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_vencimento date;
  v_antes text := case when tg_op = 'UPDATE' then old.status::text else null end;
  v_pagamento boolean := tg_op = 'UPDATE' and new.pagamento_em is not null and old.pagamento_em is null;
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
  v_descricao text := coalesce(new.product_name, 'sem descrição');
  v_juntas text;
  v_valor_juntas numeric(14,2);
  v_quem uuid := coalesce(new.pagamento_por, new.executed_by);
begin
  if not v_pagamento and v_antes = 'completed' and new.status::text <> 'completed' then
    -- A compra paga reaberta não desfaz o pagamento: ele aconteceu antes da nota.
    if new.pagamento_em is not null then
      return new;
    end if;
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
  if not v_pagamento then
    if new.status::text <> 'completed' or v_antes = 'completed' then
      return new;
    end if;
    -- Paga antes da nota: a conta nasceu no pagamento.
    if new.pagamento_em is not null then
      return new;
    end if;
  end if;

  -- Quem pediu fica sabendo que foi paga (no caminho novo).
  if v_pagamento and new.created_by is not null then
    insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message, email_sent)
    values (new.tenant_id, new.created_by, 'purchase_decided', 'ticket', new.ticket_id,
            'Compra paga — aguardando a entrega: ' || coalesce(new.product_name, ''),
            'A compra foi paga. Quando o produto e a nota chegarem, o pedido é encerrado e você é avisado.', false);
  end if;

  -- Paga junto com outra: a conta é da principal.
  if new.pago_junto_com is not null and not v_do_caixa then
    return new;
  end if;
  select coalesce(nullif(trim(s.name), ''), nullif(trim(q.supplier), ''))
    into v_fornecedor
    from public.compras_orcamentos q
    left join public.suppliers s on s.id = q.supplier_id and s.tenant_id = q.tenant_id
   where q.id = new.approved_quote_id and q.tenant_id = new.tenant_id;
  v_valor := public.valor_da_compra(new.id);
  if v_valor is null or v_valor <= 0 then
    return new;
  end if;
  if v_do_caixa then
    insert into public.caixinha_movimentos (tenant_id, tipo, valor, descricao, recibo_path, purchase_request_id, created_by)
    values (new.tenant_id, 'saida', v_valor,
            left('Compra: ' || coalesce(new.product_name, 'sem descrição') || coalesce(' (' || v_fornecedor || ')', ''), 200),
            coalesce(new.pagamento_path, new.purchase_file_path), new.id, v_quem)
    on conflict (purchase_request_id) do nothing;
    return new;
  end if;

  -- As que entram neste pagamento.
  select string_agg(coalesce(j.product_name, '?') || ' (#' || t.ticket_number || ')', ' + ' order by t.ticket_number),
         coalesce(sum(public.valor_da_compra(j.id)), 0)
    into v_juntas, v_valor_juntas
    from public.compras_solicitacoes j
    join public.tickets t on t.id = j.ticket_id
   where j.pago_junto_com = new.id;
  if v_juntas is not null then
    v_valor := v_valor + v_valor_juntas;
    v_descricao := v_descricao || ' + ' || v_juntas;
    v_notas := trim(both E'\n' from coalesce(v_notas, '') || E'\n' || 'Pago junto: ' || v_juntas);
  end if;
  if v_pagamento and new.forma_pagamento = 'boleto' then
    v_notas := trim(both E'\n' from coalesce(v_notas, '') || E'\n' || 'O boleto está anexado na compra.');
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
      cost_center, competence, source, notes, purchase_request_id, parcela, filial, created_by, anexo_path
    ) values (
      new.tenant_id, 'payable',
      'Compra: ' || left(v_descricao, 200) || case when v_n > 1 then ' (' || i || '/' || v_n || ')' else '' end,
      'compras', v_fornecedor,
      case when i = v_n then v_valor - v_parcela * (v_n - 1) else v_parcela end,
      v_vencimento,
      case when new.forma_pagamento = 'pix' then 'paid' else 'pending' end::public.fin_entry_status,
      v_metodo,
      nullif(trim(new.department), ''), date_trunc('month', v_vencimento)::date, 'compra',
      v_notas, new.id, i, new.filial, v_quem, new.pagamento_path
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
      'Boleto para pagar — ' || left(v_descricao, 120),
      'R$ ' || to_char(v_valor, 'FM999G999G990D00') || ', vence em ' || to_char(coalesce(new.payment_due_date, v_hoje), 'DD/MM/YYYY')
        || coalesce(' · ' || v_fornecedor, '')
        || case when v_juntas is not null then '. Um boleto só para ' || (1 + (select count(*) from public.compras_solicitacoes where pago_junto_com = new.id)) || ' compras' else '' end
        || case when v_pagamento then '. Está em Contas a Pagar; o boleto está anexado na compra.'
                else '. Está em Contas a Pagar; a nota está no chamado da compra.' end,
      true, v_quem);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_fin_compra_vira_conta_a_pagar on public.compras_solicitacoes;
drop trigger if exists trg_compras_vira_conta_a_pagar on public.compras_solicitacoes;
create trigger trg_compras_vira_conta_a_pagar after update of status, pagamento_em on public.compras_solicitacoes
  for each row execute function public.compras_vira_conta_a_pagar();

-- ─── 4. O Financeiro pagou o boleto ──────────────────────────────────────────────────────────────
create or replace function public.compras_boleto_pago_avisa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'paid' or old.status = 'paid' or new.purchase_request_id is null then
    return new;
  end if;
  insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message, email_sent)
  select s.tenant_id, p.pagamento_por, 'purchase_decided', 'ticket', s.ticket_id,
         'Boleto pago — anexe a nota: ' || coalesce(s.product_name, ''),
         'O Financeiro pagou o boleto. Quando a nota fiscal chegar, anexe e registre a compra para encerrar o pedido.',
         false
    from public.compras_solicitacoes p
    join public.compras_solicitacoes s on s.id = p.id or s.pago_junto_com = p.id
   where p.id = new.purchase_request_id and p.pagamento_em is not null and p.forma_pagamento = 'boleto'
     and p.pagamento_por is not null and s.status::text <> 'completed';
  update public.compras_solicitacoes s set boleto_pago_em = now()
   where (s.id = new.purchase_request_id or s.pago_junto_com = new.purchase_request_id)
     and s.pagamento_em is not null and s.boleto_pago_em is null;
  return new;
end;
$$;
revoke all on function public.compras_boleto_pago_avisa() from public, anon, authenticated;
drop trigger if exists trg_compras_boleto_pago_avisa on public.fin_entries;
create trigger trg_compras_boleto_pago_avisa after update of status on public.fin_entries
  for each row execute function public.compras_boleto_pago_avisa();

-- ─── 5. A nota que não chega ─────────────────────────────────────────────────────────────────────
/** Paga há 15 dias (boleto: desde a baixa) e ainda sem a nota: quem pagou é avisado, uma vez. Não é atraso. */
create or replace function public.compras_lembra_a_nota()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  with pendentes as (
    update public.compras_solicitacoes s set aviso_nota_em = now()
     where s.status::text = 'approved' and s.pagamento_em is not null and s.aviso_nota_em is null
       and coalesce(case when s.forma_pagamento = 'boleto' then s.boleto_pago_em else s.pagamento_em end, now()) <= now() - interval '15 days'
    returning s.*
  )
  insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message, email_sent)
  select p.tenant_id, coalesce(p.pagamento_por, c.comprador_id), 'reminder', 'ticket', p.ticket_id,
         'Nota fiscal ainda não chegou: ' || coalesce(p.product_name, ''),
         'A compra está paga há 15 dias e o pedido segue aberto. Anexe a nota (ou o recibo, dizendo por que não veio nota) para encerrar.',
         false
    from pendentes p
    left join public.compras_config c on c.tenant_id = p.tenant_id
   where coalesce(p.pagamento_por, c.comprador_id) is not null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.compras_lembra_a_nota() from public, anon, authenticated;
-- 09:00 no Brasil (12:00 UTC).
select cron.unschedule('compras-lembra-a-nota') where exists (select 1 from cron.job where jobname = 'compras-lembra-a-nota');
select cron.schedule('compras-lembra-a-nota', '0 12 * * *', $cron$select public.compras_lembra_a_nota()$cron$);

-- ─── 6. Compras sem prazo ────────────────────────────────────────────────────────────────────────
-- `zz_`: os triggers BEFORE rodam em ordem alfabética; este fica por último, depois de todo cálculo de prazo.
create or replace function public.compras_sem_prazo()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.module = 'compras' then
    new.sla_due_at := null;
    new.first_response_due_at := null;
    new.agendou_vencido := false;
  end if;
  return new;
end;
$$;
revoke all on function public.compras_sem_prazo() from public, anon, authenticated;
drop trigger if exists zz_compras_sem_prazo on public.tickets;
create trigger zz_compras_sem_prazo before insert or update on public.tickets
  for each row execute function public.compras_sem_prazo();

-- Os chamados de compra de hoje perdem o prazo (o update passa pelo guarda acima).
update public.tickets set sla_due_at = null
 where module = 'compras' and (sla_due_at is not null or first_response_due_at is not null or agendou_vencido);

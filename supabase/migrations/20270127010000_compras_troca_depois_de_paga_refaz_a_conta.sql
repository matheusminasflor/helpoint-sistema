-- COMPRAS: TROCAR A FORMA DEPOIS DE PAGA REFAZ A CONTA (dono, 2026-10-16). #90 (pilhas) e #89 (HDMI) foram enviados
-- num boleto só; depois o #90 passou para o cartão ("Mairon antecipou a fatura"). A troca entrou, mas a conta em Contas a
-- Pagar continuou "Boleto R$ 116,26, vence 19/10" — o Financeiro pagaria o boleto e o cartão.
-- Decisão do dono: a troca refaz a conta sozinha. A linha da compra passa à forma nova (o que era fica nas observações),
-- as compras pagas junto seguem a principal, e o Financeiro é avisado quando era boleto ("não pague"). Boleto já pago,
-- compra que entrou no pagamento de outra e Caixinha não trocam depois de pagas. O cartão fica em aberto na fatura, como
-- toda compra no cartão.

create or replace function pg_temp.troca(p_funcao regprocedure, p_de text, p_para text)
returns void language plpgsql as $$
declare
  v_def text := pg_get_functiondef(p_funcao);
begin
  if position(p_de in v_def) = 0 then
    raise exception 'trecho não encontrado em %: %', p_funcao, left(p_de, 80);
  end if;
  execute replace(v_def, p_de, p_para);
end;
$$;

-- ─── 1. A troca depois de paga: quando pode ──────────────────────────────────────────────────────
select pg_temp.troca('public.compras_troca_a_forma()'::regprocedure,
$$  if old.forma_pagamento_2 is null
$$,
$$  if old.pagamento_em is not null then
    if old.pago_junto_com is not null then
      raise exception 'Esta compra entrou no pagamento do chamado #%: troque a forma lá, e esta segue junto.',
        (select t.ticket_number from public.compras_solicitacoes j join public.tickets t on t.id = j.ticket_id
          where j.id = old.pago_junto_com) using errcode = '23514';
    end if;
    if old.boleto_pago_em is not null
       or exists (select 1 from public.fin_entries where purchase_request_id = old.id and status = 'paid') then
      raise exception 'O Financeiro já pagou esta compra: a forma de pagamento não muda mais.' using errcode = '23514';
    end if;
    if old.caixinha or 'caixinha' in (old.forma_pagamento, new.forma_pagamento) then
      raise exception 'Compra paga pela Caixinha, ou indo para ela, não troca de forma depois de paga.' using errcode = '23514';
    end if;
    if new.forma_pagamento = 'boleto' and (nullif(btrim(new.pagamento_path), '') is null or new.payment_due_date is null) then
      raise exception 'Para virar boleto depois de paga, anexe o boleto e diga o vencimento.' using errcode = '23514';
    end if;
    if new.forma_pagamento in ('cartao', 'pix') then
      new.payment_due_date := null;
    end if;
  end if;
  if old.forma_pagamento_2 is null
$$);

-- ─── 2. A conta refeita ──────────────────────────────────────────────────────────────────────────
select pg_temp.troca('public.compras_vira_conta_a_pagar()'::regprocedure,
$$  v_quem uuid := coalesce(new.pagamento_por, new.executed_by);
$$,
$$  v_quem uuid := coalesce(new.pagamento_por, new.executed_by);
  -- Paga e depois trocada de forma (2026-10-16): a conta é refeita na forma nova.
  v_refaz boolean := tg_op = 'UPDATE' and old.pagamento_em is not null and new.pagamento_em is not null
    and new.pago_junto_com is null and new.status::text = 'approved'
    and (new.forma_pagamento, new.parcelas) is distinct from (old.forma_pagamento, old.parcelas);
  v_era text;
$$);
select pg_temp.troca('public.compras_vira_conta_a_pagar()'::regprocedure,
$$  if not v_pagamento then
    if new.status::text <> 'completed' or v_antes = 'completed' then$$,
$$  if not v_pagamento and not v_refaz then
    if new.status::text <> 'completed' or v_antes = 'completed' then$$);
select pg_temp.troca('public.compras_vira_conta_a_pagar()'::regprocedure,
$$  -- Paga junto com outra: a conta é da principal.
$$,
$$  if v_refaz then
    -- As que entraram neste pagamento seguem a principal (a troca delas sozinha é barrada).
    update public.compras_solicitacoes
       set forma_pagamento = new.forma_pagamento, parcelas = new.parcelas, payment_due_date = new.payment_due_date,
           troca_motivo = 'Segue a compra principal: ' || coalesce(btrim(new.troca_motivo), '')
     where pago_junto_com = new.id;
    select string_agg(payment_method || ' de R$ ' || to_char(amount, 'FM999G999G990D00')
                      || ' (vence ' || to_char(due_date, 'DD/MM/YYYY') || ')', ', ' order by parcela)
      into v_era from public.fin_entries where purchase_request_id = new.id and status in ('pending', 'overdue');
    update public.fin_entries set status = 'cancelled'
     where purchase_request_id = new.id and status in ('pending', 'overdue');
  end if;

  -- Paga junto com outra: a conta é da principal.
$$);
select pg_temp.troca('public.compras_vira_conta_a_pagar()'::regprocedure,
$$  select coalesce(sum(amount) filter (where status = 'paid'), 0)$$,
$$  if v_refaz then
    v_notas := trim(both E'\n' from coalesce(v_notas, '') || E'\n' || 'Era ' || coalesce(v_era, '?') || '; trocada em '
      || to_char(v_hoje, 'DD/MM/YYYY') || ' para ' || v_metodo || ': ' || coalesce(btrim(new.troca_motivo), ''));
    if old.forma_pagamento = 'boleto' then
      perform public.notify_ticket(new.ticket_id, 'purchase_decided', public.notification_team(new.tenant_id, 'financeiro'),
        'Boleto cancelado — não pague: ' || left(v_descricao, 120),
        'A compra passou para ' || v_metodo || '. Motivo: ' || coalesce(btrim(new.troca_motivo), '')
          || '. A conta em Contas a Pagar já foi refeita.', true, auth.uid());
    end if;
  end if;

  select coalesce(sum(amount) filter (where status = 'paid'), 0)$$);
select pg_temp.troca('public.compras_vira_conta_a_pagar()'::regprocedure,
$$      v_notas, new.id, i, new.filial, v_quem, new.pagamento_path
$$,
$$      v_notas, new.id, i, new.filial, v_quem,
      -- O boleto anexado não vale mais quando a compra deixou de ser boleto.
      case when v_refaz and new.forma_pagamento <> 'boleto' then null else new.pagamento_path end
$$);
select pg_temp.troca('public.compras_vira_conta_a_pagar()'::regprocedure,
$$           filial = excluded.filial
$$,
$$           filial = excluded.filial, anexo_path = excluded.anexo_path
$$);

drop trigger if exists trg_compras_vira_conta_a_pagar on public.compras_solicitacoes;
create trigger trg_compras_vira_conta_a_pagar after update of status, pagamento_em, forma_pagamento, parcelas
  on public.compras_solicitacoes for each row execute function public.compras_vira_conta_a_pagar();

-- ─── 3. O #90/#89 de hoje ────────────────────────────────────────────────────────────────────────
-- O #90 já está "cartão", mas a conta segue boleto. Volta a forma de antes sem gatilho e troca de novo pelo caminho
-- novo (a troca já foi conferida e quem aprovou já foi avisado quando ela entrou). Em outro banco não acha nada.
do $$
declare
  v_id uuid := '38f71805-01ff-4339-8ca1-e5a78d29e852';
begin
  if not exists (select 1 from public.compras_solicitacoes where id = v_id and forma_pagamento = 'cartao' and pagamento_em is not null)
     or not exists (select 1 from public.fin_entries where purchase_request_id = v_id and status = 'pending' and payment_method = 'Boleto') then
    return;
  end if;
  alter table public.compras_solicitacoes disable trigger trg_compras_troca_a_forma;
  alter table public.compras_solicitacoes disable trigger trg_compras_vira_conta_a_pagar;
  update public.compras_solicitacoes set forma_pagamento = 'boleto', forma_pagamento_2 = 'cartao' where id = v_id;
  alter table public.compras_solicitacoes enable trigger trg_compras_vira_conta_a_pagar;
  update public.compras_solicitacoes set forma_pagamento = 'cartao', forma_pagamento_2 = 'boleto' where id = v_id;
  alter table public.compras_solicitacoes enable trigger trg_compras_troca_a_forma;
end;
$$;

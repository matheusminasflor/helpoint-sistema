-- CORREÇÃO PONTUAL: #90 (pilhas) E #89 (HDMI), PAGOS JUNTOS (dono, 2026-10-19): "foi comprado junto na BY.MF via Pix, e o
-- frete ficou total de 19,98; motivo do reajuste: os contratempos do cartão da INBRAS — se não pagasse o frete, iria
-- chegar depois do evento do dia 26/10".
-- Pela tela não dá: compra paga junto não se reajusta (`compras_reajuste_impedido`), a troca só vai para a 2ª forma
-- aprovada (o #90 tem cartão como 2ª) e trocar a forma da principal separa as compras juntas. Então, só aqui e só nestes
-- dois: o frete (R$ 9,99 em cada) entra como reajuste aplicado, com a decisão no nome do dono; as duas viram BY.MF/Pix; a
-- conta única (era boleto INBRAS de R$ 116,26) passa a Pix pago hoje de R$ 136,24, sem o boleto anexado; o Financeiro e
-- quem aprovou são avisados ("não pague o boleto"); os dois chamados ganham o registro. Em outro banco não acha nada.
do $$
declare
  v_principal uuid := '38f71805-01ff-4339-8ca1-e5a78d29e852';  -- #90
  v_junta uuid := 'b78cd0c6-844f-4ea3-a7c2-2eb3723433dc';      -- #89
  v_dono uuid := 'a30e44b6-18cc-47a3-81c0-5f7b89bd3359';
  v_motivo text := 'Comprado junto (#90 + #89) na BY.MF via Pix, com frete total de R$ 19,98. Contratempos do cartão da '
                   || 'INBRAS: sem pagar o frete, chegaria depois do evento do dia 26/10.';
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  s record;
  v_de numeric(14,2);
  v_para numeric(14,2);
  v_total numeric(14,2);
begin
  if not exists (select 1 from public.compras_solicitacoes where id = v_principal and filial = 'INBRAS' and forma_pagamento = 'boleto')
     or not exists (select 1 from public.compras_solicitacoes where id = v_junta and pago_junto_com = v_principal)
     or not exists (select 1 from public.fin_entries where purchase_request_id = v_principal and status = 'pending') then
    return;
  end if;

  -- 1. O frete: R$ 9,99 em cada, como reajuste aplicado.
  for s in select c.*, q.valor_unitario as q_unit, q.frete as q_frete
             from public.compras_solicitacoes c join public.compras_orcamentos q on q.id = c.approved_quote_id
            where c.id in (v_principal, v_junta) loop
    v_de := public.valor_da_compra(s.id);
    v_para := round(s.q_unit * coalesce(s.quantidade_aprovada, s.quantidade, 1) + 9.99, 2);
    insert into public.compras_reajustes (tenant_id, request_id, valor_unitario_de, valor_unitario_para, frete_de, frete_para,
                                          total_de, total_para, motivo, status, pedido_por, decidido_por, decidido_em, decisao_obs)
    values (s.tenant_id, s.id, s.q_unit, s.q_unit, coalesce(s.q_frete, 0), 9.99, v_de, v_para, v_motivo, 'aplicado',
            v_dono, v_dono, now(), 'Aplicado a pedido do dono.');
    update public.compras_orcamentos set frete = 9.99 where id = s.approved_quote_id;
    update public.compras_solicitacoes set estimated_amount = v_para where id = s.id;
  end loop;

  -- 2. As duas na BY.MF, Pix. Sem os gatilhos da troca: eles barrariam a forma fora da 2ª e separariam as compras.
  alter table public.compras_solicitacoes disable trigger trg_compras_troca_a_forma;
  alter table public.compras_solicitacoes disable trigger trg_compras_vira_conta_a_pagar;
  update public.compras_solicitacoes
     set filial = 'BY.MF', forma_pagamento = 'pix', parcelas = null, payment_due_date = null, troca_motivo = v_motivo
   where id in (v_principal, v_junta);
  alter table public.compras_solicitacoes enable trigger trg_compras_vira_conta_a_pagar;
  alter table public.compras_solicitacoes enable trigger trg_compras_troca_a_forma;

  -- 3. A conta única: Pix pago hoje, com o valor novo.
  v_total := public.valor_da_compra(v_principal) + public.valor_da_compra(v_junta);
  update public.fin_entries
     set amount = v_total, payment_method = 'Pix', status = 'paid', settled_at = v_hoje, due_date = v_hoje,
         competence = date_trunc('month', v_hoje)::date, filial = 'BY.MF', anexo_path = null,
         notes = 'Filial: BY.MF' || E'\n' || 'Pago junto: HDTV EXTENDER TX 60M (#89)' || E'\n'
                 || 'Era Boleto de R$ 116,26 (INBRAS, vence 19/10/2026); trocada em ' || to_char(v_hoje, 'DD/MM/YYYY')
                 || ' para Pix com frete: ' || v_motivo
   where purchase_request_id = v_principal and status = 'pending';

  -- 4. Avisos e registro nos chamados.
  for s in select c.tenant_id, c.ticket_id, c.approved_by, c.product_name from public.compras_solicitacoes c
            where c.id in (v_principal, v_junta) loop
    insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
    values (s.tenant_id, s.ticket_id, v_dono,
            'Compra reajustada e paga: frete de R$ 9,99, filial BY.MF, Pix. ' || v_motivo, true);
  end loop;
  select c.tenant_id, c.ticket_id, c.approved_by into s from public.compras_solicitacoes c where c.id = v_principal;
  perform public.notify_ticket(s.ticket_id, 'purchase_decided', public.notification_team(s.tenant_id, 'financeiro'),
    'Boleto cancelado — não pague: pilhas (#90) + HDMI (#89)',
    'As duas compras foram pagas juntas via Pix pela BY.MF, R$ ' || to_char(v_total, 'FM999G999G990D00')
      || ' com o frete. A conta em Contas a Pagar já está como paga. ' || v_motivo, true, v_dono);
  if s.approved_by is not null and s.approved_by <> v_dono then
    insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message, email_sent)
    values (s.tenant_id, s.approved_by, 'purchase_decided', 'ticket', s.ticket_id,
            'Compra reajustada — pilhas (#90) + HDMI (#89)',
            'De R$ 116,26 para R$ ' || to_char(v_total, 'FM999G999G990D00') || ' (frete), BY.MF via Pix. ' || v_motivo, false);
  end if;
end;
$$;

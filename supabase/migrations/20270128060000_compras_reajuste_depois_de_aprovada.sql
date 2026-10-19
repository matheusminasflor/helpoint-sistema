-- REAJUSTE DA COMPRA DEPOIS DE APROVADA (dono, 2026-10-19): "ter como reajustar valores, com motivo, mesmo após aprovado
-- — demorou tanto para liberar a forma de pagamento que agora, com o prazo curto, terei que pagar frete". Decisões
-- (múltipla escolha, as recomendadas):
--   * reajusta o VALOR UNITÁRIO e o FRETE do orçamento aprovado (quantidade e fornecedor ficam como aprovados);
--   * quem reajusta é quem compra (Compras › "Executar compra"), depois da aprovação e ANTES de pagar;
--   * até 10% acima do aprovado (ou para menos) vale na hora e o aprovador é avisado; acima de 10% o reajuste espera o
--     aprovador (a compra segue aprovada com o valor antigo até ele decidir);
--   * conta a pagar já criada e não paga é refeita com o valor novo, nas mesmas parcelas, e o Financeiro é avisado;
--   * o histórico guarda "aprovado R$ X → reajustado R$ Y, por quê".
-- Compra paga junto com outra não se reajusta aqui (a conta é uma só para várias): separe antes.

create table if not exists public.compras_reajustes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  request_id uuid not null references public.compras_solicitacoes(id) on delete cascade,
  valor_unitario_de numeric(14,2), valor_unitario_para numeric(14,2) not null check (valor_unitario_para > 0),
  frete_de numeric(14,2), frete_para numeric(14,2) not null check (frete_para >= 0),
  total_de numeric(14,2) not null, total_para numeric(14,2) not null,
  motivo text not null check (btrim(motivo) <> ''),
  status text not null check (status in ('aplicado', 'aguardando', 'recusado')),
  pedido_por uuid references public.profiles(id) on delete set null,
  pedido_em timestamptz not null default now(),
  decidido_por uuid references public.profiles(id) on delete set null,
  decidido_em timestamptz,
  decisao_obs text
);
create unique index if not exists compras_um_reajuste_aguardando on public.compras_reajustes (request_id) where status = 'aguardando';
create index if not exists compras_reajustes_da_compra on public.compras_reajustes (request_id, pedido_em);
alter table public.compras_reajustes enable row level security;
-- Lê quem enxerga a compra (a mesma régua da tabela da compra); escreve só pelas funções abaixo.
create policy compras_reajustes_le on public.compras_reajustes for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and exists (select 1 from public.compras_solicitacoes s where s.id = compras_reajustes.request_id));

/** Por que esta compra não pode ser reajustada agora (null = pode). */
create or replace function public.compras_reajuste_impedido(s public.compras_solicitacoes)
returns text language sql stable security definer set search_path = public as $$
  select case
    when s.status::text not in ('approved', 'completed') then 'Só compra aprovada se reajusta.'
    when s.pago_junto_com is not null
      or exists (select 1 from public.compras_solicitacoes j where j.pago_junto_com = s.id)
      then 'Esta compra é paga junto com outra: separe o pagamento antes de reajustar.'
    when exists (select 1 from public.fin_entries e where e.purchase_request_id = s.id and e.status = 'paid')
      or exists (select 1 from public.caixinha_movimentos m where m.purchase_request_id = s.id)
      then 'Esta compra já foi paga: o valor não muda mais.'
    end;
$$;
revoke all on function public.compras_reajuste_impedido(public.compras_solicitacoes) from public, anon, authenticated;

/** Aplica um reajuste: o orçamento aprovado, o valor da compra, a conta a pagar em aberto e os avisos. */
create or replace function public.compras_aplica_reajuste(p_reajuste uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.compras_reajustes%rowtype;
  s public.compras_solicitacoes%rowtype;
  v_n int;
  v_parcela numeric(14,2);
  v_i int := 0;
  e record;
  v_texto text;
begin
  select * into r from public.compras_reajustes where id = p_reajuste;
  select * into s from public.compras_solicitacoes where id = r.request_id for update;
  update public.compras_orcamentos set valor_unitario = r.valor_unitario_para, frete = r.frete_para where id = s.approved_quote_id;
  update public.compras_solicitacoes set estimated_amount = r.total_para where id = s.id;

  v_texto := 'Reajustada de R$ ' || to_char(r.total_de, 'FM999G999G990D00') || ' para R$ ' || to_char(r.total_para, 'FM999G999G990D00')
             || ' em ' || to_char((now() at time zone 'America/Sao_Paulo')::date, 'DD/MM/YYYY') || ': ' || btrim(r.motivo);

  -- A conta em aberto acompanha: o mesmo número de parcelas, a última leva o arredondamento.
  select count(*) into v_n from public.fin_entries where purchase_request_id = s.id and status in ('pending', 'overdue');
  if v_n > 0 then
    v_parcela := round(r.total_para / v_n, 2);
    for e in select id from public.fin_entries where purchase_request_id = s.id and status in ('pending', 'overdue') order by parcela loop
      v_i := v_i + 1;
      update public.fin_entries
         set amount = case when v_i = v_n then r.total_para - v_parcela * (v_n - 1) else v_parcela end,
             notes = trim(both E'\n' from coalesce(notes, '') || E'\n' || v_texto)
       where id = e.id;
    end loop;
    perform public.notify_ticket(s.ticket_id, 'purchase_decided', public.notification_team(s.tenant_id, 'financeiro'),
      'Conta de compra reajustada — ' || left(coalesce(s.product_name, ''), 120), v_texto || '. A conta em Contas a Pagar já foi corrigida.',
      true, auth.uid());
  end if;

  insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
  values (s.tenant_id, s.ticket_id, coalesce(auth.uid(), r.pedido_por), 'Compra ' || lower(left(v_texto, 1)) || substr(v_texto, 2) || '.', true);
end;
$$;
revoke all on function public.compras_aplica_reajuste(uuid) from public, anon, authenticated;

/** Quem compra pede o reajuste. Devolve 'aplicado' (até 10% a mais, ou para menos) ou 'aguardando' (acima de 10%). */
create or replace function public.compras_reajustar(p_compra uuid, p_valor_unitario numeric, p_frete numeric, p_motivo text)
returns text language plpgsql security definer set search_path = public as $$
declare
  s public.compras_solicitacoes%rowtype;
  q public.compras_orcamentos%rowtype;
  v_impede text;
  v_qtd numeric;
  v_de numeric(14,2);
  v_para numeric(14,2);
  v_status text;
  v_id uuid;
begin
  select * into s from public.compras_solicitacoes where id = p_compra and tenant_id = public.get_user_tenant_id() for update;
  if s.id is null then
    raise exception 'Compra não encontrada.' using errcode = '42501';
  end if;
  if not (public.is_admin_or_higher(auth.uid()) or public.pode_no_setor('compras', 'solicitacoes', 'execute')) then
    raise exception 'Reajustar a compra pede a permissão "Executar compra" de Compras.' using errcode = '42501';
  end if;
  v_impede := public.compras_reajuste_impedido(s);
  if v_impede is not null then
    raise exception '%', v_impede using errcode = '22023';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Escreva o motivo do reajuste.' using errcode = '23514';
  end if;
  if p_valor_unitario is null or p_valor_unitario <= 0 or p_frete is null or p_frete < 0 then
    raise exception 'Informe o valor unitário (maior que zero) e o frete (zero se não houver).' using errcode = '22023';
  end if;
  if exists (select 1 from public.compras_reajustes where request_id = s.id and status = 'aguardando') then
    raise exception 'Já há um reajuste desta compra esperando o aprovador.' using errcode = '22023';
  end if;
  select * into q from public.compras_orcamentos where id = s.approved_quote_id;
  v_qtd := coalesce(s.quantidade_aprovada, s.quantidade, 1);
  v_de := public.valor_da_compra(s.id);
  v_para := round(p_valor_unitario * v_qtd + p_frete, 2);
  if v_para = v_de and p_valor_unitario = q.valor_unitario then
    raise exception 'O valor é o mesmo que já está aprovado.' using errcode = '22023';
  end if;
  v_status := case when v_para <= round(v_de * 1.10, 2) then 'aplicado' else 'aguardando' end;

  insert into public.compras_reajustes (tenant_id, request_id, valor_unitario_de, valor_unitario_para, frete_de, frete_para,
                                        total_de, total_para, motivo, status, pedido_por, decidido_por, decidido_em)
  values (s.tenant_id, s.id, coalesce(q.valor_unitario, round((q.amount - coalesce(q.frete, 0)) / nullif(s.quantidade, 0), 2)),
          p_valor_unitario, coalesce(q.frete, 0), p_frete, v_de, v_para, btrim(p_motivo), v_status, auth.uid(),
          case when v_status = 'aplicado' then auth.uid() end, case when v_status = 'aplicado' then now() end)
  returning id into v_id;

  if v_status = 'aplicado' then
    perform public.compras_aplica_reajuste(v_id);
    perform public.notify_ticket(s.ticket_id, 'purchase_decided', public.aprovadores_da_compra(s.tenant_id, s.caixinha),
      'Compra reajustada (até 10%) — ' || left(coalesce(s.product_name, ''), 120),
      'De R$ ' || to_char(v_de, 'FM999G999G990D00') || ' para R$ ' || to_char(v_para, 'FM999G999G990D00') || '. Motivo: ' || btrim(p_motivo),
      true, auth.uid());
  else
    insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
    values (s.tenant_id, s.ticket_id, auth.uid(),
            'Reajuste pedido: de R$ ' || to_char(v_de, 'FM999G999G990D00') || ' para R$ ' || to_char(v_para, 'FM999G999G990D00')
            || ' (mais de 10%), aguardando o aprovador. Motivo: ' || btrim(p_motivo), true);
    perform public.notify_ticket(s.ticket_id, 'purchase_requested', public.aprovadores_da_compra(s.tenant_id, s.caixinha),
      'Reajuste para aprovar — ' || left(coalesce(s.product_name, ''), 120),
      'De R$ ' || to_char(v_de, 'FM999G999G990D00') || ' para R$ ' || to_char(v_para, 'FM999G999G990D00') || '. Motivo: ' || btrim(p_motivo),
      true, auth.uid());
  end if;
  return v_status;
end;
$$;
revoke all on function public.compras_reajustar(uuid, numeric, numeric, text) from public, anon;
grant execute on function public.compras_reajustar(uuid, numeric, numeric, text) to authenticated;

/** O aprovador decide o reajuste acima de 10%. */
create or replace function public.compras_decidir_reajuste(p_reajuste uuid, p_aprova boolean, p_obs text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.compras_reajustes%rowtype;
  s public.compras_solicitacoes%rowtype;
  v_impede text;
begin
  select * into r from public.compras_reajustes where id = p_reajuste and tenant_id = public.get_user_tenant_id() for update;
  if r.id is null or r.status <> 'aguardando' then
    raise exception 'Este reajuste não está esperando decisão.' using errcode = '22023';
  end if;
  select * into s from public.compras_solicitacoes where id = r.request_id;
  if not public.pode_decidir_compra(s.caixinha) then
    raise exception 'Decidir o reajuste pede a permissão "Aprovar / reprovar compra" de Compras.' using errcode = '42501';
  end if;
  if not p_aprova and nullif(btrim(p_obs), '') is null then
    raise exception 'Para recusar o reajuste, escreva o motivo.' using errcode = '23514';
  end if;
  if p_aprova then
    v_impede := public.compras_reajuste_impedido(s);
    if v_impede is not null then
      raise exception '%', v_impede using errcode = '22023';
    end if;
  end if;
  update public.compras_reajustes
     set status = case when p_aprova then 'aplicado' else 'recusado' end,
         decidido_por = auth.uid(), decidido_em = now(), decisao_obs = nullif(btrim(p_obs), '')
   where id = r.id;
  if p_aprova then
    perform public.compras_aplica_reajuste(r.id);
  else
    insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
    values (s.tenant_id, s.ticket_id, auth.uid(), 'Reajuste recusado pelo aprovador: ' || btrim(p_obs), true);
  end if;
  if r.pedido_por is not null then
    perform public.notify_ticket(s.ticket_id, 'purchase_decided', array[r.pedido_por],
      'Reajuste ' || case when p_aprova then 'aprovado' else 'recusado' end || ' — ' || left(coalesce(s.product_name, ''), 120),
      'De R$ ' || to_char(r.total_de, 'FM999G999G990D00') || ' para R$ ' || to_char(r.total_para, 'FM999G999G990D00')
        || coalesce('. ' || nullif(btrim(p_obs), ''), '') || '.', true, auth.uid());
  end if;
end;
$$;
revoke all on function public.compras_decidir_reajuste(uuid, boolean, text) from public, anon;
grant execute on function public.compras_decidir_reajuste(uuid, boolean, text) to authenticated;

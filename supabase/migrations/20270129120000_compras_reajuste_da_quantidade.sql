-- REAJUSTE DA QUANTIDADE (dono, 2026-10-21): "ter como reajustar valor e quantidade — a quantidade só para menos:
-- se aprovou 2, só pode reajustar para menos de 2". O reajuste de valor (20270128060000) continua como está; a
-- quantidade entra no mesmo pedido de reajuste e baixa a `quantidade_aprovada`, que é o que `valor_da_compra` multiplica.
-- Para mais, o banco recusa: comprar mais do que foi aprovado é uma compra nova.

alter table public.compras_reajustes
  add column if not exists quantidade_de numeric(14,3),
  add column if not exists quantidade_para numeric(14,3);

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
  update public.compras_solicitacoes
     set estimated_amount = r.total_para,
         quantidade_aprovada = coalesce(r.quantidade_para, quantidade_aprovada)
   where id = s.id;

  v_texto := 'Reajustada de R$ ' || to_char(r.total_de, 'FM999G999G990D00') || ' para R$ ' || to_char(r.total_para, 'FM999G999G990D00')
             || case when r.quantidade_para is not null and r.quantidade_para is distinct from r.quantidade_de
                     then ' (quantidade ' || trim(to_char(r.quantidade_de, 'FM999G990D###'), ',') || ' → '
                          || trim(to_char(r.quantidade_para, 'FM999G990D###'), ',') || ')' else '' end
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

-- A assinatura ganha a quantidade (opcional: sem ela, fica a aprovada) — `drop` + `create`, então a ACL é refeita no fim.
drop function if exists public.compras_reajustar(uuid, numeric, numeric, text);
create function public.compras_reajustar(p_compra uuid, p_valor_unitario numeric, p_frete numeric, p_motivo text,
                                         p_quantidade numeric default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  s public.compras_solicitacoes%rowtype;
  q public.compras_orcamentos%rowtype;
  v_impede text;
  v_qtd_de numeric;
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
  v_qtd_de := coalesce(s.quantidade_aprovada, s.quantidade, 1);
  v_qtd := coalesce(p_quantidade, v_qtd_de);
  if v_qtd <= 0 then
    raise exception 'A quantidade tem de ser maior que zero.' using errcode = '22023';
  end if;
  if v_qtd > v_qtd_de then
    raise exception 'A quantidade só pode diminuir: foram aprovadas %. Para comprar mais, abra outra compra.',
      trim(to_char(v_qtd_de, 'FM999G990D###'), ',') using errcode = '23514';
  end if;
  if exists (select 1 from public.compras_reajustes where request_id = s.id and status = 'aguardando') then
    raise exception 'Já há um reajuste desta compra esperando o aprovador.' using errcode = '22023';
  end if;
  select * into q from public.compras_orcamentos where id = s.approved_quote_id;
  v_de := public.valor_da_compra(s.id);
  v_para := round(p_valor_unitario * v_qtd + p_frete, 2);
  if v_para = v_de and p_valor_unitario = q.valor_unitario and v_qtd = v_qtd_de then
    raise exception 'Nada mudou: o valor e a quantidade são os aprovados.' using errcode = '22023';
  end if;
  v_status := case when v_para <= round(v_de * 1.10, 2) then 'aplicado' else 'aguardando' end;

  insert into public.compras_reajustes (tenant_id, request_id, valor_unitario_de, valor_unitario_para, frete_de, frete_para,
                                        quantidade_de, quantidade_para,
                                        total_de, total_para, motivo, status, pedido_por, decidido_por, decidido_em)
  values (s.tenant_id, s.id, coalesce(q.valor_unitario, round((q.amount - coalesce(q.frete, 0)) / nullif(s.quantidade, 0), 2)),
          p_valor_unitario, coalesce(q.frete, 0), p_frete, v_qtd_de, v_qtd, v_de, v_para, btrim(p_motivo), v_status, auth.uid(),
          case when v_status = 'aplicado' then auth.uid() end, case when v_status = 'aplicado' then now() end)
  returning id into v_id;

  if v_status = 'aplicado' then
    perform public.compras_aplica_reajuste(v_id);
    perform public.notify_ticket(s.ticket_id, 'purchase_decided', public.aprovadores_da_compra(s.tenant_id, s.caixinha, s.caixinha_id),
      'Compra reajustada (até 10%) — ' || left(coalesce(s.product_name, ''), 120),
      'De R$ ' || to_char(v_de, 'FM999G999G990D00') || ' para R$ ' || to_char(v_para, 'FM999G999G990D00')
        || case when v_qtd <> v_qtd_de then ' (quantidade ' || trim(to_char(v_qtd_de, 'FM999G990D###'), ',') || ' → '
                || trim(to_char(v_qtd, 'FM999G990D###'), ',') || ')' else '' end
        || '. Motivo: ' || btrim(p_motivo),
      true, auth.uid());
  else
    insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
    values (s.tenant_id, s.ticket_id, auth.uid(),
            'Reajuste pedido: de R$ ' || to_char(v_de, 'FM999G999G990D00') || ' para R$ ' || to_char(v_para, 'FM999G999G990D00')
            || ' (mais de 10%), aguardando o aprovador. Motivo: ' || btrim(p_motivo), true);
    perform public.notify_ticket(s.ticket_id, 'purchase_requested', public.aprovadores_da_compra(s.tenant_id, s.caixinha, s.caixinha_id),
      'Reajuste para aprovar — ' || left(coalesce(s.product_name, ''), 120),
      'De R$ ' || to_char(v_de, 'FM999G999G990D00') || ' para R$ ' || to_char(v_para, 'FM999G999G990D00') || '. Motivo: ' || btrim(p_motivo),
      true, auth.uid());
  end if;
  return v_status;
end;
$$;
revoke all on function public.compras_reajustar(uuid, numeric, numeric, text, numeric) from public, anon;
grant execute on function public.compras_reajustar(uuid, numeric, numeric, text, numeric) to authenticated;

-- COMPRAS: O FLUXO DE APROVAÇÃO DO DONO (2026-10-09; plano em .claude/plans/unified-dancing-mountain.md).
--
-- "Colaborador abre chamado para Compras com o orçamento → o chamado cai em Compras aguardando aprovar →
-- quem aprova decide (aprovar, recusar ou refazer) → volta para Compras com o resultado e quem abriu é
-- notificado → aprovada, Compras faz a compra; o status fica 'Aprovado, aguardando a compra' e, depois de
-- comprado, Resolvido." Decisões (múltipla escolha):
--   1. quem aprova continua a caixinha "Aprovar / reprovar compra" do perfil de Compras (e o administrador);
--      a tela sai da Diretoria e vai para Compras (é front);
--   2. o prazo de Compras PAUSA enquanto espera a decisão e o ajuste (quem aprova vê quanto está levando —
--      é front, de `compras_decisoes`);
--   3. compra aprovada SÓ fecha registrando a compra (que cria a conta a pagar) — o "Resolver" comum é recusado.
--
-- Medido antes (produção): aprovar escrevia o chamado pelo navegador, em duas escritas, e o aviso de
-- aprovação dependia de o chamado MUDAR de status — com o chamado já assumido ("em andamento") ninguém era
-- avisado; e a compra da Decolar foi fechada pelo "Resolver" comum, ficou "aprovada" e sem conta a pagar.
--
-- Agora o chamado SEGUE A COMPRA, num gatilho só:
--   pending_approval → waiting_parts ("Aguardando aprovação", prazo pausado)
--   adjustment_requested → waiting_user ("Aguardando quem pediu", prazo pausado)
--   approved → in_progress ("Aprovada · aguardando compra")
--   completed → resolved;  rejected → rejected
-- `waiting_parts` já existia no enum e sobrava (os menus só oferecem `waiting_user`); nada de valor novo.

-- ─── 1. Quem aprova (para os avisos) ─────────────────────────────────────────────────────────────
create or replace function public.aprovadores_de_compra(p_tenant uuid)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct p.id), '{}')
    from public.profiles p
   where p.tenant_id = p_tenant and coalesce(p.is_active, true)
     and (public.is_admin_or_higher(p.id) or public.tem_permissao(p.id, 'compras', 'solicitacoes', 'approve'));
$$;
revoke all on function public.aprovadores_de_compra(uuid) from public, anon, authenticated;

-- ─── 2. O chamado segue a compra ─────────────────────────────────────────────────────────────────
create or replace function public.compras_chamado_segue_a_compra()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return null; end if;
  if new.ticket_id is null then return null; end if;
  v_status := case new.status
    when 'pending_approval' then 'waiting_parts'
    when 'adjustment_requested' then 'waiting_user'
    when 'approved' then 'in_progress'
    when 'completed' then 'resolved'
    when 'rejected' then 'rejected'
  end;
  if v_status is null then return null; end if;
  -- O aviso é o da decisão (`compras_registra_decisao`); o genérico da mudança de status não repete.
  perform set_config('helpoint.status_pela_resposta', new.ticket_id::text, true);
  update public.tickets t
     set status = v_status::public.ticket_status,
         resolution_notes = case new.status
           when 'completed' then coalesce(nullif(btrim(new.purchase_report), ''), t.resolution_notes)
           when 'rejected' then 'Compra reprovada: ' || coalesce(new.rejection_reason, '')
           else t.resolution_notes end,
         resolved_at = case when new.status = 'completed' then now() else t.resolved_at end
   where t.id = new.ticket_id and t.status::text is distinct from v_status;
  perform set_config('helpoint.status_pela_resposta', '', true);
  return null;
end;
$$;
revoke all on function public.compras_chamado_segue_a_compra() from public, anon, authenticated;

drop trigger if exists trg_compras_chamado_segue_a_compra on public.compras_solicitacoes;
create trigger trg_compras_chamado_segue_a_compra after insert or update of status on public.compras_solicitacoes
  for each row execute function public.compras_chamado_segue_a_compra();

-- ─── 3. O prazo pausa também em `waiting_parts` (aguardando aprovação) ───────────────────────────
create or replace function public.chamado_pausa_em_pendente()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_parado integer;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if old.status::text = 'scheduled' then
    new.agendado_para := null;
    new.agendado_motivo := null;
  end if;
  if old.status::text in ('waiting_user', 'waiting_parts', 'scheduled') and old.pendente_desde is not null then
    v_parado := coalesce(public.minutos_uteis_do_chamado(new.tenant_id, new.module, old.pendente_desde, now(),
                                                         new.assigned_to), 0);
    new.pendente_desde := null;
    if v_parado > 0 then
      new.minutos_pausados := old.minutos_pausados + v_parado;
      if old.status::text = 'scheduled' then
        new.minutos_agendados := old.minutos_agendados + v_parado;
      end if;
      if new.sla_due_at is not distinct from old.sla_due_at and new.sla_due_at is not null then
        new.sla_due_at := public.prazo_do_chamado(new.tenant_id, new.module, old.sla_due_at, v_parado,
                                                  new.assigned_to);
      end if;
    end if;
  end if;
  if new.status::text in ('waiting_user', 'waiting_parts', 'scheduled') then
    new.pendente_desde := now();
  end if;
  return new;
end;
$$;

-- ─── 4. Compra aprovada só fecha registrando a compra ────────────────────────────────────────────
create or replace function public.compras_so_fecha_registrando()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 or new.module is distinct from 'compras'
     or new.status is not distinct from old.status or new.status::text not in ('resolved', 'closed') then
    return new;
  end if;
  if exists (select 1 from public.compras_solicitacoes s where s.ticket_id = new.id and s.status = 'approved') then
    raise exception 'Compra aprovada fecha em "Registrar compra feita" (nota e vencimento): é ele que lança a conta a pagar.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.compras_so_fecha_registrando() from public, anon, authenticated;

drop trigger if exists trg_compras_so_fecha_registrando on public.tickets;
create trigger trg_compras_so_fecha_registrando before update of status on public.tickets
  for each row execute function public.compras_so_fecha_registrando();

-- ─── 5. Os avisos: o pedido vai para quem aprova; a decisão volta para quem pediu e para Compras ──
create or replace function public.notify_on_purchase_requested()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_who text;
begin
  select full_name into v_who from public.profiles where id = new.created_by;
  perform public.notify_ticket(new.ticket_id, 'purchase_requested', public.aprovadores_de_compra(new.tenant_id),
    'Compra para aprovar — ' || coalesce(new.product_name, ''),
    coalesce(v_who, 'Alguém') || ' pediu aprovação' ||
      case when new.estimated_amount is not null
           then ' (estimado R$ ' || to_char(new.estimated_amount, 'FM999G999G990D00') || ').'
           else '.' end,
    true, new.created_by);
  return new;
end;
$$;

create or replace function public.compras_registra_decisao()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_decisao text;
  v_obs text;
  v_quem uuid;
  v_compras uuid[];
  v_produto text := coalesce(new.product_name, '');
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

  -- Quem compra: o atendente do chamado; sem ele, a equipe de Compras.
  select case when t.assigned_to is not null then array[t.assigned_to]
              else public.notification_team(new.tenant_id, 'compras') end
    into v_compras from public.tickets t where t.id = new.ticket_id;

  if v_decisao = 'aprovada' then
    perform public.notify_ticket(new.ticket_id, 'purchase_decided', array[new.created_by],
      'Compra aprovada — ' || v_produto, coalesce(nullif(btrim(new.approval_notes), ''), 'Aguardando a compra pelo setor de Compras.'), true);
    perform public.notify_ticket(new.ticket_id, 'purchase_decided', v_compras,
      'Compra aprovada, pode comprar — ' || v_produto, coalesce(nullif(btrim(new.approval_notes), ''), 'Registre a compra feita no chamado.'), true,
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

-- ─── 6. O perfil "Aprovador" de Compras: só a caixinha de aprovar ─────────────────────────────────
-- ponytail: só para as empresas que já existem (a Minasflor). Empresa nova não ganha esse exemplo pronto;
-- o admin cria o perfil com a caixinha em Configurações. Saída: pôr na semente de perfis do setor.
insert into public.access_profiles (tenant_id, department, name, description, permissions)
select t.id, 'compras', 'Aprovador', 'Só aprova, recusa ou pede ajuste de compras',
       '{"solicitacoes": {"approve": true}}'::jsonb
  from public.tenants t
on conflict (tenant_id, department, name) do nothing;

-- RESOLVER O CHAMADO DE OUTRA PESSOA (dono, 2026-10-13; caso #85: era do Yuri, quem resolveu foi o dono, e
-- contou para o Yuri). Decisão (múltipla escolha, a recomendada): ao resolver um chamado que está com outra
-- pessoa, a tela pergunta — "Assumir e resolver" (passa a ser seu, conta só para você) ou "Resolver junto"
-- (conta para os dois).
--
-- 1. Assumir AO resolver não é transferência: a troca de atendente vai no mesmo comando que fecha (o prazo
--    não recomeça — `sla_segue_o_atendente` ignora chamado que já sai resolvido) e pede a caixinha "Assumir",
--    não "Transferir".
-- 2. Resolver junto: a pessoa se põe em "atende junto" sozinha, desde que possa resolver chamado do setor.

create or replace function public.chamado_guarda_o_perfil()
returns trigger language plpgsql set search_path to 'public' as $$
declare
  v_fechado constant text[] := array['resolved', 'closed', 'cancelled', 'rejected'];
  v_acoes text[] := array[]::text[];
  v_assumiu boolean := false;
  v_acao text;
  v_junto boolean;
begin
  if pg_trigger_depth() > 1 or auth.uid() is null or current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.module <> 'compras' and not public.pode_no_chamado(old.module, 'delete') then
      raise exception 'Seu perfil de acesso não permite excluir este chamado.' using errcode = '42501';
    end if;
    return old;
  end if;

  if new.module = 'compras' then
    return new;
  end if;

  -- Quem abriu avalia ou reabre o que lhe entregaram. Não é ação de equipe — e não muda categoria.
  if old.requester_id = auth.uid() and old.status = 'resolved'
     and new.status::text in ('closed', 'in_progress')
     and new.assigned_to is not distinct from old.assigned_to
     and new.priority is not distinct from old.priority
     and new.due_date is not distinct from old.due_date
     and new.category_id is not distinct from old.category_id
     and new.category is not distinct from old.category
     and new.subcategory is not distinct from old.subcategory then
    return new;
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    -- Pegar da fila, ou assumir no mesmo comando que resolve (2026-10-13), é "assumir".
    v_assumiu := new.assigned_to = auth.uid()
                 and (old.assigned_to is null or new.status::text = any (v_fechado));
    v_acoes := v_acoes || (case when v_assumiu then 'assume' else 'transfer' end);
  end if;

  if new.status is distinct from old.status then
    if new.status::text = any (v_fechado) then
      v_acoes := v_acoes || 'close'::text;
    elsif old.status::text = any (v_fechado) then
      v_acoes := v_acoes || 'reopen'::text;
    elsif new.status::text = 'scheduled' then
      v_acoes := v_acoes || 'change_priority'::text;
    elsif not (v_assumiu and old.status = 'open' and new.status = 'in_progress') then
      v_acoes := v_acoes || 'change_status'::text;
    end if;
  end if;

  if new.priority is distinct from old.priority or new.due_date is distinct from old.due_date
     or (new.status::text = 'scheduled' and new.agendado_para is distinct from old.agendado_para) then
    v_acoes := v_acoes || 'change_priority'::text;
  end if;

  if new.category_id is distinct from old.category_id
     or new.category is distinct from old.category
     or new.subcategory is distinct from old.subcategory then
    v_acoes := v_acoes || 'change_category'::text;
  end if;

  v_junto := public.atende_junto(new.id);
  foreach v_acao in array v_acoes loop
    continue when v_junto and v_acao in ('close', 'change_status', 'reopen');
    if not public.pode_no_chamado(new.module, v_acao) then
      raise exception 'Seu perfil de acesso não permite % neste chamado.',
        case v_acao
          when 'assume' then 'assumir'
          when 'transfer' then 'transferir'
          when 'close' then 'resolver ou fechar'
          when 'reopen' then 'reabrir'
          when 'change_status' then 'mudar o status'
          when 'change_priority' then 'mudar a prioridade ou o prazo'
          when 'change_category' then 'mudar a categoria'
        end
        using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$$;

-- Resolver junto: a pessoa entra sozinha em "atende junto" quando pode resolver chamado do setor.
create or replace function public.entrar_para_resolver_junto(p_ticket uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tickets%rowtype;
begin
  select * into t from public.tickets where id = p_ticket and tenant_id = public.get_user_tenant_id();
  if t.id is null or not public.pode_no_chamado(t.module, 'close') then
    raise exception 'Seu perfil de acesso não permite resolver este chamado.' using errcode = '42501';
  end if;
  if t.assigned_to is null or t.assigned_to = auth.uid() then
    return;
  end if;
  insert into public.ticket_participantes (ticket_id, user_id, tenant_id, convidado_por)
  values (t.id, auth.uid(), t.tenant_id, auth.uid())
  on conflict (ticket_id, user_id) do nothing;
end;
$$;
revoke all on function public.entrar_para_resolver_junto(uuid) from public, anon;
grant execute on function public.entrar_para_resolver_junto(uuid) to authenticated;

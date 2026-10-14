-- AGENDAR É CAIXINHA PRÓPRIA (dono, 2026-10-14: "todos os operadores de cada setor habilitados para poder agendar
-- o chamado quando necessário"). Até aqui agendar pedia "Mudar prioridade e prazo" (20261214020000) — que também
-- deixa mudar a urgência, e por isso o Operador não tinha. Agora "Agendar" é a ação `schedule` da seção de chamados:
-- ligada em todo perfil Operador e Gestor, e em quem já tinha "Mudar prioridade e prazo".
-- Perfil criado depois (empresa nova) nasce com "Agendar" pelo padrão de chamados (`chamados_do_perfil_padrao`).
-- O resto de `chamado_guarda_o_perfil` é igual à versão no ar (20261231010000).

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
      v_acoes := v_acoes || 'schedule'::text;
    elsif not (v_assumiu and old.status = 'open' and new.status = 'in_progress') then
      v_acoes := v_acoes || 'change_status'::text;
    end if;
  end if;

  if new.priority is distinct from old.priority or new.due_date is distinct from old.due_date then
    v_acoes := v_acoes || 'change_priority'::text;
  end if;
  -- Reagendar (mudar a data de um chamado já agendado) é agendar.
  if new.status::text = 'scheduled' and old.status::text = 'scheduled' and new.agendado_para is distinct from old.agendado_para then
    v_acoes := v_acoes || 'schedule'::text;
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
          when 'schedule' then 'agendar'
        end
        using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$$;

-- Liga "Agendar" em todo Operador e Gestor, e em quem já agendava (tinha "Mudar prioridade e prazo").
update public.access_profiles
   set permissions = jsonb_set(permissions, '{tickets,schedule}', 'true'::jsonb)
 where permissions ? 'tickets' and jsonb_typeof(permissions -> 'tickets') = 'object'
   and (name in ('Operador', 'Gestor') or coalesce((permissions -> 'tickets' ->> 'change_priority')::boolean, false));

-- O padrão de chamados de cada perfil novo (a semente da empresa nova passa por aqui): "Agendar" no Gestor e no
-- Operador; o Somente leitura não agenda.
create or replace function public.chamados_do_perfil_padrao(p_nome text)
returns jsonb language sql immutable set search_path to 'public' as $function$
  select case
    when p_nome = 'Gestor' then
      '{"view_all":true,"assume":true,"change_status":true,"close":true,"reopen":true,
        "transfer":true,"change_priority":true,"schedule":true,"change_category":true,"internal_notes":true,"delete":true,
        "repassar_ausencias":true}'::jsonb
    when p_nome = 'Somente leitura' then
      '{"view_all":true,"assume":false,"change_status":false,"close":false,"reopen":false,
        "transfer":false,"change_priority":false,"schedule":false,"change_category":false,"internal_notes":false,"delete":false}'::jsonb
    else
      '{"view_all":true,"assume":true,"change_status":true,"close":true,"reopen":true,
        "transfer":false,"change_priority":false,"schedule":true,"change_category":true,"internal_notes":true,"delete":false}'::jsonb
  end;
$function$;

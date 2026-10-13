-- ATENDER JUNTO (dono, 2026-10-13): "convidar um colaborador para participar; quando finalizar, contabiliza
-- para ambos". Caso: o #27 era para dois (TI + Mel) e foi transferido, quando o certo era os dois atenderem.
-- Decisões (múltipla escolha, as recomendadas):
--   * o convidado ATENDE JUNTO: responde, nota interna, muda o status e resolve. O atendente principal
--     continua um só (é o expediente dele que conta o prazo);
--   * convida quem atende o chamado ou o gestor do setor; pode ser gente de QUALQUER setor;
--   * o convidado recebe TODOS os avisos que o atendente recebe (inclusive os de prazo);
--   * entregas, prazo e a avaliação (estrelas) contam para os dois — a avaliação segue sigilosa.
--
-- Para o banco, quem atende junto é "mais um atendente": onde uma regra dizia `assigned_to = auth.uid()`,
-- agora diz também `atende_junto(id)`; e o aviso que vai para o atendente vai para quem atende junto.

-- ─── 1. Quem atende junto ────────────────────────────────────────────────────────────────────────
create table if not exists public.ticket_participantes (
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  convidado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);
create index if not exists ticket_participantes_user_idx on public.ticket_participantes (user_id);

/** O usuário atual atende este chamado junto? (Security definer: a policy não pode reconsultar a tabela.) */
create or replace function public.atende_junto(p_ticket uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ticket_participantes p where p.ticket_id = p_ticket and p.user_id = auth.uid());
$$;
revoke all on function public.atende_junto(uuid) from public, anon;
grant execute on function public.atende_junto(uuid) to authenticated;

alter table public.ticket_participantes enable row level security;
-- Vê quem atende junto quem vê o chamado (a policy de `tickets` decide, por dentro do exists).
create policy ticket_participantes_le on public.ticket_participantes for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and exists (select 1 from public.tickets t where t.id = ticket_participantes.ticket_id));
-- Escrever só pelas funções abaixo (sem policy de insert/update/delete).

/** Pode convidar ou tirar: quem atende o chamado, o gestor do setor dele, ou administrador. */
create or replace function public.pode_chamar_para_atender_junto(p_ticket uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tickets t
                  where t.id = p_ticket and t.tenant_id = public.get_user_tenant_id()
                    and (t.assigned_to = auth.uid()
                         or public.gestor_do_setor(auth.uid(), public.setor_do_modulo(t.module))
                         or public.is_admin_or_higher(auth.uid())));
$$;
revoke all on function public.pode_chamar_para_atender_junto(uuid) from public, anon;
grant execute on function public.pode_chamar_para_atender_junto(uuid) to authenticated;

create or replace function public.convidar_para_atender_junto(p_ticket uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tickets%rowtype; v_nome text; v_quem text;
begin
  select * into t from public.tickets where id = p_ticket and tenant_id = public.get_user_tenant_id();
  if t.id is null or not public.pode_chamar_para_atender_junto(p_ticket) then
    raise exception 'Só quem atende o chamado ou o gestor do setor chama alguém para atender junto.' using errcode = '42501';
  end if;
  if t.status::text in ('resolved', 'closed', 'cancelled', 'rejected') then
    raise exception 'Chamado encerrado: reabra antes de chamar alguém.' using errcode = '22023';
  end if;
  if p_user is null or p_user = t.assigned_to then
    raise exception 'Essa pessoa já é quem atende o chamado.' using errcode = '22023';
  end if;
  if p_user = t.requester_id then
    raise exception 'Quem pediu o chamado não atende o próprio pedido.' using errcode = '22023';
  end if;
  select coalesce(full_name, email) into v_nome from public.profiles
   where id = p_user and tenant_id = t.tenant_id and coalesce(is_active, true);
  if v_nome is null then
    raise exception 'Pessoa não encontrada na empresa.' using errcode = '22023';
  end if;
  insert into public.ticket_participantes (ticket_id, user_id, tenant_id, convidado_por)
  values (t.id, p_user, t.tenant_id, auth.uid())
  on conflict (ticket_id, user_id) do nothing;
  if not found then return; end if;

  select coalesce(full_name, email) into v_quem from public.profiles where id = auth.uid();
  insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
  values (t.tenant_id, t.id, auth.uid(), v_nome || ' foi chamado(a) para atender junto, por ' || coalesce(v_quem, 'alguém') || '.', true);
  perform public.notify_ticket(t.id, 'ticket_assigned', array[p_user],
    'Você vai atender junto o chamado #' || t.ticket_number,
    coalesce(v_quem, 'Alguém') || ' chamou você para atender junto: "' || coalesce(t.title, '') || '". Conta para os dois quando resolver.',
    true);
end;
$$;
revoke all on function public.convidar_para_atender_junto(uuid, uuid) from public, anon;
grant execute on function public.convidar_para_atender_junto(uuid, uuid) to authenticated;

create or replace function public.tirar_de_atender_junto(p_ticket uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tickets%rowtype; v_nome text;
begin
  select * into t from public.tickets where id = p_ticket and tenant_id = public.get_user_tenant_id();
  -- Quem atende junto pode sair sozinho; tirar outra pessoa é de quem pode chamar.
  if t.id is null or not (p_user = auth.uid() or public.pode_chamar_para_atender_junto(p_ticket)) then
    raise exception 'Só quem atende o chamado ou o gestor do setor tira alguém.' using errcode = '42501';
  end if;
  delete from public.ticket_participantes where ticket_id = t.id and user_id = p_user;
  if not found then return; end if;
  select coalesce(full_name, email) into v_nome from public.profiles where id = p_user;
  insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
  values (t.tenant_id, t.id, auth.uid(), coalesce(v_nome, 'Alguém') || ' deixou de atender junto.', true);
end;
$$;
revoke all on function public.tirar_de_atender_junto(uuid, uuid) from public, anon;
grant execute on function public.tirar_de_atender_junto(uuid, uuid) to authenticated;

-- Quem vira o atendente principal sai da lista de "junto" (não conta duas vezes).
create or replace function public.atender_junto_vira_principal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.ticket_participantes where ticket_id = new.id and user_id = new.assigned_to;
  return null;
end;
$$;
revoke all on function public.atender_junto_vira_principal() from public, anon, authenticated;
drop trigger if exists trg_atender_junto_vira_principal on public.tickets;
create trigger trg_atender_junto_vira_principal after update of assigned_to on public.tickets
  for each row when (new.assigned_to is not null) execute function public.atender_junto_vira_principal();

-- ─── 2. Ver e mexer: quem atende junto vale como atendente ───────────────────────────────────────
alter policy "Users can view their own tickets" on public.tickets
  using ((tenant_id = (select get_user_tenant_id())) and ((requester_id = auth.uid()) or (assigned_to = auth.uid())
         or public.atende_junto(id)
         or (select is_supervisor_or_higher(auth.uid()))
         or (module = any (coalesce((select modulos_de_chamado_visiveis()), array[]::text[])))
         or ((assigned_to is null) and (module = any (coalesce((select modulos_de_chamado_que_atendo()), array[]::text[]))))));

alter policy "Technicians can update tickets" on public.tickets
  using ((tenant_id = (select get_user_tenant_id())) and ((requester_id = auth.uid()) or (assigned_to = auth.uid())
         or public.atende_junto(id)
         or (select is_supervisor_or_higher(auth.uid()))
         or (module = any (coalesce((select modulos_de_chamado_visiveis()), array[]::text[])))
         or ((assigned_to is null) and (module = any (coalesce((select modulos_de_chamado_que_atendo()), array[]::text[]))))));

alter policy "Users can view comments on accessible tickets" on public.ticket_comments
  using ((tenant_id = (select get_user_tenant_id())) and ((select is_supervisor_or_higher(auth.uid()))
         or exists (select 1 from public.tickets t where t.id = ticket_comments.ticket_id
                     and (((t.requester_id = auth.uid()) and (not ticket_comments.is_internal)) or (t.assigned_to = auth.uid())
                          or public.atende_junto(t.id)
                          or (t.module = any (coalesce((select modulos_de_chamado_visiveis()), array[]::text[])))
                          or ((t.assigned_to is null) and (t.module = any (coalesce((select modulos_de_chamado_que_atendo()), array[]::text[]))))))));

alter policy "Users can view attachments on accessible tickets" on public.ticket_attachments
  using ((tenant_id = (select get_user_tenant_id())) and ((select is_supervisor_or_higher(auth.uid()))
         or exists (select 1 from public.tickets t where t.id = ticket_attachments.ticket_id
                     and ((t.requester_id = auth.uid()) or (t.assigned_to = auth.uid()) or public.atende_junto(t.id)
                          or (t.module = any (coalesce((select modulos_de_chamado_visiveis()), array[]::text[])))
                          or ((t.assigned_to is null) and (t.module = any (coalesce((select modulos_de_chamado_que_atendo()), array[]::text[]))))))));

alter policy "Users can upload attachments to accessible tickets" on public.ticket_attachments
  with check ((tenant_id = (select get_user_tenant_id())) and ((select is_supervisor_or_higher(auth.uid()))
         or exists (select 1 from public.tickets t where t.id = ticket_attachments.ticket_id
                     and ((t.requester_id = auth.uid()) or (t.assigned_to = auth.uid()) or public.atende_junto(t.id)
                          or (t.module = any (coalesce((select modulos_de_chamado_visiveis()), array[]::text[])))
                          or ((t.assigned_to is null) and (t.module = any (coalesce((select modulos_de_chamado_que_atendo()), array[]::text[]))))))));

alter policy "Users view ticket checklist items" on public.ticket_checklist_items
  using ((tenant_id = (select get_user_tenant_id())) and exists (select 1 from public.ticket_checklists tc join public.tickets t on t.id = tc.ticket_id
          where tc.id = ticket_checklist_items.ticket_checklist_id and tc.tenant_id = ticket_checklist_items.tenant_id
            and ((t.requester_id = auth.uid()) or (t.assigned_to = auth.uid()) or public.atende_junto(t.id)
                 or (select is_supervisor_or_higher(auth.uid()))
                 or (t.module = any (coalesce((select modulos_de_chamado_visiveis()), array[]::text[])))
                 or ((t.assigned_to is null) and (t.module = any (coalesce((select modulos_de_chamado_que_atendo()), array[]::text[])))))));

alter policy "Technicians create ticket checklist items" on public.ticket_checklist_items
  with check ((tenant_id = (select get_user_tenant_id())) and exists (select 1 from public.ticket_checklists tc join public.tickets t on t.id = tc.ticket_id
          where tc.id = ticket_checklist_items.ticket_checklist_id and tc.tenant_id = ticket_checklist_items.tenant_id
            and ((t.assigned_to = auth.uid()) or public.atende_junto(t.id) or (select is_supervisor_or_higher(auth.uid()))
                 or (t.module = any (coalesce((select modulos_de_chamado_visiveis()), array[]::text[])))
                 or ((t.assigned_to is null) and (t.module = any (coalesce((select modulos_de_chamado_que_atendo()), array[]::text[])))))));

alter policy "Technicians update ticket checklist items" on public.ticket_checklist_items
  using ((tenant_id = (select get_user_tenant_id())) and exists (select 1 from public.ticket_checklists tc join public.tickets t on t.id = tc.ticket_id
          where tc.id = ticket_checklist_items.ticket_checklist_id and tc.tenant_id = ticket_checklist_items.tenant_id
            and ((t.assigned_to = auth.uid()) or public.atende_junto(t.id) or (select is_supervisor_or_higher(auth.uid()))
                 or (t.module = any (coalesce((select modulos_de_chamado_visiveis()), array[]::text[])))
                 or ((t.assigned_to is null) and (t.module = any (coalesce((select modulos_de_chamado_que_atendo()), array[]::text[])))))));

-- O perfil: quem atende junto muda o status, resolve e reabre mesmo sem perfil no setor do chamado.
-- Transferir, prazo/urgência e categoria seguem pedindo o perfil.
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
    v_assumiu := old.assigned_to is null and new.assigned_to = auth.uid();
    v_acoes := v_acoes || (case when v_assumiu then 'assume' else 'transfer' end);
  end if;

  if new.status is distinct from old.status then
    if new.status::text = any (v_fechado) then
      v_acoes := v_acoes || 'close'::text;
    elsif old.status::text = any (v_fechado) then
      v_acoes := v_acoes || 'reopen'::text;
    elsif new.status::text = 'scheduled' then
      -- Agendar é decidir QUANDO tratar: é prazo, não status (dono, 2026-10-07).
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
    -- Atender junto (2026-10-13): status, resolver e reabrir são de quem atende, de qualquer setor.
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

-- ─── 3. Avisos: o que vai para o atendente vai para quem atende junto ────────────────────────────
create or replace function public.notify_ticket(p_ticket uuid, p_type notification_type, p_users uuid[], p_title text,
  p_message text, p_com_email boolean default false, p_exclude uuid default null::uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  t public.tickets%rowtype;
  v_u uuid;
  v_junto uuid[];
begin
  select * into t from public.tickets where id = p_ticket;
  if t.id is null then
    return;
  end if;
  select coalesce(array_agg(user_id), '{}') into v_junto from public.ticket_participantes where ticket_id = p_ticket;
  -- Atender junto (2026-10-13): quem atende junto recebe o mesmo que o atendente — e o que o próprio
  -- atendente faz (a nota interna dele tira ele da lista, mas é para quem atende junto ler).
  if t.assigned_to is not null
     and (t.assigned_to = any (coalesce(p_users, '{}'::uuid[])) or t.assigned_to = auth.uid()) then
    p_users := p_users || v_junto;
  end if;
  for v_u in
    select distinct u from unnest(coalesce(p_users, '{}'::uuid[])) as u
     where u is not null and u is distinct from auth.uid() and u is distinct from p_exclude
  loop
    continue when not (v_u = any (v_junto)
                       or public.pode_ver_chamado(v_u, t.tenant_id, t.module, t.requester_id, t.assigned_to));
    update public.notifications n
       set title = p_title, message = p_message, is_read = false,
           email_sent = case when p_com_email then false else n.email_sent end
     where n.user_id = v_u and n.reference_type = 'ticket' and n.reference_id = p_ticket
       and n.type = p_type and n.created_at > now() - interval '2 minutes';
    if not found then
      insert into public.notifications
        (tenant_id, user_id, type, reference_type, reference_id, title, message, email_sent)
      values (t.tenant_id, v_u, p_type, 'ticket', p_ticket, p_title, p_message, not p_com_email);
    end if;
  end loop;
end;
$$;

create or replace function public.avisados_do_prazo(p_ticket uuid, p_vencido boolean)
returns uuid[] language sql stable security definer set search_path to 'public' as $$
  with t as (select id, tenant_id, module, assigned_to from public.tickets where id = p_ticket),
  equipe as (select unnest(public.equipe_do_chamado(t.tenant_id, t.module)) as u from t)
  select coalesce(array_agg(distinct x.u) filter (where x.u is not null), '{}'::uuid[])
    from (
      select t.assigned_to as u from t
      -- Quem atende junto também é avisado do prazo (2026-10-13).
      union all select p.user_id from public.ticket_participantes p, t where p.ticket_id = t.id
      union all select e.u from equipe e, t where t.assigned_to is null
      union all select e.u from equipe e, t
                 where t.assigned_to is not null and p_vencido and public.gere_a_fila(e.u, t.module)
    ) x;
$$;

create or replace function public.chamados_do_meu_resumo()
returns table(id uuid, ticket_number integer, title text, priority text, status text, sla_due_at timestamp with time zone,
              due_date timestamp with time zone, category text, module text, created_at timestamp with time zone)
language sql stable security definer set search_path to 'public' as $$
  with eu as (select auth.uid() as uid, public.setores_de_aviso(auth.uid()) as setores,
                     auth.uid() = any (public.donos_da_empresa(public.get_user_tenant_id())) as dono)
  select t.id, t.ticket_number, t.title, t.priority::text, t.status::text, t.sla_due_at, t.due_date,
         t.category, t.module, t.created_at
    from public.tickets t, eu
   where t.tenant_id = public.get_user_tenant_id()
     and t.status::text not in ('resolved', 'closed', 'cancelled', 'rejected')
     and (t.assigned_to = eu.uid
          or exists (select 1 from public.ticket_participantes p where p.ticket_id = t.id and p.user_id = eu.uid)
          or (t.module = any (eu.setores)
              and (t.assigned_to is null or public.gere_a_fila(eu.uid, t.module))
              and public.pode_ver_chamado(eu.uid, t.tenant_id, t.module, t.requester_id, t.assigned_to))
          or (eu.dono and t.assigned_to is null
              and cardinality(public.membros_do_aviso(t.tenant_id, t.module)) = 0))
   order by t.priority, t.sla_due_at nulls last
   limit 50;
$$;

-- ─── 4. A avaliação vale para os dois, e segue sigilosa para os dois ─────────────────────────────
alter table public.avaliacoes_do_atendimento
  add column if not exists tambem_atenderam uuid[] not null default '{}';

create or replace function public.avaliar_atendimento(p_ticket uuid, p_nota integer, p_comentario text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare t public.tickets%rowtype;
begin
  select * into t from public.tickets where id = p_ticket and tenant_id = public.get_user_tenant_id();
  if t.id is null or t.requester_id is distinct from auth.uid() then
    raise exception 'Só quem abriu o chamado avalia o atendimento.' using errcode = '42501';
  end if;
  if t.status::text <> 'resolved' then
    raise exception 'O chamado precisa estar resolvido para ser avaliado.' using errcode = '23514';
  end if;
  if t.resolved_at is not null and t.resolved_at < now() - interval '7 days' then
    raise exception 'O prazo de 7 dias para avaliar terminou.' using errcode = '23514';
  end if;
  if t.avaliado_em is not null then
    raise exception 'Este atendimento já foi avaliado.' using errcode = '23514';
  end if;
  if p_nota is null or p_nota not between 1 and 5 then
    raise exception 'A nota vai de 1 a 5.' using errcode = '23514';
  end if;
  insert into public.avaliacoes_do_atendimento (ticket_id, tenant_id, module, atendente_id, tambem_atenderam, solicitante_id, nota, comentario)
  values (t.id, t.tenant_id, t.module, t.assigned_to,
          coalesce((select array_agg(p.user_id) from public.ticket_participantes p where p.ticket_id = t.id), '{}'),
          auth.uid(), p_nota, nullif(btrim(coalesce(p_comentario, '')), ''));
  update public.tickets set avaliado_em = now() where id = t.id;
end;
$$;

alter policy avaliacoes_do_atendimento_le on public.avaliacoes_do_atendimento
  using ((tenant_id = (select get_user_tenant_id())) and ((solicitante_id = auth.uid()) or is_admin_or_higher(auth.uid())
         or exists (select 1 from user_module_access m where m.user_id = auth.uid() and m.module = 'diretoria')
         or (gestor_do_setor(auth.uid(), setor_do_modulo(module)) and atendente_id is distinct from auth.uid()
             and not (auth.uid() = any (tambem_atenderam)))));

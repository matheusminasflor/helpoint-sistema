-- CONVITE COM ACEITE E AGENDA QUE FICA (dono, 2026-10-14/15).
--
-- 1. "Ao convidar um colaborador para um chamado, ele não é notificado para aceitar" — decisão (múltipla escolha,
--    a recomendada): aviso com Aceitar e Recusar; só depois de aceitar o chamado conta para a pessoa e ela recebe os
--    avisos de prazo; quem convidou fica sabendo da resposta. O convite PENDENTE mora em `ticket_convites`, à parte:
--    `ticket_participantes` (e tudo o que conta por ela — indicadores, avaliação, avisos, RLS) continua sendo só de
--    quem aceitou. Chamar a si mesmo (e "Resolver junto") entra direto, sem convite.
-- 2. "Quando responde o chamado mesmo agendado, o agendamento some; deve sumir apenas quando o prazo terminar ou
--    manualmente pelo usuário": responder um chamado Agendado não muda o status (antes ia para Em andamento, ou
--    Pendente, e a agenda caía). Encerrar a agenda é mudar o status na mão — ou a data chegar (o job).

-- ─── 1. O convite pendente ───────────────────────────────────────────────────────────────────────
create table if not exists public.ticket_convites (
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  convidado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);
alter table public.ticket_convites enable row level security;
-- Vê o convite quem foi convidado e quem pode ver o chamado (a tela do chamado mostra "aguardando aceite").
create policy ticket_convites_le on public.ticket_convites for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and (user_id = auth.uid() or exists (select 1 from public.tickets t where t.id = ticket_convites.ticket_id)));

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
  if exists (select 1 from public.ticket_participantes where ticket_id = t.id and user_id = p_user) then
    return;
  end if;
  select coalesce(full_name, email) into v_quem from public.profiles where id = auth.uid();

  -- Chamar a si mesmo: entra direto.
  if p_user = auth.uid() then
    insert into public.ticket_participantes (ticket_id, user_id, tenant_id, convidado_por)
    values (t.id, p_user, t.tenant_id, auth.uid()) on conflict do nothing;
    insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
    values (t.tenant_id, t.id, auth.uid(), v_nome || ' passou a atender junto.', true);
    return;
  end if;

  insert into public.ticket_convites (ticket_id, user_id, tenant_id, convidado_por)
  values (t.id, p_user, t.tenant_id, auth.uid())
  on conflict (ticket_id, user_id) do nothing;
  if not found then return; end if;
  insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
  values (t.tenant_id, t.id, auth.uid(), v_nome || ' foi convidado(a) para atender junto, por ' || coalesce(v_quem, 'alguém') || ' (aguardando aceite).', true);
  perform public.notify_ticket(t.id, 'ticket_assigned', array[p_user],
    'Convite para atender junto o chamado #' || t.ticket_number,
    coalesce(v_quem, 'Alguém') || ' convidou você para atender junto: "' || coalesce(t.title, '') || '". Aceite ou recuse na tela inicial (Lyra avisa).',
    true);
end;
$$;

/** Responder o convite: aceitar entra no chamado; recusar some com o convite. Quem convidou fica sabendo. */
create or replace function public.responder_convite_atender_junto(p_ticket uuid, p_aceita boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c public.ticket_convites%rowtype; t public.tickets%rowtype; v_nome text;
begin
  select * into c from public.ticket_convites where ticket_id = p_ticket and user_id = auth.uid();
  if c.ticket_id is null then
    raise exception 'Este convite não existe mais.' using errcode = '22023';
  end if;
  select * into t from public.tickets where id = p_ticket;
  delete from public.ticket_convites where ticket_id = p_ticket and user_id = auth.uid();
  select coalesce(full_name, email) into v_nome from public.profiles where id = auth.uid();
  if p_aceita then
    if t.status::text in ('resolved', 'closed', 'cancelled', 'rejected') then
      raise exception 'O chamado já foi encerrado.' using errcode = '22023';
    end if;
    insert into public.ticket_participantes (ticket_id, user_id, tenant_id, convidado_por)
    values (c.ticket_id, c.user_id, c.tenant_id, c.convidado_por) on conflict do nothing;
  end if;
  insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
  values (c.tenant_id, c.ticket_id, auth.uid(),
          coalesce(v_nome, 'Alguém') || case when p_aceita then ' aceitou atender junto.' else ' recusou o convite para atender junto.' end, true);
  -- Marca o aviso do convite como lido, e avisa quem convidou.
  update public.notifications set is_read = true
   where user_id = auth.uid() and reference_id = p_ticket and type = 'ticket_assigned' and not is_read;
  if c.convidado_por is not null and c.convidado_por <> auth.uid() then
    perform public.notify_ticket(c.ticket_id, 'ticket_updated', array[c.convidado_por],
      coalesce(v_nome, 'Alguém') || case when p_aceita then ' aceitou' else ' recusou' end || ' atender junto o #' || t.ticket_number,
      coalesce(t.title, ''), false);
  end if;
end;
$$;
revoke all on function public.responder_convite_atender_junto(uuid, boolean) from public, anon;
grant execute on function public.responder_convite_atender_junto(uuid, boolean) to authenticated;

/** Os convites que esperam a minha resposta (o chamado eu ainda não enxergo: security definer). */
create or replace function public.meus_convites_atender_junto()
returns table (ticket_id uuid, ticket_number int, titulo text, quem_convidou text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.ticket_id, t.ticket_number, t.title, coalesce(p.full_name, p.email), c.created_at
    from public.ticket_convites c
    join public.tickets t on t.id = c.ticket_id
    left join public.profiles p on p.id = c.convidado_por
   where c.user_id = auth.uid() and c.tenant_id = public.get_user_tenant_id()
   order by c.created_at desc;
$$;
revoke all on function public.meus_convites_atender_junto() from public, anon;
grant execute on function public.meus_convites_atender_junto() to authenticated;

-- Tirar alguém também desfaz o convite que ainda espera resposta.
create or replace function public.tirar_de_atender_junto(p_ticket uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tickets%rowtype; v_nome text; v_tinha boolean;
begin
  select * into t from public.tickets where id = p_ticket and tenant_id = public.get_user_tenant_id();
  if t.id is null or not (p_user = auth.uid() or public.pode_chamar_para_atender_junto(p_ticket)) then
    raise exception 'Só quem atende o chamado ou o gestor do setor tira alguém.' using errcode = '42501';
  end if;
  delete from public.ticket_convites where ticket_id = t.id and user_id = p_user;
  v_tinha := found;
  delete from public.ticket_participantes where ticket_id = t.id and user_id = p_user;
  if not (found or v_tinha) then return; end if;
  select coalesce(full_name, email) into v_nome from public.profiles where id = p_user;
  insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
  values (t.tenant_id, t.id, auth.uid(), coalesce(v_nome, 'Alguém') || ' deixou de atender junto.', true);
end;
$$;

-- ─── 2. Responder não derruba o Agendado ─────────────────────────────────────────────────────────
-- Igual à versão no ar (20261214020000), sem 'scheduled' nas trocas de status da resposta.
create or replace function public.chamado_status_pela_resposta()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  t record;
  v_novo text;
  v_assume boolean := false;
begin
  if coalesce(new.is_internal, false) or new.author_id is null then
    return null;
  end if;
  select id, status::text as status, requester_id, assigned_to, module into t from public.tickets where id = new.ticket_id;
  if t.id is null then
    return null;
  end if;
  if new.author_id = t.requester_id then
    if t.status = 'waiting_user' then
      v_novo := 'in_progress';
    end if;
  else
    -- 2026-10-06: quem pode atender e responde um chamado SEM atendente vira o atendente.
    v_assume := t.assigned_to is null
                and t.module <> 'compras'
                and new.author_id = auth.uid()
                and t.status in ('open', 'in_progress', 'waiting_user', 'scheduled')
                and public.pode_no_chamado(t.module, 'assume');
    -- Agendado fica Agendado (2026-10-15): a agenda só cai na data marcada ou mudando o status na mão.
    if t.status = 'scheduled' then
      v_novo := null;
    elsif coalesce(new.mantem_status, false) then
      -- "Responder" (2026-10-07): o chamado fica, ou volta, Em andamento.
      if t.status in ('open', 'waiting_user') then
        v_novo := 'in_progress';
      end if;
    elsif t.status in ('open', 'in_progress') then
      -- "Responder e aguardar retorno": Pendente, prazo pausado, solicitante avisado.
      v_novo := 'waiting_user';
    end if;
  end if;
  if v_novo is null and not v_assume then
    return null;
  end if;
  perform set_config('helpoint.status_pela_resposta', t.id::text, true);
  update public.tickets
     set status = coalesce(v_novo, status::text)::ticket_status,
         assigned_to = case when v_assume then new.author_id else assigned_to end
   where id = t.id;
  perform set_config('helpoint.status_pela_resposta', '', true);
  return null;
end;
$function$;

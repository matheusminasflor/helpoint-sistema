-- Notificações, revisão completa (L0, segunda passada — 2026-09-08).
--
-- A matriz evento × destinatário mostrou que o chamado só avisava UM lado:
-- o técnico que responde avisa o solicitante, mas o solicitante que responde
-- não avisava ninguém; chamado novo não avisava a equipe; avaliação e
-- reabertura sem responsável morriam; SAC aberto e SAC avaliado não chegavam
-- à Qualidade; pedido de compra não chegava a quem aprova; holerite e
-- documento no cofre não chegavam ao colaborador.
--
-- A regra passa a viver no banco, em triggers, porque os produtores são
-- vários e nem todos têm hook no front: o chamado nasce pela tela, pelo
-- trigger do RH (create_rh_ticket_from_request), pelo desligamento
-- (create_offboarding_ti_ticket) e pelo robô (check-alerts). Um trigger
-- cobre os quatro. O front deixa de inserir onde o trigger cobre, para não
-- avisar duas vezes.
--
-- Quem é "a equipe do módulo": quem tem o módulo concedido em
-- user_module_access (o mesmo critério do check-alerts). Sem ninguém, cai
-- em owner/admin/manager, que veem tudo.

-- ───────────────────────────────────────────────────────────────────────────
-- Tipos novos
-- ───────────────────────────────────────────────────────────────────────────
alter type public.notification_type add value if not exists 'purchase_requested';
alter type public.notification_type add value if not exists 'sac_customer_rated';
alter type public.notification_type add value if not exists 'bill_due';
alter type public.notification_type add value if not exists 'document_available';
alter type public.notification_type add value if not exists 'post_published';
alter type public.notification_type add value if not exists 'post_failed';

-- ───────────────────────────────────────────────────────────────────────────
-- Duas funções de apoio: quem é a equipe, e o INSERT em lote
-- ───────────────────────────────────────────────────────────────────────────

-- `module` de tickets é 'tickets' para TI; em user_module_access é 'ti'.
create or replace function public.notification_team(p_tenant uuid, p_module text)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  with dept as (
    select case p_module when 'tickets' then 'ti' else coalesce(p_module, 'ti') end as d
  ),
  team as (
    select array_agg(distinct m.user_id) as ids
      from public.user_module_access m
      join public.profiles p on p.id = m.user_id and coalesce(p.is_active, true)
      cross join dept
     where m.tenant_id = p_tenant
       and m.module = dept.d
  ),
  supervisors as (
    select array_agg(distinct p.id) as ids
      from public.profiles p
      join public.user_roles r on r.user_id = p.id and r.role in ('owner', 'admin', 'manager')
     where p.tenant_id = p_tenant
       and coalesce(p.is_active, true)
  )
  select coalesce((select ids from team), (select ids from supervisors), '{}'::uuid[]);
$$;

-- Um aviso por destinatário, nunca para quem causou o evento (p_exclude).
create or replace function public.notify_users(
  p_tenant   uuid,
  p_users    uuid[],
  p_type     public.notification_type,
  p_ref_type text,
  p_ref_id   uuid,
  p_title    text,
  p_message  text,
  p_exclude  uuid default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
  select p_tenant, u, p_type, p_ref_type, p_ref_id, p_title, p_message
    from unnest(coalesce(p_users, '{}'::uuid[])) as u
   where u is not null
     and u is distinct from p_exclude;
$$;

revoke all on function public.notification_team(uuid, text) from public, anon, authenticated;
revoke all on function public.notify_users(uuid, uuid[], public.notification_type, text, uuid, text, text, uuid) from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- Chamado criado → responsável, senão equipe do módulo (nunca o solicitante)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.notify_on_ticket_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_targets uuid[];
  v_who     text;
begin
  if new.assigned_to is not null then
    v_targets := array[new.assigned_to];
  else
    v_targets := public.notification_team(new.tenant_id, new.module);
  end if;

  select full_name into v_who from public.profiles where id = new.requester_id;

  perform public.notify_users(
    new.tenant_id, v_targets, 'ticket_created', 'ticket', new.id,
    'Novo chamado #' || new.ticket_number || ' — ' || coalesce(new.title, ''),
    coalesce(v_who, 'Alguém') || ' abriu um chamado' ||
      case when new.assigned_to is not null then ' atribuído a você.' else ' para a sua equipe.' end,
    new.requester_id
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_on_ticket_created on public.tickets;
create trigger trg_notify_on_ticket_created
  after insert on public.tickets
  for each row execute function public.notify_on_ticket_created();

-- ───────────────────────────────────────────────────────────────────────────
-- Resposta pública no chamado → o outro lado
--   solicitante escreve  → responsável (senão equipe do módulo)
--   qualquer outro escreve → solicitante e responsável
-- Comentário interno não avisa ninguém: os comentários automáticos de
-- assumir/transferir/mudar status são internos e já têm aviso próprio no
-- front (useTicketActions), então não há aviso em dobro.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.notify_on_ticket_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t         record;
  v_targets uuid[];
  v_author  text;
  v_title   text;
begin
  if coalesce(new.is_internal, false) then
    return new;
  end if;

  select id, tenant_id, ticket_number, requester_id, assigned_to, module
    into t
    from public.tickets
   where id = new.ticket_id;

  if t.id is null then
    return new;
  end if;

  select full_name into v_author from public.profiles where id = new.author_id;

  if new.author_id = t.requester_id then
    v_targets := case
      when t.assigned_to is not null then array[t.assigned_to]
      else public.notification_team(t.tenant_id, t.module)
    end;
    v_title := 'Solicitante respondeu — chamado #' || t.ticket_number;
  else
    v_targets := array[t.requester_id, t.assigned_to];
    v_title := 'Nova resposta no chamado #' || t.ticket_number;
  end if;

  perform public.notify_users(
    t.tenant_id, v_targets, 'ticket_reply', 'ticket', t.id,
    v_title,
    coalesce(v_author, 'Alguém') || ': ' || left(new.content, 160),
    new.author_id
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_on_ticket_comment on public.ticket_comments;
create trigger trg_notify_on_ticket_comment
  after insert on public.ticket_comments
  for each row execute function public.notify_on_ticket_comment();

-- ───────────────────────────────────────────────────────────────────────────
-- Pedido de compra → equipe do Financeiro (quem aprova)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.notify_on_purchase_requested()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_who text;
begin
  select full_name into v_who from public.profiles where id = new.created_by;

  perform public.notify_users(
    new.tenant_id,
    public.notification_team(new.tenant_id, 'financeiro'),
    'purchase_requested', 'ticket', new.ticket_id,
    'Nova solicitação de compra — ' || coalesce(new.product_name, ''),
    coalesce(v_who, 'Alguém') || ' pediu aprovação' ||
      case when new.estimated_amount is not null
           then ' (estimado R$ ' || to_char(new.estimated_amount, 'FM999G999G990D00') || ').'
           else '.' end,
    new.created_by
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_on_purchase_requested on public.fin_purchase_requests;
create trigger trg_notify_on_purchase_requested
  after insert on public.fin_purchase_requests
  for each row execute function public.notify_on_purchase_requested();

-- ───────────────────────────────────────────────────────────────────────────
-- SAC: cliente abre → equipe de Qualidade; cliente avalia → responsável
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.notify_on_sac_ticket_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_users(
    new.tenant_id,
    case when new.assigned_to is not null
         then array[new.assigned_to]
         else public.notification_team(new.tenant_id, 'qualidade') end,
    'ticket_created', 'sac_ticket', new.id,
    'Novo SAC #' || new.ticket_number || ' — ' || coalesce(new.subject, ''),
    coalesce(new.customer_name, 'Um cliente') || ' abriu um atendimento.'
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_on_sac_ticket_created on public.sac_tickets;
create trigger trg_notify_on_sac_ticket_created
  after insert on public.sac_tickets
  for each row execute function public.notify_on_sac_ticket_created();

create or replace function public.notify_on_sac_customer_rated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.satisfaction_rating is null or new.satisfaction_rating is not distinct from old.satisfaction_rating then
    return new;
  end if;

  perform public.notify_users(
    new.tenant_id,
    case when new.assigned_to is not null
         then array[new.assigned_to]
         else public.notification_team(new.tenant_id, 'qualidade') end,
    'sac_customer_rated', 'sac_ticket', new.id,
    'Cliente avaliou — SAC #' || new.ticket_number,
    coalesce(new.customer_name, 'O cliente') || ' deu nota ' || new.satisfaction_rating || '/5' ||
      case when new.satisfaction_comment is not null and new.satisfaction_comment <> ''
           then ': ' || left(new.satisfaction_comment, 140) else '.' end
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_on_sac_customer_rated on public.sac_tickets;
create trigger trg_notify_on_sac_customer_rated
  after update of satisfaction_rating on public.sac_tickets
  for each row execute function public.notify_on_sac_customer_rated();

-- ───────────────────────────────────────────────────────────────────────────
-- RH: holerite e documento no cofre → o colaborador
-- (reference_type 'rh_request' leva o sino a /meu-rh)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.notify_on_rh_document()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'rh_payslips' then
    perform public.notify_users(
      new.tenant_id, array[new.user_id], 'document_available', 'rh_request', new.id,
      'Holerite disponível — ' || to_char(new.reference_month, 'MM/YYYY'),
      'Seu holerite já está em "Meu RH".'
    );
  else
    perform public.notify_users(
      new.tenant_id, array[new.user_id], 'document_available', 'rh_request', new.id,
      'Documento no cofre — ' || coalesce(new.title, ''),
      'O RH arquivou um documento seu em "Meu RH".',
      new.uploaded_by
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_on_rh_payslip on public.rh_payslips;
create trigger trg_notify_on_rh_payslip
  after insert on public.rh_payslips
  for each row execute function public.notify_on_rh_document();

drop trigger if exists trg_notify_on_rh_document on public.rh_documents;
create trigger trg_notify_on_rh_document
  after insert on public.rh_documents
  for each row execute function public.notify_on_rh_document();

-- ───────────────────────────────────────────────────────────────────────────
-- Função morta: gravava reference_type 'ugc' numa tabela que não existe mais.
-- ───────────────────────────────────────────────────────────────────────────
drop function if exists public.notify_ugc_status_change();

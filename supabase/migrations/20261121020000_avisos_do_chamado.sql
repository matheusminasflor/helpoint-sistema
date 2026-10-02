-- AVISOS DAS MOVIMENTAÇÕES DO CHAMADO — sino, Home, Lyra e e-mail (decisão do dono, 2026-10-02).
--
-- O dono: informar automaticamente os envolvidos quando o chamado é criado, atribuído, respondido,
-- transferido, alterado, aguarda retorno, é resolvido ou encerrado — respeitando permissões e sem
-- aviso duplicado. Antes desta migration o banco só avisava "criado" e "resposta pública"; assumir,
-- transferir e mudar status eram avisados pela TELA (`useTicketActions.ts`), e mudar de setor ou de
-- prioridade não avisava ninguém. Agora tudo nasce aqui, num ponto de entrada só.
--
-- Decisões (múltipla escolha):
--   1. quem recebe: solicitante + atendente + mencionados; a equipe do setor só quando o chamado
--      chega SEM atendente (criado, ou transferido de setor). Quem fez a ação não recebe. Só quem
--      pode ver o chamado; nota interna nunca vai ao solicitante;
--   2. e-mail só no que pede ação: atribuído a você, respondido, aguardando seu retorno, resolvido,
--      encerrado. Vários avisos do mesmo chamado em poucos minutos viram um e-mail;
--   3. a Home (bloco "Lyra avisa") e o resumo da Lyra leem estes mesmos avisos — nada novo aqui;
--   4. cada pessoa desliga o e-mail no perfil (`profiles.receber_email_chamados`).

-- ─── 1. A preferência e a fila de e-mail ──────────────────────────────────────
alter table public.profiles
  add column if not exists receber_email_chamados boolean not null default true;

-- `email_sent` passa a ser a fila: FALSE = há e-mail a mandar. Por isso o padrão vira TRUE — só o
-- `notify_ticket` abaixo pede e-mail, e de propósito. E nada antigo dispara para trás.
alter table public.notifications alter column email_sent set default true;
update public.notifications set email_sent = true where email_sent is distinct from true;

create index if not exists notifications_email_pendente
  on public.notifications (created_at) where email_sent = false;
create index if not exists notifications_por_referencia
  on public.notifications (user_id, reference_id, type, created_at desc);

-- ─── 2. Pode ver o chamado — perguntado sobre OUTRA pessoa ────────────────────
-- O espelho da policy de SELECT de `tickets` (20261030010000) e de `modulos_de_chamado_visiveis`
-- (20261119010000), mas para um `p_user` qualquer: aquelas leem `auth.uid()`, e o aviso é decidido
-- para quem RECEBE. ponytail: a regra de setor está escrita aqui e lá; não chamei a outra porque ela
-- é lida pela asserção 14 de `chamado_e_do_modulo_dele` (o mapa de módulos); se a regra de
-- visibilidade mudar, mudar nos dois — `chamado_avisa_as_movimentacoes.test.sql` acusa a divergência
-- do caso "colega do setor sem ver todos".
create or replace function public.pode_ver_chamado(
  p_user uuid, p_tenant uuid, p_module text, p_requester uuid, p_assigned uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  with c as (select case p_module when 'tickets' then 'ti' else coalesce(p_module, 'ti') end as concessao)
  select p_user is not null
     and exists (select 1 from public.profiles p
                  where p.id = p_user and p.tenant_id = p_tenant and coalesce(p.is_active, true))
     and (p_user = p_requester
          or p_user = p_assigned
          or public.is_supervisor_or_higher(p_user)
          or exists (select 1 from public.user_module_access uma
                      where uma.user_id = p_user and uma.module = 'diretoria')
          or exists (select 1 from public.user_module_access uma, c
                      where uma.user_id = p_user and uma.module = c.concessao
                        and (c.concessao = 'compras'
                             or coalesce(public.tem_permissao(p_user, c.concessao, 'tickets', 'view_all'), false))));
$$;
revoke all on function public.pode_ver_chamado(uuid, uuid, text, uuid, uuid) from public, anon, authenticated;

-- A equipe que recebe o chamado sem atendente: quem tem o setor E vê a fila dele. Se ninguém da
-- equipe vê (perfil sem "ver todos"), cai em dono/administrador/gestor — chamado novo não pode
-- nascer sem ninguém avisado. `notification_team` fica como está: o SAC e outros a usam.
create or replace function public.equipe_do_chamado(p_tenant uuid, p_module text)
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $$
  with quem_ve as (
    select array_agg(u) as ids
      from unnest(public.notification_team(p_tenant, p_module)) as u
     where public.pode_ver_chamado(u, p_tenant, p_module, null, null)
  )
  select coalesce(
    (select ids from quem_ve),
    (select array_agg(distinct p.id) from public.profiles p
       join public.user_roles r on r.user_id = p.id and r.role in ('owner', 'admin', 'manager')
      where p.tenant_id = p_tenant and coalesce(p.is_active, true)),
    '{}'::uuid[]);
$$;
revoke all on function public.equipe_do_chamado(uuid, text) from public, anon, authenticated;

-- ─── 3. O ponto de entrada de todo aviso de chamado ───────────────────────────
-- Tira nulos, o autor da ação (`auth.uid()`) e `p_exclude`; filtra por quem pode ver; e DEDUPLICA:
-- se a pessoa já tem aviso do mesmo tipo para o mesmo chamado nos últimos 2 minutos, atualiza
-- esse (texto novo, volta a "não lido") em vez de criar outro.
create or replace function public.notify_ticket(
  p_ticket uuid, p_type public.notification_type, p_users uuid[], p_title text, p_message text,
  p_com_email boolean default false, p_exclude uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t public.tickets%rowtype;
  v_u uuid;
begin
  select * into t from public.tickets where id = p_ticket;
  if t.id is null then
    return;
  end if;
  for v_u in
    select distinct u from unnest(coalesce(p_users, '{}'::uuid[])) as u
     where u is not null and u is distinct from auth.uid() and u is distinct from p_exclude
  loop
    continue when not public.pode_ver_chamado(v_u, t.tenant_id, t.module, t.requester_id, t.assigned_to);
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
revoke all on function public.notify_ticket(uuid, public.notification_type, uuid[], text, text, boolean, uuid)
  from public, anon, authenticated;

-- `notify_users` é a porta antiga (automação, SAC, compras…). A automação que atribui chamado faz
-- o UPDATE — que este trigger já avisa — e logo depois chama `notify_users` com o mesmo
-- `ticket_assigned`. A mesma deduplicação vale aqui para referência de chamado. (`create or replace`
-- preserva a ACL, que é só de funções do banco.)
create or replace function public.notify_users(
  p_tenant uuid, p_users uuid[], p_type public.notification_type, p_ref_type text, p_ref_id uuid,
  p_title text, p_message text, p_exclude uuid default null)
returns void
language sql
security definer
set search_path to 'public'
as $$
  insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
  select p_tenant, u, p_type, p_ref_type, p_ref_id, p_title, p_message
    from unnest(coalesce(p_users, '{}'::uuid[])) as u
   where u is not null
     and u is distinct from p_exclude
     and not (p_ref_type = 'ticket' and exists (
           select 1 from public.notifications n
            where n.user_id = u and n.reference_type = 'ticket' and n.reference_id = p_ref_id
              and n.type = p_type and n.created_at > now() - interval '2 minutes'));
$$;

-- Nome do setor para o texto do aviso.
create or replace function public.nome_do_setor_do_chamado(p_module text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case p_module
    when 'tickets' then 'TI' when 'marketing' then 'Marketing' when 'qualidade' then 'Qualidade'
    when 'rh' then 'RH' when 'financeiro' then 'Financeiro' when 'comercial' then 'Comercial'
    when 'educacional' then 'Educacional' when 'compras' then 'Compras' else coalesce(p_module, 'outro setor') end;
$$;
revoke all on function public.nome_do_setor_do_chamado(text) from public, anon;
grant execute on function public.nome_do_setor_do_chamado(text) to authenticated;

-- ─── 4. Criado ────────────────────────────────────────────────────────────────
create or replace function public.notify_on_ticket_created()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_who text;
begin
  select full_name into v_who from public.profiles where id = new.requester_id;
  perform public.notify_ticket(
    new.id, 'ticket_created',
    case when new.assigned_to is not null then array[new.assigned_to]
         else public.equipe_do_chamado(new.tenant_id, new.module) end,
    'Chamado #' || new.ticket_number || ' foi criado.',
    coalesce(v_who, 'Alguém') || ' abriu "' || coalesce(new.title, '') || '"' ||
      case when new.assigned_to is not null then ' e atribuiu a você.' else ' para a sua equipe.' end,
    false, new.requester_id);
  return new;
end;
$$;

-- ─── 5. Respondido (comentário público; a nota interna não avisa ninguém) ─────
create or replace function public.notify_on_ticket_comment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t record;
  v_author text;
  v_targets uuid[];
begin
  if coalesce(new.is_internal, false) then
    return new;
  end if;
  select id, tenant_id, ticket_number, requester_id, assigned_to, module into t
    from public.tickets where id = new.ticket_id;
  if t.id is null then
    return new;
  end if;
  select full_name into v_author from public.profiles where id = new.author_id;

  if new.author_id = t.requester_id then
    v_targets := case when t.assigned_to is not null then array[t.assigned_to]
                      else public.equipe_do_chamado(t.tenant_id, t.module) end;
  else
    v_targets := array[t.requester_id, t.assigned_to];
  end if;
  -- Os mencionados no chamado também acompanham as respostas.
  v_targets := v_targets || coalesce((select array_agg(distinct m.mentioned_user_id)
                                        from public.ticket_mentions m where m.ticket_id = t.id), '{}'::uuid[]);

  perform public.notify_ticket(
    t.id, 'ticket_reply', v_targets,
    'Chamado #' || t.ticket_number || ' foi respondido.',
    coalesce(v_author, 'Alguém') || ': ' || left(new.content, 160),
    true, new.author_id);
  return new;
end;
$$;

-- ─── 6. Atribuído, transferido, aguardando, resolvido, encerrado, alterado ────
-- UM aviso por UPDATE: assumir muda atendente E status no mesmo comando, e três avisos de um
-- clique seria o barulho que o dono pediu para evitar. Vale o evento mais importante:
-- encerrado > resolvido > aguardando retorno > transferido de setor > atribuído > alterado.
create or replace function public.notify_on_ticket_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_n text := '#' || new.ticket_number;
  v_quem text;
  v_status text;
begin
  v_status := case new.status::text
    when 'open' then 'Aberto' when 'in_progress' then 'Em andamento'
    when 'waiting_user' then 'Aguardando retorno' when 'waiting_parts' then 'Pendente'
    when 'resolved' then 'Resolvido' when 'closed' then 'Encerrado'
    when 'cancelled' then 'Cancelado' when 'rejected' then 'Reprovado' else new.status::text end;

  if new.status is distinct from old.status and new.status::text = 'closed' then
    perform public.notify_ticket(new.id, 'ticket_closed', array[new.requester_id, new.assigned_to],
      'Chamado ' || v_n || ' foi encerrado.', coalesce(new.title, ''), true);

  elsif new.status is distinct from old.status and new.status::text = 'resolved' then
    perform public.notify_ticket(new.id, 'ticket_resolved', array[new.requester_id, new.assigned_to],
      'Chamado ' || v_n || ' foi resolvido.',
      coalesce(nullif(btrim(new.resolution_notes), ''), coalesce(new.title, '')), true);

  elsif new.status is distinct from old.status and new.status::text = 'waiting_user' then
    perform public.notify_ticket(new.id, 'ticket_waiting', array[new.requester_id],
      'Chamado ' || v_n || ' aguarda seu retorno.', coalesce(new.title, ''), true);

  elsif new.module is distinct from old.module then
    perform public.notify_ticket(new.id, 'ticket_transferred',
      array[new.requester_id] || case when new.assigned_to is not null then array[new.assigned_to]
                                      else public.equipe_do_chamado(new.tenant_id, new.module) end,
      'Chamado ' || v_n || ' foi transferido para ' || public.nome_do_setor_do_chamado(new.module) || '.',
      coalesce(new.title, ''), false);

  elsif new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null then
    select full_name into v_quem from public.profiles where id = new.assigned_to;
    perform public.notify_ticket(new.id, 'ticket_assigned', array[new.assigned_to],
      'Chamado ' || v_n || ' foi atribuído a você.', coalesce(new.title, ''), true);
    perform public.notify_ticket(new.id, 'ticket_assigned', array[new.requester_id],
      'Chamado ' || v_n || ' agora é atendido por ' || coalesce(v_quem, 'outra pessoa') || '.',
      coalesce(new.title, ''), false, new.assigned_to);

  elsif new.status is distinct from old.status
     or new.priority is distinct from old.priority
     or new.due_date is distinct from old.due_date
     or new.title is distinct from old.title
     or new.asset_id is distinct from old.asset_id
     or new.category is distinct from old.category
     or new.assigned_to is distinct from old.assigned_to then
    perform public.notify_ticket(new.id, 'ticket_updated', array[new.requester_id, new.assigned_to],
      'Chamado ' || v_n || ' foi alterado.',
      concat_ws(' · ',
        case when new.status is distinct from old.status then 'status: ' || v_status end,
        case when new.priority is distinct from old.priority then 'prioridade: ' ||
          case new.priority::text when 'low' then 'Baixa' when 'medium' then 'Média' when 'high' then 'Alta'
                                  when 'critical' then 'Crítica' else new.priority::text end end,
        case when new.due_date is distinct from old.due_date then 'prazo alterado' end,
        case when new.title is distinct from old.title then 'título alterado' end,
        case when new.asset_id is distinct from old.asset_id then 'equipamento trocado' end,
        case when new.category is distinct from old.category then 'categoria alterada' end,
        case when new.assigned_to is distinct from old.assigned_to then 'sem atendente' end),
      false);
  end if;
  return null;
end;
$$;
revoke all on function public.notify_on_ticket_change() from public, anon;

drop trigger if exists trg_notify_on_ticket_change on public.tickets;
create trigger trg_notify_on_ticket_change
  after update of status, assigned_to, module, priority, due_date, title, asset_id, category
  on public.tickets
  for each row execute function public.notify_on_ticket_change();

-- ─── 7. A fila de e-mail, lida pela edge function `chamado-avisos-email` ──────
-- Agrupa por pessoa + chamado; o grupo sai quando o aviso MAIS ANTIGO dele tem `p_idade` (1 min) —
-- a janela que junta "respondido" e "aguarda seu retorno" do mesmo minuto num e-mail só.
-- Quem desligou o e-mail no perfil tem a fila esvaziada; o que passou de 24h desiste.
create or replace function public.chamado_emails_pendentes(p_limit int default 50, p_idade interval default '1 minute')
returns table (user_id uuid, email text, nome text, ticket_id uuid, ticket_number int, ticket_title text,
               ids uuid[], titulos text[])
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.notifications n set email_sent = true
   where n.email_sent = false and n.reference_type = 'ticket'
     and (n.created_at < now() - interval '24 hours'
          or exists (select 1 from public.profiles p where p.id = n.user_id
                      and (not p.receber_email_chamados or p.email is null or not coalesce(p.is_active, true))));

  return query
  select n.user_id, p.email, p.full_name, t.id, t.ticket_number, t.title,
         array_agg(n.id order by n.created_at), array_agg(n.title order by n.created_at)
    from public.notifications n
    join public.profiles p on p.id = n.user_id
    join public.tickets t on t.id = n.reference_id
   where n.email_sent = false and n.reference_type = 'ticket'
   group by n.user_id, p.email, p.full_name, t.id, t.ticket_number, t.title
  having min(n.created_at) <= now() - p_idade
   order by min(n.created_at)
   limit p_limit;
end;
$$;

create or replace function public.chamado_emails_enviados(p_ids uuid[])
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.notifications set email_sent = true where id = any (coalesce(p_ids, '{}'::uuid[]));
$$;

revoke all on function public.chamado_emails_pendentes(int, interval) from public, anon, authenticated;
revoke all on function public.chamado_emails_enviados(uuid[]) from public, anon, authenticated;
grant execute on function public.chamado_emails_pendentes(int, interval) to service_role;
grant execute on function public.chamado_emails_enviados(uuid[]) to service_role;

-- ─── 8. O robô que manda os e-mails, a cada minuto ────────────────────────────
-- Mesmo padrão de `20260907010000_cron_jobs_via_vault.sql`: URL e chave do Vault.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'chamado-emails-1min') then
    perform cron.unschedule('chamado-emails-1min');
  end if;
end $$;

select cron.schedule(
  'chamado-emails-1min',
  '* * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/chamado-avisos-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_service_role_key')
    ),
    body := jsonb_build_object('source', 'cron')
  ) as request_id;
  $job$
);

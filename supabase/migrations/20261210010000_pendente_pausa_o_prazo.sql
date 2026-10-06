-- RESPONDER PÕE EM "PENDENTE" E O PRAZO PAUSA ENQUANTO ESPERA O SOLICITANTE
-- (decisões do dono, 2026-10-06 — as recomendadas, padrão de mercado: Zendesk/Freshdesk/Jira/Movidesk).
--
-- 1. Resposta PÚBLICA de quem atende (autor ≠ solicitante; nota interna não conta) num chamado
--    aberto ou em andamento → o status vira `waiting_user` ("Pendente"). Exceção: a marcação
--    "Continuo trabalhando nele" na caixa de resposta (`ticket_comments.mantem_status`).
--    O solicitante recebe UM aviso: o "foi respondido" já existente vira "foi respondido e aguarda
--    seu retorno." — a troca de status feita pela resposta não gera um segundo aviso.
-- 2. Resposta do SOLICITANTE num chamado pendente → volta para `in_progress`. O atendente já é
--    avisado pelo "foi respondido"; a troca de status também não gera aviso próprio.
-- 3. Enquanto `waiting_user`, o prazo de RESOLUÇÃO não corre: ao sair de pendente, `sla_due_at` é
--    empurrado pelos minutos ÚTEIS (expediente do setor, feriados, almoço do atendente) que ficou
--    parado. O prazo em minutos úteis é aditivo — somar N minutos ao vencimento dá o mesmo que
--    inserir N minutos de pausa no meio —, então empurrar o vencimento é exato.
--    DECISÃO: o prazo definido à mão também é empurrado — a espera é do solicitante, não da equipe,
--    seja qual for a origem do prazo. A primeira resposta não pausa (já foi respondida para chegar
--    a pendente). `minutos_pausados` guarda o total, para os Indicadores e para o recálculo de
--    `sla_segue_o_atendente` reconhecer um prazo padrão já empurrado.
-- 4. Chamado pendente não recebe aviso de prazo vencido (`avisar_prazo_vencido`) — a tela e o
--    `check-alerts` também o tratam como pausado.

-- ─── Colunas ─────────────────────────────────────────────────────────────────────────────────
alter table public.tickets
  add column if not exists pendente_desde timestamptz,
  add column if not exists minutos_pausados integer not null default 0;
comment on column public.tickets.pendente_desde is
  'Quando o chamado entrou em Pendente (waiting_user). Ao sair, o prazo é empurrado pelos minutos úteis parados.';
comment on column public.tickets.minutos_pausados is
  'Total de minutos ÚTEIS que o chamado passou em Pendente (o prazo de resolução já está empurrado por eles).';

alter table public.ticket_comments
  add column if not exists mantem_status boolean not null default false;
comment on column public.ticket_comments.mantem_status is
  '"Continuo trabalhando nele": a resposta pública da equipe NÃO põe o chamado em Pendente.';

-- ─── O calendário num lugar só ────────────────────────────────────────────────────────────────
-- Os trechos úteis de um dia (horário de parede de São Paulo): nada em fim de semana (salvo se
-- conta) e feriado; o expediente inteiro, ou antes e depois do almoço quando ele cai dentro.
-- Antes isto morava dentro de `somar_minutos_uteis`; contar minutos entre dois instantes precisa
-- do MESMO calendário, então ele sai para cá e as duas funções o usam.
create or replace function public.trechos_uteis_do_dia(
  p_dia date, p_inicio_exp time, p_fim_exp time, p_conta_fim_de_semana boolean, p_tenant uuid,
  p_almoco_inicio time, p_almoco_fim time)
returns table (de timestamp, ate timestamp)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_abre timestamp;
  v_fecha timestamp;
begin
  if not (coalesce(p_conta_fim_de_semana, false) or extract(isodow from p_dia) < 6)
     or exists (select 1 from public.feriados_nacionais(extract(year from p_dia)::int) n where n.data = p_dia)
     or exists (select 1 from public.feriados_da_empresa e where e.tenant_id = p_tenant and e.data = p_dia) then
    return;
  end if;
  v_abre  := p_dia + coalesce(p_inicio_exp, time '00:00');
  v_fecha := case when p_fim_exp is null then (p_dia + 1)::timestamp else p_dia + p_fim_exp end;
  if p_almoco_inicio is not null and p_almoco_fim is not null
     and p_dia + p_almoco_inicio < v_fecha and p_dia + p_almoco_fim > v_abre then
    de := v_abre; ate := least(p_dia + p_almoco_inicio, v_fecha); return next;
    de := greatest(p_dia + p_almoco_fim, v_abre); ate := v_fecha; return next;
  else
    de := v_abre; ate := v_fecha; return next;
  end if;
end;
$$;

-- Mesma assinatura e mesmo resultado de antes (`create or replace` mantém a ACL); só passa a ler o
-- calendário de `trechos_uteis_do_dia`.
create or replace function public.somar_minutos_uteis(
  p_inicio timestamptz, p_minutos integer, p_inicio_exp time, p_fim_exp time,
  p_conta_fim_de_semana boolean, p_tenant uuid, p_almoco_inicio time, p_almoco_fim time)
returns timestamptz
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_local timestamp := p_inicio at time zone 'America/Sao_Paulo';
  v_falta interval := make_interval(mins => greatest(coalesce(p_minutos, 0), 0));
  v_dia date;
  t record;
  v_voltas int := 0;
begin
  if p_inicio is null or p_minutos is null then
    return null;
  end if;
  loop
    v_dia := v_local::date;
    for t in select * from public.trechos_uteis_do_dia(v_dia, p_inicio_exp, p_fim_exp,
                p_conta_fim_de_semana, p_tenant, p_almoco_inicio, p_almoco_fim) loop
      if v_local < t.de then
        v_local := t.de;
      end if;
      if v_local < t.ate then
        if v_local + v_falta <= t.ate then
          return (v_local + v_falta) at time zone 'America/Sao_Paulo';
        end if;
        v_falta := v_falta - (t.ate - v_local);
        v_local := t.ate;
      end if;
    end loop;
    v_local := (v_dia + 1)::timestamp;
    -- Trava contra laço sem fim (ex.: um ano inteiro de feriados cadastrados).
    v_voltas := v_voltas + 1;
    if v_voltas > 3700 then
      raise exception 'Prazo não cabe em 10 anos de expediente.';
    end if;
  end loop;
end;
$$;

-- Quantos minutos ÚTEIS há entre dois instantes, no mesmo calendário.
create or replace function public.contar_minutos_uteis(
  p_de timestamptz, p_ate timestamptz, p_inicio_exp time, p_fim_exp time,
  p_conta_fim_de_semana boolean, p_tenant uuid, p_almoco_inicio time, p_almoco_fim time)
returns integer
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_de timestamp := p_de at time zone 'America/Sao_Paulo';
  v_ate timestamp := p_ate at time zone 'America/Sao_Paulo';
  v_dia date;
  v_total interval := interval '0';
  t record;
begin
  if p_de is null or p_ate is null or p_ate <= p_de then
    return 0;
  end if;
  if v_ate::date - v_de::date > 3700 then
    raise exception 'Intervalo maior que 10 anos.';
  end if;
  v_dia := v_de::date;
  while v_dia <= v_ate::date loop
    for t in select * from public.trechos_uteis_do_dia(v_dia, p_inicio_exp, p_fim_exp,
                p_conta_fim_de_semana, p_tenant, p_almoco_inicio, p_almoco_fim) loop
      if least(t.ate, v_ate) > greatest(t.de, v_de) then
        v_total := v_total + (least(t.ate, v_ate) - greatest(t.de, v_de));
      end if;
    end loop;
    v_dia := v_dia + 1;
  end loop;
  return floor(extract(epoch from v_total) / 60)::int;
end;
$$;

-- O calendário de um chamado (regra do setor ou padrão, e o almoço do atendente), num lugar só.
create or replace function public.calendario_do_chamado(p_tenant uuid, p_module text, p_atendente uuid)
returns table (inicio_exp time, fim_exp time, conta_fim_de_semana boolean, almoco_inicio time, almoco_fim time)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  r public.sla_regras_do_setor%rowtype;
  p record;
begin
  select e.inicio_almoco, e.fim_almoco into almoco_inicio, almoco_fim
    from public.rh_employee_profiles e
   where p_atendente is not null and e.user_id = p_atendente and e.tenant_id = p_tenant
   limit 1;
  select * into r from public.sla_regras_do_setor where tenant_id = p_tenant and module = p_module;
  if not found then
    select * into p from public.expediente_padrao(p_module);
    inicio_exp := p.inicio; fim_exp := p.fim; conta_fim_de_semana := false;
  else
    inicio_exp := r.inicio_expediente; fim_exp := r.fim_expediente;
    conta_fim_de_semana := not r.pausa_fim_de_semana;
  end if;
  return next;
end;
$$;

-- Mesma assinatura; o calendário vem de `calendario_do_chamado`.
create or replace function public.prazo_do_chamado(
  p_tenant uuid, p_module text, p_inicio timestamptz, p_minutos integer, p_atendente uuid)
returns timestamptz
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.somar_minutos_uteis(p_inicio, p_minutos, c.inicio_exp, c.fim_exp,
                                    c.conta_fim_de_semana, p_tenant, c.almoco_inicio, c.almoco_fim)
    from public.calendario_do_chamado(p_tenant, p_module, p_atendente) c;
$$;

create or replace function public.minutos_uteis_do_chamado(
  p_tenant uuid, p_module text, p_de timestamptz, p_ate timestamptz, p_atendente uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.contar_minutos_uteis(p_de, p_ate, c.inicio_exp, c.fim_exp,
                                     c.conta_fim_de_semana, p_tenant, c.almoco_inicio, c.almoco_fim)
    from public.calendario_do_chamado(p_tenant, p_module, p_atendente) c;
$$;

revoke all on function public.trechos_uteis_do_dia(date, time, time, boolean, uuid, time, time) from public, anon, authenticated;
revoke all on function public.contar_minutos_uteis(timestamptz, timestamptz, time, time, boolean, uuid, time, time) from public, anon, authenticated;
revoke all on function public.calendario_do_chamado(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.minutos_uteis_do_chamado(uuid, text, timestamptz, timestamptz, uuid) from public, anon, authenticated;

-- ─── A pausa ──────────────────────────────────────────────────────────────────────────────────
-- BEFORE UPDATE. O nome ordena ANTES de `trg_sla_segue_o_atendente`: quando este empurra o prazo,
-- aquele vê `sla_due_at` mudado no mesmo comando e não mexe.
create or replace function public.chamado_pausa_em_pendente()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_parado integer;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status::text = 'waiting_user' then
    new.pendente_desde := now();
    return new;
  end if;
  if old.status::text = 'waiting_user' and old.pendente_desde is not null then
    v_parado := coalesce(public.minutos_uteis_do_chamado(new.tenant_id, new.module, old.pendente_desde, now(),
                                                         new.assigned_to), 0);
    new.pendente_desde := null;
    if v_parado > 0 then
      new.minutos_pausados := old.minutos_pausados + v_parado;
      if new.sla_due_at is not distinct from old.sla_due_at and new.sla_due_at is not null then
        new.sla_due_at := public.prazo_do_chamado(new.tenant_id, new.module, old.sla_due_at, v_parado,
                                                  new.assigned_to);
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.chamado_pausa_em_pendente() from public, anon, authenticated;

drop trigger if exists trg_chamado_pausa_em_pendente on public.tickets;
create trigger trg_chamado_pausa_em_pendente
  before update on public.tickets
  for each row execute function public.chamado_pausa_em_pendente();

-- O prazo padrão de um chamado já com as pausas somadas (o vencimento é aditivo em minutos úteis).
create or replace function public.prazo_padrao_com_pausa(
  p_tenant uuid, p_module text, p_priority text, p_inicio timestamptz, p_atendente uuid,
  p_due_date timestamptz, p_minutos_pausados integer)
returns timestamptz
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when coalesce(p_minutos_pausados, 0) > 0
              then public.prazo_do_chamado(p_tenant, p_module, x.prazo, p_minutos_pausados, p_atendente)
              else x.prazo end
    from (select public.prazo_padrao_do_chamado(p_tenant, p_module, p_priority, p_inicio, p_atendente, p_due_date) as prazo) x;
$$;
revoke all on function public.prazo_padrao_com_pausa(uuid, text, text, timestamptz, uuid, timestamptz, integer) from public, anon, authenticated;

-- Trocar o atendente recalcula o prazo padrão — agora contando as pausas já vividas, para um
-- prazo empurrado pela pausa não ser confundido com prazo posto à mão. Resto igual a 20261207010000.
create or replace function public.sla_segue_o_atendente()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_prazo timestamptz;
begin
  if new.assigned_to is not distinct from old.assigned_to
     or new.status::text in ('resolved', 'closed', 'cancelled', 'rejected') then
    return new;
  end if;

  if new.first_response_at is null
     and new.first_response_due_at is not distinct from old.first_response_due_at then
    new.first_response_due_at := coalesce(
      public.prazo_da_primeira_resposta(new.tenant_id, new.module, new.priority::text, new.created_at, new.assigned_to),
      new.first_response_due_at);
  end if;

  if old.sla_due_at is null or new.sla_due_at is distinct from old.sla_due_at then
    return new;
  end if;
  -- O prazo de antes foi posto à mão? Então fica.
  if old.sla_due_at is distinct from public.prazo_padrao_com_pausa(
       old.tenant_id, old.module, old.priority::text, old.created_at, old.assigned_to, old.due_date,
       old.minutos_pausados) then
    return new;
  end if;
  v_prazo := public.prazo_padrao_com_pausa(new.tenant_id, new.module, new.priority::text,
                                           new.created_at, new.assigned_to, new.due_date,
                                           new.minutos_pausados);
  if v_prazo is not null then
    new.sla_due_at := v_prazo;
  end if;
  return new;
end;
$function$;

-- ─── O status pela resposta ───────────────────────────────────────────────────────────────────
-- AFTER INSERT em `ticket_comments`. O nome ordena depois de `trg_chamado_registra_primeira_resposta`
-- e antes de `trg_notify_on_ticket_comment` — o aviso da resposta já enxerga o status novo.
-- `security definer`: o solicitante não tem UPDATE em `tickets`; a mudança é do sistema, e a guarda
-- do perfil deixa passar (current_user não é `authenticated` aqui dentro).
create or replace function public.chamado_status_pela_resposta()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t record;
  v_novo text;
begin
  if coalesce(new.is_internal, false) or new.author_id is null then
    return null;
  end if;
  select id, status::text as status, requester_id into t from public.tickets where id = new.ticket_id;
  if t.id is null then
    return null;
  end if;
  if new.author_id = t.requester_id then
    if t.status = 'waiting_user' then
      v_novo := 'in_progress';
    end if;
  elsif not coalesce(new.mantem_status, false) and t.status in ('open', 'in_progress') then
    v_novo := 'waiting_user';
  end if;
  if v_novo is null then
    return null;
  end if;
  -- O aviso desta troca é o da própria resposta (`notify_on_ticket_comment`); o de "mudou o
  -- status" fica calado só neste chamado, só neste comando.
  perform set_config('helpoint.status_pela_resposta', t.id::text, true);
  update public.tickets set status = v_novo::ticket_status where id = t.id;
  perform set_config('helpoint.status_pela_resposta', '', true);
  return null;
end;
$$;
revoke all on function public.chamado_status_pela_resposta() from public, anon, authenticated;

drop trigger if exists trg_chamado_status_pela_resposta on public.ticket_comments;
create trigger trg_chamado_status_pela_resposta
  after insert on public.ticket_comments
  for each row execute function public.chamado_status_pela_resposta();

-- O aviso de mudança cala quando a mudança veio da resposta (ela já avisou). Resto igual.
create or replace function public.notify_on_ticket_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_n text := '#' || new.ticket_number;
  v_quem text;
  v_status text;
  v_menc uuid[];
begin
  if new.status is distinct from old.status
     and current_setting('helpoint.status_pela_resposta', true) = new.id::text then
    return null;
  end if;
  v_menc := public.mencionados_do_chamado(new.id);
  v_status := case new.status::text
    when 'open' then 'Aberto' when 'in_progress' then 'Em andamento'
    when 'waiting_user' then 'Pendente' when 'waiting_parts' then 'Pendente'
    when 'resolved' then 'Resolvido' when 'closed' then 'Encerrado'
    when 'cancelled' then 'Cancelado' when 'rejected' then 'Reprovado' else new.status::text end;
  if new.status is distinct from old.status and new.status::text = 'closed' then
    perform public.notify_ticket(new.id, 'ticket_closed', array[new.requester_id, new.assigned_to] || v_menc,
      'Chamado ' || v_n || ' foi encerrado.', coalesce(new.title, ''), true);
  elsif new.status is distinct from old.status and new.status::text = 'resolved' then
    perform public.notify_ticket(new.id, 'ticket_resolved', array[new.requester_id, new.assigned_to] || v_menc,
      'Chamado ' || v_n || ' foi resolvido.',
      coalesce(nullif(btrim(new.resolution_notes), ''), coalesce(new.title, '')), true);
  elsif new.status is distinct from old.status and new.status::text = 'waiting_user' then
    perform public.notify_ticket(new.id, 'ticket_waiting', array[new.requester_id],
      'Chamado ' || v_n || ' aguarda seu retorno.', coalesce(new.title, ''), true);
  elsif new.module = 'compras' and new.status is distinct from old.status
        and new.status::text in ('in_progress', 'rejected')
        and new.assigned_to is not distinct from old.assigned_to then
    perform public.notify_ticket(new.id, 'purchase_decided', array[new.requester_id, new.assigned_to] || v_menc,
      case new.status::text when 'rejected' then 'A compra do chamado ' || v_n || ' foi reprovada.'
                            else 'A compra do chamado ' || v_n || ' foi aprovada.' end,
      coalesce(nullif(btrim(new.resolution_notes), ''), coalesce(new.title, '')), false);
  elsif new.module is distinct from old.module then
    perform public.notify_ticket(new.id, 'ticket_transferred',
      array[new.requester_id] || v_menc
        || case when new.assigned_to is not null then array[new.assigned_to]
                else public.equipe_do_chamado(new.tenant_id, new.module) end,
      'Chamado ' || v_n || ' foi transferido para ' || public.nome_do_setor_do_chamado(new.module) || '.',
      coalesce(new.title, ''), false);
  elsif new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null
        and old.assigned_to is not null and new.assigned_to is distinct from auth.uid() then
    select full_name into v_quem from public.profiles where id = new.assigned_to;
    perform public.notify_ticket(new.id, 'ticket_transferred', array[new.assigned_to],
      'Chamado ' || v_n || ' foi transferido para você.', coalesce(new.title, ''), true);
    perform public.notify_ticket(new.id, 'ticket_transferred', array[new.requester_id] || v_menc,
      'Chamado ' || v_n || ' foi transferido para ' || coalesce(v_quem, 'outra pessoa') || '.',
      coalesce(new.title, ''), false, new.assigned_to);
  elsif new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null then
    select full_name into v_quem from public.profiles where id = new.assigned_to;
    perform public.notify_ticket(new.id, 'ticket_assigned', array[new.assigned_to],
      'Chamado ' || v_n || ' foi atribuído a você.', coalesce(new.title, ''), true);
    perform public.notify_ticket(new.id, 'ticket_assigned', array[new.requester_id] || v_menc,
      'Chamado ' || v_n || ' agora é atendido por ' || coalesce(v_quem, 'outra pessoa') || '.',
      coalesce(new.title, ''), false, new.assigned_to);
  elsif new.status is distinct from old.status
     or new.priority is distinct from old.priority
     or new.due_date is distinct from old.due_date
     or new.title is distinct from old.title
     or new.asset_id is distinct from old.asset_id
     or new.category is distinct from old.category
     or new.assigned_to is distinct from old.assigned_to then
    perform public.notify_ticket(new.id, 'ticket_updated', array[new.requester_id, new.assigned_to] || v_menc,
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
$function$;

-- A resposta da equipe que deixou o chamado pendente diz isso ao solicitante, no MESMO aviso.
-- Resto igual a 20261208010000.
create or replace function public.notify_on_ticket_comment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t record;
  v_author text;
  v_targets uuid[];
begin
  select id, tenant_id, ticket_number, requester_id, assigned_to, module, status::text as status into t
    from public.tickets where id = new.ticket_id;
  if t.id is null then
    return new;
  end if;
  select full_name into v_author from public.profiles where id = new.author_id;
  if coalesce(new.is_internal, false) then
    perform public.notify_ticket(
      t.id, 'ticket_reply',
      array_remove(array[t.assigned_to] || public.mencionados_do_chamado(t.id), new.author_id),
      'Chamado #' || t.ticket_number || ' recebeu uma nota interna.',
      coalesce(v_author, 'Alguém') || ': ' || left(new.content, 160),
      true, t.requester_id);
    return new;
  end if;
  if new.author_id = t.requester_id then
    v_targets := case when t.assigned_to is not null then array[t.assigned_to]
                      else public.equipe_do_chamado(t.tenant_id, t.module) end;
  else
    v_targets := array[t.requester_id, t.assigned_to];
  end if;
  perform public.notify_ticket(
    t.id, 'ticket_reply', v_targets || public.mencionados_do_chamado(t.id),
    'Chamado #' || t.ticket_number ||
      case when new.author_id is distinct from t.requester_id and t.status = 'waiting_user'
           then ' foi respondido e aguarda seu retorno.' else ' foi respondido.' end,
    coalesce(v_author, 'Alguém') || ': ' || left(new.content, 160),
    true, new.author_id);
  return new;
end;
$function$;

-- ─── Pendente não vence ───────────────────────────────────────────────────────────────────────
-- Mesma assinatura (ACL mantida); só não avisa chamado pausado.
create or replace function public.avisar_prazo_vencido(p_ticket uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t public.tickets%rowtype;
  v_n integer;
begin
  select * into t from public.tickets where id = p_ticket;
  if t.id is null or t.status::text = 'waiting_user' then
    return 0;
  end if;
  insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
  select t.tenant_id, u, 'deadline_expired', 'ticket', t.id,
         'Prazo vencido - Chamado #' || t.ticket_number,
         case when t.assigned_to is not null
              then 'O chamado "' || coalesce(t.title, '') || '" passou do prazo e precisa de ação.'
              else 'O chamado "' || coalesce(t.title, '') || '" passou do prazo sem atendente. Verifique.' end
    from unnest(public.avisados_do_prazo(p_ticket, true)) as u
   where not exists (select 1 from public.notifications n
                      where n.user_id = u and n.reference_id = t.id and n.type = 'deadline_expired');
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

-- Quem já está pendente hoje começa a contar a pausa agora (não há como saber desde quando).
-- Arrumação de dado: a porta `helpoint.automation` impede fluxo de rodar por ela.
do $$
begin
  perform set_config('helpoint.automation', '1', true);
  update public.tickets set pendente_desde = now()
   where status::text = 'waiting_user' and pendente_desde is null;
  perform set_config('helpoint.automation', '0', true);
end $$;

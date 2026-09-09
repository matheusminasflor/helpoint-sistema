-- Leva L2 (Fase 3): motor de automação, regras simples — 2026-09-09.
--
-- "Quando [algo acontece] → então [faça isto]", por módulo, configurado na
-- tela e executado no banco. Decisões do dono (2026-09-08):
--
--   Gatilhos: chamado aberto; chamado muda de status; prazo do chamado
--             estourou; dia/hora marcados.
--   Ações:    avisar (pessoa ou equipe de um módulo); abrir chamado; criar
--             tarefa; atribuir o chamado; mudar a prioridade.
--   Quem edita: owner/admin/manager. Quem tem o módulo só vê.
--   Histórico: só "última execução" e "último erro" na própria regra.
--
-- Uma regra = um gatilho + uma ação. Duas ações = duas regras.
--
-- Por que no banco e não numa edge function: os gatilhos de chamado já são
-- triggers (o chamado nasce por tela, por RH, por desligamento e por robô —
-- o trigger cobre todos); o agendado e o prazo rodam num cron SQL puro, sem
-- HTTP, sem segredo. É a mesma casa das notificações (20260908020000), e
-- reaproveita `notification_team()` e `notify_users()`.
--
-- Diagrama visual (estilo n8n), condições compostas, esperas e webhooks
-- ficam para a L10 — de propósito.

-- ───────────────────────────────────────────────────────────────────────────
-- Tipo de aviso próprio, para o sino distinguir "uma regra sua disparou"
-- ───────────────────────────────────────────────────────────────────────────
alter type public.notification_type add value if not exists 'automation';

-- ───────────────────────────────────────────────────────────────────────────
-- A regra
-- ───────────────────────────────────────────────────────────────────────────
create table public.automation_rules (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  -- mesmo domínio de `tickets.module` (tickets = TI)
  module         text not null check (module in ('tickets', 'marketing', 'qualidade', 'rh', 'financeiro')),
  name           text not null check (length(trim(name)) between 1 and 120),
  is_active      boolean not null default true,
  trigger_kind   text not null check (trigger_kind in ('ticket_created', 'ticket_status_changed', 'ticket_deadline_expired', 'schedule')),
  -- ticket_*:  {status?, category_id?, priority?}   (status só em ticket_status_changed)
  -- schedule:  {every: 'day'|'week', weekday?: 1..7 (ISO, 1 = segunda), time: 'HH:MM'}
  trigger_config jsonb not null default '{}'::jsonb,
  action_kind    text not null check (action_kind in ('notify', 'create_ticket', 'create_task', 'assign', 'set_priority')),
  -- notify:        {user_id | team_module, title?, message?}
  -- create_ticket: {module?, title?, description?, priority?, category_id?, assigned_to?}
  -- create_task:   {user_id?, title?, description?, priority?, due_in_days?}
  -- assign:        {user_id}
  -- set_priority:  {priority}
  -- Em title/description/message valem {numero}, {titulo} e {status} do chamado.
  action_config  jsonb not null default '{}'::jsonb,
  last_run_at    timestamptz,
  last_error     text,
  run_count      integer not null default 0,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Sem chamado não há o que atribuir nem que prioridade mudar.
  constraint automation_rules_action_needs_ticket
    check (trigger_kind <> 'schedule' or action_kind in ('notify', 'create_ticket', 'create_task'))
);

create index automation_rules_lookup_idx
  on public.automation_rules (tenant_id, module, trigger_kind) where is_active;

create trigger inject_tenant_id_automation_rules
  before insert on public.automation_rules
  for each row execute function public.inject_tenant_id();

create trigger handle_automation_rules_updated_at
  before update on public.automation_rules
  for each row execute function public.handle_updated_at();

create trigger audit_automation_rules_trigger
  after insert or update or delete on public.automation_rules
  for each row execute function public.audit_trigger_fn();

alter table public.automation_rules enable row level security;

create policy "Tenant members can view automation rules"
  on public.automation_rules for select to authenticated
  using (tenant_id = public.get_user_tenant_id());

create policy "Managers can insert automation rules"
  on public.automation_rules for insert to authenticated
  with check (tenant_id = public.get_user_tenant_id() and public.is_manager_or_higher(auth.uid()));

create policy "Managers can update automation rules"
  on public.automation_rules for update to authenticated
  using (tenant_id = public.get_user_tenant_id() and public.is_manager_or_higher(auth.uid()))
  with check (tenant_id = public.get_user_tenant_id() and public.is_manager_or_higher(auth.uid()));

create policy "Managers can delete automation rules"
  on public.automation_rules for delete to authenticated
  using (tenant_id = public.get_user_tenant_id() and public.is_manager_or_higher(auth.uid()));

-- "Prazo estourado" dispara UMA vez por chamado por regra. Esta tabela é a
-- memória disso — interna, sem policy: só o motor (security definer) a toca.
create table public.automation_fired (
  rule_id   uuid not null references public.automation_rules(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  fired_at  timestamptz not null default now(),
  primary key (rule_id, ticket_id)
);
alter table public.automation_fired enable row level security;

-- ───────────────────────────────────────────────────────────────────────────
-- O motor
-- ───────────────────────────────────────────────────────────────────────────

-- {numero}, {titulo}, {status} viram os dados do chamado; sem chamado, fica como está.
create or replace function public.automation_template(p_text text, t public.tickets)
returns text
language sql
stable
as $$
  select case
    when p_text is null then null
    when t.id is null then p_text
    else replace(replace(replace(p_text,
           '{numero}', coalesce(t.ticket_number::text, '')),
           '{titulo}', coalesce(t.title, '')),
           '{status}', coalesce(t.status::text, ''))
  end;
$$;

-- Executa a ação de UMA regra. Lança erro quando a configuração não dá para
-- cumprir; quem chama registra o erro na regra.
create or replace function public.automation_run_action(r public.automation_rules, t public.tickets)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg       jsonb := r.action_config;
  v_targets uuid[];
  v_user    uuid;
  v_title   text;
begin
  case r.action_kind

  when 'notify' then
    if cfg ? 'user_id' then
      v_targets := array[(cfg->>'user_id')::uuid];
    elsif cfg ? 'team_module' then
      v_targets := public.notification_team(r.tenant_id, cfg->>'team_module');
    else
      raise exception 'a acao "avisar" precisa de uma pessoa ou de uma equipe';
    end if;

    perform public.notify_users(
      r.tenant_id, v_targets, 'automation',
      case when t.id is null then 'automation_rule' else 'ticket' end,
      coalesce(t.id, r.id),
      coalesce(nullif(public.automation_template(cfg->>'title', t), ''), 'Automação: ' || r.name),
      coalesce(public.automation_template(cfg->>'message', t), '')
    );

  when 'create_ticket' then
    insert into public.tickets (tenant_id, module, title, description, priority, status, category_id, requester_id, created_by, assigned_to)
    values (
      r.tenant_id,
      coalesce(cfg->>'module', r.module),
      coalesce(nullif(public.automation_template(cfg->>'title', t), ''), r.name),
      coalesce(nullif(public.automation_template(cfg->>'description', t), ''), 'Aberto pela automação "' || r.name || '".'),
      coalesce((cfg->>'priority')::public.ticket_priority, 'medium'),
      'open',
      (cfg->>'category_id')::uuid,
      coalesce(t.requester_id, r.created_by),
      r.created_by,
      (cfg->>'assigned_to')::uuid
    );

  when 'create_task' then
    v_user := coalesce((cfg->>'user_id')::uuid, t.assigned_to, r.created_by);
    if v_user is null then
      raise exception 'a acao "criar tarefa" precisa de uma pessoa';
    end if;
    insert into public.tasks (tenant_id, user_id, title, description, priority, due_date, source_type, source_id)
    values (
      r.tenant_id, v_user,
      coalesce(nullif(public.automation_template(cfg->>'title', t), ''), r.name),
      public.automation_template(cfg->>'description', t),
      coalesce((cfg->>'priority')::int, 3),
      case when cfg ? 'due_in_days' then now() + make_interval(days => (cfg->>'due_in_days')::int) end,
      'automation', r.id
    );

  when 'assign' then
    if t.id is null then raise exception 'a acao "atribuir" exige um chamado'; end if;
    v_user := (cfg->>'user_id')::uuid;
    if v_user is null then raise exception 'a acao "atribuir" precisa de uma pessoa'; end if;

    update public.tickets set assigned_to = v_user where id = t.id;
    insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
    values (r.tenant_id, t.id, coalesce(r.created_by, t.requester_id),
            'Atribuído automaticamente pela regra "' || r.name || '".', true);
    perform public.notify_users(
      r.tenant_id, array[v_user], 'ticket_assigned', 'ticket', t.id,
      'Chamado #' || t.ticket_number || ' atribuído a você',
      'Pela regra "' || r.name || '": "' || coalesce(t.title, '') || '"'
    );

  when 'set_priority' then
    if t.id is null then raise exception 'a acao "mudar prioridade" exige um chamado'; end if;
    if cfg->>'priority' is null then raise exception 'a acao "mudar prioridade" precisa da prioridade'; end if;

    update public.tickets set priority = (cfg->>'priority')::public.ticket_priority where id = t.id;
    insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
    values (r.tenant_id, t.id, coalesce(r.created_by, t.requester_id),
            'Prioridade alterada para ' || (cfg->>'priority') || ' pela regra "' || r.name || '".', true);

  end case;
end;
$$;

-- Dispara uma regra: roda a ação e grava última execução / último erro.
-- Enquanto a ação roda, `helpoint.automation = '1'` na transação: um chamado
-- aberto por uma regra NÃO dispara outras regras (senão RH→TI→RH→… não para).
-- Erro na ação desfaz só a ação (subtransação) e fica registrado na regra.
create or replace function public.automation_fire(r public.automation_rules, t public.tickets)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('helpoint.automation', '1', true);
  begin
    perform public.automation_run_action(r, t);
    update public.automation_rules
       set last_run_at = now(), last_error = null, run_count = run_count + 1
     where id = r.id;
  exception when others then
    update public.automation_rules
       set last_run_at = now(), last_error = left(sqlerrm, 500), run_count = run_count + 1
     where id = r.id;
  end;
  perform set_config('helpoint.automation', '0', true);
end;
$$;

-- Filtros opcionais comuns aos gatilhos de chamado: categoria e prioridade.
create or replace function public.automation_matches(cfg jsonb, t public.tickets)
returns boolean
language sql
stable
as $$
  select (cfg->>'category_id' is null or (cfg->>'category_id')::uuid is not distinct from t.category_id)
     and (cfg->>'priority'    is null or  cfg->>'priority' = t.priority::text);
$$;

-- Avalia as regras de um evento de chamado (aberto / mudou de status).
create or replace function public.automation_evaluate(p_event text, t public.tickets)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.automation_rules;
begin
  if current_setting('helpoint.automation', true) = '1' then
    return;
  end if;

  for r in
    select * from public.automation_rules
     where tenant_id = t.tenant_id
       and module = t.module
       and trigger_kind = p_event
       and is_active
     order by created_at
  loop
    if p_event = 'ticket_status_changed'
       and r.trigger_config->>'status' is distinct from t.status::text then
      continue;
    end if;
    if not public.automation_matches(r.trigger_config, t) then
      continue;
    end if;
    perform public.automation_fire(r, t);
  end loop;
end;
$$;

create or replace function public.automation_on_ticket_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.automation_evaluate('ticket_created', new);
  return new;
end;
$$;

create or replace function public.automation_on_ticket_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.automation_evaluate('ticket_status_changed', new);
  return new;
end;
$$;

-- `trg_zz_`: roda depois de `trg_notify_on_ticket_created` (ordem alfabética),
-- para o aviso de "chamado novo" sair antes de a regra mexer no chamado.
drop trigger if exists trg_zz_automation_ticket_created on public.tickets;
create trigger trg_zz_automation_ticket_created
  after insert on public.tickets
  for each row execute function public.automation_on_ticket_insert();

drop trigger if exists trg_zz_automation_ticket_status on public.tickets;
create trigger trg_zz_automation_ticket_status
  after update of status on public.tickets
  for each row
  when (old.status is distinct from new.status)
  execute function public.automation_on_ticket_status();

-- ───────────────────────────────────────────────────────────────────────────
-- O relógio: agendadas e prazo estourado. Roda a cada 5 minutos pelo cron.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.run_automations_tick()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r          public.automation_rules;
  t          public.tickets;
  v_now      timestamptz := now();
  -- ponytail: fuso fixo. Vira coluna em `tenants` no primeiro cliente fora do Brasil.
  v_local    timestamp := now() at time zone 'America/Sao_Paulo';
  v_due      timestamp;
  n_sched    int := 0;
  n_deadline int := 0;
begin
  -- Agendadas: dispara uma vez por dia (ou por semana, no dia certo) a partir
  -- da hora marcada. `last_run_at` é a memória: já rodou hoje, não roda de novo.
  for r in
    select * from public.automation_rules where trigger_kind = 'schedule' and is_active
  loop
    if r.trigger_config->>'every' = 'week'
       and extract(isodow from v_local)::int <> coalesce((r.trigger_config->>'weekday')::int, 1) then
      continue;
    end if;

    v_due := date_trunc('day', v_local) + coalesce((r.trigger_config->>'time')::time, '08:00'::time);
    if v_local < v_due then
      continue;
    end if;
    if r.last_run_at is not null and (r.last_run_at at time zone 'America/Sao_Paulo') >= v_due then
      continue;
    end if;

    t := null;
    perform public.automation_fire(r, t);
    n_sched := n_sched + 1;
  end loop;

  -- Prazo estourado: chamados abertos do módulo da regra cujo prazo (due_date,
  -- senão o do SLA) já passou, uma vez por chamado (automation_fired).
  for r in
    select * from public.automation_rules where trigger_kind = 'ticket_deadline_expired' and is_active
  loop
    for t in
      select tk.* from public.tickets tk
       where tk.tenant_id = r.tenant_id
         and tk.module = r.module
         and tk.status not in ('resolved', 'closed', 'cancelled', 'rejected')
         and coalesce(tk.due_date, tk.sla_due_at) < v_now
         and not exists (select 1 from public.automation_fired f where f.rule_id = r.id and f.ticket_id = tk.id)
       order by tk.created_at
    loop
      if not public.automation_matches(r.trigger_config, t) then
        continue;
      end if;
      insert into public.automation_fired (rule_id, ticket_id) values (r.id, t.id);
      perform public.automation_fire(r, t);
      n_deadline := n_deadline + 1;
    end loop;
  end loop;

  return jsonb_build_object('scheduled', n_sched, 'deadline', n_deadline);
end;
$$;

revoke all on function public.automation_template(text, public.tickets)                    from public, anon, authenticated;
revoke all on function public.automation_run_action(public.automation_rules, public.tickets) from public, anon, authenticated;
revoke all on function public.automation_fire(public.automation_rules, public.tickets)       from public, anon, authenticated;
revoke all on function public.automation_matches(jsonb, public.tickets)                      from public, anon, authenticated;
revoke all on function public.automation_evaluate(text, public.tickets)                     from public, anon, authenticated;
revoke all on function public.run_automations_tick()                                        from public, anon, authenticated;

-- Cron SQL puro: sem HTTP, sem segredo do vault (ao contrário dos dois robôs
-- de 20260907010000). `cron.schedule` com nome existente atualiza.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'automations-tick-5min') then
    perform cron.unschedule('automations-tick-5min');
  end if;
end $$;

select cron.schedule('automations-tick-5min', '*/5 * * * *', $job$ select public.run_automations_tick(); $job$);

-- Leva E5-A1 (ADR-007): automações viram motor de fluxo no banco. 2026-09-12.
--
-- Substitui o motor "um gatilho + uma ação" da L2 (20260909010000). As regras
-- existentes são convertidas em fluxos de um passo e o motor antigo sai — um
-- motor só. Referência de produto: os workflows do Twenty CRM
-- (docs/pesquisa-twenty-crm.md, seção 5), traduzidos para Postgres:
--
--   fluxo = gatilho + passos em grafo (array plano, `next` por passo);
--   run   = uma execução, com CÓPIA CONGELADA do fluxo (editar o fluxo não
--           muda run em andamento) e o estado de cada passo em jsonb;
--   quem captura o evento só enfileira; os passos SQL rodam na mesma
--   transação com teto de 20; espera, tentativa e passo externo (e-mail,
--   HTTP, IA — leva A2) ficam para o tick de 1 minuto;
--   escrita feita por fluxo NÃO dispara outro fluxo (helpoint.automation).
--
-- O que este arquivo cria, em uma frase cada:
--   automation_workflows        o fluxo: módulo, gatilho, passos, status, próximo disparo agendado
--   automation_runs             a execução: snapshot do fluxo, contexto, passo atual, espera, erro
--   automation_fired            "uma vez por registro" (prazo estourado)
--   automation_validate_flow()  CHECK do fluxo: ids únicos, next existe, tipos conhecidos, sem ciclo
--   automation_filter_matches() {op, rules:[{path, cmp, value}]} contra o contexto — gatilho e passo "condição"
--   automation_render()         "{{trigger.after.title}}" → valor do contexto
--   automation_enqueue()        evento de registro → runs dos fluxos que casam
--   automation_advance()        o executor
--   automation_tick()           agenda, prazo, runs em espera, faxina — pg_cron a cada minuto
--
-- Formato do gatilho (jsonb):
--   {kind: 'record_created'|'record_updated', entity: 'ticket'|'crm_deal'|'crm_contact'|'crm_order',
--    fields?: [colunas observadas], filter?: {...}, next: [ids dos primeiros passos]}
--   {kind: 'deadline_expired', entity: 'ticket', filter?, next}
--   {kind: 'schedule', every: 'day'|'week', weekday?: 1..7, time: 'HH:MM', next}
--   {kind: 'webhook' | 'manual', ...}   (leva A2)
-- Formato do passo:
--   {id, kind, name?, config: {...}, next: [ids], continue_on_failure?: bool, retry?: 0..3}
-- Contexto do run (automation_runs.context):
--   {trigger: {kind, entity, before, after, updated_fields}, subject: {type, id},
--    steps: {id: {status, result, error, attempts, started_at, ended_at}}}
--
-- Fora, de propósito (ADR-007): código do usuário, iterador, formulário que
-- pausa, "escolher registro". Ramificação (branch) entra na A3.

-- ───────────────────────────────────────────────────────────────────────────
-- Validação do fluxo (CHECK): levanta erro legível, não devolve false
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.automation_validate_flow(p_trigger jsonb, p_steps jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  v_kind    text := p_trigger->>'kind';
  v_entity  text := p_trigger->>'entity';
  v_ids     text[] := '{}';
  s         jsonb;
  n         text;
  v_remaining text[];
  v_removed   boolean;
  k_step    text;
begin
  if jsonb_typeof(p_trigger) <> 'object' then raise exception 'gatilho precisa ser um objeto'; end if;
  if v_kind is null or v_kind not in ('record_created', 'record_updated', 'deadline_expired', 'schedule', 'webhook', 'manual') then
    raise exception 'gatilho desconhecido: %', coalesce(v_kind, '(vazio)');
  end if;
  if v_kind in ('record_created', 'record_updated', 'deadline_expired', 'manual')
     and (v_entity is null or v_entity not in ('ticket', 'crm_deal', 'crm_contact', 'crm_order')) then
    raise exception 'gatilho "%" precisa de um cadastro (ticket, crm_deal, crm_contact, crm_order)', v_kind;
  end if;
  if v_kind = 'deadline_expired' and v_entity <> 'ticket' then
    raise exception 'prazo estourado só vale para chamado';
  end if;
  if v_kind = 'schedule' then
    if p_trigger->>'every' not in ('day', 'week') then raise exception 'agenda precisa de every = day|week'; end if;
    if (p_trigger->>'time') !~ '^\d{2}:\d{2}$' then raise exception 'agenda precisa de time HH:MM'; end if;
    if p_trigger->>'every' = 'week' and coalesce((p_trigger->>'weekday')::int, 0) not between 1 and 7 then
      raise exception 'agenda semanal precisa de weekday 1..7';
    end if;
  end if;
  if jsonb_typeof(p_steps) <> 'array' then raise exception 'passos precisam ser uma lista'; end if;

  for s in select * from jsonb_array_elements(p_steps) loop
    if jsonb_typeof(s) <> 'object' or coalesce(s->>'id', '') = '' then raise exception 'passo sem id'; end if;
    if s->>'id' = any(v_ids) then raise exception 'id de passo repetido: %', s->>'id'; end if;
    v_ids := v_ids || (s->>'id');
    if s->>'kind' is null or s->>'kind' not in (
      'notify', 'create_task', 'create_ticket', 'assign', 'set_priority', 'set_stage', 'update_record',
      'create_deal', 'add_note', 'create_calendar_event', 'condition', 'delay', 'stop', 'branch',
      'send_email', 'http_request', 'ai_text') then
      raise exception 'tipo de passo desconhecido: %', coalesce(s->>'kind', '(vazio)');
    end if;
    if s ? 'next' and jsonb_typeof(s->'next') <> 'array' then raise exception 'next do passo % precisa ser lista', s->>'id'; end if;
  end loop;

  -- todo `next` (do gatilho, dos passos e dos ramos) aponta para um passo existente
  for n in select jsonb_array_elements_text(coalesce(p_trigger->'next', '[]'::jsonb)) loop
    if not (n = any(v_ids)) then raise exception 'o gatilho aponta para passo inexistente: %', n; end if;
  end loop;
  for s in select * from jsonb_array_elements(p_steps) loop
    for n in select jsonb_array_elements_text(coalesce(s->'next', '[]'::jsonb)) loop
      if not (n = any(v_ids)) then raise exception 'o passo % aponta para passo inexistente: %', s->>'id', n; end if;
    end loop;
    if s->>'kind' = 'branch' then
      for n in
        select jsonb_array_elements_text(coalesce(b->'next', '[]'::jsonb))
          from jsonb_array_elements(coalesce(s->'config'->'branches', '[]'::jsonb)) b
        union all
        select jsonb_array_elements_text(coalesce(s->'config'->'else_next', '[]'::jsonb))
      loop
        if not (n = any(v_ids)) then raise exception 'o ramo do passo % aponta para passo inexistente: %', s->>'id', n; end if;
      end loop;
    end if;
  end loop;

  -- sem ciclo: remove repetidamente quem não tem aresta chegando de quem ainda resta
  v_remaining := v_ids;
  loop
    v_removed := false;
    foreach k_step in array v_remaining loop
      if not exists (
        select 1
          from jsonb_array_elements(p_steps) s2
         where (s2->>'id') = any(v_remaining)
           and (
             k_step in (select jsonb_array_elements_text(coalesce(s2->'next', '[]'::jsonb)))
             or k_step in (select jsonb_array_elements_text(coalesce(b->'next', '[]'::jsonb))
                             from jsonb_array_elements(coalesce(s2->'config'->'branches', '[]'::jsonb)) b)
             or k_step in (select jsonb_array_elements_text(coalesce(s2->'config'->'else_next', '[]'::jsonb)))
           )
      ) then
        v_remaining := array_remove(v_remaining, k_step);
        v_removed := true;
      end if;
    end loop;
    exit when not v_removed or cardinality(v_remaining) = 0;
  end loop;
  if cardinality(v_remaining) > 0 then
    raise exception 'o fluxo tem um ciclo entre os passos %', array_to_string(v_remaining, ', ');
  end if;
  return true;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Tabelas
-- ───────────────────────────────────────────────────────────────────────────
create table public.automation_workflows (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  module       text not null check (module in ('tickets', 'marketing', 'qualidade', 'rh', 'financeiro', 'comercial', 'educacional')),
  name         text not null check (length(trim(name)) between 1 and 120),
  description  text,
  status       text not null default 'draft' check (status in ('draft', 'active', 'paused')),
  trigger      jsonb not null default '{"kind":"manual","entity":"ticket","next":[]}'::jsonb,
  steps        jsonb not null default '[]'::jsonb,
  next_run_at  timestamptz,
  last_run_at  timestamptz,
  last_error   text,
  run_count    integer not null default 0,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint automation_workflows_flow_valid check (public.automation_validate_flow(trigger, steps))
);
create index automation_workflows_lookup_idx on public.automation_workflows (tenant_id, module, status);
create index automation_workflows_schedule_idx on public.automation_workflows (next_run_at) where status = 'active' and next_run_at is not null;

create trigger inject_tenant_id_automation_workflows before insert on public.automation_workflows for each row execute function public.inject_tenant_id();
create trigger handle_automation_workflows_updated_at before update on public.automation_workflows for each row execute function public.handle_updated_at();
create trigger audit_automation_workflows_trigger after insert or update or delete on public.automation_workflows for each row execute function public.audit_trigger_fn();

alter table public.automation_workflows enable row level security;
create policy "Tenant members can view workflows" on public.automation_workflows for select to authenticated
  using (tenant_id = public.get_user_tenant_id());
create policy "Managers can insert workflows" on public.automation_workflows for insert to authenticated
  with check (tenant_id = public.get_user_tenant_id() and public.is_manager_or_higher(auth.uid()));
create policy "Managers can update workflows" on public.automation_workflows for update to authenticated
  using (tenant_id = public.get_user_tenant_id() and public.is_manager_or_higher(auth.uid()))
  with check (tenant_id = public.get_user_tenant_id() and public.is_manager_or_higher(auth.uid()));
create policy "Managers can delete workflows" on public.automation_workflows for delete to authenticated
  using (tenant_id = public.get_user_tenant_id() and public.is_manager_or_higher(auth.uid()));

create table public.automation_runs (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  workflow_id      uuid not null references public.automation_workflows(id) on delete cascade,
  status           text not null default 'queued' check (status in ('queued', 'running', 'waiting', 'completed', 'failed', 'cancelled')),
  trigger_kind     text not null,
  subject_type     text,
  subject_id       uuid,
  flow             jsonb not null,
  context          jsonb not null default '{}'::jsonb,
  current_step_ids text[] not null default '{}',
  pending_step_id  text,
  pending_kind     text,
  resume_at        timestamptz,
  executed_steps   integer not null default 0,
  error            text,
  created_at       timestamptz not null default now(),
  started_at       timestamptz,
  ended_at         timestamptz
);
create index automation_runs_workflow_idx on public.automation_runs (tenant_id, workflow_id, created_at desc);
create index automation_runs_due_idx on public.automation_runs (resume_at) where status in ('queued', 'waiting');
create index automation_runs_subject_idx on public.automation_runs (subject_type, subject_id);

alter table public.automation_runs enable row level security;
create policy "Tenant members can view runs" on public.automation_runs for select to authenticated
  using (tenant_id = public.get_user_tenant_id());
-- Sem insert/update/delete pelo cliente: só as funções definer escrevem.

-- "Uma vez por registro": prazo estourado. Interna, sem policy.
drop table if exists public.automation_fired;
create table public.automation_fired (
  workflow_id uuid not null references public.automation_workflows(id) on delete cascade,
  subject_id  uuid not null,
  fired_at    timestamptz not null default now(),
  primary key (workflow_id, subject_id)
);
alter table public.automation_fired enable row level security;

-- ───────────────────────────────────────────────────────────────────────────
-- Filtro e template
-- ───────────────────────────────────────────────────────────────────────────
-- {op: 'and'|'or', rules: [{path: 'trigger.after.status', cmp, value}]}
-- cmp: eq, neq, gt, gte, lt, lte, contains, is_empty, not_empty, in, changed
-- ponytail: um nível de grupo (AND de regras, ou OR). Grupos aninhados quando alguém pedir.
create or replace function public.automation_filter_matches(p_filter jsonb, p_ctx jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  r        jsonb;
  v        jsonb;
  v_text   text;
  w_text   text;
  ok       boolean;
  any_true boolean := false;
  all_true boolean := true;
  n_rules  int := 0;
  v_num    numeric;
  w_num    numeric;
begin
  if p_filter is null or jsonb_typeof(p_filter) <> 'object' or jsonb_typeof(p_filter->'rules') <> 'array' then
    return true;
  end if;
  for r in select * from jsonb_array_elements(p_filter->'rules') loop
    n_rules := n_rules + 1;
    v := p_ctx #> string_to_array(r->>'path', '.');
    v_text := case when v is null or jsonb_typeof(v) = 'null' then null else v #>> '{}' end;
    w_text := case when r->'value' is null or jsonb_typeof(r->'value') = 'null' then null else r->'value' #>> '{}' end;
    case coalesce(r->>'cmp', 'eq')
      when 'eq'        then ok := v_text is not distinct from w_text;
      when 'neq'       then ok := v_text is distinct from w_text;
      when 'contains'  then ok := v_text is not null and w_text is not null and v_text ilike '%' || w_text || '%';
      when 'is_empty'  then ok := v_text is null or v_text = '';
      when 'not_empty' then ok := v_text is not null and v_text <> '';
      when 'in'        then ok := v_text is not null and jsonb_typeof(r->'value') = 'array'
                                  and exists (select 1 from jsonb_array_elements_text(r->'value') x where x = v_text);
      when 'changed'   then ok := exists (select 1 from jsonb_array_elements_text(coalesce(p_ctx #> '{trigger,updated_fields}', '[]'::jsonb)) x
                                          where x = split_part(r->>'path', '.', 3));
      when 'gt', 'gte', 'lt', 'lte' then
        begin
          v_num := v_text::numeric; w_num := w_text::numeric;
        exception when others then
          v_num := null; w_num := null;
        end;
        if v_num is null or w_num is null then
          ok := false;
        else
          ok := case r->>'cmp' when 'gt' then v_num > w_num when 'gte' then v_num >= w_num when 'lt' then v_num < w_num else v_num <= w_num end;
        end if;
      else ok := false;
    end case;
    any_true := any_true or ok;
    all_true := all_true and ok;
  end loop;
  if n_rules = 0 then return true; end if;
  return case when coalesce(p_filter->>'op', 'and') = 'or' then any_true else all_true end;
end;
$$;

-- "{{trigger.after.title}}" → valor; caminho desconhecido vira vazio.
create or replace function public.automation_render(p_text text, p_ctx jsonb)
returns text
language plpgsql
immutable
as $$
declare
  m     text[];
  v_out text := p_text;
  v_val text;
begin
  if p_text is null or position('{{' in p_text) = 0 then return p_text; end if;
  for m in select regexp_matches(p_text, '\{\{\s*([A-Za-z0-9_.]+)\s*\}\}', 'g') loop
    v_val := coalesce(p_ctx #>> string_to_array(m[1], '.'), '');
    v_out := replace(v_out, '{{' || m[1] || '}}', v_val);
    v_out := replace(v_out, '{{ ' || m[1] || ' }}', v_val);
  end loop;
  return v_out;
end;
$$;

-- Pega um passo do snapshot pelo id.
create or replace function public.automation_step(p_flow jsonb, p_id text)
returns jsonb
language sql
immutable
as $$
  select s from jsonb_array_elements(coalesce(p_flow->'steps', '[]'::jsonb)) s where s->>'id' = p_id limit 1;
$$;

-- Quem é "a pessoa" de um passo: user_id fixo, ou um papel do registro do gatilho.
create or replace function public.automation_target_user(p_cfg jsonb, p_ctx jsonb)
returns uuid
language sql
immutable
as $$
  select case
    when nullif(p_cfg->>'user_id', '') is not null then (p_cfg->>'user_id')::uuid
    when p_cfg->>'target' = 'owner'      then nullif(p_ctx #>> '{trigger,after,owner_id}', '')::uuid
    when p_cfg->>'target' = 'assignee'   then nullif(p_ctx #>> '{trigger,after,assigned_to}', '')::uuid
    when p_cfg->>'target' = 'requester'  then nullif(p_ctx #>> '{trigger,after,requester_id}', '')::uuid
    when p_cfg->>'target' = 'created_by' then nullif(p_ctx #>> '{trigger,after,created_by}', '')::uuid
    else null
  end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Executar UM passo. Devolve {status: 'success'|'waiting'|'stop', result?, resume_at?, pending_kind?}.
-- Lança exceção quando a configuração não dá para cumprir (o executor trata).
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.automation_run_step(r public.automation_runs, p_step jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg       jsonb := coalesce(p_step->'config', '{}'::jsonb);
  ctx       jsonb := r.context;
  w         public.automation_workflows;
  v_entity  text := r.subject_type;
  v_user    uuid;
  v_targets uuid[];
  v_id      uuid;
  v_title   text;
  v_text    text;
  v_ref_type text;
  k         text;
  v         jsonb;
  v_allowed text[];
  v_set     text := '';
  v_deal    public.crm_deals;
begin
  select * into w from public.automation_workflows where id = r.workflow_id;
  v_ref_type := case v_entity when 'ticket' then 'ticket' when 'crm_deal' then 'crm_deal' else 'automation_workflow' end;

  case p_step->>'kind'

  when 'notify' then
    if cfg ? 'team_module' then
      v_targets := public.notification_team(r.tenant_id, cfg->>'team_module');
    else
      v_user := public.automation_target_user(cfg, ctx);
      if v_user is null then raise exception 'a acao "avisar" precisa de uma pessoa ou de uma equipe'; end if;
      v_targets := array[v_user];
    end if;
    perform public.notify_users(
      r.tenant_id, v_targets, 'automation', v_ref_type, coalesce(r.subject_id, r.workflow_id),
      coalesce(nullif(public.automation_render(cfg->>'title', ctx), ''), 'Automação: ' || w.name),
      coalesce(public.automation_render(cfg->>'message', ctx), ''));
    return jsonb_build_object('status', 'success', 'result', jsonb_build_object('notified', to_jsonb(v_targets)));

  when 'create_task' then
    v_user := coalesce(public.automation_target_user(cfg, ctx),
                       nullif(ctx #>> '{trigger,after,assigned_to}', '')::uuid,
                       nullif(ctx #>> '{trigger,after,owner_id}', '')::uuid,
                       w.created_by);
    if v_user is null then raise exception 'a acao "criar tarefa" precisa de uma pessoa'; end if;
    insert into public.tasks (tenant_id, user_id, title, description, priority, due_date, source_type, source_id)
    values (r.tenant_id, v_user,
            coalesce(nullif(public.automation_render(cfg->>'title', ctx), ''), w.name),
            public.automation_render(cfg->>'description', ctx),
            coalesce((cfg->>'priority')::int, 3),
            case when cfg ? 'due_in_days' then now() + make_interval(days => (cfg->>'due_in_days')::int) end,
            'automation', w.id)
    returning id into v_id;
    return jsonb_build_object('status', 'success', 'result', jsonb_build_object('task_id', v_id));

  when 'create_ticket' then
    insert into public.tickets (tenant_id, module, title, description, priority, status, category_id, requester_id, created_by, assigned_to)
    values (r.tenant_id,
            coalesce(nullif(cfg->>'module', ''), w.module),
            coalesce(nullif(public.automation_render(cfg->>'title', ctx), ''), w.name),
            coalesce(nullif(public.automation_render(cfg->>'description', ctx), ''), 'Aberto pela automação "' || w.name || '".'),
            coalesce((cfg->>'priority')::public.ticket_priority, 'medium'),
            'open',
            nullif(cfg->>'category_id', '')::uuid,
            coalesce(nullif(ctx #>> '{trigger,after,requester_id}', '')::uuid, w.created_by),
            w.created_by,
            nullif(cfg->>'assigned_to', '')::uuid)
    returning id into v_id;
    return jsonb_build_object('status', 'success', 'result', jsonb_build_object('ticket_id', v_id));

  when 'assign' then
    v_user := public.automation_target_user(cfg, ctx);
    if v_user is null then raise exception 'a acao "atribuir" precisa de uma pessoa'; end if;
    if v_entity = 'ticket' then
      update public.tickets set assigned_to = v_user where id = r.subject_id;
      insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
      values (r.tenant_id, r.subject_id, coalesce(w.created_by, v_user), 'Atribuído automaticamente pelo fluxo "' || w.name || '".', true);
      perform public.notify_users(r.tenant_id, array[v_user], 'ticket_assigned', 'ticket', r.subject_id,
        'Chamado #' || coalesce(ctx #>> '{trigger,after,ticket_number}', '?') || ' atribuído a você',
        'Pelo fluxo "' || w.name || '": "' || coalesce(ctx #>> '{trigger,after,title}', '') || '"');
    elsif v_entity = 'crm_deal' then
      update public.crm_deals set owner_id = v_user where id = r.subject_id;
      insert into public.crm_deal_activities (tenant_id, deal_id, author_id, kind, content)
      values (r.tenant_id, r.subject_id, null, 'system', 'Dono definido pelo fluxo "' || w.name || '".');
    elsif v_entity = 'crm_contact' then
      update public.crm_contacts set owner_id = v_user where id = r.subject_id;
    else
      raise exception 'a acao "atribuir" nao vale para %', v_entity;
    end if;
    return jsonb_build_object('status', 'success', 'result', jsonb_build_object('user_id', v_user));

  when 'set_priority' then
    if v_entity <> 'ticket' then raise exception 'a acao "mudar prioridade" exige um chamado'; end if;
    if nullif(cfg->>'priority', '') is null then raise exception 'a acao "mudar prioridade" precisa da prioridade'; end if;
    update public.tickets set priority = (cfg->>'priority')::public.ticket_priority where id = r.subject_id;
    insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
    values (r.tenant_id, r.subject_id, coalesce(w.created_by, nullif(ctx #>> '{trigger,after,requester_id}', '')::uuid),
            'Prioridade alterada para ' || (cfg->>'priority') || ' pelo fluxo "' || w.name || '".', true);
    return jsonb_build_object('status', 'success');

  when 'set_stage' then
    if v_entity <> 'crm_deal' then raise exception 'a acao "mudar etapa" exige um negocio'; end if;
    if nullif(cfg->>'stage_id', '') is null then raise exception 'a acao "mudar etapa" precisa da etapa'; end if;
    update public.crm_deals set stage_id = (cfg->>'stage_id')::uuid where id = r.subject_id and tenant_id = r.tenant_id;
    return jsonb_build_object('status', 'success');

  when 'update_record' then
    -- {fields: {coluna: valor}}; só colunas da lista; "custom.chave" entra no jsonb `custom`.
    v_allowed := case v_entity
      when 'ticket'      then array['status', 'priority', 'assigned_to', 'category_id', 'due_date', 'title']
      when 'crm_deal'    then array['title', 'value', 'owner_id', 'expected_close_date', 'stage_id', 'lost_reason']
      when 'crm_contact' then array['owner_id', 'notes', 'company', 'city', 'state']
      when 'crm_order'   then array['status']
      else '{}'::text[] end;
    for k, v in select * from jsonb_each(coalesce(cfg->'fields', '{}'::jsonb)) loop
      if k like 'custom.%' and v_entity in ('crm_deal', 'crm_contact') then
        execute format('update public.%I set custom = jsonb_set(custom, %L, %L::jsonb) where id = $1',
                       case v_entity when 'crm_deal' then 'crm_deals' else 'crm_contacts' end,
                       array[substr(k, 8)], v::text) using r.subject_id;
      elsif k = any(v_allowed) then
        v_text := case when jsonb_typeof(v) = 'string' then public.automation_render(v #>> '{}', ctx) else v #>> '{}' end;
        execute format('update public.%I set %I = %L where id = $1',
                       case v_entity when 'ticket' then 'tickets' when 'crm_deal' then 'crm_deals' when 'crm_contact' then 'crm_contacts' else 'crm_orders' end,
                       k, v_text) using r.subject_id;
      else
        raise exception 'a acao "atualizar" nao pode mudar "%" em %', k, v_entity;
      end if;
    end loop;
    return jsonb_build_object('status', 'success');

  when 'create_deal' then
    v_id := coalesce(nullif(cfg->>'contact_id', '')::uuid,
                     case v_entity when 'crm_contact' then r.subject_id when 'crm_deal' then nullif(ctx #>> '{trigger,after,contact_id}', '')::uuid end);
    if v_id is null then raise exception 'a acao "criar negocio" precisa de um contato'; end if;
    insert into public.crm_deals (tenant_id, contact_id, stage_id, title, value, owner_id, source)
    select r.tenant_id, v_id,
           coalesce(nullif(cfg->>'stage_id', '')::uuid,
                    (select s.id from public.crm_pipeline_stages s join public.crm_pipelines p on p.id = s.pipeline_id
                      where p.tenant_id = r.tenant_id and p.is_default and s.kind = 'open' order by s.position limit 1)),
           coalesce(nullif(public.automation_render(cfg->>'title', ctx), ''), w.name),
           coalesce((cfg->>'value')::numeric, 0),
           coalesce(public.automation_target_user(cfg, ctx), (select owner_id from public.crm_contacts where id = v_id)),
           'outro'
    returning id into v_id;
    return jsonb_build_object('status', 'success', 'result', jsonb_build_object('deal_id', v_id));

  when 'add_note' then
    v_text := coalesce(nullif(public.automation_render(cfg->>'content', ctx), ''), 'Fluxo "' || w.name || '"');
    if v_entity = 'crm_deal' then
      insert into public.crm_deal_activities (tenant_id, deal_id, author_id, kind, content) values (r.tenant_id, r.subject_id, null, 'note', v_text);
    elsif v_entity = 'ticket' then
      insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
      values (r.tenant_id, r.subject_id, coalesce(w.created_by, nullif(ctx #>> '{trigger,after,requester_id}', '')::uuid), v_text, true);
    else
      raise exception 'a acao "anotar" nao vale para %', v_entity;
    end if;
    return jsonb_build_object('status', 'success');

  when 'create_calendar_event' then
    v_user := coalesce(public.automation_target_user(cfg, ctx), w.created_by);
    if v_user is null then raise exception 'a acao "agendar" precisa de uma pessoa'; end if;
    insert into public.calendar_events (tenant_id, user_id, title, description, start_at, end_at, event_type, source_type, source_id)
    values (r.tenant_id, v_user,
            coalesce(nullif(public.automation_render(cfg->>'title', ctx), ''), w.name),
            public.automation_render(cfg->>'description', ctx),
            now() + make_interval(days => coalesce((cfg->>'in_days')::int, 1)),
            now() + make_interval(days => coalesce((cfg->>'in_days')::int, 1)) + interval '1 hour',
            'event', 'automation', w.id)
    returning id into v_id;
    return jsonb_build_object('status', 'success', 'result', jsonb_build_object('event_id', v_id));

  when 'condition' then
    if public.automation_filter_matches(cfg->'filter', ctx) then
      return jsonb_build_object('status', 'success', 'result', jsonb_build_object('matched', true));
    end if;
    return jsonb_build_object('status', 'stop', 'result', jsonb_build_object('matched', false));

  when 'delay' then
    if cfg ? 'until_path' then
      v_text := ctx #>> string_to_array(cfg->>'until_path', '.');
      if v_text is null then raise exception 'a espera "ate a data" nao achou a data em %', cfg->>'until_path'; end if;
      return jsonb_build_object('status', 'waiting', 'resume_at', (v_text::timestamptz));
    end if;
    return jsonb_build_object('status', 'waiting',
      'resume_at', now() + make_interval(mins => coalesce((cfg->>'minutes')::int, 0), hours => coalesce((cfg->>'hours')::int, 0), days => coalesce((cfg->>'days')::int, 0)));

  when 'stop' then
    return jsonb_build_object('status', 'stop');

  when 'branch' then
    -- A3: escolhe o primeiro ramo cujo filtro casa; o executor lê `result.next`.
    for v in select * from jsonb_array_elements(coalesce(cfg->'branches', '[]'::jsonb)) loop
      if public.automation_filter_matches(v->'filter', ctx) then
        return jsonb_build_object('status', 'success', 'result', jsonb_build_object('branch', v->>'name', 'next', coalesce(v->'next', '[]'::jsonb)));
      end if;
    end loop;
    return jsonb_build_object('status', 'success', 'result', jsonb_build_object('branch', 'else', 'next', coalesce(cfg->'else_next', '[]'::jsonb)));

  when 'send_email', 'http_request', 'ai_text' then
    -- Passo externo: quem executa é a edge function automation-worker (leva A2), pelo tick.
    return jsonb_build_object('status', 'waiting', 'pending_kind', p_step->>'kind');

  else
    raise exception 'tipo de passo desconhecido: %', p_step->>'kind';
  end case;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- O executor: percorre o grafo a partir de current_step_ids
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.automation_advance(p_run uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r          public.automation_runs;
  v_frontier text[];
  v_id       text;
  v_step     jsonb;
  v_info     jsonb;
  v_out      jsonb;
  v_err      text;
  v_attempts int;
  v_retry    int;
  v_next     jsonb;
  v_prev     text := coalesce(current_setting('helpoint.automation', true), '0');
  c_max      constant int := 20;                                  -- teto por rodada (Twenty: MAX_EXECUTED_STEPS_COUNT)
  c_delays   constant interval[] := array['1 second', '5 seconds', '15 seconds']::interval[];
  n          int := 0;
  v_parent   jsonb;
  v_blocked  boolean;
begin
  select * into r from public.automation_runs where id = p_run for update;
  if r.id is null or r.status not in ('queued', 'waiting') or r.pending_kind is not null then
    return;
  end if;

  perform set_config('helpoint.automation', '1', true);
  update public.automation_runs set status = 'running', started_at = coalesce(started_at, now()), resume_at = null where id = p_run;
  v_frontier := r.current_step_ids;

  while cardinality(v_frontier) > 0 and n < c_max loop
    v_id := v_frontier[1];
    v_frontier := v_frontier[2:];
    v_step := public.automation_step(r.flow, v_id);
    if v_step is null then
      r.context := jsonb_set(r.context, array['steps', v_id], jsonb_build_object('status', 'failed', 'error', 'passo inexistente no fluxo'), true);
      continue;
    end if;
    v_info := coalesce(r.context #> array['steps', v_id], '{}'::jsonb);
    if v_info->>'status' in ('success', 'failed', 'failed_safely', 'stopped', 'skipped') then
      continue;
    end if;
    -- Espera que venceu: o passo já cumpriu o papel; segue para os próximos sem esperar de novo.
    if v_info->>'status' = 'pending' and v_step->>'kind' = 'delay' and (v_info->>'error') is null then
      r.context := jsonb_set(r.context, array['steps', v_id], v_info || jsonb_build_object('status', 'success', 'ended_at', now()), true);
      v_frontier := v_frontier || (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(coalesce(v_step->'next', '[]'::jsonb)) x);
      continue;
    end if;

    -- Junção: não roda enquanto algum pai ainda está rodando ou esperando.
    -- ponytail: um pai que nunca vai rodar (ramo perdedor) não bloqueia porque
    -- não tem status; a semântica SKIPPED do Twenty entra com o passo branch (A3).
    select bool_or(coalesce(r.context #> array['steps', p->>'id'] ->> 'status', '') in ('running', 'pending'))
      into v_blocked
      from jsonb_array_elements(r.flow->'steps') p
     where v_id in (select jsonb_array_elements_text(coalesce(p->'next', '[]'::jsonb)));
    if coalesce(v_blocked, false) then
      continue;
    end if;

    n := n + 1;
    v_attempts := coalesce((v_info->>'attempts')::int, 0);
    r.context := jsonb_set(r.context, array['steps', v_id], v_info || jsonb_build_object('status', 'running', 'started_at', now()), true);

    begin
      v_out := public.automation_run_step(r, v_step);
      v_err := null;
    exception when others then
      v_out := jsonb_build_object('status', 'failed');
      v_err := left(sqlerrm, 500);
    end;

    if v_out->>'status' = 'failed' then
      v_attempts := v_attempts + 1;
      v_retry := least(greatest(coalesce((v_step->>'retry')::int, 0), 0), 3);
      if v_attempts <= v_retry then
        r.context := jsonb_set(r.context, array['steps', v_id], v_info || jsonb_build_object('status', 'pending', 'attempts', v_attempts, 'error', v_err), true);
        update public.automation_runs
           set status = 'waiting', context = r.context, current_step_ids = array[v_id] || v_frontier,
               executed_steps = executed_steps + n, resume_at = now() + c_delays[least(v_attempts, 3)]
         where id = p_run;
        perform set_config('helpoint.automation', v_prev, true);
        return;
      end if;
      if coalesce((v_step->>'continue_on_failure')::boolean, false) then
        r.context := jsonb_set(r.context, array['steps', v_id], v_info || jsonb_build_object('status', 'failed_safely', 'attempts', v_attempts, 'error', v_err, 'ended_at', now()), true);
        v_next := coalesce(v_step->'next', '[]'::jsonb);
        v_frontier := v_frontier || (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(v_next) x);
        continue;
      end if;
      r.context := jsonb_set(r.context, array['steps', v_id], v_info || jsonb_build_object('status', 'failed', 'attempts', v_attempts, 'error', v_err, 'ended_at', now()), true);
      update public.automation_runs
         set status = 'failed', context = r.context, current_step_ids = '{}', executed_steps = executed_steps + n,
             error = coalesce(v_step->>'name', v_step->>'kind') || ': ' || coalesce(v_err, 'erro'), ended_at = now()
       where id = p_run;
      update public.automation_workflows set last_run_at = now(), last_error = left(coalesce(v_err, 'erro'), 500) where id = r.workflow_id;
      perform set_config('helpoint.automation', v_prev, true);
      return;
    end if;

    if v_out->>'status' = 'waiting' then
      r.context := jsonb_set(r.context, array['steps', v_id], v_info || jsonb_build_object('status', 'pending', 'attempts', v_attempts), true);
      update public.automation_runs
         set status = 'waiting', context = r.context, current_step_ids = array[v_id] || v_frontier,
             executed_steps = executed_steps + n,
             resume_at = case when v_out ? 'resume_at' then (v_out->>'resume_at')::timestamptz else null end,
             pending_step_id = case when v_out ? 'pending_kind' then v_id end,
             pending_kind = v_out->>'pending_kind'
       where id = p_run;
      perform set_config('helpoint.automation', v_prev, true);
      return;
    end if;

    if v_out->>'status' = 'stop' then
      r.context := jsonb_set(r.context, array['steps', v_id], v_info || jsonb_build_object('status', 'stopped', 'result', v_out->'result', 'ended_at', now()), true);
      continue;
    end if;

    -- success
    r.context := jsonb_set(r.context, array['steps', v_id], v_info || jsonb_build_object('status', 'success', 'result', coalesce(v_out->'result', '{}'::jsonb), 'ended_at', now()), true);
    v_next := coalesce(v_out #> '{result,next}', v_step->'next', '[]'::jsonb);
    v_frontier := v_frontier || (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(v_next) x);
  end loop;

  if cardinality(v_frontier) > 0 then
    -- estourou o teto: guarda onde parou e volta pela fila (o tick continua)
    update public.automation_runs
       set status = 'queued', context = r.context, current_step_ids = v_frontier, executed_steps = executed_steps + n, resume_at = now()
     where id = p_run;
  else
    update public.automation_runs
       set status = 'completed', context = r.context, current_step_ids = '{}', executed_steps = executed_steps + n, ended_at = now()
     where id = p_run;
    update public.automation_workflows set last_run_at = now(), last_error = null, run_count = run_count + 1 where id = r.workflow_id;
  end if;
  perform set_config('helpoint.automation', v_prev, true);
end;
$$;

-- Passo externo terminou (worker, leva A2): grava e segue. Só service role chama.
create or replace function public.automation_complete_external(p_run uuid, p_step text, p_result jsonb default null, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r      public.automation_runs;
  v_step jsonb;
  v_info jsonb;
  v_next jsonb;
begin
  select * into r from public.automation_runs where id = p_run for update;
  if r.id is null or r.status not in ('waiting', 'running') or r.pending_step_id is distinct from p_step then
    raise exception 'run nao esta esperando o passo %', p_step;
  end if;
  v_step := public.automation_step(r.flow, p_step);
  v_info := coalesce(r.context #> array['steps', p_step], '{}'::jsonb);
  if p_error is not null then
    if coalesce((v_step->>'continue_on_failure')::boolean, false) then
      r.context := jsonb_set(r.context, array['steps', p_step], v_info || jsonb_build_object('status', 'failed_safely', 'error', left(p_error, 500), 'ended_at', now()), true);
    else
      update public.automation_runs
         set status = 'failed', pending_step_id = null, pending_kind = null, current_step_ids = '{}',
             context = jsonb_set(r.context, array['steps', p_step], v_info || jsonb_build_object('status', 'failed', 'error', left(p_error, 500), 'ended_at', now()), true),
             error = coalesce(v_step->>'name', v_step->>'kind') || ': ' || left(p_error, 200), ended_at = now()
       where id = p_run;
      update public.automation_workflows set last_run_at = now(), last_error = left(p_error, 500) where id = r.workflow_id;
      return;
    end if;
  else
    r.context := jsonb_set(r.context, array['steps', p_step], v_info || jsonb_build_object('status', 'success', 'result', coalesce(p_result, '{}'::jsonb), 'ended_at', now()), true);
  end if;
  v_next := coalesce(v_step->'next', '[]'::jsonb);
  update public.automation_runs
     set status = 'queued', pending_step_id = null, pending_kind = null, context = r.context,
         current_step_ids = (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(v_next) x) || r.current_step_ids[2:],
         resume_at = now()
   where id = p_run;
  perform public.automation_advance(p_run);
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Abrir um run e enfileirar por evento de registro
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.automation_start_run(w public.automation_workflows, p_kind text, p_subject_type text, p_subject_id uuid, p_ctx jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run uuid;
begin
  insert into public.automation_runs (tenant_id, workflow_id, status, trigger_kind, subject_type, subject_id, flow, context, current_step_ids)
  values (w.tenant_id, w.id, 'queued', p_kind, p_subject_type, p_subject_id,
          jsonb_build_object('trigger', w.trigger, 'steps', w.steps),
          coalesce(p_ctx, '{}'::jsonb) || jsonb_build_object('steps', '{}'::jsonb, 'workflow', jsonb_build_object('id', w.id, 'name', w.name)),
          (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(coalesce(w.trigger->'next', '[]'::jsonb)) x))
  returning id into v_run;
  return v_run;
end;
$$;

create or replace function public.automation_enqueue(p_tenant uuid, p_module text, p_entity text, p_event text, p_payload jsonb, p_subject uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  w     public.automation_workflows;
  v_ctx jsonb;
  v_run uuid;
  n     int := 0;
begin
  for w in
    select * from public.automation_workflows
     where tenant_id = p_tenant and module = p_module and status = 'active'
       and trigger->>'kind' = p_event and trigger->>'entity' = p_entity
     order by created_at
  loop
    if p_event = 'record_updated' and jsonb_typeof(w.trigger->'fields') = 'array' and jsonb_array_length(w.trigger->'fields') > 0
       and not exists (select 1 from jsonb_array_elements_text(w.trigger->'fields') f
                        where f in (select jsonb_array_elements_text(coalesce(p_payload->'updated_fields', '[]'::jsonb)))) then
      continue;
    end if;
    v_ctx := jsonb_build_object(
      'trigger', p_payload || jsonb_build_object('kind', p_event, 'entity', p_entity),
      'subject', jsonb_build_object('type', p_entity, 'id', p_subject));
    if not public.automation_filter_matches(w.trigger->'filter', v_ctx) then
      continue;
    end if;
    v_run := public.automation_start_run(w, p_event, p_entity, p_subject, v_ctx);
    perform public.automation_advance(v_run);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Trigger genérica: after insert/update em tickets, crm_deals, crm_contacts, crm_orders.
create or replace function public.automation_on_record_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity  text := tg_argv[0];
  v_event   text;
  v_before  jsonb;
  v_after   jsonb := to_jsonb(new);
  v_updated text[] := '{}';
  v_module  text;
begin
  if coalesce(current_setting('helpoint.automation', true), '0') = '1' then
    return null;   -- escrita feita por fluxo não dispara fluxo
  end if;
  if tg_op = 'INSERT' then
    v_event := 'record_created';
  else
    v_event := 'record_updated';
    v_before := to_jsonb(old);
    select coalesce(array_agg(a.key), '{}') into v_updated
      from jsonb_each(v_after) a
     where a.value is distinct from (v_before -> a.key) and a.key <> 'updated_at';
    if cardinality(v_updated) = 0 then return null; end if;
  end if;
  v_module := case v_entity when 'ticket' then v_after->>'module' else 'comercial' end;
  perform public.automation_enqueue(
    (v_after->>'tenant_id')::uuid, v_module, v_entity, v_event,
    jsonb_build_object('before', v_before, 'after', v_after, 'updated_fields', to_jsonb(v_updated)),
    (v_after->>'id')::uuid);
  return null;
end;
$$;

-- `trg_zz_`: depois dos avisos de casa (ordem alfabética), como no motor antigo.
drop trigger if exists trg_zz_automation_ticket_created on public.tickets;
drop trigger if exists trg_zz_automation_ticket_status on public.tickets;
create trigger trg_zz_automation_ticket after insert or update on public.tickets
  for each row execute function public.automation_on_record_event('ticket');
create trigger trg_zz_automation_crm_deal after insert or update on public.crm_deals
  for each row execute function public.automation_on_record_event('crm_deal');
create trigger trg_zz_automation_crm_contact after insert or update on public.crm_contacts
  for each row execute function public.automation_on_record_event('crm_contact');
create trigger trg_zz_automation_crm_order after insert or update on public.crm_orders
  for each row execute function public.automation_on_record_event('crm_order');

-- ───────────────────────────────────────────────────────────────────────────
-- Agenda: próximo disparo (America/Sao_Paulo fixo — ver ponytail no motor antigo)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.automation_next_schedule(p_trigger jsonb, p_after timestamptz)
returns timestamptz
language plpgsql
immutable
as $$
declare
  v_local timestamp := p_after at time zone 'America/Sao_Paulo';
  v_time  time := coalesce((p_trigger->>'time')::time, '08:00'::time);
  v_cand  timestamp := date_trunc('day', v_local) + v_time;
  v_wd    int := coalesce((p_trigger->>'weekday')::int, 1);
  i       int := 0;
begin
  if p_trigger->>'kind' <> 'schedule' then return null; end if;
  if p_trigger->>'every' = 'week' then
    while (extract(isodow from v_cand)::int <> v_wd or v_cand <= v_local) and i < 8 loop
      v_cand := v_cand + interval '1 day'; i := i + 1;
    end loop;
  elsif v_cand <= v_local then
    v_cand := v_cand + interval '1 day';
  end if;
  return v_cand at time zone 'America/Sao_Paulo';
end;
$$;

create or replace function public.automation_workflows_schedule()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'active' and new.trigger->>'kind' = 'schedule' then
    if tg_op = 'INSERT' or old.status <> 'active' or old.trigger is distinct from new.trigger or new.next_run_at is null then
      new.next_run_at := public.automation_next_schedule(new.trigger, now());
    end if;
  else
    new.next_run_at := null;
  end if;
  return new;
end;
$$;
create trigger trg_automation_workflows_schedule
  before insert or update of status, trigger on public.automation_workflows
  for each row execute function public.automation_workflows_schedule();

-- ───────────────────────────────────────────────────────────────────────────
-- O tick: a cada minuto, SQL puro
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.automation_tick()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  w          public.automation_workflows;
  t          public.tickets;
  v_run      uuid;
  v_id       uuid;
  n_sched    int := 0;
  n_deadline int := 0;
  n_resumed  int := 0;
  n_cleaned  int := 0;
begin
  -- 1. agendados
  for w in
    select * from public.automation_workflows
     where status = 'active' and trigger->>'kind' = 'schedule' and next_run_at is not null and next_run_at <= now()
     order by next_run_at
  loop
    update public.automation_workflows set next_run_at = public.automation_next_schedule(trigger, now()) where id = w.id;
    v_run := public.automation_start_run(w, 'schedule', null, null, jsonb_build_object('trigger', jsonb_build_object('kind', 'schedule', 'at', now())));
    perform public.automation_advance(v_run);
    n_sched := n_sched + 1;
  end loop;

  -- 2. prazo estourado: uma vez por chamado por fluxo
  for w in
    select * from public.automation_workflows where status = 'active' and trigger->>'kind' = 'deadline_expired'
  loop
    for t in
      select tk.* from public.tickets tk
       where tk.tenant_id = w.tenant_id and tk.module = w.module
         and tk.status not in ('resolved', 'closed', 'cancelled', 'rejected')
         and coalesce(tk.due_date, tk.sla_due_at) < now()
         and not exists (select 1 from public.automation_fired f where f.workflow_id = w.id and f.subject_id = tk.id)
       order by tk.created_at
    loop
      if not public.automation_filter_matches(w.trigger->'filter',
           jsonb_build_object('trigger', jsonb_build_object('after', to_jsonb(t)))) then
        continue;
      end if;
      insert into public.automation_fired (workflow_id, subject_id) values (w.id, t.id);
      v_run := public.automation_start_run(w, 'deadline_expired', 'ticket', t.id,
                 jsonb_build_object('trigger', jsonb_build_object('kind', 'deadline_expired', 'entity', 'ticket', 'after', to_jsonb(t)),
                                    'subject', jsonb_build_object('type', 'ticket', 'id', t.id)));
      perform public.automation_advance(v_run);
      n_deadline := n_deadline + 1;
    end loop;
  end loop;

  -- 3. runs na fila ou em espera vencida (passo externo espera o worker, não o tick)
  for v_id in
    select id from public.automation_runs
     where (status = 'queued' or (status = 'waiting' and pending_kind is null and resume_at <= now()))
     order by created_at
     limit 50
     for update skip locked
  loop
    update public.automation_runs set status = 'queued' where id = v_id;
    perform public.automation_advance(v_id);
    n_resumed := n_resumed + 1;
  end loop;

  -- 4. faxina: terminados há mais de 30 dias saem; "rodando" há mais de 1 hora falhou
  with d as (delete from public.automation_runs where status in ('completed', 'failed', 'cancelled') and ended_at < now() - interval '30 days' returning 1)
  select count(*) into n_cleaned from d;
  update public.automation_runs set status = 'failed', error = 'travado há mais de 1 hora', ended_at = now()
   where status = 'running' and started_at < now() - interval '1 hour';

  return jsonb_build_object('scheduled', n_sched, 'deadline', n_deadline, 'resumed', n_resumed, 'cleaned', n_cleaned);
end;
$$;

-- Cancelar um run (quem tem o módulo, na própria empresa).
create or replace function public.automation_cancel_run(p_run uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r public.automation_runs;
begin
  select * into r from public.automation_runs where id = p_run;
  if r.id is null or r.tenant_id is distinct from public.get_user_tenant_id() then
    raise exception 'execução não encontrada';
  end if;
  if r.status in ('completed', 'failed', 'cancelled') then
    raise exception 'esta execução já terminou';
  end if;
  update public.automation_runs set status = 'cancelled', pending_step_id = null, pending_kind = null, current_step_ids = '{}', ended_at = now() where id = p_run;
end;
$$;

revoke all on function public.automation_run_step(public.automation_runs, jsonb)                          from public, anon, authenticated;
revoke all on function public.automation_advance(uuid)                                                    from public, anon, authenticated;
revoke all on function public.automation_complete_external(uuid, text, jsonb, text)                       from public, anon, authenticated;
revoke all on function public.automation_start_run(public.automation_workflows, text, text, uuid, jsonb)  from public, anon, authenticated;
revoke all on function public.automation_enqueue(uuid, text, text, text, jsonb, uuid)                     from public, anon, authenticated;
revoke all on function public.automation_tick()                                                           from public, anon, authenticated;
revoke all on function public.automation_cancel_run(uuid)                                                 from public, anon;

-- ───────────────────────────────────────────────────────────────────────────
-- Conversão das regras da L2 em fluxos de um passo; depois o motor antigo sai
-- ───────────────────────────────────────────────────────────────────────────
insert into public.automation_workflows (id, tenant_id, module, name, status, trigger, steps, last_run_at, last_error, run_count, created_by, created_at)
select
  r.id, r.tenant_id, r.module, r.name,
  case when r.is_active then 'active' else 'paused' end,
  case r.trigger_kind
    when 'ticket_created' then jsonb_build_object('kind', 'record_created', 'entity', 'ticket', 'next', jsonb_build_array('s1'),
      'filter', jsonb_build_object('op', 'and', 'rules', (
        select coalesce(jsonb_agg(x), '[]'::jsonb) from (
          select jsonb_build_object('path', 'trigger.after.category_id', 'cmp', 'eq', 'value', r.trigger_config->'category_id') as x where r.trigger_config ? 'category_id'
          union all
          select jsonb_build_object('path', 'trigger.after.priority', 'cmp', 'eq', 'value', r.trigger_config->'priority') where r.trigger_config ? 'priority'
        ) q)))
    when 'ticket_status_changed' then jsonb_build_object('kind', 'record_updated', 'entity', 'ticket', 'fields', jsonb_build_array('status'), 'next', jsonb_build_array('s1'),
      'filter', jsonb_build_object('op', 'and', 'rules', (
        select coalesce(jsonb_agg(x), '[]'::jsonb) from (
          select jsonb_build_object('path', 'trigger.after.status', 'cmp', 'eq', 'value', r.trigger_config->'status') as x where r.trigger_config ? 'status'
          union all
          select jsonb_build_object('path', 'trigger.after.category_id', 'cmp', 'eq', 'value', r.trigger_config->'category_id') where r.trigger_config ? 'category_id'
          union all
          select jsonb_build_object('path', 'trigger.after.priority', 'cmp', 'eq', 'value', r.trigger_config->'priority') where r.trigger_config ? 'priority'
        ) q)))
    when 'ticket_deadline_expired' then jsonb_build_object('kind', 'deadline_expired', 'entity', 'ticket', 'next', jsonb_build_array('s1'),
      'filter', jsonb_build_object('op', 'and', 'rules', (
        select coalesce(jsonb_agg(x), '[]'::jsonb) from (
          select jsonb_build_object('path', 'trigger.after.category_id', 'cmp', 'eq', 'value', r.trigger_config->'category_id') as x where r.trigger_config ? 'category_id'
          union all
          select jsonb_build_object('path', 'trigger.after.priority', 'cmp', 'eq', 'value', r.trigger_config->'priority') where r.trigger_config ? 'priority'
        ) q)))
    else jsonb_build_object('kind', 'schedule', 'every', coalesce(r.trigger_config->>'every', 'day'),
           'weekday', coalesce((r.trigger_config->>'weekday')::int, 1), 'time', coalesce(r.trigger_config->>'time', '08:00'), 'next', jsonb_build_array('s1'))
  end,
  jsonb_build_array(jsonb_build_object(
    'id', 's1', 'kind', r.action_kind, 'next', '[]'::jsonb,
    'config', replace(replace(replace(r.action_config::text,
                '{numero}', '{{trigger.after.ticket_number}}'),
                '{titulo}', '{{trigger.after.title}}'),
                '{status}', '{{trigger.after.status}}')::jsonb)),
  r.last_run_at, r.last_error, r.run_count, r.created_by, r.created_at
from public.automation_rules r;

drop function if exists public.run_automations_tick();
drop function if exists public.automation_on_ticket_insert();
drop function if exists public.automation_on_ticket_status();
drop function if exists public.automation_evaluate(text, public.tickets);
drop function if exists public.automation_matches(jsonb, public.tickets);
drop function if exists public.automation_fire(public.automation_rules, public.tickets);
drop function if exists public.automation_run_action(public.automation_rules, public.tickets);
drop function if exists public.automation_template(text, public.tickets);
drop table public.automation_rules;

-- ───────────────────────────────────────────────────────────────────────────
-- Cron: a cada minuto, SQL puro (substitui automations-tick-5min)
-- ───────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'automations-tick-5min') then
    perform cron.unschedule('automations-tick-5min');
  end if;
  if exists (select 1 from cron.job where jobname = 'automations-tick-1min') then
    perform cron.unschedule('automations-tick-1min');
  end if;
end $$;
select cron.schedule('automations-tick-1min', '* * * * *', $job$ select public.automation_tick(); $job$);

-- Fluxo não repete chamado, e módulo inventado não passa. 2026-09-13.
--
-- As três ressalvas que o dono aprovou corrigir, em ordem.
--
-- **1. O mesmo fluxo abria o mesmo chamado duas vezes.** O fluxo "Cadastro
-- concluído → cobrar" dispara quando o chamado muda de status e o novo status é
-- "resolvido" **ou** "fechado": quem resolve e depois fecha dispara duas vezes.
-- Antes isso virava duas tarefas numa lista pessoal e passava batido; desde que
-- toda tarefa de fluxo virou chamado, vira duas demandas com número, relógio de
-- prazo e peso nos indicadores. Agora o passo **reaproveita** o chamado que já
-- está aberto, em vez de abrir outro.
--
-- **2. Reexecutar execução sem passo falho recomeçava do início** e criava um
-- par a mais. Não precisa de código próprio: a guarda acima pega esse caminho
-- também, porque o chamado anterior continua aberto.
--
-- **3. Módulo inventado passava no salvamento** e só quebrava na hora de rodar.
-- Agora a validação confere contra a lista de módulos que têm fila de chamados.
--
-- A chave da guarda é (empresa, fluxo, **passo**, registro de origem): um fluxo
-- com dois passos que abrem chamado — um na TI, outro no Financeiro — continua
-- abrindo os dois. Gatilho sem registro de origem (agenda, webhook) não entra na
-- guarda, porque repetir é a natureza dele.

-- ── De onde o chamado veio ──────────────────────────────────────────────────
alter table public.tickets
  add column origin_workflow_id uuid references public.automation_workflows(id) on delete set null,
  add column origin_step_id     text,
  add column origin_subject_id  uuid;

comment on column public.tickets.origin_workflow_id is
  'Fluxo que abriu este chamado. Junto com o passo e o registro de origem, impede o mesmo fluxo de abrir o mesmo chamado duas vezes.';

-- Rede de baixo: mesmo que alguém insira por fora, não nascem dois abertos.
create unique index tickets_origem_do_fluxo_idx
  on public.tickets (tenant_id, origin_workflow_id, origin_step_id, origin_subject_id)
  where origin_workflow_id is not null
    and origin_subject_id is not null
    and status not in ('resolved', 'closed', 'cancelled', 'rejected');

-- ── Abrir chamado de passo de fluxo, sem repetir ────────────────────────────
-- Os dois passos que abrem chamado ("abrir chamado" e "criar tarefa") passam a
-- chamar esta função, em vez de cada um ter o seu INSERT. Mudança futura no
-- chamado de fluxo mexe aqui, não na função gigante do motor.
create or replace function public.automation_ticket_do_passo(
  p_run       public.automation_runs,
  p_workflow  public.automation_workflows,
  p_step      jsonb,
  p_module    text,
  p_title     text,
  p_description text,
  p_priority  public.ticket_priority,
  p_category  uuid,
  p_requester uuid,
  p_assigned  uuid,
  p_due       date
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Já existe chamado aberto deste passo para este registro? Reaproveita.
  if p_run.subject_id is not null then
    select t.id into v_id
      from public.tickets t
     where t.tenant_id = p_run.tenant_id
       and t.origin_workflow_id = p_workflow.id
       and t.origin_step_id is not distinct from (p_step->>'id')
       and t.origin_subject_id = p_run.subject_id
       and t.status not in ('resolved', 'closed', 'cancelled', 'rejected')
     limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  insert into public.tickets (
    tenant_id, module, title, description, priority, status, category_id,
    requester_id, created_by, assigned_to, due_date,
    origin_workflow_id, origin_step_id, origin_subject_id
  )
  values (
    p_run.tenant_id, p_module, p_title, p_description, p_priority, 'open', p_category,
    p_requester, p_workflow.created_by, p_assigned, p_due,
    p_workflow.id, p_step->>'id', p_run.subject_id
  )
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.automation_ticket_do_passo(public.automation_runs, public.automation_workflows, jsonb, text, text, text, public.ticket_priority, uuid, uuid, uuid, date) from public, anon, authenticated;

-- ── O passo "abrir chamado" passa a usar a função ───────────────────────────
do $do$
declare d text; n int; alvo text;
begin
  alvo := $x$    insert into public.tickets (tenant_id, module, title, description, priority, status, category_id, requester_id, created_by, assigned_to)
    values (r.tenant_id,
            coalesce(nullif(nullif(cfg->>'module', ''), 'crm'), case when w.module = 'crm' then 'comercial' else w.module end),
            coalesce(nullif(public.automation_render(cfg->>'title', ctx), ''), w.name),
            coalesce(nullif(public.automation_render(cfg->>'description', ctx), ''), 'Aberto pela automação "' || w.name || '".'),
            coalesce((cfg->>'priority')::public.ticket_priority, 'medium'),
            'open',
            nullif(cfg->>'category_id', '')::uuid,
            coalesce(public.automation_target_user(jsonb_build_object('target', cfg->>'requester_target'), ctx),
                     nullif(ctx #>> '{trigger,after,requester_id}', '')::uuid, w.created_by),
            w.created_by,
            nullif(cfg->>'assigned_to', '')::uuid)
    returning id into v_id;$x$;
  select pg_get_functiondef('public.automation_run_step(public.automation_runs, jsonb)'::regprocedure) into d;
  n := (length(d) - length(replace(d, alvo, ''))) / length(alvo);
  if n <> 1 then raise exception 'automation_run_step: esperava 1 insert do passo "abrir chamado", achei %', n; end if;

  execute replace(d, alvo,
    $x$    v_id := public.automation_ticket_do_passo(r, w, p_step,
      coalesce(nullif(nullif(cfg->>'module', ''), 'crm'), case when w.module = 'crm' then 'comercial' else w.module end),
      coalesce(nullif(public.automation_render(cfg->>'title', ctx), ''), w.name),
      coalesce(nullif(public.automation_render(cfg->>'description', ctx), ''), 'Aberto pela automação "' || w.name || '".'),
      coalesce((cfg->>'priority')::public.ticket_priority, 'medium'),
      nullif(cfg->>'category_id', '')::uuid,
      coalesce(public.automation_target_user(jsonb_build_object('target', cfg->>'requester_target'), ctx),
               nullif(ctx #>> '{trigger,after,requester_id}', '')::uuid, w.created_by),
      nullif(cfg->>'assigned_to', '')::uuid,
      null::date);$x$);
end $do$;

-- ── O passo "criar tarefa" idem, e a tarefa não nasce duas vezes ────────────
do $do$
declare d text; n int; alvo text;
begin
  alvo := $x$    -- A tarefa nasce com o chamado dela: sem chamado o trabalho nao entra
    -- em relatorio nenhum. O modulo vem do passo; sem ele, o do fluxo (e o CRM,
    -- que nao tem fila, cai no Comercial).
    insert into public.tickets (tenant_id, module, title, description, priority, status, category_id, requester_id, created_by, assigned_to, due_date)
    values (r.tenant_id,
            coalesce(nullif(nullif(cfg->>'module', ''), 'crm'), case when w.module = 'crm' then 'comercial' else w.module end),
            coalesce(nullif(public.automation_render(cfg->>'title', ctx), ''), w.name),
            coalesce(nullif(public.automation_render(cfg->>'description', ctx), ''), 'Aberto pela automação "' || w.name || '".'),
            case coalesce((cfg->>'priority')::int, 3)
              when 1 then 'critical'::public.ticket_priority
              when 2 then 'high'::public.ticket_priority
              when 3 then 'medium'::public.ticket_priority
              else 'low'::public.ticket_priority end,
            'open',
            nullif(cfg->>'category_id', '')::uuid,
            coalesce(nullif(ctx #>> '{trigger,after,requester_id}', '')::uuid, w.created_by),
            w.created_by,
            v_user,
            case when cfg ? 'due_in_days' then (now() + make_interval(days => (cfg->>'due_in_days')::int))::date end)
    returning id into v_ticket;$x$;
  select pg_get_functiondef('public.automation_run_step(public.automation_runs, jsonb)'::regprocedure) into d;
  n := (length(d) - length(replace(d, alvo, ''))) / length(alvo);
  if n <> 1 then raise exception 'automation_run_step: esperava 1 insert de chamado da tarefa, achei %', n; end if;

  execute replace(d, alvo,
    $x$    -- A tarefa nasce com o chamado dela: sem chamado o trabalho nao entra
    -- em relatorio nenhum. O modulo vem do passo; sem ele, o do fluxo (e o CRM,
    -- que nao tem fila, cai no Comercial). Disparo repetido reaproveita o
    -- chamado que ja esta aberto, em vez de abrir outro.
    v_ticket := public.automation_ticket_do_passo(r, w, p_step,
      coalesce(nullif(nullif(cfg->>'module', ''), 'crm'), case when w.module = 'crm' then 'comercial' else w.module end),
      coalesce(nullif(public.automation_render(cfg->>'title', ctx), ''), w.name),
      coalesce(nullif(public.automation_render(cfg->>'description', ctx), ''), 'Aberto pela automação "' || w.name || '".'),
      case coalesce((cfg->>'priority')::int, 3)
        when 1 then 'critical'::public.ticket_priority
        when 2 then 'high'::public.ticket_priority
        when 3 then 'medium'::public.ticket_priority
        else 'low'::public.ticket_priority end,
      nullif(cfg->>'category_id', '')::uuid,
      coalesce(nullif(ctx #>> '{trigger,after,requester_id}', '')::uuid, w.created_by),
      v_user,
      case when cfg ? 'due_in_days' then (now() + make_interval(days => (cfg->>'due_in_days')::int))::date end);$x$);
end $do$;

-- A tarefa segue o chamado: se o chamado foi reaproveitado, a tarefa dele já
-- existe e não nasce outra.
do $do$
declare d text; n int; alvo text;
begin
  alvo := $x$    insert into public.tasks (tenant_id, user_id, title, description, priority, due_date, source_type, source_id, ticket_id)
    values (r.tenant_id, v_user,
            coalesce(nullif(public.automation_render(cfg->>'title', ctx), ''), w.name),
            public.automation_render(cfg->>'description', ctx),
            coalesce((cfg->>'priority')::int, 3),
            case when cfg ? 'due_in_days' then now() + make_interval(days => (cfg->>'due_in_days')::int) end,
            'automation', w.id, v_ticket)
    returning id into v_id;$x$;
  select pg_get_functiondef('public.automation_run_step(public.automation_runs, jsonb)'::regprocedure) into d;
  n := (length(d) - length(replace(d, alvo, ''))) / length(alvo);
  if n <> 1 then raise exception 'automation_run_step: esperava 1 insert de tarefa, achei %', n; end if;

  execute replace(d, alvo,
    $x$    insert into public.tasks (tenant_id, user_id, title, description, priority, due_date, source_type, source_id, ticket_id)
    select r.tenant_id, v_user,
           coalesce(nullif(public.automation_render(cfg->>'title', ctx), ''), w.name),
           public.automation_render(cfg->>'description', ctx),
           coalesce((cfg->>'priority')::int, 3),
           case when cfg ? 'due_in_days' then now() + make_interval(days => (cfg->>'due_in_days')::int) end,
           'automation', w.id, v_ticket
     where not exists (select 1 from public.tasks t where t.ticket_id = v_ticket)
    returning id into v_id;$x$);
end $do$;

-- ── 3. Módulo do passo tem que existir ──────────────────────────────────────
do $do$
declare d text; n int; alvo text;
begin
  alvo := $x$    if s->>'kind' in ('create_ticket', 'create_task') and s->'config'->>'module' = 'crm' then
      raise exception 'o CRM nao tem fila de chamados: escolha o modulo onde o chamado nasce';
    end if;$x$;
  select pg_get_functiondef('public.automation_validate_flow(jsonb, jsonb)'::regprocedure) into d;
  n := (length(d) - length(replace(d, alvo, ''))) / length(alvo);
  if n <> 1 then raise exception 'automation_validate_flow: esperava 1 guard de modulo, achei %', n; end if;

  execute replace(d, alvo,
    $x$    if s->>'kind' in ('create_ticket', 'create_task') and s->'config'->>'module' = 'crm' then
      raise exception 'o CRM nao tem fila de chamados: escolha o modulo onde o chamado nasce';
    end if;
    -- Modulo inventado passava e so quebrava na hora de rodar. A lista e a
    -- mesma do CHECK de `tickets.module` (sem 'crm', que ja caiu acima).
    if s->>'kind' in ('create_ticket', 'create_task')
       and coalesce(s->'config'->>'module', '') <> ''
       and s->'config'->>'module' not in ('tickets', 'marketing', 'qualidade', 'rh', 'financeiro', 'comercial', 'educacional') then
      raise exception 'modulo desconhecido no passo: %', s->'config'->>'module';
    end if;$x$);
end $do$;

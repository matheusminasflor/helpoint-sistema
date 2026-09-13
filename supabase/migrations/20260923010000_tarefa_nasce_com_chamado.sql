-- Leva "tarefa de fluxo nasce com chamado". 2026-09-13.
--
-- Decisão do dono: **trabalho que nasce de um fluxo automatizado tem que virar
-- chamado**, no módulo que o próprio fluxo manda, já atribuído ao atendente.
-- O motivo é medição — "isso gera relatórios e dados e controle das demandas".
-- Tarefa solta não entra em indicador nenhum: não tem módulo, não tem fila, não
-- tem SLA, e some do controle de quem gerencia.
--
-- O que muda:
--   tasks.ticket_id            a tarefa aponta para o chamado que a representa
--   passo `create_task`        cria o chamado **e** a tarefa, ligados
--   automation_validate_flow   o passo `create_task` também recusa o módulo 'crm'
--   fluxos e tarefas de antes  ganham o módulo e o chamado que faltavam
--
-- Quem decide o módulo é o fluxo, não uma regra fixa: o mesmo passo que hoje
-- manda "abrir chamado na TI para cadastrar o cliente no ERP" passa a mandar
-- também para onde vai a cobrança. O CRM continua sem fila de chamados
-- (ADR-009), então fluxo de CRM sem módulo escolhido cai no Comercial.

-- ── 1. O par tarefa ↔ chamado, sem furar a empresa ──────────────────────────
-- Chave composta, como em `exp_stock_moves`: policy só por `tenant_id` não
-- impede apontar para o chamado de outra empresa.
alter table public.tickets add constraint tickets_id_tenant_key unique (id, tenant_id);

alter table public.tasks
  add column ticket_id uuid,
  add constraint tasks_ticket_id_tenant_id_fkey
    foreign key (ticket_id, tenant_id) references public.tickets(id, tenant_id) on delete set null;

create index tasks_ticket_idx on public.tasks (ticket_id) where ticket_id is not null;

comment on column public.tasks.ticket_id is
  'O chamado que representa esta tarefa na fila do módulo. Tarefa de fluxo sempre tem um.';

-- ── 2. O passo `create_task` passa a abrir o chamado junto ──────────────────
-- A variável do chamado criado junto, antes de qualquer uso dela.
do $do$
declare d text; n int;
begin
  select pg_get_functiondef('public.automation_run_step(public.automation_runs, jsonb)'::regprocedure) into d;
  n := (length(d) - length(replace(d, $x$  v_id      uuid;$x$, ''))) / length($x$  v_id      uuid;$x$);
  if n <> 1 then raise exception 'automation_run_step: esperava 1 declaracao de v_id, achei %', n; end if;
  execute replace(d, $x$  v_id      uuid;$x$, $x$  v_id      uuid;
  v_ticket  uuid;$x$);
end $do$;

do $do$
declare d text; n int;
begin
  select pg_get_functiondef('public.automation_run_step(public.automation_runs, jsonb)'::regprocedure) into d;
  n := (length(d) - length(replace(d, $x$            'automation', w.id)
    returning id into v_id;$x$, ''))) / length($x$            'automation', w.id)
    returning id into v_id;$x$);
  if n <> 1 then raise exception 'automation_run_step: esperava 1 insert de tarefa, achei %', n; end if;

  execute replace(d,
    $x$    insert into public.tasks (tenant_id, user_id, title, description, priority, due_date, source_type, source_id)
    values (r.tenant_id, v_user,
            coalesce(nullif(public.automation_render(cfg->>'title', ctx), ''), w.name),
            public.automation_render(cfg->>'description', ctx),
            coalesce((cfg->>'priority')::int, 3),
            case when cfg ? 'due_in_days' then now() + make_interval(days => (cfg->>'due_in_days')::int) end,
            'automation', w.id)
    returning id into v_id;$x$,
    $x$    -- A tarefa nasce com o chamado dela: sem chamado o trabalho nao entra
    -- em relatorio nenhum. O modulo vem do passo; sem ele, o do fluxo (e o CRM,
    -- que nao tem fila, cai no Comercial).
    insert into public.tickets (tenant_id, module, title, description, priority, status, category_id, requester_id, created_by, assigned_to)
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
            v_user)
    returning id into v_ticket;

    insert into public.tasks (tenant_id, user_id, title, description, priority, due_date, source_type, source_id, ticket_id)
    values (r.tenant_id, v_user,
            coalesce(nullif(public.automation_render(cfg->>'title', ctx), ''), w.name),
            public.automation_render(cfg->>'description', ctx),
            coalesce((cfg->>'priority')::int, 3),
            case when cfg ? 'due_in_days' then now() + make_interval(days => (cfg->>'due_in_days')::int) end,
            'automation', w.id, v_ticket)
    returning id into v_id;$x$);
end $do$;

-- E a resposta do passo passa a dizer os dois ids.
do $do$
declare d text; n int;
begin
  select pg_get_functiondef('public.automation_run_step(public.automation_runs, jsonb)'::regprocedure) into d;
  n := (length(d) - length(replace(d, $x$jsonb_build_object('task_id', v_id)$x$, ''))) / length($x$jsonb_build_object('task_id', v_id)$x$);
  if n <> 1 then raise exception 'automation_run_step: esperava 1 retorno de tarefa, achei %', n; end if;
  execute replace(d,
    $x$jsonb_build_object('task_id', v_id)$x$,
    $x$jsonb_build_object('task_id', v_id, 'ticket_id', v_ticket)$x$);
end $do$;

-- ── 3. O passo `create_task` também recusa o módulo 'crm' ───────────────────
do $do$
declare d text; n int;
begin
  select pg_get_functiondef('public.automation_validate_flow(jsonb, jsonb)'::regprocedure) into d;
  n := (length(d) - length(replace(d, $x$    if s->>'kind' = 'create_ticket' and s->'config'->>'module' = 'crm' then$x$, ''))) / length($x$    if s->>'kind' = 'create_ticket' and s->'config'->>'module' = 'crm' then$x$);
  if n <> 1 then raise exception 'automation_validate_flow: esperava 1 guard de modulo, achei %', n; end if;
  execute replace(d,
    $x$    if s->>'kind' = 'create_ticket' and s->'config'->>'module' = 'crm' then$x$,
    $x$    if s->>'kind' in ('create_ticket', 'create_task') and s->'config'->>'module' = 'crm' then$x$);
end $do$;

-- ── 4. Os fluxos que já existem ganham o módulo no passo de tarefa ──────────
update public.automation_workflows w
   set steps = (
     select jsonb_agg(
       case when s->>'kind' = 'create_task' and coalesce(s->'config'->>'module', '') = ''
            then jsonb_set(s, '{config,module}',
                   to_jsonb(case when w.module = 'crm' then 'comercial' else w.module end))
            else s end
       order by idx)
       from jsonb_array_elements(w.steps) with ordinality as e(s, idx))
 where exists (
   select 1 from jsonb_array_elements(w.steps) s
    where s->>'kind' = 'create_task' and coalesce(s->'config'->>'module', '') = '');

-- ── 5. As tarefas de fluxo que já existem ganham o chamado que faltava ──────
-- Sem isto elas continuariam fora de todo indicador, que é justamente o que a
-- decisão veio corrigir.
do $do$
declare o record; v_ticket uuid;
begin
  for o in
    select t.id, t.tenant_id, t.user_id, t.title, t.description, t.priority,
           case when w.module = 'crm' then 'comercial' else coalesce(w.module, 'tickets') end as modulo,
           w.name as fluxo, w.created_by
      from public.tasks t
      join public.automation_workflows w on w.id = t.source_id
     where t.source_type = 'automation'
       and t.ticket_id is null
       and t.status in ('pending', 'in_progress')
  loop
    insert into public.tickets (tenant_id, module, title, description, priority, status, requester_id, created_by, assigned_to)
    values (o.tenant_id, o.modulo, o.title,
            coalesce(o.description, 'Aberto pela automação "' || o.fluxo || '".'),
            case o.priority when 1 then 'critical'::public.ticket_priority
                            when 2 then 'high'::public.ticket_priority
                            when 3 then 'medium'::public.ticket_priority
                            else 'low'::public.ticket_priority end,
            'open', coalesce(o.created_by, o.user_id), o.created_by, o.user_id)
    returning id into v_ticket;

    update public.tasks set ticket_id = v_ticket where id = o.id;
  end loop;
end $do$;

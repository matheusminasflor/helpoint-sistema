-- Leva E5-A3 (ADR-007): ramificação com ramos perdedores marcados, e
-- reexecução de run que falhou. 2026-09-12.
--
-- O passo `branch` já era executado (20260912010000): escolhe o primeiro ramo
-- cujo filtro casa e o executor segue por `result.next`. O que entra aqui:
--
--   ramos perdedores viram `skipped` no contexto — é o que a página de
--   execuções pinta, e é a semântica do Twenty (`getEffectiveParentStatus`):
--   um pai pulado não segura a junção;
--   automation_retry_run(run): run `failed` volta para a fila a partir dos
--   passos que falharam, com o MESMO snapshot do fluxo e o mesmo contexto do
--   gatilho (o que mudou no fluxo depois não entra — é o que se espera de
--   "tentar de novo").

-- ───────────────────────────────────────────────────────────────────────────
-- Executor: ao escolher um ramo, marca as cabeças dos outros como pulados
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.automation_mark_skipped(p_ctx jsonb, p_flow jsonb, p_step jsonb, p_chosen jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_ctx   jsonb := p_ctx;
  v_ids   text[] := '{}';
  v_head  text;
  b       jsonb;
begin
  -- todas as cabeças de ramo (inclusive o "senão")…
  for b in select * from jsonb_array_elements(coalesce(p_step->'config'->'branches', '[]'::jsonb)) loop
    v_ids := v_ids || (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(coalesce(b->'next', '[]'::jsonb)) x);
  end loop;
  v_ids := v_ids || (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(coalesce(p_step->'config'->'else_next', '[]'::jsonb)) x);
  -- …menos as do ramo escolhido
  v_ids := (select coalesce(array_agg(x), '{}') from unnest(v_ids) x
             where x not in (select jsonb_array_elements_text(coalesce(p_chosen, '[]'::jsonb))));
  foreach v_head in array v_ids loop
    if coalesce(v_ctx #> array['steps', v_head] ->> 'status', '') = '' then
      v_ctx := jsonb_set(v_ctx, array['steps', v_head], jsonb_build_object('status', 'skipped'), true);
    end if;
  end loop;
  return v_ctx;
end;
$$;

-- Só a parte do executor que muda: depois de um passo com sucesso, se for `branch`, marca os pulados.
-- (Reescreve automation_advance inteira porque plpgsql não tem "patch".)
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
  c_max      constant int := 20;
  c_delays   constant interval[] := array['1 second', '5 seconds', '15 seconds']::interval[];
  n          int := 0;
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
    if v_info->>'status' = 'pending' and v_step->>'kind' = 'delay' and (v_info->>'error') is null then
      r.context := jsonb_set(r.context, array['steps', v_id], v_info || jsonb_build_object('status', 'success', 'ended_at', now()), true);
      v_frontier := v_frontier || (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(coalesce(v_step->'next', '[]'::jsonb)) x);
      continue;
    end if;

    -- Junção: não roda enquanto algum pai ainda está rodando ou esperando; pai pulado não segura.
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
        v_frontier := v_frontier || (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(coalesce(v_step->'next', '[]'::jsonb)) x);
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

    r.context := jsonb_set(r.context, array['steps', v_id], v_info || jsonb_build_object('status', 'success', 'result', coalesce(v_out->'result', '{}'::jsonb), 'ended_at', now()), true);
    v_next := coalesce(v_out #> '{result,next}', v_step->'next', '[]'::jsonb);
    if v_step->>'kind' = 'branch' then
      r.context := public.automation_mark_skipped(r.context, r.flow, v_step, v_next);
    end if;
    v_frontier := v_frontier || (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(v_next) x);
  end loop;

  if cardinality(v_frontier) > 0 then
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

-- ───────────────────────────────────────────────────────────────────────────
-- Reexecutar um run que falhou: a partir dos passos que falharam
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.automation_retry_run(p_run uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r       public.automation_runs;
  v_ctx   jsonb;
  v_ids   text[];
  k       text;
  v       jsonb;
begin
  select * into r from public.automation_runs where id = p_run for update;
  if r.id is null or r.tenant_id is distinct from public.get_user_tenant_id() then
    raise exception 'execução não encontrada';
  end if;
  if r.status <> 'failed' then
    raise exception 'só uma execução que falhou pode ser reexecutada';
  end if;

  v_ctx := r.context;
  v_ids := '{}';
  for k, v in select * from jsonb_each(coalesce(r.context->'steps', '{}'::jsonb)) loop
    if v->>'status' = 'failed' then
      v_ids := v_ids || k;
      v_ctx := jsonb_set(v_ctx, array['steps', k], v - 'status' - 'error' - 'ended_at' || jsonb_build_object('attempts', 0, 'retried_at', now()), true);
    end if;
  end loop;
  if cardinality(v_ids) = 0 then
    -- falhou fora de passo (ex.: travado): recomeça do gatilho
    v_ids := (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(coalesce(r.flow->'trigger'->'next', '[]'::jsonb)) x);
  end if;

  update public.automation_runs
     set status = 'queued', context = v_ctx, current_step_ids = v_ids, error = null, ended_at = null,
         pending_step_id = null, pending_kind = null, resume_at = now()
   where id = p_run;
  perform public.automation_advance(p_run);
end;
$$;

revoke all on function public.automation_mark_skipped(jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.automation_retry_run(uuid) from public, anon;

-- AUTOMAÇÃO AGENDADA NÃO RODA NO FERIADO (dono, 2026-10-08).
--
-- "A automação dos setores, por exemplo o Educacional fez uma para a TI: segunda agora, dia 12, tem
-- feriado, portanto não deve ter automação disso." Decisão (múltipla escolha): no feriado a automação
-- agendada NÃO roda e espera a próxima data normal (não passa para o dia útil seguinte).
--
-- Feriado é o mesmo que já pausa o prazo do chamado (`trechos_uteis_do_dia`): os nacionais, calculados
-- por `feriados_nacionais` (Carnaval e Corpus Christi inclusos), e os que o RH cadastra em
-- `feriados_da_empresa`. Só muda a etapa 1 (agendados) de `automation_tick`; o resto é a função como estava.

create or replace function public.automation_tick()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  w          public.automation_workflows;
  t          public.tickets;
  v_run      uuid;
  v_id       uuid;
  v_dia      date;
  n_sched    int := 0;
  n_feriado  int := 0;
  n_deadline int := 0;
  n_resumed  int := 0;
  n_cleaned  int := 0;
begin
  -- 1. agendados. No feriado da empresa a data passa sem rodar (a próxima é a da regra, não o dia útil seguinte).
  for w in
    select * from public.automation_workflows
     where status = 'active' and trigger->>'kind' = 'schedule' and next_run_at is not null and next_run_at <= now()
     order by next_run_at
  loop
    update public.automation_workflows set next_run_at = public.automation_next_schedule(trigger, now()) where id = w.id;
    v_dia := (w.next_run_at at time zone 'America/Sao_Paulo')::date;
    if exists (select 1 from public.feriados_nacionais(extract(year from v_dia)::int) n where n.data = v_dia)
       or exists (select 1 from public.feriados_da_empresa f where f.tenant_id = w.tenant_id and f.data = v_dia) then
      n_feriado := n_feriado + 1;
      continue;
    end if;
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

  return jsonb_build_object('scheduled', n_sched, 'feriado', n_feriado, 'deadline', n_deadline,
                            'resumed', n_resumed, 'cleaned', n_cleaned);
end;
$$;

-- "Tarefa de fluxo nasce com chamado", correções da auditoria. 2026-09-13.
--
-- O par nascia ligado e depois seguia caminhos separados, o que estragava
-- justamente o que a decisão veio buscar:
--
-- 1. **Nada fechava o outro lado.** Concluir a tarefa deixava o chamado aberto
--    para sempre — inflando a fila do módulo e estourando o SLA de uma demanda
--    que já acabou. Resolver o chamado fazia a tarefa **voltar** ao painel,
--    porque a deduplicação só esconde a tarefa enquanto o chamado está na
--    lista. Era o mesmo item ressuscitando, que é o que confundiu o dono.
-- 2. **O prazo do fluxo sumia.** O passo configura "vence em N dias", mas o
--    chamado nascia sem `due_date`, e a tela passou a mostrar o relógio de SLA.
--    Quem montou o fluxo escolheu um prazo e ele não aparecia em lugar nenhum.

-- ── 1. O prazo que o fluxo pediu vai para o chamado ─────────────────────────
-- O anchor leva o comentário junto: a lista de colunas sozinha aparece também
-- no passo "abrir chamado", e trocar as duas estragaria aquele passo.
do $do$
declare d text; n int; alvo text;
begin
  alvo := $x$    -- A tarefa nasce com o chamado dela: sem chamado o trabalho nao entra
    -- em relatorio nenhum. O modulo vem do passo; sem ele, o do fluxo (e o CRM,
    -- que nao tem fila, cai no Comercial).
    insert into public.tickets (tenant_id, module, title, description, priority, status, category_id, requester_id, created_by, assigned_to)$x$;
  select pg_get_functiondef('public.automation_run_step(public.automation_runs, jsonb)'::regprocedure) into d;
  n := (length(d) - length(replace(d, alvo, ''))) / length(alvo);
  if n <> 1 then raise exception 'automation_run_step: esperava 1 insert de chamado da tarefa, achei %', n; end if;

  execute replace(d, alvo, replace(alvo, 'created_by, assigned_to)', 'created_by, assigned_to, due_date)'));
end $do$;

do $do$
declare d text; n int;
begin
  select pg_get_functiondef('public.automation_run_step(public.automation_runs, jsonb)'::regprocedure) into d;
  n := (length(d) - length(replace(d, $x$            v_user)
    returning id into v_ticket;$x$, ''))) / length($x$            v_user)
    returning id into v_ticket;$x$);
  if n <> 1 then raise exception 'automation_run_step: esperava 1 fim de insert de chamado, achei %', n; end if;

  execute replace(d,
    $x$            v_user)
    returning id into v_ticket;$x$,
    $x$            v_user,
            case when cfg ? 'due_in_days' then (now() + make_interval(days => (cfg->>'due_in_days')::int))::date end)
    returning id into v_ticket;$x$);
end $do$;

-- ── 2. Fechar um lado fecha o outro ─────────────────────────────────────────
-- Cada gatilho só escreve quando há o que mudar, então o par se acerta numa
-- volta e para: o segundo UPDATE não casa nenhuma linha e não dispara nada.
create or replace function public.tarefa_fecha_chamado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ticket_id is null then return new; end if;
  if new.status not in ('completed', 'cancelled') then return new; end if;

  update public.tickets
     set status = case when new.status = 'cancelled' then 'cancelled'::public.ticket_status
                       else 'resolved'::public.ticket_status end,
         resolved_at = coalesce(resolved_at, now())
   where id = new.ticket_id
     and tenant_id = new.tenant_id
     and status not in ('resolved', 'closed', 'cancelled', 'rejected');
  return new;
end;
$$;

create trigger trg_tarefa_fecha_chamado
  after update of status on public.tasks
  for each row
  when (old.status is distinct from new.status)
  execute function public.tarefa_fecha_chamado();

create or replace function public.chamado_fecha_tarefa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status not in ('resolved', 'closed', 'cancelled', 'rejected') then return new; end if;

  update public.tasks
     set status = case when new.status in ('cancelled', 'rejected') then 'cancelled' else 'completed' end,
         completed_at = coalesce(completed_at, now())
   where ticket_id = new.id
     and tenant_id = new.tenant_id
     and status not in ('completed', 'cancelled');
  return new;
end;
$$;

create trigger trg_chamado_fecha_tarefa
  after update of status on public.tickets
  for each row
  when (old.status is distinct from new.status)
  execute function public.chamado_fecha_tarefa();

comment on function public.tarefa_fecha_chamado() is
  'Concluir a tarefa resolve o chamado dela. Sem isto a fila do módulo acumula demanda já feita.';
comment on function public.chamado_fecha_tarefa() is
  'Resolver o chamado conclui a tarefa dele. Sem isto a tarefa volta ao painel depois de resolvida.';

-- ── 3. O par que já existe fica coerente ────────────────────────────────────
update public.tasks t
   set status = 'completed', completed_at = coalesce(t.completed_at, now())
  from public.tickets k
 where k.id = t.ticket_id
   and k.tenant_id = t.tenant_id
   and k.status in ('resolved', 'closed', 'cancelled', 'rejected')
   and t.status not in ('completed', 'cancelled');

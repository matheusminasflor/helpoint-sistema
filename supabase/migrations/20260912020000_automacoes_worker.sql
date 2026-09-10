-- Leva E5-A2 (ADR-007): passos externos (e-mail, HTTP, IA) por worker,
-- gatilho por webhook e disparo manual. 2026-09-12.
--
-- O executor (20260912010000) deixa o run em `waiting` com `pending_kind`
-- quando o passo precisa sair do banco. Quem executa é a edge function
-- `automation-worker`, chamada pelo cron a cada minuto com a chave
-- service_role, pelo mesmo molde de check-alerts:
--
--   automation_claim_external(limite)   entrega ao worker os passos externos à espera, com a
--                                       configuração já renderizada ({{...}} resolvido no banco —
--                                       uma implementação de template só) e marca o run como rodando
--   automation_complete_external(...)   já existia: grava o resultado e segue o fluxo
--   automation_webhook_secret(fluxo)    gerente gera o segredo do gatilho webhook; o banco guarda só
--                                       o hash, o valor aparece uma vez
--   automation_webhook_fire(...)        edge function automation-webhook → confere o hash, limita a
--                                       60 disparos/min por fluxo, abre o run com o corpo em
--                                       trigger.body
--   automation_run_manual(fluxo, id)    botão "Automações" no chamado e no negócio: abre o run com o
--                                       registro em trigger.after, como se tivesse sido criado agora
--   automation_manual_for(entity)       os fluxos manuais ativos do cadastro, para o botão listar

-- ───────────────────────────────────────────────────────────────────────────
-- Worker: claimar e devolver com a configuração renderizada
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.automation_render_config(p_cfg jsonb, p_ctx jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  k   text;
  v   jsonb;
  out jsonb := '{}'::jsonb;
begin
  for k, v in select * from jsonb_each(coalesce(p_cfg, '{}'::jsonb)) loop
    if jsonb_typeof(v) = 'string' then
      out := out || jsonb_build_object(k, public.automation_render(v #>> '{}', p_ctx));
    else
      out := out || jsonb_build_object(k, v);
    end if;
  end loop;
  return out;
end;
$$;

create or replace function public.automation_claim_external(p_limit integer default 20)
returns table (
  run_id uuid, step_id text, kind text, config jsonb, tenant_id uuid,
  subject_type text, subject_id uuid, workflow_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.automation_runs;
begin
  for r in
    select * from public.automation_runs
     where status = 'waiting' and pending_kind is not null
     order by created_at
     limit greatest(least(coalesce(p_limit, 20), 100), 1)
     for update skip locked
  loop
    update public.automation_runs set status = 'running', started_at = coalesce(started_at, now()) where id = r.id;
    run_id := r.id;
    step_id := r.pending_step_id;
    kind := r.pending_kind;
    config := public.automation_render_config(public.automation_step(r.flow, r.pending_step_id)->'config', r.context);
    tenant_id := r.tenant_id;
    subject_type := r.subject_type;
    subject_id := r.subject_id;
    workflow_name := r.context #>> '{workflow,name}';
    return next;
  end loop;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Webhook: segredo (hash no banco) e disparo
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.automation_webhook_secret(p_workflow uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  w        public.automation_workflows;
  v_secret text;
begin
  select * into w from public.automation_workflows where id = p_workflow;
  if w.id is null or w.tenant_id is distinct from public.get_user_tenant_id() or not public.is_manager_or_higher(auth.uid()) then
    raise exception 'fluxo não encontrado';
  end if;
  if w.trigger->>'kind' <> 'webhook' then
    raise exception 'este fluxo não é disparado por webhook';
  end if;
  v_secret := encode(extensions.gen_random_bytes(24), 'hex');
  update public.automation_workflows
     set trigger = w.trigger || jsonb_build_object('secret_hash', encode(extensions.digest(v_secret, 'sha256'), 'hex'))
   where id = w.id;
  return v_secret;
end;
$$;

create or replace function public.automation_webhook_fire(p_workflow uuid, p_secret text, p_body jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  w     public.automation_workflows;
  v_run uuid;
begin
  select * into w from public.automation_workflows where id = p_workflow;
  if w.id is null or w.trigger->>'kind' <> 'webhook' or w.status <> 'active' then
    raise exception 'fluxo não encontrado' using errcode = 'P0002';
  end if;
  if coalesce(w.trigger->>'secret_hash', '') = '' or p_secret is null
     or encode(extensions.digest(p_secret, 'sha256'), 'hex') <> w.trigger->>'secret_hash' then
    raise exception 'segredo inválido' using errcode = 'P0003';
  end if;
  -- ponytail: limite fixo de 60 por minuto por fluxo, contando runs; vira configuração quando alguém precisar.
  if (select count(*) from public.automation_runs where workflow_id = w.id and trigger_kind = 'webhook' and created_at > now() - interval '1 minute') >= 60 then
    raise exception 'limite de 60 disparos por minuto' using errcode = 'P0004';
  end if;
  v_run := public.automation_start_run(w, 'webhook', null, null,
             jsonb_build_object('trigger', jsonb_build_object('kind', 'webhook', 'body', coalesce(p_body, '{}'::jsonb), 'at', now())));
  perform public.automation_advance(v_run);
  return v_run;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Manual: o botão no registro
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.automation_manual_for(p_entity text)
returns table (id uuid, name text, module text)
language sql
stable
security invoker
set search_path = public
as $$
  select w.id, w.name, w.module
    from public.automation_workflows w
   where w.tenant_id = public.get_user_tenant_id()
     and w.status = 'active'
     and w.trigger->>'kind' = 'manual'
     and w.trigger->>'entity' = p_entity
   order by w.name;
$$;

create or replace function public.automation_run_manual(p_workflow uuid, p_subject_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  w        public.automation_workflows;
  v_entity text;
  v_row    jsonb;
  v_run    uuid;
begin
  select * into w from public.automation_workflows where id = p_workflow;
  if w.id is null or w.tenant_id is distinct from public.get_user_tenant_id() then
    raise exception 'fluxo não encontrado';
  end if;
  if w.trigger->>'kind' <> 'manual' or w.status <> 'active' then
    raise exception 'este fluxo não é acionado pelo botão';
  end if;
  v_entity := w.trigger->>'entity';
  case v_entity
    when 'ticket'      then select to_jsonb(t) into v_row from public.tickets t where t.id = p_subject_id and t.tenant_id = w.tenant_id;
    when 'crm_deal'    then select to_jsonb(d) into v_row from public.crm_deals d where d.id = p_subject_id and d.tenant_id = w.tenant_id;
    when 'crm_contact' then select to_jsonb(c) into v_row from public.crm_contacts c where c.id = p_subject_id and c.tenant_id = w.tenant_id;
    when 'crm_order'   then select to_jsonb(o) into v_row from public.crm_orders o where o.id = p_subject_id and o.tenant_id = w.tenant_id;
    else raise exception 'cadastro desconhecido: %', v_entity;
  end case;
  if v_row is null then
    raise exception 'registro não encontrado';
  end if;
  -- quem aciona precisa poder ver o registro (o RLS do módulo): confere pelo caminho do usuário
  if v_entity = 'ticket' and not exists (select 1 from public.tickets where id = p_subject_id) then
    raise exception 'registro não encontrado';
  end if;
  if v_entity <> 'ticket' and not public.has_comercial_access(auth.uid()) then
    raise exception 'registro não encontrado';
  end if;

  v_run := public.automation_start_run(w, 'manual', v_entity, p_subject_id,
             jsonb_build_object(
               'trigger', jsonb_build_object('kind', 'manual', 'entity', v_entity, 'after', v_row, 'updated_fields', '[]'::jsonb, 'by', auth.uid()),
               'subject', jsonb_build_object('type', v_entity, 'id', p_subject_id)));
  perform public.automation_advance(v_run);
  return v_run;
end;
$$;

revoke all on function public.automation_render_config(jsonb, jsonb)              from public, anon, authenticated;
revoke all on function public.automation_claim_external(integer)                  from public, anon, authenticated;
revoke all on function public.automation_webhook_fire(uuid, text, jsonb)          from public, anon, authenticated;
revoke all on function public.automation_webhook_secret(uuid)                     from public, anon;
revoke all on function public.automation_manual_for(text)                         from public, anon;
revoke all on function public.automation_run_manual(uuid, uuid)                   from public, anon;

-- ───────────────────────────────────────────────────────────────────────────
-- Cron: o worker a cada minuto, pelo molde de 20260907010000 (URL e chave no vault)
-- ───────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'automation-worker-1min') then
    perform cron.unschedule('automation-worker-1min');
  end if;
end $$;

select cron.schedule(
  'automation-worker-1min',
  '* * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/automation-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_service_role_key')
    ),
    body := jsonb_build_object('source', 'cron')
  ) as request_id;
  $job$
);

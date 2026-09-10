-- Auditoria do branch "CRM open source" (E1–E5) antes de entrar no main — 2026-09-10.
--
-- Dois bloqueios achados pelo auditor:
--
-- 1. `automation_runs` tinha SELECT para qualquer membro da empresa, e o run
--    guarda a cópia inteira do registro que o disparou (`to_jsonb(new)` de
--    contato, negócio ou chamado). Um usuário sem o módulo Comercial lia
--    contatos e negócios pelo histórico de execuções; um solicitante lia
--    chamados dos outros. Cancelar e reexecutar tinham o mesmo teto.
--    Agora: ler, cancelar e reexecutar são de gerente para cima — quem
--    configura automação (as policies de `automation_workflows` já são de
--    gerente para escrita).
--
-- 2. `crm_delete_stage` é `security invoker`; a policy de DELETE das etapas é
--    de gerente. Um vendedor movia os negócios (UPDATE permitido) e o DELETE
--    afetava 0 linhas em silêncio — a tela dizia "Etapa apagada". Agora a
--    função exige gerente antes de mexer em qualquer coisa.

drop policy if exists "Tenant members can view runs" on public.automation_runs;
create policy "Managers can view runs" on public.automation_runs for select to authenticated
  using (tenant_id = public.get_user_tenant_id() and public.is_manager_or_higher(auth.uid()));

create or replace function public.automation_cancel_run(p_run uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r public.automation_runs;
begin
  select * into r from public.automation_runs where id = p_run;
  if r.id is null or r.tenant_id is distinct from public.get_user_tenant_id()
     or not public.is_manager_or_higher(auth.uid()) then
    raise exception 'execução não encontrada';
  end if;
  if r.status in ('completed', 'failed', 'cancelled') then
    raise exception 'esta execução já terminou';
  end if;
  update public.automation_runs set status = 'cancelled', pending_step_id = null, pending_kind = null, current_step_ids = '{}', ended_at = now() where id = p_run;
end;
$$;

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
  if r.id is null or r.tenant_id is distinct from public.get_user_tenant_id()
     or not public.is_manager_or_higher(auth.uid()) then
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
    v_ids := (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(coalesce(r.flow->'trigger'->'next', '[]'::jsonb)) x);
  end if;

  update public.automation_runs
     set status = 'queued', context = v_ctx, current_step_ids = v_ids, error = null, ended_at = null,
         pending_step_id = null, pending_kind = null, resume_at = now()
   where id = p_run;
  perform public.automation_advance(p_run);
end;
$$;

create or replace function public.crm_delete_stage(p_stage uuid, p_move_to uuid default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_stage   public.crm_pipeline_stages;
  v_target  public.crm_pipeline_stages;
  v_deals   integer;
  v_n       integer;
begin
  -- Apagar etapa é de gerente (policy de DELETE). Conferir antes de mover
  -- negócio nenhum: senão o vendedor move e o delete afeta 0 linhas em silêncio.
  if not public.is_manager_or_higher(auth.uid()) then
    raise exception 'só gerente, admin ou dono apaga etapa';
  end if;

  select * into v_stage from public.crm_pipeline_stages where id = p_stage;
  if v_stage.id is null then
    raise exception 'etapa não encontrada';
  end if;
  if v_stage.kind <> 'open' then
    raise exception 'as etapas Ganho e Perdido não podem ser apagadas';
  end if;

  select count(*) into v_deals from public.crm_deals where stage_id = p_stage;
  if v_deals > 0 then
    if p_move_to is null then
      raise exception 'a etapa tem % negócio(s): escolha para onde movê-los', v_deals;
    end if;
    select * into v_target from public.crm_pipeline_stages where id = p_move_to;
    if v_target.id is null or v_target.tenant_id <> v_stage.tenant_id then
      raise exception 'etapa de destino não encontrada';
    end if;
    if v_target.id = v_stage.id then
      raise exception 'a etapa de destino é a própria etapa';
    end if;
    update public.crm_deals set stage_id = p_move_to where stage_id = p_stage;
  end if;

  delete from public.crm_pipeline_stages where id = p_stage;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'a etapa não foi apagada — sem permissão';
  end if;
end;
$$;

-- 3. O passo "mudar etapa" (`set_stage`) e o "atualizar" (`update_record` com
--    `stage_id`) do motor de fluxos gravavam o uuid que estivesse na
--    configuração — inclusive uma etapa de outra empresa. Mesmo guard que a
--    etapa já tem com o funil, agora no negócio: a etapa tem de ser da mesma
--    empresa. Vale para o fluxo, para a tela e para quem escreve com service role.
create or replace function public.crm_deal_check_stage_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.crm_pipeline_stages where id = new.stage_id and tenant_id = new.tenant_id) then
    raise exception 'negócio e etapa de empresas diferentes';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_crm_deal_check_stage_tenant on public.crm_deals;
create trigger trg_crm_deal_check_stage_tenant
  before insert or update of stage_id, tenant_id on public.crm_deals
  for each row execute function public.crm_deal_check_stage_tenant();

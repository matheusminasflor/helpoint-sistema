-- CRM-4b, correção: "parado" é nada ter acontecido, não a linha não ter sido
-- tocada. 2026-09-13.
--
-- A varredura do lead frio olhava só `crm_deals.updated_at`. Dois problemas, e
-- o segundo é o que interessa:
--
--   1. `updated_at` é mantido por trigger (`handle_updated_at`), então nem em
--      teste dá para envelhecer um negócio — o `update` que tenta é o próprio
--      `update` que o rejuvenesce. Descoberto ao provar a leva, e é sintoma.
--   2. O sinal está errado. Um vendedor que anota "cliente pediu para ligar em
--      março" mexe na **história** do negócio, não no registro; uma conversa
--      inteira por WhatsApp também não toca a linha do negócio. Pelo critério
--      antigo, esse negócio estaria "parado" e receberia uma mensagem de
--      reengajamento no meio de uma negociação viva — que é o jeito mais rápido
--      de queimar um número e irritar um cliente.
--
-- Parado passa a ser: nem o registro mudou, nem houve atividade na história,
-- nem mensagem trocada, nos últimos N dias.
create or replace function public.automation_tick_deal_idle()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  w      public.automation_workflows;
  d      public.crm_deals;
  v_run  uuid;
  v_dias int;
  n      int := 0;
begin
  for w in
    select * from public.automation_workflows
     where status = 'active' and trigger->>'kind' = 'deal_idle'
  loop
    v_dias := greatest(coalesce((w.trigger->>'dias')::int, 30), 1);

    for d in
      select dl.* from public.crm_deals dl
        join public.crm_pipeline_stages st on st.id = dl.stage_id
       where dl.tenant_id = w.tenant_id
         and st.kind = 'open'
         and greatest(
               dl.updated_at,
               coalesce((select max(a.created_at) from public.crm_deal_activities a where a.deal_id = dl.id), dl.created_at),
               coalesce((select max(m.created_at) from public.crm_messages m where m.deal_id = dl.id), dl.created_at)
             ) < now() - make_interval(days => v_dias)
         and not exists (
           select 1 from public.automation_fired f
            where f.workflow_id = w.id and f.subject_id = dl.id)
       order by dl.updated_at
       limit 200
    loop
      if not public.automation_filter_matches(w.trigger->'filter',
           jsonb_build_object('trigger', jsonb_build_object('after', to_jsonb(d)))) then
        continue;
      end if;

      insert into public.automation_fired (workflow_id, subject_id) values (w.id, d.id);
      v_run := public.automation_start_run(
        w, 'deal_idle', 'crm_deal', d.id,
        jsonb_build_object(
          'trigger', jsonb_build_object('kind', 'deal_idle', 'entity', 'crm_deal', 'after', to_jsonb(d)),
          'subject', jsonb_build_object('type', 'crm_deal', 'id', d.id)));
      perform public.automation_advance(v_run);
      n := n + 1;
    end loop;
  end loop;

  return n;
end;
$$;

-- As duas consultas por negócio precisam de índice, senão a varredura diária
-- lê a história inteira de cada um.
create index if not exists crm_deal_activities_deal_created_idx
  on public.crm_deal_activities (deal_id, created_at desc);

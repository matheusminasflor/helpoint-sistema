-- LEAD SEM RESPOSTA (parte 4.4 do projeto Kommo, docs/projeto-kommo-bling-expedicao.md §16): quando a Lyra passa o lead
-- para a atendente, ela cria no Kommo uma tarefa de 30 minutos. Se a tarefa continua aberta depois de 30 minutos DE
-- EXPEDIENTE, o dono, o admin e o gestor comercial recebem um aviso, uma vez por tarefa.
--   * O relógio é o dos chamados (`minutos_uteis_do_chamado`, módulo comercial): fim de semana, feriado nacional e da
--     empresa, e setor fora não contam. Lead que chega às 17h50 avisa às 8h20 do dia útil seguinte.
--   * A leitura é do `mkt-kommo-coletar` com `{ semResposta: true }`, a cada 10 minutos (abaixo). Ele manda as tarefas
--     abertas de prazo curto; aqui se decide quem já passou dos 30 minutos e quem já foi avisado.
-- ponytail: a atendente ainda não recebe — o usuário do Kommo não está ligado ao do Helpoint; entra quando estiver.

create table public.kommo_tarefas_avisadas (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tarefa_id bigint not null,
  avisado_em timestamptz not null default now(),
  primary key (tenant_id, tarefa_id)
);
-- Só o robô (service_role) lê e grava: sem policy, ninguém do navegador alcança.
alter table public.kommo_tarefas_avisadas enable row level security;

-- p_tarefas: [{ id, lead_id, texto, criada_em (segundos) }]. Devolve quantos avisos saíram.
create function public.kommo_avisar_sem_resposta(p_tenant uuid, p_tarefas jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_avisos integer := 0;
  t record;
begin
  for t in
    select (x->>'id')::bigint as id, (x->>'lead_id')::bigint as lead_id, coalesce(x->>'texto', '') as texto,
           to_timestamp((x->>'criada_em')::bigint) as criada_em
      from jsonb_array_elements(coalesce(p_tarefas, '[]'::jsonb)) x
  loop
    continue when exists (select 1 from public.kommo_tarefas_avisadas a where a.tenant_id = p_tenant and a.tarefa_id = t.id);
    continue when public.minutos_uteis_do_chamado(p_tenant, 'comercial', t.criada_em, now(), null) < 30;

    insert into public.kommo_tarefas_avisadas (tenant_id, tarefa_id) values (p_tenant, t.id);
    insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
    select distinct p_tenant, p.id, 'lead_sem_resposta'::public.notification_type, 'kommo_lead', p_tenant,
           'Lead sem resposta há 30 minutos',
           t.texto || ' · Lead nº ' || t.lead_id || ' no Kommo, chegou ' ||
           to_char(t.criada_em at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') || '.'
      from public.profiles p
     where p.tenant_id = p_tenant and coalesce(p.is_active, true)
       and (exists (select 1 from public.user_roles r where r.user_id = p.id and r.role in ('owner', 'admin'))
            or public.tem_permissao(p.id, 'comercial', 'carteiras', 'gerir'));
    v_avisos := v_avisos + 1;
  end loop;
  return v_avisos;
end;
$$;
revoke all on function public.kommo_avisar_sem_resposta(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.kommo_avisar_sem_resposta(uuid, jsonb) to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'mkt-kommo-sem-resposta') then
    perform cron.unschedule('mkt-kommo-sem-resposta');
  end if;
end $$;

select cron.schedule(
  'mkt-kommo-sem-resposta',
  '*/10 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/mkt-kommo-coletar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_service_role_key')
    ),
    body := jsonb_build_object('source', 'cron', 'semResposta', true),
    timeout_milliseconds := 30000
  ) as request_id;
  $job$
);

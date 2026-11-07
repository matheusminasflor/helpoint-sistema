-- LEADS DO KOMMO NOS INDICADORES DO MARKETING (dono, 2026-11-03: "só quantos leads chegaram por funil"; chave cadastrada em
-- 2026-11-07). A edge function `mkt-kommo-coletar` conta os leads criados em cada semana pelo funil em que estão agora e
-- grava em `mkt_trafego_semana` (as mesmas colunas do lançamento à mão). Mesmo vigia da leitura das reuniões
-- (20270212620000): a queda avisa quem administra, uma vez, e a conferência de hora em hora pega o robô que nem rodou.
create table public.mkt_kommo_robo (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  ok_em timestamptz,
  caiu_em timestamptz,
  ultimo_erro text
);
alter table public.mkt_kommo_robo enable row level security;
create policy "Leitura do Kommo: administrador" on public.mkt_kommo_robo for select to authenticated
  using (tenant_id = public.get_user_tenant_id() and public.is_admin_or_higher(auth.uid()));
revoke insert, update, delete on public.mkt_kommo_robo from anon, authenticated;

create function public.mkt_kommo_robo_caiu(p_tenant uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.mkt_kommo_robo (tenant_id) values (p_tenant) on conflict (tenant_id) do nothing;
  update public.mkt_kommo_robo set ultimo_erro = p_motivo where tenant_id = p_tenant;
  if exists (select 1 from public.mkt_kommo_robo where tenant_id = p_tenant and caiu_em is not null) then
    return;
  end if;
  update public.mkt_kommo_robo set caiu_em = now() where tenant_id = p_tenant;

  insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
  select distinct p_tenant, p.id, 'ligacao_caiu'::public.notification_type, 'ligacao_meta', p_tenant, 'A leitura do Kommo parou', p_motivo
    from public.profiles p
    join public.user_roles r on r.user_id = p.id and r.role in ('owner', 'admin')
   where p.tenant_id = p_tenant and coalesce(p.is_active, true);
end;
$$;
revoke all on function public.mkt_kommo_robo_caiu(uuid, text) from public, anon, authenticated;
grant execute on function public.mkt_kommo_robo_caiu(uuid, text) to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'mkt-kommo-coletar') then
    perform cron.unschedule('mkt-kommo-coletar');
  end if;
  if exists (select 1 from cron.job where jobname = 'mkt-kommo-conferir') then
    perform cron.unschedule('mkt-kommo-conferir');
  end if;
end $$;

-- A cada 3 horas, como a Meta: a semana em andamento e a anterior (o lead triado depois muda de funil).
select cron.schedule(
  'mkt-kommo-coletar',
  '20 */3 * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/mkt-kommo-coletar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_service_role_key')
    ),
    body := jsonb_build_object('source', 'cron'),
    timeout_milliseconds := 60000
  ) as request_id;
  $job$
);

select cron.schedule(
  'mkt-kommo-conferir',
  '45 * * * *',
  $job$
  select public.mkt_kommo_robo_caiu(tenant_id, 'Nenhuma leitura do Kommo deu certo nas últimas 7 horas')
    from public.mkt_kommo_robo where ok_em < now() - interval '7 hours';
  $job$
);

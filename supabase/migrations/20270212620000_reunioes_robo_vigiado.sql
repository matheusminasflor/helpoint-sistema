-- A leitura das reuniões precisa avisar quando para: chave recusada, Google fora ou agendamento parado. Uma vez por
-- queda, para quem administra. A conferência de hora em hora pega até o robô que nem chegou a rodar.
create table public.reuniao_robo (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  ok_em timestamptz,
  caiu_em timestamptz,
  ultimo_erro text
);
alter table public.reuniao_robo enable row level security;
create policy "Leitura das reuniões: administrador" on public.reuniao_robo for select to authenticated
  using (tenant_id = public.get_user_tenant_id() and public.is_admin_or_higher(auth.uid()));

create function public.reuniao_robo_caiu(p_tenant uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.reuniao_robo (tenant_id) values (p_tenant) on conflict (tenant_id) do nothing;
  update public.reuniao_robo set ultimo_erro = p_motivo where tenant_id = p_tenant;
  if exists (select 1 from public.reuniao_robo where tenant_id = p_tenant and caiu_em is not null) then
    return;
  end if;
  update public.reuniao_robo set caiu_em = now() where tenant_id = p_tenant;

  insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
  select distinct p_tenant, p.id, 'ligacao_caiu'::public.notification_type, 'ligacao_meta', p_tenant, 'A leitura das reuniões parou', p_motivo
    from public.profiles p
    join public.user_roles r on r.user_id = p.id and r.role in ('owner', 'admin')
   where p.tenant_id = p_tenant and coalesce(p.is_active, true);
end;
$$;
revoke all on function public.reuniao_robo_caiu(uuid, text) from public, anon, authenticated;
grant execute on function public.reuniao_robo_caiu(uuid, text) to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'google-reunioes-conferir') then
    perform cron.unschedule('google-reunioes-conferir');
  end if;
end $$;

select cron.schedule(
  'google-reunioes-conferir',
  '15 * * * *',
  $job$
  select public.reuniao_robo_caiu(tenant_id, 'Nenhuma leitura deu certo nas últimas 2 horas')
    from public.reuniao_robo where ok_em < now() - interval '2 hours';
  $job$
);

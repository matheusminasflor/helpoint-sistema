-- Aviso no celular (Web Push; proposta "Helpoint no dia a dia", etapa 4b e decisão 2 do dono: o gestor é avisado na
-- "Lyra avisa" e no celular). Cada aparelho que aceitou recebe os avisos novos da pessoa — os mesmos da "Lyra avisa".
-- No iPhone, só com o Helpoint instalado e iOS 16.4 ou mais novo.
--
-- O caminho: o aparelho se inscreve (`push_inscricoes`); a cada minuto o cron chama a função `avisos-push`, que pega os
-- avisos dos últimos 30 minutos ainda não enviados ao celular (`avisos_push_pendentes`), envia e marca. Aviso de quem
-- não tem aparelho inscrito fica não enviado e envelhece para fora da janela — sem fila crescendo.

create table if not exists public.push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  aparelho text,
  created_at timestamptz not null default now()
);
alter table public.push_inscricoes enable row level security;
create policy push_inscricoes_minhas on public.push_inscricoes for select to authenticated using (user_id = auth.uid());
create policy push_inscricoes_inscreve on public.push_inscricoes for insert to authenticated
  with check (user_id = auth.uid() and tenant_id = (select public.get_user_tenant_id()));
create policy push_inscricoes_sai on public.push_inscricoes for delete to authenticated using (user_id = auth.uid());

-- Os avisos de antes não vão para o celular: a coluna nasce verdadeira neles e falsa nos novos.
alter table public.notifications add column if not exists push_enviado boolean;
update public.notifications set push_enviado = true where push_enviado is null;
alter table public.notifications alter column push_enviado set default false;
alter table public.notifications alter column push_enviado set not null;
create index if not exists notifications_push_pendente on public.notifications (created_at) where push_enviado = false;

create or replace function public.avisos_push_pendentes()
returns table (aviso_id uuid, titulo text, mensagem text, reference_type text, reference_id uuid,
               inscricao_id uuid, endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public as $$
  select n.id, n.title, n.message, n.reference_type, n.reference_id, i.id, i.endpoint, i.p256dh, i.auth
    from public.notifications n
    join public.push_inscricoes i on i.user_id = n.user_id
   where n.push_enviado = false and n.created_at > now() - interval '30 minutes'
   order by n.created_at
   limit 200;
$$;
revoke all on function public.avisos_push_pendentes() from public, anon, authenticated;
grant execute on function public.avisos_push_pendentes() to service_role;

create or replace function public.avisos_push_enviados(p_avisos uuid[], p_inscricoes_mortas uuid[])
returns void language sql security definer set search_path = public as $$
  update public.notifications set push_enviado = true where id = any(p_avisos);
  delete from public.push_inscricoes where id = any(p_inscricoes_mortas);
$$;
revoke all on function public.avisos_push_enviados(uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.avisos_push_enviados(uuid[], uuid[]) to service_role;

-- O robô, a cada minuto (o mesmo padrão do e-mail: URL e chave no Vault).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'avisos-push-1min') then
    perform cron.unschedule('avisos-push-1min');
  end if;
end $$;
select cron.schedule(
  'avisos-push-1min',
  '* * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/avisos-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_service_role_key')
    ),
    body := jsonb_build_object('source', 'cron')
  ) as request_id;
  $job$
);

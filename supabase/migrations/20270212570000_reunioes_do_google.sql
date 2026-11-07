-- REUNIÕES DO GOOGLE NO CHAT (dono, 2026-11-07, proposta https://claude.ai/artifact/Bfv2PsTPL639tckyTE3gKz).
-- Cada reunião repetida é um canal; cada encontro guarda o texto do Google como veio, sem resumo do Helpoint.
--   * canal: quem foi convidado ou entrou na chamada;
--   * pauta: todos do canal, inclusive quem entrou depois;
--   * transcrição e presença: quem participou daquele encontro e a Diretoria;
--   * só a edge function `google-reunioes` grava. Não há caminho para criar tarefa ou projeto.

do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.chat_channels'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%tipo%'
  loop
    execute format('alter table public.chat_channels drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.chat_channels
  add constraint chat_channels_tipo_check check (tipo in ('canal', 'direta', 'reuniao')),
  add constraint chat_channels_dm_key_check check ((tipo = 'direta' and dm_key is not null) or (tipo <> 'direta' and dm_key is null)),
  add constraint chat_channels_nome_check check (
    (tipo in ('canal', 'reuniao') and nome is not null and length(btrim(nome)) between 1 and 60)
    or (tipo = 'direta' and nome is null and privado and dm_key is not null)
  );

create table public.reuniao_series (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  google_serie text not null,
  titulo text not null,
  avulsa boolean not null default false,
  canal_id uuid not null references public.chat_channels (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint reuniao_series_uma_vez unique (tenant_id, google_serie)
);

create table public.reunioes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  serie_id uuid not null references public.reuniao_series (id) on delete cascade,
  google_evento text not null,
  titulo text not null,
  inicio timestamptz not null,
  fim timestamptz,
  documento_id text,
  documento_em timestamptz,
  link_documento text,
  link_gravacao text,
  pauta text,
  lista_google text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reunioes_uma_vez unique (tenant_id, google_evento)
);
create index reunioes_da_serie on public.reunioes (serie_id, inicio desc);

create table public.reuniao_transcricoes (
  reuniao_id uuid primary key references public.reunioes (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  texto text not null
);

create table public.reuniao_presencas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  reuniao_id uuid not null references public.reunioes (id) on delete cascade,
  nome text not null,
  user_id uuid references auth.users (id) on delete set null,
  convidado boolean not null default false,
  entrou boolean not null default false,
  entrada timestamptz,
  saida timestamptz,
  constraint reuniao_presencas_uma_vez unique (reuniao_id, nome)
);
create index reuniao_presencas_da_pessoa on public.reuniao_presencas (user_id, reuniao_id);

/** O nome que o Google mostra e a pessoa do Helpoint. `ignorar`: não é pessoa da empresa com login. */
create table public.reuniao_nomes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  nome_google text not null,
  user_id uuid references auth.users (id) on delete set null,
  ignorar boolean not null default false,
  constraint reuniao_nomes_uma_vez unique (tenant_id, nome_google)
);

alter table public.chat_messages
  add column if not exists reuniao_id uuid references public.reunioes (id) on delete set null;

/** Quem digita no chat não consegue fingir a mensagem automática da reunião. */
create function public.chat_reuniao_so_do_sistema()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null then
    new.reuniao_id := null;
  end if;
  return new;
end;
$$;
revoke all on function public.chat_reuniao_so_do_sistema() from public, anon, authenticated;
create trigger trg_chat_reuniao_so_do_sistema before insert on public.chat_messages
  for each row execute function public.chat_reuniao_so_do_sistema();

create function public.reuniao_da_diretoria()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_or_higher(auth.uid())
      or exists (select 1 from public.user_module_access m where m.user_id = auth.uid() and m.module = 'diretoria')
$$;
revoke all on function public.reuniao_da_diretoria() from public, anon;
grant execute on function public.reuniao_da_diretoria() to authenticated;

/** Quem foi convidado ou entrou naquele encontro. */
create function public.reuniao_participei(p_reuniao uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.reuniao_presencas p where p.reuniao_id = p_reuniao and p.user_id = auth.uid())
$$;
revoke all on function public.reuniao_participei(uuid) from public, anon;
grant execute on function public.reuniao_participei(uuid) to authenticated;

alter table public.reuniao_series enable row level security;
alter table public.reunioes enable row level security;
alter table public.reuniao_transcricoes enable row level security;
alter table public.reuniao_presencas enable row level security;
alter table public.reuniao_nomes enable row level security;

create policy "Canal de reunião: quem é do canal e a Diretoria" on public.reuniao_series for select to authenticated
  using (tenant_id = public.get_user_tenant_id() and (public.chat_sou_membro(canal_id) or public.reuniao_da_diretoria()));

create policy "Pauta: quem é do canal e a Diretoria" on public.reunioes for select to authenticated
  using (tenant_id = public.get_user_tenant_id() and exists (
    select 1 from public.reuniao_series s
     where s.id = serie_id and (public.chat_sou_membro(s.canal_id) or public.reuniao_da_diretoria())
  ));

create policy "Transcrição: quem participou e a Diretoria" on public.reuniao_transcricoes for select to authenticated
  using (tenant_id = public.get_user_tenant_id() and (public.reuniao_participei(reuniao_id) or public.reuniao_da_diretoria()));

create policy "Presença: quem participou e a Diretoria" on public.reuniao_presencas for select to authenticated
  using (tenant_id = public.get_user_tenant_id() and (public.reuniao_participei(reuniao_id) or public.reuniao_da_diretoria()));

create policy "Nomes do Google: administrador" on public.reuniao_nomes for select to authenticated
  using (tenant_id = public.get_user_tenant_id() and public.is_admin_or_higher(auth.uid()));

/** Liga o nome do Google à pessoa, ou marca que não é da empresa (`p_user` nulo). Vale para as reuniões já guardadas. */
create function public.reuniao_ligar_nome(p_nome text, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
begin
  if not public.is_admin_or_higher(auth.uid()) then
    raise exception 'Só o administrador liga os nomes.' using errcode = '42501';
  end if;
  if p_user is not null and not exists (select 1 from public.profiles where id = p_user and tenant_id = v_tenant) then
    raise exception 'Pessoa não encontrada.' using errcode = 'P0002';
  end if;

  update public.reuniao_nomes set user_id = p_user, ignorar = p_user is null
   where tenant_id = v_tenant and nome_google = p_nome;
  if not found then
    raise exception 'Nome não encontrado.' using errcode = 'P0002';
  end if;

  update public.reuniao_presencas set user_id = p_user where tenant_id = v_tenant and nome = p_nome;

  if p_user is not null then
    insert into public.chat_channel_members (tenant_id, channel_id, user_id)
    select distinct v_tenant, s.canal_id, p_user
      from public.reuniao_presencas p
      join public.reunioes r on r.id = p.reuniao_id
      join public.reuniao_series s on s.id = r.serie_id
     where p.tenant_id = v_tenant and p.nome = p_nome
    on conflict (channel_id, user_id) do nothing;
  end if;
end;
$$;
revoke all on function public.reuniao_ligar_nome(text, uuid) from public, anon;
grant execute on function public.reuniao_ligar_nome(text, uuid) to authenticated;

-- A cada 30 minutos: o robô só baixa o documento novo ou alterado.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'google-reunioes') then
    perform cron.unschedule('google-reunioes');
  end if;
end $$;

select cron.schedule(
  'google-reunioes',
  '*/30 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/google-reunioes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_service_role_key')
    ),
    body := jsonb_build_object('source', 'cron'),
    timeout_milliseconds := 120000
  ) as request_id;
  $job$
);

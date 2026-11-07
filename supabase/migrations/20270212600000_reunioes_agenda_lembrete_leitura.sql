-- Reuniões do Google: próximas reuniões na Agenda, lembrete antes de começar e a leitura da Lyra guardada por canal.
alter table public.reunioes
  add column link_meet text,
  add column lembrete_em timestamptz;

/** As reuniões em que a pessoa foi convidada ou entrou, para a Agenda dela. */
create function public.minhas_reunioes(p_de timestamptz, p_ate timestamptz)
returns table (id uuid, serie_id uuid, titulo text, inicio timestamptz, fim timestamptz, link_meet text)
language sql stable security definer set search_path = public as $$
  select r.id, r.serie_id, r.titulo, r.inicio, r.fim, r.link_meet
    from public.reunioes r
    join public.reuniao_presencas p on p.reuniao_id = r.id and p.user_id = auth.uid()
   where r.tenant_id = public.get_user_tenant_id() and r.inicio >= p_de and r.inicio <= p_ate
   order by r.inicio
$$;
revoke all on function public.minhas_reunioes(timestamptz, timestamptz) from public, anon;
grant execute on function public.minhas_reunioes(timestamptz, timestamptz) to authenticated;

/** O que a Lyra leu do canal, por clique. `ate_reuniao`: o encontro mais recente que entrou na leitura. */
create table public.reuniao_leituras (
  serie_id uuid primary key references public.reuniao_series (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  ate_reuniao uuid references public.reunioes (id) on delete set null,
  conteudo jsonb not null,
  gerado_por uuid references auth.users (id) on delete set null,
  gerado_em timestamptz not null default now()
);
alter table public.reuniao_leituras enable row level security;

create policy "Leitura: quem é do canal e a Diretoria" on public.reuniao_leituras for select to authenticated
  using (tenant_id = public.get_user_tenant_id() and exists (
    select 1 from public.reuniao_series s
     where s.id = serie_id and (public.chat_sou_membro(s.canal_id) or public.reuniao_da_diretoria())
  ));

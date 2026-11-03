-- MARKETING › ARTISTAS (dono, 2026-11-03; docs/proposta-indicadores-marketing.md, decisão 2). A seção 1 da planilha
-- PAINEL MKT: cada artista com o teto da bonificação e as metas do mês; cada entrega (stories, reels, post) com
-- quantidade, produto, se foi aprovada e se foi na campanha; a reunião do mês. A bonificação é calculada na tela
-- (`src/lib/bonificacao-dos-artistas.ts`), pela regra da planilha.
--
-- Permissão: a seção nova `artistas` do perfil do Marketing — Ver; Lançar (entrega e reunião); Cadastrar artista
-- (teto e metas); Apagar entrega. Quem já tem o Calendário de Redes Sociais herda o mesmo (ponytail: só nas empresas
-- que já existem, a Minasflor; empresa nova nasce sem — dono e admin passam igual. Saída: somar à semente de perfis).

create table if not exists public.mkt_artistas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants (id) on delete cascade,
  nome text not null check (length(btrim(nome)) > 0),
  teto_mensal numeric(12,2) not null check (teto_mensal >= 0),
  meta_stories integer not null default 10 check (meta_stories > 0),
  meta_reels integer not null default 4 check (meta_reels >= 0),
  meta_posts integer not null default 2 check (meta_posts >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  constraint mkt_artistas_meta_rp check (meta_reels + meta_posts > 0)
);
create unique index if not exists mkt_artistas_nome on public.mkt_artistas (tenant_id, lower(btrim(nome)));

create table if not exists public.mkt_artistas_entregas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants (id) on delete cascade,
  artista_id uuid not null references public.mkt_artistas (id) on delete restrict,
  data date not null,
  tipo text not null check (tipo in ('stories', 'reels', 'post')),
  quantidade integer not null check (quantidade > 0),
  produto text,
  aprovado boolean not null default true,
  na_campanha boolean not null default true,
  link text,
  observacao text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists mkt_artistas_entregas_mes on public.mkt_artistas_entregas (tenant_id, data);

create table if not exists public.mkt_artistas_reunioes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants (id) on delete cascade,
  artista_id uuid not null references public.mkt_artistas (id) on delete cascade,
  mes date not null check (mes = date_trunc('month', mes)::date),
  presente boolean not null,
  unique (artista_id, mes)
);

alter table public.mkt_artistas enable row level security;
alter table public.mkt_artistas_entregas enable row level security;
alter table public.mkt_artistas_reunioes enable row level security;
revoke all on public.mkt_artistas, public.mkt_artistas_entregas, public.mkt_artistas_reunioes from anon;
grant select, insert, update, delete on public.mkt_artistas, public.mkt_artistas_entregas, public.mkt_artistas_reunioes to authenticated;

-- Ler: quem vê os Artistas, e a Diretoria (os indicadores). O `with check` de UPDATE repete a permissão (regra 15).
create policy mkt_artistas_le on public.mkt_artistas for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.pode_no_setor('marketing', 'artistas', 'view')) or (select public.dir_pode_ver('indicadores'))));
create policy mkt_artistas_cria on public.mkt_artistas for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'artistas', 'edit')));
create policy mkt_artistas_muda on public.mkt_artistas for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'artistas', 'edit')))
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'artistas', 'edit')));

create policy mkt_artistas_entregas_le on public.mkt_artistas_entregas for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.pode_no_setor('marketing', 'artistas', 'view')) or (select public.dir_pode_ver('indicadores'))));
create policy mkt_artistas_entregas_cria on public.mkt_artistas_entregas for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'artistas', 'create')));
create policy mkt_artistas_entregas_muda on public.mkt_artistas_entregas for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'artistas', 'create')))
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'artistas', 'create')));
create policy mkt_artistas_entregas_apaga on public.mkt_artistas_entregas for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'artistas', 'delete')));

create policy mkt_artistas_reunioes_le on public.mkt_artistas_reunioes for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.pode_no_setor('marketing', 'artistas', 'view')) or (select public.dir_pode_ver('indicadores'))));
create policy mkt_artistas_reunioes_grava on public.mkt_artistas_reunioes for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'artistas', 'create')))
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'artistas', 'create')));

-- A seção nova nasce com o que o perfil já tinha no Calendário de Redes Sociais.
update public.access_profiles
   set permissions = permissions || jsonb_build_object('artistas', jsonb_build_object(
         'view',   coalesce((permissions -> 'calendar' ->> 'view')::boolean, false),
         'create', coalesce((permissions -> 'calendar' ->> 'create')::boolean, false),
         'edit',   coalesce((permissions -> 'calendar' ->> 'edit')::boolean, false),
         'delete', coalesce((permissions -> 'calendar' ->> 'delete')::boolean, false)))
 where department = 'marketing' and not (permissions ? 'artistas');

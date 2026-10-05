-- JORNAL DA EMPRESA (decisões do dono, 2026-10-04).
--
-- O dono: "um jornal da empresa onde passa as notícias da empresa, seja de funcionários novos, seja
-- feriados, seja festas … hoje seria interessante o marketing: ele cria, edita, rascunha, publica e
-- despublica. Título, texto, imagem, anexo, data e período; home e histórico."
-- Escolhas dele (AskUserQuestion, mesmo dia):
--   * na tela inicial (notícia principal + as 3 seguintes) e numa página Jornal com o histórico;
--   * a principal é a que quem publica marcou como destaque; sem marcação, a mais recente;
--   * fora do período de exibição a notícia sai da tela inicial e fica no histórico;
--   * só leitura por enquanto (sem curtir nem comentar).
--
-- QUEM LÊ: todos da empresa, só as publicadas. Rascunho e despublicada: só quem cria e edita ou
-- publica. QUEM ESCREVE: a seção `jornal` do perfil do MARKETING — `edit` (Criar e editar),
-- `publish` (Publicar e despublicar), `delete` (Excluir). Dono e administrador passam.

create or replace function public.pode_no_jornal(p_acao text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.pode_no_setor('marketing', 'jornal', p_acao);
$$;
revoke all on function public.pode_no_jornal(text) from public, anon;
grant execute on function public.pode_no_jornal(text) to authenticated;

create table if not exists public.jornal_noticias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  titulo text not null check (length(btrim(titulo)) > 0),
  texto text not null default '',
  tipo text not null default 'aviso' check (tipo in (
    'aviso', 'novo_colaborador', 'aniversario', 'feriado', 'festa_evento', 'outros')),
  -- O dia da notícia (o que ela conta), no calendário do Brasil.
  data_noticia date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  -- Quando aparece na tela inicial. Sem início: desde que foi publicada; sem fim: até sair do topo.
  exibir_de date,
  exibir_ate date,
  destaque boolean not null default false,
  status text not null default 'rascunho' check (status in ('rascunho', 'publicada', 'despublicada')),
  capa_caminho text,
  autor_id uuid default auth.uid() references public.profiles(id) on delete set null,
  publicada_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (exibir_ate is null or exibir_de is null or exibir_ate >= exibir_de)
);

comment on table public.jornal_noticias is
  'Jornal da empresa (decisão do dono, 2026-10-04): notícias na tela inicial e na página Jornal. Escreve quem tem a seção Jornal no perfil do Marketing.';

create index if not exists jornal_noticias_tenant_idx on public.jornal_noticias (tenant_id, status, data_noticia desc);

create trigger trg_jornal_noticias_updated_at before update on public.jornal_noticias
  for each row execute function public.handle_updated_at();

alter table public.jornal_noticias enable row level security;

create policy jornal_le on public.jornal_noticias for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
     and (status = 'publicada' or public.pode_no_jornal('edit') or public.pode_no_jornal('publish')));

create policy jornal_cria on public.jornal_noticias for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id())
     and status = 'rascunho' and public.pode_no_jornal('edit'));

-- Uma policy só de UPDATE, com o `with check` repetindo o `using` (lição 15). Quem pode o quê dentro
-- dela (o texto ou o status) é a guarda abaixo.
create policy jornal_altera on public.jornal_noticias for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
     and (public.pode_no_jornal('edit') or public.pode_no_jornal('publish')))
  with check (tenant_id = (select public.get_user_tenant_id())
     and (public.pode_no_jornal('edit') or public.pode_no_jornal('publish')));

create policy jornal_apaga on public.jornal_noticias for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_jornal('delete'));

-- A guarda: mudar o status pede "Publicar e despublicar"; mudar o conteúdo pede "Criar e editar".
-- `publicada_em` é do banco (a primeira vez que vai ao ar). Escrita de outro gatilho passa
-- (`pg_trigger_depth() > 1`, lição 8).
create or replace function public.jornal_guarda()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if new.status is distinct from old.status then
    if not public.pode_no_jornal('publish') then
      raise exception 'Publicar e despublicar pede a caixinha "Publicar e despublicar" do Jornal.' using errcode = '42501';
    end if;
    if new.status = 'rascunho' then
      raise exception 'Notícia publicada não volta a rascunho: despublique.' using errcode = '22023';
    end if;
    if new.status = 'publicada' and old.publicada_em is null then
      new.publicada_em := now();
    end if;
  end if;
  if (new.titulo, new.texto, new.tipo, new.data_noticia, new.exibir_de, new.exibir_ate, new.destaque, new.capa_caminho)
     is distinct from
     (old.titulo, old.texto, old.tipo, old.data_noticia, old.exibir_de, old.exibir_ate, old.destaque, old.capa_caminho)
     and not public.pode_no_jornal('edit') then
    raise exception 'Editar a notícia pede a caixinha "Criar e editar" do Jornal.' using errcode = '42501';
  end if;
  if new.publicada_em is distinct from old.publicada_em and new.status is not distinct from old.status then
    new.publicada_em := old.publicada_em;
  end if;
  new.autor_id := old.autor_id;
  new.tenant_id := old.tenant_id;
  return new;
end;
$$;
revoke all on function public.jornal_guarda() from public, anon;

create trigger trg_jornal_guarda before update on public.jornal_noticias
  for each row execute function public.jornal_guarda();

-- ─── Anexos (balde privado `jornal`, pasta <empresa>/<notícia>/arquivo; a capa mora no mesmo lugar) ─
create table if not exists public.jornal_anexos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  noticia_id uuid not null references public.jornal_noticias(id) on delete cascade,
  nome text not null,
  caminho text not null unique,
  tamanho bigint,
  tipo text,
  created_at timestamptz not null default now()
);

-- Lê o anexo quem lê a notícia; grava e apaga quem edita.
create or replace function public.jornal_noticia_visivel(p_noticia uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from public.jornal_noticias n
                  where n.id = p_noticia
                    and n.tenant_id = public.get_user_tenant_id()
                    and (n.status = 'publicada' or public.pode_no_jornal('edit') or public.pode_no_jornal('publish')));
$$;
revoke all on function public.jornal_noticia_visivel(uuid) from public, anon;
grant execute on function public.jornal_noticia_visivel(uuid) to authenticated;

alter table public.jornal_anexos enable row level security;
create policy jornal_anexos_le on public.jornal_anexos for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.jornal_noticia_visivel(noticia_id));
create policy jornal_anexos_cria on public.jornal_anexos for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_jornal('edit'));
create policy jornal_anexos_apaga on public.jornal_anexos for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_jornal('edit'));

insert into storage.buckets (id, name, public)
values ('jornal', 'jornal', false)
on conflict (id) do nothing;
update storage.buckets set public = false where id = 'jornal' and public is distinct from false;

create policy jornal_arquivo_le on storage.objects for select to authenticated
  using (bucket_id = 'jornal'
     and (storage.foldername(name))[1] = public.get_user_tenant_id()::text
     and public.jornal_noticia_visivel(((storage.foldername(name))[2])::uuid));
create policy jornal_arquivo_grava on storage.objects for insert to authenticated
  with check (bucket_id = 'jornal'
     and (storage.foldername(name))[1] = public.get_user_tenant_id()::text
     and public.pode_no_jornal('edit'));
create policy jornal_arquivo_apaga on storage.objects for delete to authenticated
  using (bucket_id = 'jornal'
     and (storage.foldername(name))[1] = public.get_user_tenant_id()::text
     and public.pode_no_jornal('edit'));

-- ─── Os perfis do Marketing que já existem ────────────────────────────────────────────────────
-- O dono: "hoje seria interessante o marketing: ele cria, edita, rascunha, publica e despublica".
-- Todo perfil do Marketing ganha criar/editar e publicar/despublicar; excluir fica só com quem já
-- altera as configurações de chamados do Marketing (quem cuida do setor).
update public.access_profiles
   set permissions = permissions || jsonb_build_object('jornal', jsonb_build_object(
         'edit', true, 'publish', true,
         'delete', coalesce((permissions -> 'config_chamados' ->> 'edit')::boolean, false)))
 where department = 'marketing'
   and not (permissions ? 'jornal');

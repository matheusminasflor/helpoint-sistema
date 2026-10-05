-- DIRETRIZES POR SETOR (decisões do dono, 2026-10-04).
--
-- O dono: "A diretriz seria por setor, não somente comercial … criar, editar, publicar, arquivar,
-- título, conteúdo, anexo, responsável, atualizações, versões, colaborador, consultas do setor,
-- acesso a outros setores conforme permissão, diretoria para visualizar todas."
-- Escolhas dele (AskUserQuestion, mesmo dia):
--   * fica "igual ao Comercial": aba nas Configurações de cada setor e consulta no menu do setor;
--   * nome "Diretrizes + setor"; o COMERCIAL não entra — lá "Diretrizes Comerciais" continua sendo
--     só a regra de benefício (`com_diretrizes`, 20261203010000);
--   * Rascunho → Publicada → Arquivada; publica quem tem a caixinha Publicar do setor; cada
--     publicação vira uma versão (o que o colaborador lê é sempre a última versão publicada);
--   * ciência opcional por diretriz ("Li e estou ciente"); versão nova pede ciência de novo.
--
-- QUEM LÊ uma diretriz publicada: quem é do setor (a concessão do módulo ou um perfil no setor),
-- quem tem "Ver" na seção Diretrizes do setor, os setores escolhidos, ou a empresa toda — conforme a
-- visibilidade que quem escreveu marcou. A Diretoria lê todas (publicadas e arquivadas). Rascunho e
-- arquivada: só quem cria/edita ou publica no setor.
--
-- PERMISSÃO no perfil de cada setor, seção `diretrizes`: `view` (Ver), `edit` (Criar e editar),
-- `publish` (Publicar e arquivar), `delete` (Excluir rascunho). Dono e administrador passam
-- (`pode_no_setor`).

-- ─── 1. "É do setor?" e "pode na seção Diretrizes do setor?" ──────────────────────────────────
create or replace function public.eh_do_setor(p_setor text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from public.user_module_access m
                  where m.user_id = auth.uid() and m.module = p_setor)
      or exists (select 1 from public.user_access_profiles p
                  where p.user_id = auth.uid() and p.department = p_setor);
$$;
revoke all on function public.eh_do_setor(text) from public, anon;
grant execute on function public.eh_do_setor(text) to authenticated;

create or replace function public.pode_na_diretriz(p_setor text, p_acao text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.pode_no_setor(p_setor, 'diretrizes', p_acao);
$$;
revoke all on function public.pode_na_diretriz(text, text) from public, anon;
grant execute on function public.pode_na_diretriz(text, text) to authenticated;

-- A regra de leitura, por COLUNAS — a policy da própria tabela chama esta função com os valores da
-- linha, sem reconsultar a tabela (lição 13).
create or replace function public.diretriz_pode_ler(
  p_setor text, p_status text, p_visibilidade text, p_setores text[])
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.pode_na_diretriz(p_setor, 'edit')
      or public.pode_na_diretriz(p_setor, 'publish')
      or (p_status in ('publicada', 'arquivada') and public.has_diretoria_access(auth.uid()))
      or (p_status = 'publicada' and (
            p_visibilidade = 'empresa'
         or public.eh_do_setor(p_setor)
         or public.pode_na_diretriz(p_setor, 'view')
         or (p_visibilidade = 'setores'
             and exists (select 1 from unnest(coalesce(p_setores, '{}')) s where public.eh_do_setor(s)))));
$$;
revoke all on function public.diretriz_pode_ler(text, text, text, text[]) from public, anon;
grant execute on function public.diretriz_pode_ler(text, text, text, text[]) to authenticated;

-- ─── 2. A diretriz (a cópia de trabalho) ──────────────────────────────────────────────────────
create table if not exists public.diretrizes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  setor text not null check (setor = any (array[
    'ti', 'marketing', 'rh', 'qualidade', 'financeiro', 'compras', 'educacional', 'expedicao', 'producao'])),
  titulo text not null check (length(btrim(titulo)) > 0),
  conteudo text not null default '',
  responsavel_id uuid references public.profiles(id) on delete set null,
  status text not null default 'rascunho' check (status in ('rascunho', 'publicada', 'arquivada')),
  exige_ciencia boolean not null default false,
  visibilidade text not null default 'setor' check (visibilidade in ('setor', 'setores', 'empresa')),
  setores_visiveis text[] not null default '{}',
  -- 0 = nunca publicada. Só `diretriz_publicar` mexe (a guarda abaixo confere).
  versao_atual integer not null default 0,
  publicada_em timestamptz,
  publicada_por uuid references public.profiles(id) on delete set null,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.diretrizes is
  'Diretrizes de cada setor (decisão do dono, 2026-10-04). Esta linha é a cópia de trabalho; o que o colaborador lê é a última versão em diretrizes_versoes.';

create index if not exists diretrizes_tenant_setor_idx on public.diretrizes (tenant_id, setor, status);

create trigger trg_diretrizes_updated_at before update on public.diretrizes
  for each row execute function public.handle_updated_at();

alter table public.diretrizes enable row level security;

create policy diretrizes_le on public.diretrizes for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
     and public.diretriz_pode_ler(setor, status, visibilidade, setores_visiveis));

-- Nasce rascunho, por quem cria e edita no setor (comparação direta de coluna, lição 13).
create policy diretrizes_cria on public.diretrizes for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id())
     and status = 'rascunho' and versao_atual = 0
     and public.pode_na_diretriz(setor, 'edit'));

-- Editar o texto: quem cria e edita. Publicar e arquivar passam por função (abaixo), não por aqui.
-- O `with check` repete o `using` (lição 15).
create policy diretrizes_edita on public.diretrizes for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_na_diretriz(setor, 'edit'))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_na_diretriz(setor, 'edit'));

-- Apagar: só rascunho que nunca foi publicado, por quem tem "Excluir rascunho".
create policy diretrizes_apaga on public.diretrizes for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
     and status = 'rascunho' and versao_atual = 0
     and public.pode_na_diretriz(setor, 'delete'));

-- A guarda: status, versão e marca de publicação só mudam pelas funções de publicar/arquivar
-- (elas ligam `helpoint.diretriz` na própria transação). O setor não muda depois de criada — mudar
-- de setor seria mudar quem lê e quem publica por baixo da versão já publicada.
create or replace function public.diretrizes_guarda()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if coalesce(current_setting('helpoint.diretriz', true), '') = '1' then
    return new;
  end if;
  if new.status is distinct from old.status
     or new.versao_atual is distinct from old.versao_atual
     or new.publicada_em is distinct from old.publicada_em
     or new.publicada_por is distinct from old.publicada_por then
    raise exception 'Publicar e arquivar uma diretriz é pelo botão Publicar/Arquivar.'
      using errcode = '42501';
  end if;
  if new.setor is distinct from old.setor or new.tenant_id is distinct from old.tenant_id then
    raise exception 'A diretriz não muda de setor.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.diretrizes_guarda() from public, anon;

create trigger trg_diretrizes_guarda before update on public.diretrizes
  for each row execute function public.diretrizes_guarda();

-- ─── 3. As versões (imutáveis: sem policy de escrita; só a função de publicar grava) ──────────
create table if not exists public.diretrizes_versoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  diretriz_id uuid not null references public.diretrizes(id) on delete cascade,
  numero integer not null check (numero > 0),
  titulo text not null,
  conteudo text not null,
  resumo text,
  publicada_por uuid references public.profiles(id) on delete set null,
  publicada_em timestamptz not null default now(),
  unique (diretriz_id, numero)
);

comment on table public.diretrizes_versoes is
  'Cada publicação de uma diretriz (número, texto, quem, quando, o que mudou). Imutável.';

-- Quem lê a diretriz lê as versões dela.
create or replace function public.diretriz_visivel(p_diretriz uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.diretrizes d
     where d.id = p_diretriz
       and d.tenant_id = public.get_user_tenant_id()
       and public.diretriz_pode_ler(d.setor, d.status, d.visibilidade, d.setores_visiveis));
$$;
revoke all on function public.diretriz_visivel(uuid) from public, anon;
grant execute on function public.diretriz_visivel(uuid) to authenticated;

-- "Pode editar a diretriz" (anexos), pela linha que já existe.
create or replace function public.diretriz_editavel(p_diretriz uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.diretrizes d
     where d.id = p_diretriz
       and d.tenant_id = public.get_user_tenant_id()
       and public.pode_na_diretriz(d.setor, 'edit'));
$$;
revoke all on function public.diretriz_editavel(uuid) from public, anon;
grant execute on function public.diretriz_editavel(uuid) to authenticated;

alter table public.diretrizes_versoes enable row level security;
create policy diretrizes_versoes_le on public.diretrizes_versoes for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.diretriz_visivel(diretriz_id));

-- ─── 4. Publicar e arquivar ───────────────────────────────────────────────────────────────────
-- Publicar = gravar a cópia de trabalho como a versão N+1 e pôr a diretriz em "publicada" (vale
-- também para republicar uma arquivada ou uma publicada que foi editada).
create or replace function public.diretriz_publicar(p_diretriz uuid, p_resumo text default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  d public.diretrizes;
  v_numero integer;
begin
  select * into d from public.diretrizes
   where id = p_diretriz and tenant_id = public.get_user_tenant_id()
   for update;
  if not found then
    raise exception 'Diretriz não encontrada.' using errcode = 'P0002';
  end if;
  if not public.pode_na_diretriz(d.setor, 'publish') then
    raise exception 'Sem a caixinha "Publicar" das diretrizes deste setor.' using errcode = '42501';
  end if;
  if length(btrim(d.conteudo)) = 0 then
    raise exception 'A diretriz está sem conteúdo.' using errcode = '22023';
  end if;

  v_numero := d.versao_atual + 1;
  insert into public.diretrizes_versoes (tenant_id, diretriz_id, numero, titulo, conteudo, resumo, publicada_por)
  values (d.tenant_id, d.id, v_numero, d.titulo, d.conteudo, nullif(btrim(coalesce(p_resumo, '')), ''), auth.uid());

  perform set_config('helpoint.diretriz', '1', true);
  update public.diretrizes
     set status = 'publicada', versao_atual = v_numero, publicada_em = now(), publicada_por = auth.uid()
   where id = d.id;
  perform set_config('helpoint.diretriz', '0', true);
  return v_numero;
end;
$$;
revoke all on function public.diretriz_publicar(uuid, text) from public, anon;
grant execute on function public.diretriz_publicar(uuid, text) to authenticated;

create or replace function public.diretriz_arquivar(p_diretriz uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  d public.diretrizes;
begin
  select * into d from public.diretrizes
   where id = p_diretriz and tenant_id = public.get_user_tenant_id()
   for update;
  if not found then
    raise exception 'Diretriz não encontrada.' using errcode = 'P0002';
  end if;
  if not public.pode_na_diretriz(d.setor, 'publish') then
    raise exception 'Sem a caixinha "Publicar" das diretrizes deste setor.' using errcode = '42501';
  end if;
  if d.status <> 'publicada' then
    raise exception 'Só uma diretriz publicada é arquivada.' using errcode = '22023';
  end if;
  perform set_config('helpoint.diretriz', '1', true);
  update public.diretrizes set status = 'arquivada' where id = d.id;
  perform set_config('helpoint.diretriz', '0', true);
end;
$$;
revoke all on function public.diretriz_arquivar(uuid) from public, anon;
grant execute on function public.diretriz_arquivar(uuid) to authenticated;

-- ─── 5. Anexos (no balde privado `diretrizes`, pasta <empresa>/<diretriz>/arquivo) ───────────
create table if not exists public.diretrizes_anexos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  diretriz_id uuid not null references public.diretrizes(id) on delete cascade,
  nome text not null,
  caminho text not null unique,
  tamanho bigint,
  tipo text,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.diretrizes_anexos enable row level security;
create policy diretrizes_anexos_le on public.diretrizes_anexos for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.diretriz_visivel(diretriz_id));
create policy diretrizes_anexos_cria on public.diretrizes_anexos for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and public.diretriz_editavel(diretriz_id));
create policy diretrizes_anexos_apaga on public.diretrizes_anexos for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.diretriz_editavel(diretriz_id));

insert into storage.buckets (id, name, public)
values ('diretrizes', 'diretrizes', false)
on conflict (id) do nothing;
update storage.buckets set public = false where id = 'diretrizes' and public is distinct from false;

-- O arquivo se lê como a linha do anexo; grava e apaga quem edita a diretriz da pasta.
create policy diretrizes_arquivo_le on storage.objects for select to authenticated
  using (bucket_id = 'diretrizes'
     and exists (select 1 from public.diretrizes_anexos a
                  where a.caminho = storage.objects.name
                    and a.tenant_id = public.get_user_tenant_id()
                    and public.diretriz_visivel(a.diretriz_id)));
create policy diretrizes_arquivo_grava on storage.objects for insert to authenticated
  with check (bucket_id = 'diretrizes'
     and (storage.foldername(name))[1] = public.get_user_tenant_id()::text
     and public.diretriz_editavel(((storage.foldername(name))[2])::uuid));
create policy diretrizes_arquivo_apaga on storage.objects for delete to authenticated
  using (bucket_id = 'diretrizes'
     and (storage.foldername(name))[1] = public.get_user_tenant_id()::text
     and public.diretriz_editavel(((storage.foldername(name))[2])::uuid));

-- ─── 6. Ciência ("Li e estou ciente") — da versão atual, de quem lê ──────────────────────────
create table if not exists public.diretrizes_ciencias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  diretriz_id uuid not null references public.diretrizes(id) on delete cascade,
  versao integer not null,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  ciente_em timestamptz not null default now(),
  unique (diretriz_id, versao, user_id)
);

alter table public.diretrizes_ciencias enable row level security;
-- Vê a própria ciência; quem edita ou publica no setor e a Diretoria veem a de todos.
create policy diretrizes_ciencias_le on public.diretrizes_ciencias for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
     and (user_id = auth.uid()
          or public.has_diretoria_access(auth.uid())
          or exists (select 1 from public.diretrizes d
                      where d.id = diretriz_id
                        and (public.pode_na_diretriz(d.setor, 'edit') or public.pode_na_diretriz(d.setor, 'publish')))));
-- Só a própria, só da versão publicada AGORA de uma diretriz que pede ciência e que a pessoa lê.
create policy diretrizes_ciencias_cria on public.diretrizes_ciencias for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id())
     and user_id = auth.uid()
     and exists (select 1 from public.diretrizes d
                  where d.id = diretriz_id
                    and d.status = 'publicada'
                    and d.exige_ciencia
                    and d.versao_atual = versao
                    and public.diretriz_pode_ler(d.setor, d.status, d.visibilidade, d.setores_visiveis)));

-- ─── 7. Os perfis que já existem ──────────────────────────────────────────────────────────────
-- Seção nova, toda desmarcada nos perfis atuais, com uma exceção: quem já ALTERA as configurações
-- de chamados do setor (`config_chamados.edit`) é quem cuida do setor — passa a criar, publicar e
-- excluir rascunho das diretrizes dele (o mesmo critério de 20261203010000, que copiou do vizinho).
-- Ler não precisa de caixinha: quem é do setor lê.
update public.access_profiles
   set permissions = permissions || jsonb_build_object('diretrizes',
         jsonb_build_object('view', true, 'edit', true, 'publish', true, 'delete', true))
 where department <> 'comercial'
   and coalesce((permissions -> 'config_chamados' ->> 'edit')::boolean, false)
   and not (permissions ? 'diretrizes');

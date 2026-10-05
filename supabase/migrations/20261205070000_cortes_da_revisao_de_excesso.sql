-- CORTES DA REVISÃO DE EXCESSO (ponytail-review de 2026-10-05; o dono mandou corrigir tudo).
-- Nada muda de comportamento: só sai o que repetia outra coisa.
--
-- 1. As versões curtas de `somar_minutos_uteis` (6 argumentos) e `prazo_do_chamado` (4 argumentos),
--    criadas em 20261205040000 só para encaminhar às longas com nulos. Nenhum chamador de produção
--    as usa (o trigger, a troca de atendente e o recálculo chamam as longas); os testes passam a
--    mandar os nulos eles mesmos.
-- 2. `pode_no_jornal(acao)` e `pode_na_diretriz(setor, acao)` eram `pode_no_setor(...)` com um
--    argumento fixo, sem outra lógica e sem chamada da tela. As policies e funções passam a perguntar
--    a `pode_no_setor` direto, e as duas saem.

-- ─── 1. As versões curtas do prazo ────────────────────────────────────────────────────────────
drop function if exists public.somar_minutos_uteis(timestamptz, integer, time, time, boolean, uuid);
drop function if exists public.prazo_do_chamado(uuid, text, timestamptz, integer);

-- ─── 2a. Jornal ───────────────────────────────────────────────────────────────────────────────
drop policy if exists jornal_le on public.jornal_noticias;
create policy jornal_le on public.jornal_noticias for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
     and (status = 'publicada'
          or public.pode_no_setor('marketing', 'jornal', 'edit')
          or public.pode_no_setor('marketing', 'jornal', 'publish')));

drop policy if exists jornal_cria on public.jornal_noticias;
create policy jornal_cria on public.jornal_noticias for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id())
     and status = 'rascunho' and public.pode_no_setor('marketing', 'jornal', 'edit'));

-- O `with check` repete o `using` (lição 15).
drop policy if exists jornal_altera on public.jornal_noticias;
create policy jornal_altera on public.jornal_noticias for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
     and (public.pode_no_setor('marketing', 'jornal', 'edit') or public.pode_no_setor('marketing', 'jornal', 'publish')))
  with check (tenant_id = (select public.get_user_tenant_id())
     and (public.pode_no_setor('marketing', 'jornal', 'edit') or public.pode_no_setor('marketing', 'jornal', 'publish')));

drop policy if exists jornal_apaga on public.jornal_noticias;
create policy jornal_apaga on public.jornal_noticias for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_setor('marketing', 'jornal', 'delete'));

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
    if not public.pode_no_setor('marketing', 'jornal', 'publish') then
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
     and not public.pode_no_setor('marketing', 'jornal', 'edit') then
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
                    and (n.status = 'publicada'
                         or public.pode_no_setor('marketing', 'jornal', 'edit')
                         or public.pode_no_setor('marketing', 'jornal', 'publish')));
$$;

drop policy if exists jornal_anexos_cria on public.jornal_anexos;
create policy jornal_anexos_cria on public.jornal_anexos for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_setor('marketing', 'jornal', 'edit'));
drop policy if exists jornal_anexos_apaga on public.jornal_anexos;
create policy jornal_anexos_apaga on public.jornal_anexos for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_setor('marketing', 'jornal', 'edit'));

drop policy if exists jornal_arquivo_grava on storage.objects;
create policy jornal_arquivo_grava on storage.objects for insert to authenticated
  with check (bucket_id = 'jornal'
     and (storage.foldername(name))[1] = public.get_user_tenant_id()::text
     and public.pode_no_setor('marketing', 'jornal', 'edit'));
drop policy if exists jornal_arquivo_apaga on storage.objects;
create policy jornal_arquivo_apaga on storage.objects for delete to authenticated
  using (bucket_id = 'jornal'
     and (storage.foldername(name))[1] = public.get_user_tenant_id()::text
     and public.pode_no_setor('marketing', 'jornal', 'edit'));

drop function if exists public.pode_no_jornal(text);

-- ─── 2b. Diretrizes por setor ─────────────────────────────────────────────────────────────────
create or replace function public.diretriz_pode_ler(
  p_setor text, p_status text, p_visibilidade text, p_setores text[])
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.pode_no_setor(p_setor, 'diretrizes', 'edit')
      or public.pode_no_setor(p_setor, 'diretrizes', 'publish')
      or (p_status in ('publicada', 'arquivada') and public.has_diretoria_access(auth.uid()))
      or (p_status = 'publicada' and (
            p_visibilidade = 'empresa'
         or public.eh_do_setor(p_setor)
         or public.pode_no_setor(p_setor, 'diretrizes', 'view')
         or (p_visibilidade = 'setores'
             and exists (select 1 from unnest(coalesce(p_setores, '{}')) s where public.eh_do_setor(s)))));
$$;

drop policy if exists diretrizes_cria on public.diretrizes;
create policy diretrizes_cria on public.diretrizes for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id())
     and status = 'rascunho' and versao_atual = 0
     and public.pode_no_setor(setor, 'diretrizes', 'edit'));

drop policy if exists diretrizes_edita on public.diretrizes;
create policy diretrizes_edita on public.diretrizes for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_setor(setor, 'diretrizes', 'edit'))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_setor(setor, 'diretrizes', 'edit'));

drop policy if exists diretrizes_apaga on public.diretrizes;
create policy diretrizes_apaga on public.diretrizes for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
     and status = 'rascunho' and versao_atual = 0
     and public.pode_no_setor(setor, 'diretrizes', 'delete'));

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
       and public.pode_no_setor(d.setor, 'diretrizes', 'edit'));
$$;

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
  if not public.pode_no_setor(d.setor, 'diretrizes', 'publish') then
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
  if not public.pode_no_setor(d.setor, 'diretrizes', 'publish') then
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

drop policy if exists diretrizes_ciencias_le on public.diretrizes_ciencias;
create policy diretrizes_ciencias_le on public.diretrizes_ciencias for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
     and (user_id = auth.uid()
          or public.has_diretoria_access(auth.uid())
          or exists (select 1 from public.diretrizes d
                      where d.id = diretriz_id
                        and (public.pode_no_setor(d.setor, 'diretrizes', 'edit')
                             or public.pode_no_setor(d.setor, 'diretrizes', 'publish')))));

drop function if exists public.pode_na_diretriz(text, text);

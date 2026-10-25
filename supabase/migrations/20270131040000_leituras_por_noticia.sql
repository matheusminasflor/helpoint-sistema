-- Leituras por notícia (proposta "Helpoint no dia a dia", etapa 4 · Jornal, 2026-10-25): quem publica vê "lida por
-- 12 de 30". `jornal_lidas` (20270111020000) já guardava a leitura das atualizações do sistema; desde hoje a tela grava
-- a de toda notícia aberta. A policy da tabela continua cada um a sua: a contagem sai por esta função, que só
-- devolve números, e só para quem edita ou publica no Jornal.
create or replace function public.jornal_leituras()
returns table (noticia_id uuid, lidas int, pessoas int)
language sql
stable
security definer
set search_path to 'public'
as $$
  with ativas as (
    select count(*)::int as n from public.profiles
     where tenant_id = public.get_user_tenant_id() and coalesce(is_active, true)
  )
  select l.noticia_id, count(*)::int, (select n from ativas)
    from public.jornal_lidas l
   where l.tenant_id = public.get_user_tenant_id()
     and (public.pode_no_setor('marketing', 'jornal', 'edit') or public.pode_no_setor('marketing', 'jornal', 'publish'))
   group by l.noticia_id;
$$;
revoke all on function public.jornal_leituras() from public, anon;
grant execute on function public.jornal_leituras() to authenticated;

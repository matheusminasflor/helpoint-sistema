-- Rodada 3 (R3a), decisão 3 do dono (2026-10-26): o link do catálogo do Conecta é colado por quem libera o
-- distribuidor — o da MF e o da INBRAS, da tabela dele. As chaves do Conecta deixam de ser pré-requisito: sem elas
-- `conecta_catalogos` fica vazia e o "Pedir na MF / INBRAS" dizia "catálogo ainda não disponível".
-- O link colado vale primeiro; o lido do Conecta só entra para a conta sem link colado.

alter table public.dist_distribuidores
  add column catalogo_mf text check (catalogo_mf is null or catalogo_mf ~ '^https://'),
  add column catalogo_inbras text check (catalogo_inbras is null or catalogo_inbras ~ '^https://');

create function public.dist_guardar_catalogos(p_id uuid, p_mf text, p_inbras text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.dist_pode_liberar() then
    raise exception 'Guardar o catálogo pede "Liberar distribuidor" no perfil da TI.' using errcode = '42501';
  end if;
  update public.dist_distribuidores
     set catalogo_mf = nullif(btrim(p_mf), ''), catalogo_inbras = nullif(btrim(p_inbras), ''), updated_at = now()
   where id = p_id and tenant_id = public.get_user_tenant_id();
  if not found then
    raise exception 'Distribuidor não encontrado.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.dist_guardar_catalogos(uuid, text, text) from public, anon;
grant execute on function public.dist_guardar_catalogos(uuid, text, text) to authenticated;

create or replace function public.dist_catalogos()
returns table(conta text, descricao text, link text, tabela_preco text)
language sql
stable
security definer
set search_path = public
as $$
  with eu as (select x.catalogo_mf, x.catalogo_inbras from public.dist_distribuidores x where x.id = public.dist_ativo()),
  colado as (
    select 'MF'::text as conta, 'Catálogo MF'::text as descricao, eu.catalogo_mf as link, public.dist_minha_tabela() as tabela_preco
      from eu where eu.catalogo_mf is not null
    union all
    select 'INBRAS', 'Catálogo INBRAS', eu.catalogo_inbras, public.dist_minha_tabela()
      from eu where eu.catalogo_inbras is not null
  ),
  lido as (
    select distinct on (k.conta) k.conta, k.descricao, k.link, k.tabela_preco
      from public.conecta_catalogos k
      join public.dist_distribuidores d on d.id = public.dist_ativo() and d.tenant_id = k.tenant_id
     where upper(btrim(k.tabela_preco)) = upper(btrim(public.dist_minha_tabela()))
       and (k.vence_em is null or k.vence_em > now())
       and k.conta not in (select c.conta from colado c)
     order by k.conta, k.vence_em desc nulls first
  )
  select * from colado
  union all
  select * from lido
$$;

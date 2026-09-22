-- Fecha os dois achados registrados no relatório da leva anterior
-- (.scratch/plano-l6d-lacunas.md, seção "Encontrei mas não toquei").
-- Idempotente: `create or replace function`/`drop policy if exists` podem
-- ser reaplicados sem erro.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. O mesmo defeito da lacuna 2, num terceiro lugar: `com_metas_x_realizado`
-- e `com_conciliacao` já enxergam o diretor puro (migration anterior), mas
-- `com_carteiras`/`com_carteira_membros` ainda só conhecem
-- `has_comercial_access` no SELECT — a grade de Metas fica com linhas sem
-- nome para quem só tem a Diretoria. Só o SELECT muda; escrita continua a
-- mesma (carteiras.gerir / admin).
-- ═══════════════════════════════════════════════════════════════════════════
drop policy if exists com_carteiras_select on public.com_carteiras;
create policy com_carteiras_select on public.com_carteiras for select
  using (tenant_id = (select public.get_user_tenant_id())
     and ((select public.has_comercial_access(auth.uid()))
       or (select public.has_diretoria_access(auth.uid()))));

drop policy if exists com_carteira_membros_select on public.com_carteira_membros;
create policy com_carteira_membros_select on public.com_carteira_membros for select
  using (tenant_id = (select public.get_user_tenant_id())
     and ((select public.has_comercial_access(auth.uid()))
       or (select public.has_diretoria_access(auth.uid()))));

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. `com_pessoas_do_comercial` — o seletor de "Quem responde por cada
-- carteira" lia `user_module_access` direto, e essa tabela só é legível por
-- admin/owner ou pela própria linha (RLS que protege o sistema inteiro,
-- correta como está — não se afrouxa por causa de um seletor). Um gestor
-- com `carteiras.gerir` (não admin) montava a lista sem ver quem tem o
-- módulo Comercial.
--
-- `security definer` com porta explícita: quem chama tem que ser
-- admin/owner, ter `carteiras.gerir`, OU ter acesso à Diretoria — as mesmas
-- três portas que já abrem a tela. Sem ela, a função abriria a leitura de
-- `user_module_access` (por tabela intermediária) para QUALQUER
-- autenticado, não só para quem já podia gerir carteira.
--
-- `security definer` desliga a RLS: por isso toda CTE carrega `tenant_id =
-- get_user_tenant_id()` escrito à mão, e não a policy de `user_module_
-- access`/`user_roles`/`profiles` que normalmente faria isso.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_pessoas_do_comercial()
returns table (user_id uuid, nome text, email text, carteira_id uuid, carteira_nome text)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not (
    public.is_admin_or_higher(auth.uid())
    or public.tem_permissao(auth.uid(), 'comercial', 'carteiras', 'gerir')
    or public.has_diretoria_access(auth.uid())
  ) then
    raise exception 'Sem acesso para ver as pessoas do Comercial.';
  end if;

  return query
  with elegiveis as (
    select uma.user_id
    from public.user_module_access uma
    where uma.tenant_id = (select public.get_user_tenant_id()) and uma.module = 'comercial'
    union
    select ur.user_id
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where p.tenant_id = (select public.get_user_tenant_id()) and ur.role in ('owner', 'admin')
  ),
  membro_atual as (
    select cm.user_id, cm.carteira_id
    from public.com_carteira_membros cm
    where cm.tenant_id = (select public.get_user_tenant_id())
  )
  select
    pr.id as user_id,
    coalesce(pr.full_name, pr.email) as nome,
    pr.email,
    ma.carteira_id,
    c.nome as carteira_nome
  from elegiveis e
  join public.profiles pr
    on pr.id = e.user_id and pr.tenant_id = (select public.get_user_tenant_id()) and pr.is_active
  left join membro_atual ma on ma.user_id = e.user_id
  left join public.com_carteiras c
    on c.id = ma.carteira_id and c.tenant_id = (select public.get_user_tenant_id())
  order by coalesce(pr.full_name, pr.email);
end;
$$;

grant execute on function public.com_pessoas_do_comercial() to authenticated;

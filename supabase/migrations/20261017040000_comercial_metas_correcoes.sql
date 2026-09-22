-- Correções da auditoria "passa com ressalva" da leva metas-e-carteiras
-- (L6d). Ver .scratch/plano-l6d-correcoes.md e
-- docs/instrucoes-painel-comercial.md (INSTRUCOES v7) §14/§15. Idempotente:
-- `create or replace function`, `drop trigger if exists` e os `if not
-- exists`/`if exists` abaixo podem ser reaplicados sem erro.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 (item 1 do plano, achado GRAVE) — o peso da carteira no ano NÃO é a
-- média dos pesos mensais. Mês sem venda entra na média como zero, e isso
-- afunda o peso de quem vende concentrado (mesma classe do erro dos 129
-- clientes da L6a: conta agregada no navegador sobre linhas que não se somam
-- assim). Peso do ano = realizado da carteira no ano / realizado total no
-- ano — os DOIS lados somados primeiro, divididos depois. `com_metas_x_
-- realizado_ano` é a irmã anual de `com_metas_x_realizado`: mesmo padrão
-- (security definer, porta explícita, tenant_id escrito à mão em toda
-- leitura de com_vendas_itens/com_clientes/com_metas — replicando os
-- comentários de 20261017020000 sobre por que isso é obrigatório aqui).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_metas_x_realizado_ano(p_ano int, p_filial text default null)
returns table (
  carteira_id uuid,
  carteira_nome text,
  realizado numeric,
  meta numeric,
  cobertura numeric,
  peso numeric
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not (public.has_comercial_access(auth.uid()) or public.has_diretoria_access(auth.uid())) then
    raise exception 'Sem acesso ao Comercial nem à Diretoria.';
  end if;

  return query
  with carteiras_do_tenant as (
    select id, nome from public.com_carteiras where tenant_id = (select public.get_user_tenant_id())
    union all
    select null::uuid, 'Sem carteira'
  ),
  -- `i.tenant_id = get_user_tenant_id()` escrito à mão — security definer
  -- desliga a RLS que faria isso sozinha (mesma nota de 20261017020000).
  realizado_por_carteira as (
    select
      c.carteira_id,
      coalesce(sum(i.valor_curva) filter (where i.classe in ('venda', 'devolucao')), 0) as realizado
    from public.com_vendas_itens i
    left join public.com_clientes c
      on c.tenant_id = (select public.get_user_tenant_id()) and c.codigo = i.cliente_codigo
    where i.tenant_id = (select public.get_user_tenant_id())
      and extract(year from i.competencia) = p_ano
      and (p_filial is null or i.filial = p_filial)
    group by c.carteira_id
  ),
  total_ano as (
    select sum(rp.realizado) as total from realizado_por_carteira rp
  ),
  -- Meta anual da carteira = soma dos meses que TÊM meta definida — mês sem
  -- linha em com_metas simplesmente não entra na soma (nunca conta como
  -- zero). Carteira sem meta em nenhum mês do ano devolve `meta` nula.
  metas_do_ano as (
    select cm.carteira_id, sum(cm.valor) as meta
    from public.com_metas cm
    where cm.tenant_id = (select public.get_user_tenant_id()) and cm.ano = p_ano and cm.carteira_id is not null
    group by cm.carteira_id
  )
  select
    ct.id as carteira_id,
    ct.nome as carteira_nome,
    coalesce(rp.realizado, 0) as realizado,
    mm.meta,
    (case when mm.meta is null or mm.meta = 0 then null
      else round(coalesce(rp.realizado, 0) / mm.meta, 4) end) as cobertura,
    (case when ta.total is null or ta.total = 0 then null
      else round(coalesce(rp.realizado, 0) / ta.total, 4) end) as peso
  from carteiras_do_tenant ct
  left join realizado_por_carteira rp
    on coalesce(rp.carteira_id::text, '') = coalesce(ct.id::text, '')
  left join total_ano ta on true
  -- Mesmo cuidado de 20261017020000: só carteira REAL junta com meta; "Sem
  -- carteira" nunca recebe meta, nem a total (outra grandeza — nota lá).
  left join metas_do_ano mm
    on ct.id is not null and mm.carteira_id = ct.id
  order by ct.nome;
end;
$$;

grant execute on function public.com_metas_x_realizado_ano(int, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2 (item 6 do plano) — `updated_at` que nunca muda é pior que coluna
-- ausente: as três tabelas novas da L6d têm a coluna e não tinham o
-- trigger (a L6c pôs em com_faixas_cashback; ficou faltando aqui). Mesmo
-- padrão: `before update ... execute function handle_updated_at()`.
-- ═══════════════════════════════════════════════════════════════════════════
drop trigger if exists handle_com_metas_updated_at on public.com_metas;
create trigger handle_com_metas_updated_at before update on public.com_metas
  for each row execute function public.handle_updated_at();

drop trigger if exists handle_com_carteiras_updated_at on public.com_carteiras;
create trigger handle_com_carteiras_updated_at before update on public.com_carteiras
  for each row execute function public.handle_updated_at();

drop trigger if exists handle_com_carteira_membros_updated_at on public.com_carteira_membros;
create trigger handle_com_carteira_membros_updated_at before update on public.com_carteira_membros
  for each row execute function public.handle_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3 (item 7.3 do plano) — `com_carteiras.ativa` não tem leitor nem escritor:
-- não há tela de criar/renomear/inativar carteira nesta leva. Coluna que
-- ninguém lê nem grava sai, em vez de ficar mentindo que algo a controla.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.com_carteiras drop column if exists ativa;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4 (item 7.5 do plano) — `com_pessoas_do_comercial` calculava carteira_id/
-- carteira_nome (join com com_carteira_membros/com_carteiras) e a tela
-- descarta os dois, lendo a alocação por `useCarteiraMembros` (consulta
-- direta em com_carteira_membros). Das duas fontes da mesma informação, a
-- que sobra é esta — sai da função, que fica só com o universo de nomes
-- elegíveis (seu único uso real, em `usePessoasElegiveisParaCarteira`).
--
-- `drop function` antes do `create` porque o retorno mudou de forma (menos
-- colunas) — Postgres recusa `create or replace` quando o tipo de retorno
-- (definido pelos parâmetros OUT do `returns table`) muda.
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists public.com_pessoas_do_comercial();

create or replace function public.com_pessoas_do_comercial()
returns table (user_id uuid, nome text, email text)
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
  )
  select
    pr.id as user_id,
    coalesce(pr.full_name, pr.email) as nome,
    pr.email
  from elegiveis e
  join public.profiles pr
    on pr.id = e.user_id and pr.tenant_id = (select public.get_user_tenant_id()) and pr.is_active
  order by coalesce(pr.full_name, pr.email);
end;
$$;

grant execute on function public.com_pessoas_do_comercial() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5 (item 7.8 do plano) — o aviso pelo sino mandava o valor cru
-- ("...é 50000.00"). `fmt_brl` (20260910010000) já existe para isto — o
-- mesmo padrão pt-BR usado em todo aviso de dinheiro do sistema.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.notify_on_meta_definida()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membros uuid[];
  v_nome_carteira text;
begin
  if new.carteira_id is null then
    return new;
  end if;

  select array_agg(user_id) into v_membros
  from public.com_carteira_membros
  where carteira_id = new.carteira_id;

  select nome into v_nome_carteira from public.com_carteiras where id = new.carteira_id;

  perform public.notify_users(
    new.tenant_id,
    v_membros,
    'meta_definida'::public.notification_type,
    'com_meta',
    new.id,
    format('Meta de %s/%s definida', new.mes, new.ano),
    format('A meta da carteira %s para %s/%s é R$ %s.', coalesce(v_nome_carteira, ''), new.mes, new.ano, public.fmt_brl(new.valor))
  );

  return new;
end;
$$;

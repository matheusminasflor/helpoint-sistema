-- Fecha a lacuna 2 do plano .scratch/plano-l6d-lacunas.md: o diretor que só
-- tem o módulo Diretoria (sem o módulo Comercial) abria a aba Metas x
-- Realizado / Conciliação e via zero, sem erro, porque as duas funções eram
-- `security invoker` e liam `com_vendas_itens`, cuja policy de SELECT exige
-- `has_comercial_access`. Idempotente: `create or replace function` pode ser
-- reaplicado sem erro.
--
-- Decisão do dono (não do executor): as duas passam a `security definer`,
-- com uma porta explícita no corpo — sem ela, security definer desliga a
-- RLS e qualquer um que consiga chamar a função vê tudo. A porta aqui é a
-- MESMA condição que a policy de com_metas já usa (has_comercial_access OR
-- has_diretoria_access), então quem já podia ver a aba continua podendo, e
-- quem só tem Diretoria passa a ver de verdade.
--
-- Consequência que exige atenção: dentro de uma função security definer, o
-- Postgres NÃO filtra `com_vendas_itens`/`com_clientes` por tenant sozinho —
-- isso era a RLS fazendo, e a RLS está desligada aqui dentro. Por isso todo
-- lugar que lê `com_vendas_itens` agora carrega `i.tenant_id =
-- get_user_tenant_id()` explícito, e não só a policy antiga. Sem isso, a
-- porta explícita autoriza a CHAMADA da função, mas nada impede que ela leia
-- dado de OUTRA empresa — o mesmo furo que a regra de isolamento deste
-- sistema nunca permite (pgTAP: comercial_carteiras_e_metas.test.sql, blocos
-- 12/13).

create or replace function public.com_metas_x_realizado(p_ano int, p_filial text default null)
returns table (
  competencia date,
  carteira_id uuid,
  carteira_nome text,
  meta numeric,
  realizado numeric,
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
  with meses as (
    select generate_series(make_date(p_ano, 1, 1), make_date(p_ano, 12, 1), interval '1 month')::date as competencia
  ),
  carteiras_do_tenant as (
    select id, nome from public.com_carteiras where tenant_id = (select public.get_user_tenant_id())
    union all
    select null::uuid, 'Sem carteira'
  ),
  -- `i.tenant_id = get_user_tenant_id()` é o filtro que a RLS fazia sozinha
  -- quando esta função era `security invoker`. Com `security definer` ele
  -- precisa estar escrito aqui — é o que os testes 13/14 provam ao chamar
  -- esta função como usuário de OUTRA empresa.
  realizado_por_carteira as (
    select
      i.competencia,
      c.carteira_id,
      coalesce(sum(i.valor_curva) filter (where i.classe in ('venda', 'devolucao')), 0) as realizado
    from public.com_vendas_itens i
    left join public.com_clientes c
      on c.tenant_id = (select public.get_user_tenant_id()) and c.codigo = i.cliente_codigo
    where i.tenant_id = (select public.get_user_tenant_id())
      and extract(year from i.competencia) = p_ano
      and (p_filial is null or i.filial = p_filial)
    group by i.competencia, c.carteira_id
  ),
  -- `rp.`/`cm.` explícitos abaixo não são estilo: em `language plpgsql`, os
  -- nomes de `returns table` (`competencia`, `carteira_id`, `realizado`, …)
  -- viram VARIÁVEIS da função, e uma referência de coluna sem prefixo que
  -- tenha o mesmo nome fica ambígua para o Postgres — "column reference is
  -- ambiguous", erro descoberto rodando esta função pela primeira vez como
  -- plpgsql. Coluna qualificada nunca é ambígua, então cada CTE daqui para
  -- baixo prefixa toda coluna com o alias da tabela/CTE de origem.
  total_por_mes as (
    select rp.competencia, sum(rp.realizado) as total from realizado_por_carteira rp group by rp.competencia
  ),
  metas_do_ano as (
    select cm.mes, cm.carteira_id, cm.valor from public.com_metas cm
    where cm.tenant_id = (select public.get_user_tenant_id()) and cm.ano = p_ano
  ),
  grade as (
    select m.competencia, ct.id as carteira_id, ct.nome as carteira_nome
    from meses m cross join carteiras_do_tenant ct
  )
  select
    g.competencia,
    g.carteira_id,
    g.carteira_nome,
    mm.valor as meta,
    coalesce(rp.realizado, 0) as realizado,
    (case when mm.valor is null or mm.valor = 0 then null
      else round(coalesce(rp.realizado, 0) / mm.valor, 4) end) as cobertura,
    (case when tm.total is null or tm.total = 0 then null
      else round(coalesce(rp.realizado, 0) / tm.total, 4) end) as peso
  from grade g
  left join realizado_por_carteira rp
    on rp.competencia = g.competencia
   and coalesce(rp.carteira_id::text, '') = coalesce(g.carteira_id::text, '')
  left join total_por_mes tm on tm.competencia = g.competencia
  -- Lacuna 4 do plano, para ficar impossível de reintroduzir: `carteira_id
  -- is null` significa DUAS coisas diferentes em DUAS tabelas, sentidos
  -- opostos. Em `com_clientes`, é "cliente sem carteira" — o balde "Sem
  -- carteira" desta grade. Em `com_metas` (`mm` aqui), é "meta TOTAL da
  -- empresa" — outra grandeza, lida direto de `com_metas` pela tela, nunca
  -- por esta função. Por isso só carteira REAL (g.carteira_id is not null)
  -- pode juntar com `mm`: a linha "Sem carteira" NUNCA recebe meta, nem
  -- quando existe uma meta total definida para o mês (pgTAP: bloco 15).
  left join metas_do_ano mm
    on g.carteira_id is not null and mm.carteira_id = g.carteira_id and mm.mes = extract(month from g.competencia)
  order by g.competencia, g.carteira_nome;
end;
$$;

grant execute on function public.com_metas_x_realizado(int, text) to authenticated;

create or replace function public.com_conciliacao(p_ano int, p_filial text default null, p_apresentacao numeric default null)
returns table (venda_liquida numeric, bonificacao numeric, soma numeric, diferenca numeric)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not (public.has_comercial_access(auth.uid()) or public.has_diretoria_access(auth.uid())) then
    raise exception 'Sem acesso ao Comercial nem à Diretoria.';
  end if;

  return query
  select
    coalesce(sum(i.valor_curva) filter (where i.classe in ('venda', 'devolucao')), 0) as venda_liquida,
    coalesce(sum(i.valor_nota) filter (where i.classe = 'bonificacao'), 0) as bonificacao,
    coalesce(sum(i.valor_curva) filter (where i.classe in ('venda', 'devolucao')), 0)
      + coalesce(sum(i.valor_nota) filter (where i.classe = 'bonificacao'), 0) as soma,
    (case when p_apresentacao is null then null
      else p_apresentacao - (
        coalesce(sum(i.valor_curva) filter (where i.classe in ('venda', 'devolucao')), 0)
        + coalesce(sum(i.valor_nota) filter (where i.classe = 'bonificacao'), 0)
      ) end) as diferenca
  from public.com_vendas_itens i
  -- Mesmo motivo do comentário acima: sem `security invoker`, a RLS de
  -- `com_vendas_itens` não filtra por tenant sozinha dentro desta função.
  where i.tenant_id = (select public.get_user_tenant_id())
    and extract(year from i.competencia) = p_ano
    and (p_filial is null or i.filial = p_filial);
end;
$$;

grant execute on function public.com_conciliacao(int, text, numeric) to authenticated;

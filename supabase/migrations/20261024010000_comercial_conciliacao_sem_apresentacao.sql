-- Frente 5b — a Conciliação para de pedir o valor digitado
-- (.scratch/plano-frente5-ficha-e-conciliacao.md, seção "5b. A
-- Conciliação"). O §6 do anexo de metas (docs/metas-e-carteiras-fonte-
-- da-verdade.md) diz que a comparação é `total_realizado` (informado,
-- já com bonificação) menos venda líquida do ERP no mesmo período — e
-- `total_realizado` já está no banco desde a Frente 2, importado do
-- HISTORICO_METAS.json. Pedir que o diretor o digite de novo abria a
-- porta para o digitado discordar do importado, sem ninguém saber qual
-- dos dois valia.
--
-- `drop function` primeiro: a assinatura muda de (int, text, numeric)
-- para (integer) — parâmetro a menos, não a mais — e Postgres trata
-- assinatura diferente como função diferente. Sem o drop a antiga
-- ficaria no catálogo ao lado da nova. Mesmo cuidado que 20261023010000
-- tomou com `com_painel_totais`.
drop function if exists public.com_conciliacao(int, text, numeric);

-- A armadilha dos meses desiguais: se o diretor informou 5 meses de um
-- ano e o sistema já importou 9, somar o ano inteiro dos dois lados
-- compara cinco meses de um lado com nove do outro — diferença grande,
-- convincente e sem erro nenhum aparecer (mesma família do erro dos 129
-- clientes). Por isso o lado do ERP soma exatamente os meses que têm
-- `total_realizado` informado, nunca o ano inteiro; a função devolve
-- `meses_comparados` para a tela dizer o que está comparando.
--
-- `informado` é `sum(total_realizado)` sobre os meses informados —
-- já NULL quando nenhum mês foi informado, que é "sem dado", nunca
-- "zero" (a regra que a Frente 2 existiu para estabelecer). Por isso
-- nenhum `coalesce(..., 0)` por cima dele. `diferenca` é NULL junto.
--
-- Sem filial: `metas_ano` não tem filial (o JSON do diretor é da
-- empresa inteira) — comparar o total informado da empresa toda contra
-- a venda líquida de uma filial só produziria a mesma diferença falsa.
-- A comparação só existe no nível da empresa.
create or replace function public.com_conciliacao(p_ano integer)
returns table (
  informado numeric,
  venda_liquida numeric,
  bonificacao numeric,
  soma numeric,
  diferenca numeric,
  meses_comparados int
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not (public.has_comercial_access(auth.uid()) or public.has_diretoria_access(auth.uid())) then
    raise exception 'Sem acesso ao Comercial nem à Diretoria.';
  end if;

  return query
  with meses_informados as (
    select ma.mes
    from public.metas_ano ma
    where ma.tenant_id = (select public.get_user_tenant_id())
      and ma.ano = p_ano
      and ma.total_realizado is not null
  ),
  totais as (
    select
      sum(ma.total_realizado) as informado,
      count(*) as meses_comparados
    from public.metas_ano ma
    where ma.tenant_id = (select public.get_user_tenant_id())
      and ma.ano = p_ano
      and ma.total_realizado is not null
  ),
  erp as (
    -- O join com `meses_informados` é o que restringe o lado do ERP aos
    -- mesmos meses do lado informado — sem ele, a soma volta a cobrir o
    -- ano inteiro e a armadilha dos meses desiguais reaparece.
    select
      coalesce(sum(i.valor_curva) filter (where i.classe in ('venda', 'devolucao')), 0) as venda_liquida,
      coalesce(sum(i.valor_nota) filter (where i.classe = 'bonificacao'), 0) as bonificacao
    from public.com_vendas_itens i
    join meses_informados mi on extract(month from i.competencia) = mi.mes
    where i.tenant_id = (select public.get_user_tenant_id())
      and extract(year from i.competencia) = p_ano
  ),
  -- `soma` nasce aqui, uma vez só, e `diferenca` lê ESTA coluna — nunca
  -- recalcula `venda_liquida + bonificacao` por conta própria. Com as
  -- duas contas separadas, mutar `soma` não move `diferenca`, e a prova
  -- pgTAP ("trocar a soma por zero tem que acusar") fica cega.
  totais_erp as (
    -- `erp.` explícito: os nomes de coluna aqui colidem com os parâmetros
    -- OUT da função (mesmo nome, `venda_liquida`/`bonificacao`) — sem o
    -- prefixo, Postgres recusa com "column reference is ambiguous".
    select erp.venda_liquida, erp.bonificacao, erp.venda_liquida + erp.bonificacao as soma
    from erp
  )
  select
    t.informado,
    x.venda_liquida,
    x.bonificacao,
    x.soma,
    case when t.informado is null then null else t.informado - x.soma end as diferenca,
    t.meses_comparados::int as meses_comparados
  from totais t, totais_erp x;
end;
$$;

grant execute on function public.com_conciliacao(integer) to authenticated;

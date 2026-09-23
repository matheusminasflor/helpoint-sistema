-- Painel Diretor (L6f) — os três itens que faltavam do §14: faturamento por
-- cliente (item 4), evolução por faixa (item 5) e a matriz produto × cliente
-- (item 6). Ver .scratch/plano-l6f-tres-telas-do-diretor.md e
-- docs/instrucoes-painel-comercial.md §14. Idempotente: pode ser reaplicada
-- sem erro. Nenhuma tabela nova — tudo lê o que a L6a já grava em
-- com_vendas_itens/com_clientes/com_produtos, e reusa a faixa de
-- com_curva_abc (nunca reclassifica Pareto de novo).
--
-- Correção de 2026-09-22 (plano §1): estas três telas NÃO entram em
-- `/diretoria` — entram no Insights do Comercial, como os itens 2 e 3 do
-- mesmo §14 (com_tendencia_produtos/com_detalhe_produto, leva L6e). Por
-- isso as três funções abaixo são `security invoker`, sem porta própria de
-- diretoria — iguais a `com_curva_abc` e `com_tendencia_produtos`, nunca
-- `security definer` com `has_diretoria_access` (essa porta dupla foi o
-- erro que a auditoria da L6d registrou, e não se repete por antecipação).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. com_faturamento_por_cliente — item 4 do §14: todos os clientes, sem
-- filtro de faixa, com faturamento líquido, bonificação (coluna própria,
-- nunca somada ao faturamento), SKUs e meses ativos DISTINTOS (o erro da
-- L6a era somar entre meses) e a série mensal para o histórico em miniatura.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_faturamento_por_cliente(
  p_de date, p_ate date, p_filial text default null, p_criterio text default 'valor'
)
returns table (
  cliente_codigo text, nome text, tabela_preco text, em_condicao boolean,
  faturamento numeric, bonificacao numeric, skus bigint, meses_ativos bigint,
  serie_mensal jsonb
)
language plpgsql stable security invoker
set search_path = public
as $$
-- Mesmo motivo do `com_curva_abc`: os nomes de saída (cliente_codigo, nome,
-- ...) também são nomes de coluna nas CTEs abaixo, e sem esta diretiva o
-- Postgres recusa com "column reference is ambiguous" (42702), só ao
-- CHAMAR a função.
#variable_conflict use_column
begin
  if p_criterio not in ('valor', 'quantidade') then
    raise exception 'p_criterio inválido: % — use ''valor'' ou ''quantidade''.', p_criterio;
  end if;

  return query
  with meses as (
    select gs::date as mes
    from generate_series(
      date_trunc('month', p_de::timestamp), date_trunc('month', p_ate::timestamp), interval '1 month'
    ) as gs
  ),
  por_mes as (
    select i.cliente_codigo, i.competencia,
      sum(i.valor_curva) as valor, sum(i.quantidade_curva) as quantidade
    from public.com_vendas_itens i
    where i.classe in ('venda', 'devolucao')
      and i.emissao between p_de and p_ate
      and (p_filial is null or i.filial = p_filial)
    group by i.cliente_codigo, i.competencia
  ),
  totais as (
    select
      i.cliente_codigo,
      coalesce(max(c.razao_social), i.cliente_codigo) as nome,
      max(c.tabela_preco) as tabela_preco,
      coalesce(bool_or(c.em_condicao), false) as em_condicao,
      coalesce(sum(i.valor_curva) filter (where i.classe in ('venda', 'devolucao')), 0) as faturamento,
      coalesce(sum(i.valor_nota) filter (where i.classe = 'bonificacao'), 0) as bonificacao,
      count(distinct i.produto_codigo) filter (where i.classe = 'venda') as skus,
      count(distinct i.competencia) filter (where i.classe = 'venda') as meses_ativos
    from public.com_vendas_itens i
    left join public.com_clientes c on c.tenant_id = i.tenant_id and c.codigo = i.cliente_codigo
    where i.emissao between p_de and p_ate
      and (p_filial is null or i.filial = p_filial)
    group by i.cliente_codigo
  ),
  grade as (
    select t.cliente_codigo, m.mes,
      coalesce(pm.valor, 0) as valor_mes, coalesce(pm.quantidade, 0) as quantidade_mes
    from totais t
    cross join meses m
    left join por_mes pm on pm.cliente_codigo = t.cliente_codigo and pm.competencia = m.mes
  ),
  series as (
    select g.cliente_codigo,
      jsonb_agg((case when p_criterio = 'valor' then g.valor_mes else g.quantidade_mes end) order by g.mes) as serie_mensal
    from grade g
    group by g.cliente_codigo
  )
  select
    t.cliente_codigo, t.nome, t.tabela_preco, t.em_condicao,
    t.faturamento, t.bonificacao, t.skus, t.meses_ativos,
    s.serie_mensal
  from totais t
  left join series s on s.cliente_codigo = t.cliente_codigo
  order by t.faturamento desc;
end;
$$;

grant execute on function public.com_faturamento_por_cliente(date, date, text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. com_evolucao_por_faixa — item 5 do §14: por cliente e mês, quanto ele
-- comprou de produto faixa A, B, C, e o que ficou fora da curva (`-`,
-- reusando `com_curva_abc` — nunca reclassificando Pareto aqui). A faixa é
-- do PRODUTO, no período/filial/critério selecionados — nunca do cliente.
-- `valor_outros` é a coluna que faz `valor_a + valor_b + valor_c +
-- valor_outros = total` fechar sempre: produto fora da curva (saldo
-- líquido ≤ 0, decisão da L6b) não desaparece, só não entra em A/B/C. Sem
-- esta coluna a soma das três faixas ficaria menor que o total do cliente,
-- e a tela mentiria.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_evolucao_por_faixa(
  p_de date, p_ate date, p_filial text default null, p_criterio text default 'valor'
)
returns table (
  cliente_codigo text, competencia date,
  valor_a numeric, valor_b numeric, valor_c numeric, valor_outros numeric, total numeric
)
language plpgsql stable security invoker
set search_path = public
as $$
#variable_conflict use_column
begin
  if p_criterio not in ('valor', 'quantidade') then
    raise exception 'p_criterio inválido: % — use ''valor'' ou ''quantidade''.', p_criterio;
  end if;

  return query
  with faixas as (
    select produto_codigo, faixa from public.com_curva_abc(p_de, p_ate, p_filial, p_criterio)
  ),
  base as (
    select
      i.cliente_codigo, i.competencia, i.produto_codigo,
      (case when p_criterio = 'valor' then sum(i.valor_curva) else sum(i.quantidade_curva) end) as m
    from public.com_vendas_itens i
    where i.classe in ('venda', 'devolucao')
      and i.emissao between p_de and p_ate
      and (p_filial is null or i.filial = p_filial)
    group by i.cliente_codigo, i.competencia, i.produto_codigo
  ),
  -- `coalesce(faixa, '-')`: todo produto com movimento no mesmo recorte
  -- (classe, emissao, filial) aparece em com_curva_abc — o coalesce é
  -- defesa, não caminho esperado.
  classificado as (
    select b.cliente_codigo, b.competencia, coalesce(f.faixa, '-') as faixa, b.m
    from base b
    left join faixas f on f.produto_codigo = b.produto_codigo
  )
  select
    cl.cliente_codigo, cl.competencia,
    coalesce(sum(cl.m) filter (where cl.faixa = 'A'), 0) as valor_a,
    coalesce(sum(cl.m) filter (where cl.faixa = 'B'), 0) as valor_b,
    coalesce(sum(cl.m) filter (where cl.faixa = 'C'), 0) as valor_c,
    coalesce(sum(cl.m) filter (where cl.faixa = '-'), 0) as valor_outros,
    coalesce(sum(cl.m), 0) as total
  from classificado cl
  group by cl.cliente_codigo, cl.competencia
  order by cl.cliente_codigo, cl.competencia;
end;
$$;

grant execute on function public.com_evolucao_por_faixa(date, date, text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. com_matriz_produto_cliente — item 6 do §14: produto × cliente, só
-- células com movimento (nunca a grade inteira: 182 produtos × 58 clientes
-- já passa de dez mil células, e cresce com a carga histórica). `valor` e
-- `quantidade` sempre vêm os dois; o CRITÉRIO decide o que conta como
-- "movimento" (uma célula com quantidade de bonificação mas valor líquido
-- zero, por exemplo) e qual é o `maximo` devolvido — a mesma alternância
-- que `FiltrosComerciais` já oferece, sem seletor próprio da tela.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_matriz_produto_cliente(
  p_de date, p_ate date, p_filial text default null, p_criterio text default 'valor'
)
returns table (
  produto_codigo text, produto_nome text, cliente_codigo text, cliente_nome text,
  valor numeric, quantidade numeric, maximo numeric
)
language plpgsql stable security invoker
set search_path = public
as $$
#variable_conflict use_column
begin
  if p_criterio not in ('valor', 'quantidade') then
    raise exception 'p_criterio inválido: % — use ''valor'' ou ''quantidade''.', p_criterio;
  end if;

  return query
  with celulas as (
    select
      i.produto_codigo,
      coalesce(max(p.nome), i.produto_codigo) as produto_nome,
      i.cliente_codigo,
      coalesce(max(c.razao_social), i.cliente_codigo) as cliente_nome,
      sum(i.valor_curva) as valor,
      sum(i.quantidade_curva) as quantidade
    from public.com_vendas_itens i
    left join public.com_produtos p on p.tenant_id = i.tenant_id and p.codigo = i.produto_codigo
    left join public.com_clientes c on c.tenant_id = i.tenant_id and c.codigo = i.cliente_codigo
    where i.classe in ('venda', 'devolucao')
      and i.emissao between p_de and p_ate
      and (p_filial is null or i.filial = p_filial)
    group by i.produto_codigo, i.cliente_codigo
  ),
  filtradas as (
    select * from celulas
    where (case when p_criterio = 'valor' then valor else quantidade end) <> 0
  )
  select
    f.produto_codigo, f.produto_nome, f.cliente_codigo, f.cliente_nome,
    f.valor, f.quantidade,
    max(case when p_criterio = 'valor' then f.valor else f.quantidade end) over () as maximo
  from filtradas f;
end;
$$;

grant execute on function public.com_matriz_produto_cliente(date, date, text, text) to authenticated;

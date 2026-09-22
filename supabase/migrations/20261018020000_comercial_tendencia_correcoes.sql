-- Correção da auditoria da L6e (Painel Diretor — tendência produto a
-- produto). Ver .scratch/plano-l6e-correcoes.md §3 (achado D3) e
-- docs/instrucoes-painel-comercial.md §14.
--
-- ACHADO D3: com um único mês selecionado no período, `com_tendencia_
-- produtos` já zera `situacao` e `variacao` (ressalva 1 do §14 — não existe
-- "1ª metade"/"2ª metade" para medir tendência), mas `concentrado` não tinha
-- a mesma guarda. Com um único mês, o total do período É o total daquele
-- mês: `maior_mes_valor > total_valor * 0.5` é sempre verdadeiro (o único
-- mês é 100% do total, sempre acima de 50%) — "mais da metade do
-- faturamento saiu num único mês" deixa de informar concentração e passa a
-- ser uma tautologia do próprio filtro. A mesma razão da ressalva 1,
-- aplicada à ressalva 2: com um único mês, não existe "concentração" para
-- medir, e a resposta certa é nula, nunca `true`.
--
-- Idempotente: `create or replace function` recria o corpo inteiro sem
-- apagar a função (privilégios de `grant` continuam valendo).
create or replace function public.com_tendencia_produtos(
  p_de date, p_ate date, p_filial text default null, p_criterio text default 'valor'
)
returns table (
  produto_codigo text, nome text, faturamento numeric, quantidade numeric, faixa text,
  meses_com_venda int, clientes bigint, primeira_metade numeric, segunda_metade numeric,
  variacao numeric, situacao text, concentrado boolean, serie_mensal jsonb
)
language plpgsql stable security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_total_meses int;
  v_meio int;
begin
  if p_criterio not in ('valor', 'quantidade') then
    raise exception 'p_criterio inválido: % — use ''valor'' ou ''quantidade''.', p_criterio;
  end if;

  v_total_meses := (extract(year from p_ate) - extract(year from p_de)) * 12
    + (extract(month from p_ate) - extract(month from p_de)) + 1;
  v_meio := v_total_meses / 2;

  return query
  with meses as (
    select gs::date as mes, (row_number() over (order by gs) <= v_meio) as primeira
    from generate_series(date_trunc('month', p_de::timestamp), date_trunc('month', p_ate::timestamp), interval '1 month') as gs
  ),
  por_mes as (
    select i.produto_codigo, i.competencia, sum(i.valor_curva) as valor, sum(i.quantidade_curva) as quantidade
    from public.com_vendas_itens i
    where i.classe in ('venda', 'devolucao')
      and i.emissao between p_de and p_ate
      and (p_filial is null or i.filial = p_filial)
    group by i.produto_codigo, i.competencia
  ),
  totais as (
    select
      i.produto_codigo,
      coalesce(max(p.nome), i.produto_codigo) as nome,
      sum(i.valor_curva) as faturamento,
      sum(i.quantidade_curva) as quantidade,
      count(distinct i.cliente_codigo) as clientes,
      count(distinct i.competencia) filter (where i.classe = 'venda') as meses_com_venda
    from public.com_vendas_itens i
    left join public.com_produtos p on p.tenant_id = i.tenant_id and p.codigo = i.produto_codigo
    where i.classe in ('venda', 'devolucao')
      and i.emissao between p_de and p_ate
      and (p_filial is null or i.filial = p_filial)
    group by i.produto_codigo
  ),
  grade as (
    select t.produto_codigo, m.mes, m.primeira,
           coalesce(pm.valor, 0) as valor_mes,
           coalesce(pm.quantidade, 0) as quantidade_mes
    from totais t
    cross join meses m
    left join por_mes pm on pm.produto_codigo = t.produto_codigo and pm.competencia = m.mes
  ),
  metricas as (
    select
      g.produto_codigo,
      sum(case when g.primeira then (case when p_criterio = 'valor' then g.valor_mes else g.quantidade_mes end) else 0 end) as primeira_metade,
      sum(case when not g.primeira then (case when p_criterio = 'valor' then g.valor_mes else g.quantidade_mes end) else 0 end) as segunda_metade,
      -- Concentração: SEMPRE por valor (faturamento), independente de p_criterio.
      max(g.valor_mes) as maior_mes_valor,
      sum(g.valor_mes) as total_valor,
      jsonb_agg((case when p_criterio = 'valor' then g.valor_mes else g.quantidade_mes end) order by g.mes) as serie_mensal
    from grade g
    group by g.produto_codigo
  ),
  faixas as (
    select produto_codigo, faixa from public.com_curva_abc(p_de, p_ate, p_filial, p_criterio)
  )
  select
    t.produto_codigo, t.nome, t.faturamento, t.quantidade,
    coalesce(f.faixa, '-') as faixa,
    t.meses_com_venda::int, t.clientes,
    (case when v_total_meses <= 1 then null else m.primeira_metade end) as primeira_metade,
    (case when v_total_meses <= 1 then null else m.segunda_metade end) as segunda_metade,
    (case
      when v_total_meses <= 1 then null
      when m.primeira_metade = 0 then null
      else round((m.segunda_metade - m.primeira_metade) / m.primeira_metade, 4)
    end) as variacao,
    (case
      when v_total_meses <= 1 then null
      when m.primeira_metade = 0 and m.segunda_metade <> 0 then 'Novo'
      when m.primeira_metade <> 0 and m.segunda_metade = 0 then 'Descontinuado'
      when t.meses_com_venda::numeric / v_total_meses <= 0.30 then 'Esporádico'
      when m.segunda_metade >= m.primeira_metade * 1.25 then 'Crescendo'
      when m.segunda_metade <= m.primeira_metade * 0.75 then 'Caindo'
      else 'Estável'
    end) as situacao,
    -- CORREÇÃO D3: com um único mês no período, o único mês É o total —
    -- "mais da metade do faturamento saiu num único mês" seria sempre
    -- verdadeiro e não informaria nada. Nulo, pela mesma razão de situacao
    -- e variacao (ressalva 1 do §14, agora estendida à ressalva 2).
    (case
      when v_total_meses <= 1 then null
      else (m.total_valor > 0 and m.maior_mes_valor > m.total_valor * 0.5)
    end) as concentrado,
    m.serie_mensal
  from totais t
  join metricas m on m.produto_codigo = t.produto_codigo
  left join faixas f on f.produto_codigo = t.produto_codigo
  order by t.faturamento desc;
end;
$$;

grant execute on function public.com_tendencia_produtos(date, date, text, text) to authenticated;

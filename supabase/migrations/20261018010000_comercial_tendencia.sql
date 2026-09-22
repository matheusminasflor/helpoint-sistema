-- Painel Diretor (L6e) — tendência produto a produto e detalhe do produto
-- (docs/instrucoes-painel-comercial.md §14, itens 2 e 3). Ver
-- .scratch/plano-l6e-simulador-e-tendencia.md §2/§3. Idempotente: pode ser
-- reaplicada sem erro. Nenhuma tabela nova — lê o que a L6a/L6b já gravam em
-- com_vendas_itens e reusa a faixa de com_curva_abc (não recalcula Pareto
-- aqui: se a fronteira A/B/C mudar um dia, muda num lugar só).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. com_tendencia_produtos — por produto, no período/filial/critério
-- escolhidos: faturamento, quantidade, faixa (de com_curva_abc), meses com
-- venda, clientes, faturamento na 1ª e 2ª metade do período, variação entre
-- as duas, situação, concentração e a série mensal (para a miniatura).
--
-- A ORDEM DE AVALIAÇÃO DA SITUAÇÃO (o documento dá a tabela, não a ordem):
--   1º Novo          — sem venda na 1ª metade, com venda na 2ª.
--   2º Descontinuado — vendia na 1ª metade, zerado na 2ª.
--   3º Esporádico    — meses com venda ≤ 30% dos meses do período.
--   4º Crescendo/Caindo/Estável — pela variação entre as duas metades.
-- Novo e Descontinuado são presença/ausência e vêm ANTES da variação: sem
-- isso, um produto zerado na 2ª metade teria segunda_metade = 0 e
-- "variação" de -100%, que é Caindo, não Descontinuado — dois rótulos para
-- o mesmo fato, escondendo o que importa (zerou). Esporádico vem ANTES de
-- Crescendo/Caindo/Estável: um produto que vendeu em 2 de 12 meses (um em
-- cada metade) teria variação de até +∞%/-100% entre eles, virando
-- "Crescendo 300%" ou "Caindo" por acaso — Esporádico descarta essa
-- variação como não confiável antes de ela ser calculada como rótulo.
--
-- RESSALVA 1 (§14): com um único mês no período (p_de e p_ate no mesmo mês)
-- não existe "1ª metade" nem "2ª metade" — situação e variação saem NULAS
-- para todo produto, nunca 'Estável'.
--
-- RESSALVA 2 (§14): concentração é sinalizada quando mais da metade do
-- FATURAMENTO do produto (sempre por valor, nunca por quantidade — é sobre
-- dinheiro, não sobre unidade) saiu num único mês do período. Evita tirar
-- de linha um produto que só vende em época certa.
-- ═══════════════════════════════════════════════════════════════════════════
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
-- Mesmo motivo do `com_curva_abc`: os nomes de saída também são nomes de
-- coluna nas CTEs abaixo, e sem esta diretiva o Postgres recusa com "column
-- reference is ambiguous" (42702), só ao CHAMAR a função.
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
  -- Divisão inteira: com um total ímpar de meses, a 1ª metade fica menor e
  -- a sobra vai para a 2ª — escolha arbitrária, sem teste de fronteira
  -- específico (o painel sempre abre com o ano inteiro, 12 meses, par).
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
    (m.total_valor > 0 and m.maior_mes_valor > m.total_valor * 0.5) as concentrado,
    m.serie_mensal
  from totais t
  join metricas m on m.produto_codigo = t.produto_codigo
  left join faixas f on f.produto_codigo = t.produto_codigo
  order by t.faturamento desc;
end;
$$;

grant execute on function public.com_tendencia_produtos(date, date, text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. com_detalhe_produto — o gráfico mensal (faturamento, quantidade,
-- clientes distintos por competência) e a lista de quem compra, para a
-- tela de detalhe (§14 item 3). Devolve `jsonb` porque são duas listas de
-- formatos diferentes — mesmo padrão de `com_ficha_cliente` (migration
-- 20261016020000): um `jsonb_build_object` no lugar de dois SELECTs.
-- A "leitura em texto" (situação, variação, concentração, clientes) NÃO
-- mora aqui: ela usa a linha já calculada por `com_tendencia_produtos` para
-- este produto — recalcular a mesma coisa duas vezes é a segunda
-- implementação que a regra 11 do CLAUDE.md pede para nunca existir.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_detalhe_produto(
  p_codigo text, p_de date, p_ate date, p_filial text default null
)
returns jsonb
language plpgsql stable security invoker
set search_path = public
as $$
declare
  v_mensal jsonb;
  v_clientes jsonb;
begin
  select coalesce(jsonb_agg(x order by x.competencia), '[]'::jsonb) into v_mensal
  from (
    select
      i.competencia,
      sum(i.valor_curva) as faturamento,
      sum(i.quantidade_curva) as quantidade,
      count(distinct i.cliente_codigo) as clientes_distintos
    from public.com_vendas_itens i
    where i.produto_codigo = p_codigo
      and i.classe in ('venda', 'devolucao')
      and i.emissao between p_de and p_ate
      and (p_filial is null or i.filial = p_filial)
    group by i.competencia
  ) x;

  select coalesce(jsonb_agg(x order by x.valor desc), '[]'::jsonb) into v_clientes
  from (
    select
      i.cliente_codigo,
      coalesce(max(c.razao_social), i.cliente_codigo) as nome,
      sum(i.valor_curva) as valor,
      sum(i.quantidade_curva) as quantidade
    from public.com_vendas_itens i
    left join public.com_clientes c on c.tenant_id = i.tenant_id and c.codigo = i.cliente_codigo
    where i.produto_codigo = p_codigo
      and i.classe in ('venda', 'devolucao')
      and i.emissao between p_de and p_ate
      and (p_filial is null or i.filial = p_filial)
    group by i.cliente_codigo
  ) x;

  return jsonb_build_object('mensal', v_mensal, 'clientes', v_clientes);
end;
$$;

grant execute on function public.com_detalhe_produto(text, date, date, text) to authenticated;

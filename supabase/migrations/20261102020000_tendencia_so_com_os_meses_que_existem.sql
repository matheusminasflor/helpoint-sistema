-- "Caindo" era 175 produtos; são 46. A janela comparava meses que não existem
--
-- Leva E (2026-09-26), achado ao desenhar a visão simplificada de Produtos —
-- antes de construir o farol, porque farol em cima de sinal errado é pior que
-- nenhum.
--
-- O QUE ACONTECIA. `com_tendencia_produtos` divide a janela pedida em duas
-- metades e compara a segunda com a primeira: é daí que saem `variacao` e
-- `situacao` (Novo, Descontinuado, Esporádico, Crescendo, Caindo, Estável).
--
-- A divisão era pelo CALENDÁRIO da janela, não pelos meses com dado:
--
--   v_total_meses := meses entre p_de e p_ate          -- 12, para janeiro a dezembro
--   v_meio        := v_total_meses / 2                 -- 6
--   meses         := generate_series(p_de .. p_ate)    -- Jan, Fev, … Dez
--
-- O padrão da tela é "ano todo" — janeiro a **dezembro**. E os dados do
-- test-helpoint vão até **setembro**. Então a comparação era:
--
--   primeira metade  Jan–Jun   6 meses de dado
--   segunda metade   Jul–Dez   3 meses de dado + 3 meses que não aconteceram
--
-- Com isso, quase todo produto parece desabar. Medido no banco, o MESMO pedido
-- da tela (Jan–Dez, sem filial, por valor), antes e depois desta migration —
-- depois, a janela encolhe sozinha para Jan–Set, o que existe:
--
--                          antes (Jan–Dez do calendário)   depois (Jan–Set)
--   produtos "Caindo"                  175                        46
--   "Descontinuado"                     28                        17
--   "Esporádico"                         8                         5
--   variação média                   −66,98%                   +69,96%
--
-- Quase quatro vezes mais produtos acusados de cair, e a variação média
-- TROCANDO DE SINAL. Nenhum erro na tela, nenhum aviso: só um mês de outubro
-- que ainda não chegou, somando zero contra seis meses de venda.
--
-- E havia um segundo efeito, mais discreto: `meses_com_venda / v_total_meses <=
-- 0.30` decide "Esporádico". Com o denominador em 12 e só 9 meses possíveis, um
-- produto que vendeu em 3 dos 9 meses dava 3/12 = 0,25 → "Esporádico", quando a
-- conta honesta é 3/9 = 0,33 → não é.
--
-- ══ A CORREÇÃO ══════════════════════════════════════════════════════════════
--
-- A janela encolhe até os meses que EXISTEM: `min` e `max` de `competencia`
-- dentro do recorte pedido. Tudo o mais continua igual, inclusive os buracos no
-- meio — um produto que vendeu em janeiro e em setembro e nada entre os dois tem
-- sete meses de zero, e esses zeros são reais. O que sai da conta são apenas os
-- meses de FORA do que foi importado, nas duas pontas.
--
-- Janela sem dado nenhum devolve zero linha, como antes (era o `totais` vazio;
-- agora é um `return` explícito, que diz a mesma coisa mais cedo).
--
-- O que NÃO muda: `faturamento`, `quantidade`, `clientes` e a faixa da curva —
-- são somas sobre a janela, e somar meses vazios não altera soma. A curva
-- continua recebendo `p_de`/`p_ate` originais de propósito, para a faixa aqui ser
-- a mesma que as outras telas mostram para o mesmo período.
--
-- `create or replace` sem `drop`: a assinatura não muda, então a ACL se preserva
-- (regra 14 do pgTAP no CLAUDE.md). O corpo é o da migration de origem
-- (20261018020000), copiado por script, com TRÊS linhas trocadas — conferido com
-- `scripts/diff-corpo-funcao.mjs`.

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
  v_primeiro_mes date;
  v_ultimo_mes date;
  v_meio int;
begin
  if p_criterio not in ('valor', 'quantidade') then
    raise exception 'p_criterio inválido: % — use ''valor'' ou ''quantidade''.', p_criterio;
  end if;

  -- A JANELA ENCOLHE ATE OS MESES QUE EXISTEM (leva E, 2026-09-26). Ver o
  -- cabecalho da migration: comparar metades de uma janela com meses vazios
  -- marcava 175 produtos como "Caindo" onde eram 46.
  select min(i.competencia), max(i.competencia)
    into v_primeiro_mes, v_ultimo_mes
  from public.com_vendas_itens i
  where i.classe in ('venda', 'devolucao')
    and i.emissao between p_de and p_ate
    and (p_filial is null or i.filial = p_filial);

  if v_primeiro_mes is null then
    return;
  end if;

  v_total_meses := (extract(year from v_ultimo_mes) - extract(year from v_primeiro_mes)) * 12
    + (extract(month from v_ultimo_mes) - extract(month from v_primeiro_mes)) + 1;
  v_meio := v_total_meses / 2;

  return query
  with meses as (
    select gs::date as mes, (row_number() over (order by gs) <= v_meio) as primeira
    from generate_series(v_primeiro_mes::timestamp, v_ultimo_mes::timestamp, interval '1 month') as gs
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

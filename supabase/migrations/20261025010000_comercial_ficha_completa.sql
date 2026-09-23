-- Frente 5a — a ficha do cliente completa (§11 do documento do dono,
-- docs/instrucoes-painel-comercial.md linhas 292-326). Ver
-- .scratch/plano-frente5-ficha-e-conciliacao.md §5a. Idempotente: pode ser
-- reaplicada sem erro.
--
-- `com_ficha_cliente` tinha quatro blocos (comprou, bonificado, parou de
-- comprar, nunca comprou); o §11 pede nove. Em vez de um `plpgsql` de 500
-- linhas — que não se testa por partes — cada bloco ganha a PRÓPRIA
-- função, testável e mutável isoladamente, e `com_ficha_cliente` passa a
-- ser só o compositor fino que as chama e monta o jsonb final: continua
-- sendo UMA ida ao banco para a tela, que é o que o comentário original
-- (migration 20261016010000) defendia.
--
-- A assinatura muda (ganha p_criterio; `p_ano` nunca existiu e continua
-- fora — o ano do bloco mensal é o ano de `p_ate`), então o `drop`
-- explícito vem antes do `create`, como `20261023010000` já fez com
-- `com_painel_totais` e a leva anterior (5b) com `com_conciliacao`.

-- ═══════════════════════════════════════════════════════════════════════════
-- 0. com_periodo_anterior — a janela imediatamente anterior a [p_de, p_ate],
-- do MESMO TAMANHO (jul contra jun; mai-jul contra fev-abr). Escrita uma
-- vez porque dois blocos a usam (evolução por faixa e evolução produto a
-- produto) — o compositor calcula uma vez só e passa o resultado para os
-- dois, em vez de cada bloco recalcular a mesma conta.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_periodo_anterior(p_de date, p_ate date)
returns table (ant_de date, ant_ate date)
language sql immutable
as $$
  select (p_de - ((p_ate - p_de) + 1)), (p_de - 1);
$$;

grant execute on function public.com_periodo_anterior(date, date) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. com_ficha_identificacao — {codigo, nome, tabela_preco, em_condicao}.
-- `em_condicao` é a coluna gerada de `com_clientes` (mesmo critério que
-- `com_faturamento_por_cliente` já usa) — nunca uma segunda decisão sobre o
-- que é "estar em condição". `values` garante uma linha sempre, mesmo para
-- um código sem cadastro em `com_clientes` (cliente só existe por venda).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_ficha_identificacao(p_codigo text)
returns table (codigo text, nome text, tabela_preco text, em_condicao boolean)
language sql stable security invoker
set search_path = public
as $$
  select base.codigo, coalesce(c.razao_social, base.codigo), c.tabela_preco, coalesce(c.em_condicao, false)
  from (values (p_codigo)) as base(codigo)
  left join public.com_clientes c on c.codigo = base.codigo;
$$;

grant execute on function public.com_ficha_identificacao(text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. com_ficha_indicadores — faturamento/bonificação/SKUs/meses ativos NO
-- PERÍODO, mais a variação do último mês contra a média dos 3 anteriores.
-- A âncora é o último mês com movimento do CLIENTE dentro do período —
-- nunca `current_date` (regra 10 do pgTAP), mesmo padrão que
-- `com_ficha_cliente` já usa para "parou de comprar".
--
-- Os três meses anteriores NÃO passam por `coalesce(..., 0)`: `sum()` sobre
-- zero linhas devolve NULL, e é assim que "mês sem dado" se distingue de
-- "mês com movimento zero" — a regra 0.0/null da Frente 2, agora no tempo.
-- Com menos de 3 meses anteriores com dado, `variacao` sai NULL (nunca
-- 0%) — é a asserção que a mutação `coalesce(valor_mes, 0)` tem que
-- derrubar: com o coalesce, um mês sem movimento passaria a "contar" como
-- mês com dado (valor 0), e a exigência de 3 meses deixaria de filtrar
-- nada.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_ficha_indicadores(
  p_codigo text, p_de date, p_ate date, p_filial text default null
)
returns table (
  faturamento numeric, bonificacao numeric, skus bigint, meses_ativos bigint,
  ultimo_mes date, media_3_anteriores numeric, variacao numeric
)
language plpgsql stable security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_ultimo_mes date;
  v_m1 date;
  v_m2 date;
  v_m3 date;
  v_valor_ultimo numeric;
  v_media numeric;
  v_meses_com_dado int;
begin
  select max(i.competencia) into v_ultimo_mes
  from public.com_vendas_itens i
  where i.cliente_codigo = p_codigo and i.classe = 'venda'
    and i.emissao between p_de and p_ate
    and (p_filial is null or i.filial = p_filial);

  if v_ultimo_mes is not null then
    v_m1 := (v_ultimo_mes - interval '1 month')::date;
    v_m2 := (v_ultimo_mes - interval '2 month')::date;
    v_m3 := (v_ultimo_mes - interval '3 month')::date;

    select sum(i.valor_curva) into v_valor_ultimo
    from public.com_vendas_itens i
    where i.cliente_codigo = p_codigo and i.classe in ('venda', 'devolucao')
      and i.competencia = v_ultimo_mes
      and (p_filial is null or i.filial = p_filial);

    select count(*) filter (where valores.valor is not null), avg(valores.valor)
      into v_meses_com_dado, v_media
    from (
      select mes, (
        select sum(i.valor_curva) from public.com_vendas_itens i
        where i.cliente_codigo = p_codigo and i.classe in ('venda', 'devolucao')
          and i.competencia = mes
          and (p_filial is null or i.filial = p_filial)
      ) as valor
      from (values (v_m1), (v_m2), (v_m3)) as t(mes)
    ) valores;
  end if;

  return query
  select
    coalesce((
      select sum(i.valor_curva) from public.com_vendas_itens i
      where i.cliente_codigo = p_codigo and i.classe in ('venda', 'devolucao')
        and i.emissao between p_de and p_ate and (p_filial is null or i.filial = p_filial)
    ), 0) as faturamento,
    coalesce((
      select sum(i.valor_nota) from public.com_vendas_itens i
      where i.cliente_codigo = p_codigo and i.classe = 'bonificacao'
        and i.emissao between p_de and p_ate and (p_filial is null or i.filial = p_filial)
    ), 0) as bonificacao,
    coalesce((
      select count(distinct i.produto_codigo) from public.com_vendas_itens i
      where i.cliente_codigo = p_codigo and i.classe = 'venda'
        and i.emissao between p_de and p_ate and (p_filial is null or i.filial = p_filial)
    ), 0) as skus,
    coalesce((
      select count(distinct i.competencia) from public.com_vendas_itens i
      where i.cliente_codigo = p_codigo and i.classe = 'venda'
        and i.emissao between p_de and p_ate and (p_filial is null or i.filial = p_filial)
    ), 0) as meses_ativos,
    v_ultimo_mes as ultimo_mes,
    v_media as media_3_anteriores,
    (case
      when v_ultimo_mes is null then null
      when coalesce(v_meses_com_dado, 0) < 3 then null
      when coalesce(v_media, 0) = 0 then null
      else round((coalesce(v_valor_ultimo, 0) - v_media) / v_media, 4)
    end) as variacao;
end;
$$;

grant execute on function public.com_ficha_indicadores(text, date, date, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. com_ficha_mensal_do_ano — os 12 meses do ANO DE p_ate (nunca um
-- `p_ano` próprio — parâmetro a menos é ambiguidade a menos), com `valor`
-- NULL (não zero) no mês sem venda. A tela é quem destaca os meses dentro
-- de [p_de, p_ate].
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_ficha_mensal_do_ano(
  p_codigo text, p_ate date, p_filial text default null
)
returns table (mes date, valor numeric)
language sql stable security invoker
set search_path = public
as $$
  with meses as (
    select gs::date as mes
    from generate_series(
      make_date(extract(year from p_ate)::int, 1, 1),
      make_date(extract(year from p_ate)::int, 12, 1),
      interval '1 month'
    ) as gs
  ),
  vendas as (
    select i.competencia, sum(i.valor_curva) as valor
    from public.com_vendas_itens i
    where i.cliente_codigo = p_codigo and i.classe in ('venda', 'devolucao')
      and extract(year from i.competencia) = extract(year from p_ate)
      and (p_filial is null or i.filial = p_filial)
    group by i.competencia
  )
  select m.mes, v.valor
  from meses m
  left join vendas v on v.competencia = m.mes
  order by m.mes;
$$;

grant execute on function public.com_ficha_mensal_do_ano(text, date, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. com_ficha_mix_por_faixa — valor, quantidade e participação do cliente
-- por faixa A/B/C/fora da curva. A faixa vem de `com_curva_abc(p_de, p_ate,
-- p_filial, p_criterio)` — SEMPRE relativa ao período e à filial
-- selecionados, nunca gravada (§11 linha 298). `participacao` segue o
-- MESMO critério da curva (valor ou quantidade, nunca só valor), para não
-- misturar base de comparação com o resto do painel.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_ficha_mix_por_faixa(
  p_codigo text, p_de date, p_ate date, p_filial text default null, p_criterio text default 'valor'
)
returns table (faixa text, valor numeric, quantidade numeric, participacao numeric)
language sql stable security invoker
set search_path = public
as $$
  with faixas as (
    select produto_codigo, faixa from public.com_curva_abc(p_de, p_ate, p_filial, p_criterio)
  ),
  compras as (
    select i.produto_codigo, sum(i.valor_curva) as valor, sum(i.quantidade_curva) as quantidade
    from public.com_vendas_itens i
    where i.cliente_codigo = p_codigo and i.classe in ('venda', 'devolucao')
      and i.emissao between p_de and p_ate and (p_filial is null or i.filial = p_filial)
    group by i.produto_codigo
  ),
  classificado as (
    select coalesce(f.faixa, '-') as faixa, c.valor, c.quantidade,
      (case when p_criterio = 'valor' then c.valor else c.quantidade end) as m
    from compras c
    left join faixas f on f.produto_codigo = c.produto_codigo
  ),
  agregado as (
    select faixa, sum(valor) as valor, sum(quantidade) as quantidade, sum(m) as m
    from classificado
    group by faixa
  ),
  total as (select coalesce(sum(m), 0) as t from agregado)
  select a.faixa, a.valor, a.quantidade,
    (case when total.t = 0 then null else round(a.m / total.t * 100, 2) end) as participacao
  from agregado a, total;
$$;

grant execute on function public.com_ficha_mix_por_faixa(text, date, date, text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. com_ficha_evolucao_faixa — {atual, anterior, total}, A/B/C/fora por
-- mês. `com_evolucao_por_faixa` já calcula isto para TODOS os clientes e é
-- cortada em 500 linhas (`buscarComTeto`) — chamá-la para filtrar UM
-- cliente no navegador é a mesma doença dos 129 clientes (conta certa,
-- lugar errado): o cliente pode não estar entre os 500 primeiros. Este
-- bloco filtra `cliente_codigo = p_codigo` já no banco, sem teto.
--
-- A faixa do período ANTERIOR é relativa a ELE MESMO — um novo
-- `com_curva_abc(p_ant_de, p_ant_ate, ...)`, nunca a faixa do período
-- atual aplicada retroativamente: faixa gravada é o que o §11 linha 298
-- proíbe.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_ficha_evolucao_faixa(
  p_codigo text, p_de date, p_ate date, p_ant_de date, p_ant_ate date,
  p_filial text default null, p_criterio text default 'valor'
)
returns jsonb
language plpgsql stable security invoker
set search_path = public
as $$
declare
  v_atual jsonb;
  v_anterior jsonb;
  v_total numeric;
begin
  select coalesce(jsonb_agg(to_jsonb(x) order by x.competencia), '[]'::jsonb) into v_atual
  from (
    with faixas as (
      select produto_codigo, faixa from public.com_curva_abc(p_de, p_ate, p_filial, p_criterio)
    ),
    base as (
      select i.competencia, i.produto_codigo,
        (case when p_criterio = 'valor' then sum(i.valor_curva) else sum(i.quantidade_curva) end) as m
      from public.com_vendas_itens i
      where i.cliente_codigo = p_codigo and i.classe in ('venda', 'devolucao')
        and i.emissao between p_de and p_ate and (p_filial is null or i.filial = p_filial)
      group by i.competencia, i.produto_codigo
    ),
    classificado as (
      select b.competencia, coalesce(f.faixa, '-') as faixa, b.m
      from base b
      left join faixas f on f.produto_codigo = b.produto_codigo
    )
    select competencia,
      coalesce(sum(m) filter (where faixa = 'A'), 0) as valor_a,
      coalesce(sum(m) filter (where faixa = 'B'), 0) as valor_b,
      coalesce(sum(m) filter (where faixa = 'C'), 0) as valor_c,
      coalesce(sum(m) filter (where faixa = '-'), 0) as valor_outros,
      coalesce(sum(m), 0) as total
    from classificado
    group by competencia
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.competencia), '[]'::jsonb) into v_anterior
  from (
    with faixas as (
      select produto_codigo, faixa from public.com_curva_abc(p_ant_de, p_ant_ate, p_filial, p_criterio)
    ),
    base as (
      select i.competencia, i.produto_codigo,
        (case when p_criterio = 'valor' then sum(i.valor_curva) else sum(i.quantidade_curva) end) as m
      from public.com_vendas_itens i
      where i.cliente_codigo = p_codigo and i.classe in ('venda', 'devolucao')
        and i.emissao between p_ant_de and p_ant_ate and (p_filial is null or i.filial = p_filial)
      group by i.competencia, i.produto_codigo
    ),
    classificado as (
      select b.competencia, coalesce(f.faixa, '-') as faixa, b.m
      from base b
      left join faixas f on f.produto_codigo = b.produto_codigo
    )
    select competencia,
      coalesce(sum(m) filter (where faixa = 'A'), 0) as valor_a,
      coalesce(sum(m) filter (where faixa = 'B'), 0) as valor_b,
      coalesce(sum(m) filter (where faixa = 'C'), 0) as valor_c,
      coalesce(sum(m) filter (where faixa = '-'), 0) as valor_outros,
      coalesce(sum(m), 0) as total
    from classificado
    group by competencia
  ) x;

  select coalesce(sum((mes ->> 'total')::numeric), 0) into v_total
  from jsonb_array_elements(v_atual) as mes;

  return jsonb_build_object('atual', v_atual, 'anterior', v_anterior, 'total', v_total);
end;
$$;

grant execute on function public.com_ficha_evolucao_faixa(text, date, date, date, date, text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. com_ficha_evolucao_produtos — período contra o anterior de mesmo
-- tamanho, produto a produto: `valor_atual`, `valor_anterior`, `delta`
-- (ordenado por ele, decrescente — quem mais cresceu em reais) e `marca`
-- ('novo' quando não comprava e passou a comprar; 'zerou' quando comprava
-- e parou; null nos demais casos) — mesma ordem de avaliação por
-- presença/ausência ANTES da variação que `com_tendencia_produtos` já usa,
-- para não confundir "zerou" com "caiu 100%".
--
-- `anterior_existe`/`anterior_completo` respondem ao pedido do §11 linha
-- 319 ("quando o período anterior não existir ou for incompleto, diga
-- isso no cabeçalho"), resolvidos contra o que `com_periodo_importado`
-- cobre (min/max de competência publicada) — nunca contra o calendário.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_ficha_evolucao_produtos(
  p_codigo text, p_de date, p_ate date, p_ant_de date, p_ant_ate date, p_filial text default null
)
returns jsonb
language plpgsql stable security invoker
set search_path = public
as $$
declare
  v_produtos jsonb;
  v_comp_de date;
  v_comp_ate date;
  v_anterior_existe boolean;
  v_anterior_completo boolean;
begin
  select competencia_de, competencia_ate into v_comp_de, v_comp_ate
  from public.com_periodo_importado(p_filial);

  v_anterior_existe := v_comp_de is not null and p_ant_de <= v_comp_ate and p_ant_ate >= v_comp_de;
  v_anterior_completo := v_comp_de is not null and p_ant_de >= v_comp_de and p_ant_ate <= v_comp_ate;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.delta desc), '[]'::jsonb) into v_produtos
  from (
    with atual as (
      select i.produto_codigo, sum(i.valor_curva) as valor
      from public.com_vendas_itens i
      where i.cliente_codigo = p_codigo and i.classe in ('venda', 'devolucao')
        and i.emissao between p_de and p_ate and (p_filial is null or i.filial = p_filial)
      group by i.produto_codigo
    ),
    anterior as (
      select i.produto_codigo, sum(i.valor_curva) as valor
      from public.com_vendas_itens i
      where i.cliente_codigo = p_codigo and i.classe in ('venda', 'devolucao')
        and i.emissao between p_ant_de and p_ant_ate and (p_filial is null or i.filial = p_filial)
      group by i.produto_codigo
    ),
    unidos as (
      select coalesce(a.produto_codigo, an.produto_codigo) as produto_codigo,
        coalesce(a.valor, 0) as valor_atual, coalesce(an.valor, 0) as valor_anterior
      from atual a
      full join anterior an on an.produto_codigo = a.produto_codigo
    )
    select u.produto_codigo, coalesce(max(p.nome), u.produto_codigo) as nome,
      u.valor_atual, u.valor_anterior, (u.valor_atual - u.valor_anterior) as delta,
      (case
        when u.valor_anterior = 0 and u.valor_atual <> 0 then 'novo'
        when u.valor_anterior <> 0 and u.valor_atual = 0 then 'zerou'
        else null
      end) as marca
    from unidos u
    left join public.com_produtos p on p.codigo = u.produto_codigo
    group by u.produto_codigo, u.valor_atual, u.valor_anterior
  ) x;

  return jsonb_build_object(
    'produtos', v_produtos,
    'anterior_existe', v_anterior_existe,
    'anterior_completo', v_anterior_completo
  );
end;
$$;

grant execute on function public.com_ficha_evolucao_produtos(text, date, date, date, date, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. com_ficha_comprou — o que o cliente compra, com DUAS faixas: a dele
-- (`faixa_cliente`, o Pareto calculado só sobre as compras DELE — mesma
-- fórmula A até 80%/B até 95%/C depois de `com_curva_abc`, mas escopada a
-- este cliente) e a geral (`faixa_geral`, de `com_curva_abc` no
-- período/filial/critério selecionados — a curva da empresa). É a
-- comparação que o §11 pede: o que é A para ele pode ser C para a empresa.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_ficha_comprou(
  p_codigo text, p_de date, p_ate date, p_filial text default null, p_criterio text default 'valor'
)
returns table (
  produto_codigo text, nome text, valor numeric, quantidade numeric,
  faixa_cliente text, faixa_geral text
)
language sql stable security invoker
set search_path = public
as $$
  with compras as (
    select i.produto_codigo, coalesce(max(p.nome), i.produto_codigo) as nome,
      sum(i.valor_curva) as valor, sum(i.quantidade_curva) as quantidade
    from public.com_vendas_itens i
    left join public.com_produtos p on p.codigo = i.produto_codigo
    where i.cliente_codigo = p_codigo and i.classe in ('venda', 'devolucao')
      and i.emissao between p_de and p_ate and (p_filial is null or i.filial = p_filial)
    group by i.produto_codigo
  ),
  metrica as (
    select c.*, (case when p_criterio = 'valor' then c.valor else c.quantidade end) as m
    from compras c
  ),
  positivos as (
    select m.*,
      sum(m.m) over (order by m.m desc, m.produto_codigo rows unbounded preceding) as corrido
    from metrica m
    where m.m > 0
  ),
  total_cliente as (select coalesce(sum(m), 0) as t from positivos),
  faixa_do_cliente as (
    select p.produto_codigo,
      (case
        when round(p.corrido / total_cliente.t * 100, 2) <= 80 then 'A'
        when round(p.corrido / total_cliente.t * 100, 2) <= 95 then 'B'
        else 'C'
      end) as faixa_cliente
    from positivos p, total_cliente
    union all
    select m.produto_codigo, '-' from metrica m where m.m <= 0
  ),
  faixas_gerais as (
    select produto_codigo, faixa from public.com_curva_abc(p_de, p_ate, p_filial, p_criterio)
  )
  select c.produto_codigo, c.nome, c.valor, c.quantidade,
    coalesce(fc.faixa_cliente, '-') as faixa_cliente,
    coalesce(fg.faixa, '-') as faixa_geral
  from compras c
  left join faixa_do_cliente fc on fc.produto_codigo = c.produto_codigo
  left join faixas_gerais fg on fg.produto_codigo = c.produto_codigo
  order by c.valor desc;
$$;

grant execute on function public.com_ficha_comprou(text, date, date, text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8a. com_ficha_bonificado — sem mudança de regra, só extraído da
-- `com_ficha_cliente` antiga (migration 20261016020000) para função
-- própria.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_ficha_bonificado(
  p_codigo text, p_de date, p_ate date, p_filial text default null
)
returns table (produto_codigo text, nome text, valor numeric, quantidade numeric)
language sql stable security invoker
set search_path = public
as $$
  select i.produto_codigo, coalesce(max(p.nome), i.produto_codigo) as nome,
    sum(i.valor_nota) as valor, sum(i.quantidade) as quantidade
  from public.com_vendas_itens i
  left join public.com_produtos p on p.codigo = i.produto_codigo
  where i.cliente_codigo = p_codigo and i.classe = 'bonificacao'
    and i.emissao between p_de and p_ate and (p_filial is null or i.filial = p_filial)
  group by i.produto_codigo
  order by valor desc;
$$;

grant execute on function public.com_ficha_bonificado(text, date, date, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8b. com_ficha_parou_de_comprar — sem mudança de regra (comprou em ≥2 dos
-- 3 meses anteriores ao último mês com movimento do cliente, e não comprou
-- nesse último mês), extraído da `com_ficha_cliente` antiga.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_ficha_parou_de_comprar(
  p_codigo text, p_de date, p_ate date, p_filial text default null
)
returns table (produto_codigo text, nome text)
language plpgsql stable security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_ultimo_mes date;
  v_m1 date;
  v_m2 date;
  v_m3 date;
begin
  select max(i.competencia) into v_ultimo_mes
  from public.com_vendas_itens i
  where i.cliente_codigo = p_codigo and i.classe = 'venda'
    and i.emissao between p_de and p_ate and (p_filial is null or i.filial = p_filial);

  if v_ultimo_mes is null then
    return;
  end if;

  v_m1 := (v_ultimo_mes - interval '1 month')::date;
  v_m2 := (v_ultimo_mes - interval '2 month')::date;
  v_m3 := (v_ultimo_mes - interval '3 month')::date;

  return query
  with meses3 as (
    select distinct produto_codigo, competencia
    from public.com_vendas_itens
    where cliente_codigo = p_codigo and classe = 'venda' and competencia in (v_m1, v_m2, v_m3)
      and (p_filial is null or filial = p_filial)
  ),
  contagem as (
    select produto_codigo, count(*) as meses from meses3 group by produto_codigo
  ),
  comprou_ultimo as (
    select distinct produto_codigo
    from public.com_vendas_itens
    where cliente_codigo = p_codigo and classe = 'venda' and competencia = v_ultimo_mes
      and (p_filial is null or filial = p_filial)
  )
  select ct.produto_codigo, coalesce(max(p.nome), ct.produto_codigo) as nome
  from contagem ct
  left join public.com_produtos p on p.codigo = ct.produto_codigo
  where ct.meses >= 2
    and not exists (select 1 from comprou_ultimo cu where cu.produto_codigo = ct.produto_codigo)
  group by ct.produto_codigo;
end;
$$;

grant execute on function public.com_ficha_parou_de_comprar(text, date, date, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. com_ficha_nunca_comprou — produtos das TRÊS faixas (A/B/C) e fora da
-- curva, nunca só da C. O teto (100) passa a valer POR FAIXA — antes era
-- um teto global de 100 ordenado por `valor_outros desc`, e como C tem
-- sempre mais SKUs que A/B, a faixa C sozinha engolia as 100 vagas e A/B
-- somiam da lista. `row_number() over (partition by faixa ...)` garante até
-- 100 de CADA faixa; `total_da_faixa` é a contagem cheia daquela faixa
-- (antes do corte), para a tela dizer "mostrando 100 de N" por faixa —
-- filtro de qual faixa mostrar é da TELA, o corte de quantidade é do BANCO.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_ficha_nunca_comprou(
  p_codigo text, p_de date, p_ate date, p_filial text default null, p_criterio text default 'valor'
)
returns table (produto_codigo text, nome text, faixa text, valor_outros numeric, total_da_faixa bigint)
language sql stable security invoker
set search_path = public
as $$
  with nunca as (
    select pr.codigo as produto_codigo, pr.nome,
      coalesce(sum(i2.valor_curva) filter (
        where i2.classe in ('venda', 'devolucao') and i2.cliente_codigo <> p_codigo
      ), 0) as valor_outros
    from public.com_produtos pr
    left join public.com_vendas_itens i2
      on i2.produto_codigo = pr.codigo and i2.emissao between p_de and p_ate
      and (p_filial is null or i2.filial = p_filial)
    where not exists (
      select 1 from public.com_vendas_itens i
      where i.produto_codigo = pr.codigo and i.cliente_codigo = p_codigo
        and i.classe in ('venda', 'devolucao') and i.emissao between p_de and p_ate
        and (p_filial is null or i.filial = p_filial)
    )
    group by pr.codigo, pr.nome
  ),
  faixas as (
    select produto_codigo, faixa from public.com_curva_abc(p_de, p_ate, p_filial, p_criterio)
  ),
  classificado as (
    select n.produto_codigo, n.nome, coalesce(f.faixa, '-') as faixa, n.valor_outros
    from nunca n
    left join faixas f on f.produto_codigo = n.produto_codigo
  ),
  com_rank as (
    select c.*,
      row_number() over (partition by faixa order by valor_outros desc, produto_codigo) as rn,
      count(*) over (partition by faixa) as total_da_faixa
    from classificado c
  )
  select produto_codigo, nome, faixa, valor_outros, total_da_faixa
  from com_rank
  where rn <= 100
  order by faixa, valor_outros desc;
$$;

grant execute on function public.com_ficha_nunca_comprou(text, date, date, text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. com_ficha_cliente — o COMPOSITOR fino. Assinatura nova: ganha
-- `p_criterio`; a coluna de retorno continua `jsonb`, mas como a
-- assinatura muda, o `drop` explícito vem antes do `create`, para não
-- deixar uma sobrecarga ambígua (mesmo cuidado de `20261023010000` com
-- `com_painel_totais`). Quem chamava com 4 argumentos (sem `p_criterio`)
-- não quebra: `p_criterio` tem default, então a chamada antiga resolve
-- para esta função de 5 argumentos sem precisar mudar nada na tela ainda
-- não migrada — mas o FORMATO do jsonb muda por completo (nove blocos em
-- vez de quatro), então a tela TEM de ser atualizada junto.
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists public.com_ficha_cliente(text, date, date, text);

create function public.com_ficha_cliente(
  p_codigo text, p_de date, p_ate date, p_filial text default null, p_criterio text default 'valor'
)
returns jsonb
language plpgsql stable security invoker
set search_path = public
as $$
declare
  v_ant_de date;
  v_ant_ate date;
begin
  if p_criterio not in ('valor', 'quantidade') then
    raise exception 'p_criterio inválido: % — use ''valor'' ou ''quantidade''.', p_criterio;
  end if;

  select ant_de, ant_ate into v_ant_de, v_ant_ate
  from public.com_periodo_anterior(p_de, p_ate);

  return jsonb_build_object(
    'identificacao', (select to_jsonb(x) from public.com_ficha_identificacao(p_codigo) x),
    'indicadores', (select to_jsonb(x) from public.com_ficha_indicadores(p_codigo, p_de, p_ate, p_filial) x),
    'mensal_do_ano', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.mes), '[]'::jsonb)
      from public.com_ficha_mensal_do_ano(p_codigo, p_ate, p_filial) x
    ),
    'mix_por_faixa', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.faixa), '[]'::jsonb)
      from public.com_ficha_mix_por_faixa(p_codigo, p_de, p_ate, p_filial, p_criterio) x
    ),
    'evolucao_faixa', public.com_ficha_evolucao_faixa(p_codigo, p_de, p_ate, v_ant_de, v_ant_ate, p_filial, p_criterio),
    'evolucao_produtos', public.com_ficha_evolucao_produtos(p_codigo, p_de, p_ate, v_ant_de, v_ant_ate, p_filial),
    'comprou', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.valor desc), '[]'::jsonb)
      from public.com_ficha_comprou(p_codigo, p_de, p_ate, p_filial, p_criterio) x
    ),
    'bonificado', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.valor desc), '[]'::jsonb)
      from public.com_ficha_bonificado(p_codigo, p_de, p_ate, p_filial) x
    ),
    'parou_de_comprar', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.nome), '[]'::jsonb)
      from public.com_ficha_parou_de_comprar(p_codigo, p_de, p_ate, p_filial) x
    ),
    'nunca_comprou', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.faixa, x.valor_outros desc), '[]'::jsonb)
      from public.com_ficha_nunca_comprou(p_codigo, p_de, p_ate, p_filial, p_criterio) x
    )
  );
end;
$$;

grant execute on function public.com_ficha_cliente(text, date, date, text, text) to authenticated;

-- PUBLICIDADE deixa de ser somada dentro de BONIFICAÇÃO nas telas por
-- cliente. Continuação da migration 20261026020000, que fez o mesmo na
-- Conciliação — aqui a regra desce para a ficha do cliente e para a lista de
-- faturamento por cliente da Diretoria.
--
-- A regra é a mesma, dita pelo dono em 2026-09-25: "quando é série 75 e a
-- natureza da operação está bonificação, realmente é bonificação; quando é
-- série 1 e está bonificação na natureza, é publicidade". O CFOP 5910/6910 É
-- essa natureza, então a série decide — e ela já está gravada desde a
-- primeira importação.
--
-- POR QUE ISTO IMPORTA, em reais: em 2026 há R$ 673.530 de publicidade
-- dentro de um número que toda tela chama de "bonificação". Um cliente que
-- recebeu material de propaganda aparecia com a mesma marca de quem recebeu
-- produto de graça — e a régua do painel antigo ("acima de 25% sobre a venda
-- merece conversa") estava sendo aplicada sobre a soma das duas.
--
-- AS TRÊS FUNÇÕES MUDAM A LISTA DE COLUNAS, então vão de `drop` + `create`,
-- não `create or replace`: o tipo de linha (definido pelos parâmetros OUT)
-- mudou, e o Postgres recusa a substituição. Mesma armadilha de
-- `20261016020000` e `20261026020000`.
--
-- `com_ficha_cliente` NÃO precisa de mudança: ela compõe os blocos com
-- `to_jsonb(x)`, então a coluna nova aparece no JSON sozinha. Confirmado
-- lendo a função (migration 20261025010000, linhas 638-667).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. com_ficha_indicadores — o farol da ficha.
--
-- `bonificacao` passa a ser SÓ a série 75; `publicidade` nasce ao lado. O
-- `case when not v_periodo_tem_dado then null` continua nas duas: período sem
-- nada importado devolve NULL, nunca zero — "não sei" e "foi zero" são
-- respostas diferentes, e é a regra que a Frente 2 existiu para estabelecer.
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists public.com_ficha_indicadores(text, date, date, text);

create or replace function public.com_ficha_indicadores(
  p_codigo text, p_de date, p_ate date, p_filial text default null
)
returns table (
  faturamento numeric, bonificacao numeric, publicidade numeric,
  skus bigint, meses_ativos bigint,
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
  v_periodo_tem_dado boolean;
begin
  select exists (
    select 1 from public.com_vendas_itens i
    where i.emissao between p_de and p_ate
      and (p_filial is null or i.filial = p_filial)
  ) into v_periodo_tem_dado;

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

    -- Mês IMPORTADO em que o cliente não comprou conta como zero real —
    -- é o que faz a variação continuar existindo justamente para quem
    -- parou de comprar. Mês NÃO importado é NULL e não entra na média:
    -- não se sabe o que houve nele, e inventar zero ali derrubaria a
    -- média e inflaria a variação.
    --
    -- ESTE BLOCO É CÓPIA VERBATIM da migration 20261025030000. Na primeira
    -- versão desta migration eu o REESCREVI de cabeça, em vez de copiar, e
    -- perdi as duas regras: os zeros reais dos meses cobertos e a média
    -- sobre o que está coberto (eu anulava a média com menos de 3 meses,
    -- quando o certo é anular só a VARIAÇÃO, embaixo). Seis asserções da
    -- suíte da ficha acusaram no CI #103. A leva era sobre bonificação e
    -- publicidade; nada aqui tinha o que mudar.
    select count(*) filter (where valores.valor is not null), avg(valores.valor)
      into v_meses_com_dado, v_media
    from (
      select mes, (
        case when public.com_mes_importado(mes, p_filial) then coalesce((
          select sum(i.valor_curva) from public.com_vendas_itens i
          where i.cliente_codigo = p_codigo and i.classe in ('venda', 'devolucao')
            and i.competencia = mes
            and (p_filial is null or i.filial = p_filial)
        ), 0) else null end
      ) as valor
      from (values (v_m1), (v_m2), (v_m3)) as t(mes)
    ) valores;
  end if;

  return query
  select
    (case when not v_periodo_tem_dado then null else coalesce((
      select sum(i.valor_curva) from public.com_vendas_itens i
      where i.cliente_codigo = p_codigo and i.classe in ('venda', 'devolucao')
        and i.emissao between p_de and p_ate and (p_filial is null or i.filial = p_filial)
    ), 0) end) as faturamento,
    -- Série 75: bonificação de verdade (o cashback sai por aqui também).
    (case when not v_periodo_tem_dado then null else coalesce((
      select sum(i.valor_nota) from public.com_vendas_itens i
      where i.cliente_codigo = p_codigo and i.classe = 'bonificacao' and i.serie <> '1'
        and i.emissao between p_de and p_ate and (p_filial is null or i.filial = p_filial)
    ), 0) end) as bonificacao,
    -- Série 1: material de propaganda. Mesmo CFOP, outra coisa.
    (case when not v_periodo_tem_dado then null else coalesce((
      select sum(i.valor_nota) from public.com_vendas_itens i
      where i.cliente_codigo = p_codigo and i.classe = 'bonificacao' and i.serie = '1'
        and i.emissao between p_de and p_ate and (p_filial is null or i.filial = p_filial)
    ), 0) end) as publicidade,
    (case when not v_periodo_tem_dado then null else coalesce((
      select count(distinct i.produto_codigo) from public.com_vendas_itens i
      where i.cliente_codigo = p_codigo and i.classe = 'venda'
        and i.emissao between p_de and p_ate and (p_filial is null or i.filial = p_filial)
    ), 0) end) as skus,
    (case when not v_periodo_tem_dado then null else coalesce((
      select count(distinct i.competencia) from public.com_vendas_itens i
      where i.cliente_codigo = p_codigo and i.classe = 'venda'
        and i.emissao between p_de and p_ate and (p_filial is null or i.filial = p_filial)
    ), 0) end) as meses_ativos,
    v_ultimo_mes as ultimo_mes,
    -- `media_3_anteriores` é a média do que está COBERTO pelo importado,
    -- mesmo com menos de três meses — é a régua que a tela mostra ao lado da
    -- variação. Quem exige os três meses é só a `variacao`, abaixo.
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
-- 2. com_ficha_bonificado — a tabela "Produtos bonificados" da ficha.
--
-- Ganha `serie` em vez de virar duas funções: a mesma linha de produto pode
-- ter saído nas duas séries, e uma função por série obrigaria a tela a juntar
-- os dois resultados de novo — que é o erro que esta leva está desfazendo.
-- Agrupa por (produto, série) e a tela decide como mostrar.
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists public.com_ficha_bonificado(text, date, date, text);

create or replace function public.com_ficha_bonificado(
  p_codigo text, p_de date, p_ate date, p_filial text default null
)
returns table (produto_codigo text, nome text, serie text, valor numeric, quantidade numeric)
language sql stable security invoker
set search_path = public
as $$
  select i.produto_codigo, coalesce(max(p.nome), i.produto_codigo) as nome,
    i.serie,
    sum(i.valor_nota) as valor, sum(i.quantidade) as quantidade
  from public.com_vendas_itens i
  left join public.com_produtos p on p.codigo = i.produto_codigo
  where i.cliente_codigo = p_codigo and i.classe = 'bonificacao'
    and i.emissao between p_de and p_ate and (p_filial is null or i.filial = p_filial)
  group by i.produto_codigo, i.serie
  order by valor desc;
$$;

grant execute on function public.com_ficha_bonificado(text, date, date, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. com_faturamento_por_cliente — a lista da Diretoria → Clientes.
--
-- Mesma separação. O `order by faturamento desc` não muda: a ordem é pela
-- venda, e continua sendo.
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists public.com_faturamento_por_cliente(date, date, text, text);

create or replace function public.com_faturamento_por_cliente(
  p_de date, p_ate date, p_filial text default null, p_criterio text default 'valor'
)
returns table (
  cliente_codigo text, nome text, tabela_preco text, em_condicao boolean,
  faturamento numeric, bonificacao numeric, publicidade numeric,
  skus bigint, meses_ativos bigint,
  serie_mensal jsonb
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
      coalesce(sum(i.valor_nota) filter (where i.classe = 'bonificacao' and i.serie <> '1'), 0) as bonificacao,
      coalesce(sum(i.valor_nota) filter (where i.classe = 'bonificacao' and i.serie = '1'), 0) as publicidade,
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
    t.faturamento, t.bonificacao, t.publicidade, t.skus, t.meses_ativos,
    s.serie_mensal
  from totais t
  left join series s on s.cliente_codigo = t.cliente_codigo
  order by t.faturamento desc;
end;
$$;

grant execute on function public.com_faturamento_por_cliente(date, date, text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. com_painel_totais — os KPIs do topo do Painel Comercial.
--
-- Aqui a separação é MAIS necessária, não menos: o painel abre em "as duas
-- séries", e o indicador "bonificação sobre a venda" é o que herda a régua do
-- painel antigo do dono ("acima de 25% merece conversa"). Com a publicidade
-- somada dentro, essa régua estava sendo aplicada sobre um número inflado —
-- em 2026, R$ 673.530 de propaganda contados como produto dado de graça.
--
-- `com_faturamento_mensal` NÃO entra nesta leva de propósito: ela já AGRUPA
-- por série, então cada linha dela já é de uma série só, e uma coluna
-- `publicidade` ali seria sempre zero ou sempre igual à de bonificação. O que
-- faltava lá era o RÓTULO da tela, não o dado — e isso se resolve em
-- `ComercialPainel.tsx`, sem tocar no banco.
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists public.com_painel_totais(integer, text, text, date, date);

create or replace function public.com_painel_totais(
  p_ano integer,
  p_filial text default null,
  p_serie text default null,
  p_de date default null,
  p_ate date default null
)
returns table(
  venda numeric, devolucao numeric, liquido numeric,
  bonificacao numeric, publicidade numeric,
  unidades numeric, clientes_ativos bigint, skus_vendidos bigint
)
language sql stable
set search_path to 'public'
as $function$
  select
    coalesce(sum(i.valor_nota) filter (where i.classe = 'venda'), 0),
    coalesce(sum(abs(i.valor_nota)) filter (where i.classe = 'devolucao'), 0),
    coalesce(sum(i.valor_curva) filter (where i.classe in ('venda','devolucao')), 0),
    coalesce(sum(i.valor_nota) filter (where i.classe = 'bonificacao' and i.serie <> '1'), 0),
    coalesce(sum(i.valor_nota) filter (where i.classe = 'bonificacao' and i.serie = '1'), 0),
    coalesce(sum(i.quantidade_curva) filter (where i.classe in ('venda','devolucao')), 0),
    count(distinct i.cliente_codigo) filter (where i.classe = 'venda'),
    count(distinct i.produto_codigo) filter (where i.classe = 'venda')
  from public.com_vendas_itens i
  where (
      case
        when p_de is not null and p_ate is not null then i.emissao between p_de and p_ate
        else extract(year from i.competencia) = p_ano
      end
    )
    and (p_filial is null or i.filial = p_filial)
    and (p_serie is null or i.serie = p_serie);
$function$;

grant execute on function public.com_painel_totais(integer, text, text, date, date) to authenticated;

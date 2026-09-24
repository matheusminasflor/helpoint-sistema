-- "Este mês foi importado?" passa a ser uma pergunta sobre o MÊS, não sobre
-- o intervalo — decisão do dono em 2026-09-24, achado da revisão das
-- correções da Frente 5a.
--
-- O DEFEITO: `com_ficha_indicadores` e `com_ficha_evolucao_produtos`
-- decidiam se um mês tinha dado comparando-o com o COMEÇO e o FIM do que
-- existe na filial (`com_periodo_importado`). Importe janeiro e março, pule
-- fevereiro, e fevereiro passa a ser "dado" — o cliente é tratado como
-- tendo comprado ZERO num mês que ninguém carregou.
--
-- Em `com_ficha_evolucao_produtos` isso movia um aviso (`anterior_completo`
-- dizia completo com buraco dentro). Em `com_ficha_indicadores` movia um
-- NÚMERO: o zero inventado entra na média dos 3 meses anteriores, a média
-- cai, e a variação do cliente infla — sem nada na tela dizendo que aquele
-- mês é desconhecido, não vazio. É a mesma família de "sem dado virou
-- zero" que a Frente 2 existiu para tirar do sistema, um nível mais fundo.
--
-- A FONTE ESCOLHIDA, e por que não a outra: `com_vendas_competencias`
-- grava, por filial, quais competências cada importação publicou — é
-- autoritativa, mas ler dela exigiria alargar a policy de SELECT dela para
-- `has_diretoria_access` (hoje só `has_comercial_access`), e um diretor
-- puro veria a ficha inteira virar "—" em silêncio até isso acontecer.
-- Pior: qualquer linha de venda que exista sem competência correspondente
-- (dado carregado por outro caminho) sumiria do cálculo do mesmo jeito
-- silencioso. A pergunta "existe QUALQUER venda nesta competência, nesta
-- filial?" não tem nenhum dos dois riscos: um mês com venda foi
-- obviamente importado, e um mês sem venda nenhuma de ninguém é
-- desconhecido — que é exatamente a distinção que faltava.
--
-- O que nenhuma das duas fontes distingue: mês importado em que a empresa
-- INTEIRA não vendeu nada. Na Minasflor isso não acontece (há nota todo
-- mês); se um dia acontecer, aquele mês vira "desconhecido" em vez de
-- "zero da empresa" — erra para o lado de não inventar número.
--
-- Idempotente: `create or replace` em todas.

-- ═══════════════════════════════════════════════════════════════════════════
-- O critério, escrito UMA vez. As duas funções abaixo o chamam — duas
-- cópias da mesma regra foi como a faixa A e a faixa B viraram a mesma cor
-- na Frente 4, e como o documento e o banco divergiram na Frente 3.
-- `security invoker`: a RLS de `com_vendas_itens` é quem separa as
-- empresas, e a asserção estrutural da suíte da ficha exige que continue
-- assim.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_mes_importado(p_mes date, p_filial text default null)
returns boolean
language sql stable security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.com_vendas_itens i
    where i.competencia = date_trunc('month', p_mes)::date
      and (p_filial is null or i.filial = p_filial)
  );
$$;

comment on function public.com_mes_importado(date, text) is
  'Este mês foi importado nesta filial? Responde pela EXISTÊNCIA de venda '
  'na competência, nunca pelo intervalo entre a primeira e a última — um '
  'mês pulado no meio da carga não pode ser lido como "o cliente comprou '
  'zero". Ver a migration 20261025030000.';

grant execute on function public.com_mes_importado(date, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- com_ficha_indicadores — o mês anterior só conta como zero real quando
-- FOI importado; fora disso é NULL e não entra na média. E o período
-- selecionado só mostra número quando tem algum mês importado dentro dele.
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
  v_periodo_tem_dado boolean;
begin
  -- "O período selecionado tem alguma coisa importada?" — pela existência
  -- de venda dentro dele, não pela sobreposição com o intervalo geral.
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
    (case when not v_periodo_tem_dado then null else coalesce((
      select sum(i.valor_nota) from public.com_vendas_itens i
      where i.cliente_codigo = p_codigo and i.classe = 'bonificacao'
        and i.emissao between p_de and p_ate and (p_filial is null or i.filial = p_filial)
    ), 0) end) as bonificacao,
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
    v_media as media_3_anteriores,
    (case
      when v_ultimo_mes is null then null
      when coalesce(v_meses_com_dado, 0) < 3 then null
      when coalesce(v_media, 0) = 0 then null
      else round((coalesce(v_valor_ultimo, 0) - v_media) / v_media, 4)
    end) as variacao;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- com_ficha_evolucao_produtos — a janela anterior está COMPLETA quando
-- TODO mês dela foi importado, e EXISTE quando ao menos um foi. Antes,
-- as duas perguntas eram respondidas contra as pontas do intervalo, e um
-- mês pulado no meio passava despercebido.
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
  v_anterior_existe boolean;
  v_anterior_completo boolean;
begin
  select coalesce(bool_or(public.com_mes_importado(m::date, p_filial)), false),
         coalesce(bool_and(public.com_mes_importado(m::date, p_filial)), false)
    into v_anterior_existe, v_anterior_completo
  from generate_series(
    date_trunc('month', p_ant_de),
    date_trunc('month', p_ant_ate),
    interval '1 month'
  ) m;

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
        coalesce(a.valor, 0) as valor_atual,
        (case when v_anterior_existe then coalesce(an.valor, 0) else null end) as valor_anterior
      from atual a
      full join anterior an on an.produto_codigo = a.produto_codigo
    )
    select u.produto_codigo, coalesce(max(p.nome), u.produto_codigo) as nome,
      u.valor_atual, u.valor_anterior,
      (case when v_anterior_existe then (u.valor_atual - u.valor_anterior) else null end) as delta,
      (case
        when not v_anterior_existe then null
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

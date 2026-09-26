-- "PUBLICIDADE" SAI DO SISTEMA. Desfaz a separação que a migration
-- `20261026030000` introduziu no mesmo dia — ela estava errada, e o erro foi
-- meu.
--
-- O QUE ACONTECEU. Em 2026-09-25 o dono descreveu a regra que usa no
-- Forteplus: "quando é série 75 e a natureza da operação está bonificação,
-- realmente é bonificação; quando é série 1 e está bonificação na natureza, é
-- publicidade". Eu conferi numa amostra — a lista de UM cliente, o 1859, cuja
-- série 1 era quase toda sacola e sachê — e tratei como regra.
--
-- A BASE INTEIRA NEGA. Da remessa gratuita da série 1, **98,7% do valor é
-- produto que também é vendido**: OJON MÁSCARA 1KG (R$ 232 mil), STYLO
-- REPARADOR (R$ 136 mil), BB CREAM (R$ 84 mil). Só 1,3% é material que nunca
-- foi vendido em quatro anos — e esses são apenas 21 produtos somando R$ 33
-- mil (flyer, banner, camisa, sacola, espátula, caneta, certificado).
--
-- E O CFOP TAMBÉM NÃO SEPARA, conferido a pedido do dono: existem só dois
-- CFOPs de remessa gratuita (5910 e 6910) e os DOIS aparecem nas DUAS séries.
-- A diferença entre eles é geografia — 5 é dentro do estado, 6 é
-- interestadual —, nunca finalidade. O CFOP diz para onde o produto foi,
-- nunca por quê. A natureza da operação, que diria, não vem no export (44
-- colunas conferidas).
--
-- DECISÃO DO DONO, 2026-09-25, depois de ver os números: "Venda = Série 1 e
-- 75. E tudo que é sem emissão de nota, ou seja, bonificação, cashback."
-- Publicidade fica DENTRO da bonificação, sem nome próprio — número que não
-- se consegue calcular não pode ter rótulo na tela. Foi exatamente esse erro
-- que esta migration desfaz.
--
-- FICA REGISTRADA A SAÍDA, para quando ele quiser: marcar uma vez os produtos
-- promocionais e os destinos de publicidade (o cliente MINASFLOR MARKETING
-- recebeu R$ 27 mil em 2026 — isso é publicidade por destino, não por
-- produto). Aí a separação vira exata e não depende de adivinhar.
--
-- AS QUATRO PRIMEIRAS FUNÇÕES VOLTAM AO CORPO EXATO de antes de
-- `20261026030000`, copiado das migrations de origem — não reescrito de
-- cabeça. Reescrever de cabeça foi como eu apaguei, no mesmo dia, a regra dos
-- meses cobertos de `com_ficha_indicadores` (CI #103). A conferência que
-- fecha esta leva é um `diff` do corpo contra a origem, ignorando
-- comentários: a diferença tem de ser SÓ a coluna que sai.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. com_ficha_indicadores — volta a `20261025030000` (sem `publicidade`).
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists public.com_ficha_indicadores(text, date, date, text);

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
    -- AS DUAS SÉRIES. A série não distingue bonificação de publicidade, e o
    -- CFOP também não: um número só, honesto, com a publicidade dentro.
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

grant execute on function public.com_ficha_indicadores(text, date, date, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. com_ficha_bonificado — volta a `20261025010000` (sem `serie`).
--
-- A coluna `serie` existia para a tela mostrar duas tabelas. Com uma só, ela
-- faria o MESMO produto aparecer duas vezes — pior do que antes.
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists public.com_ficha_bonificado(text, date, date, text);

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
-- 3. com_faturamento_por_cliente — volta a `20261019010000`.
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists public.com_faturamento_por_cliente(date, date, text, text);

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
-- 4. com_painel_totais — volta a `20261023010000`.
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists public.com_painel_totais(integer, text, text, date, date);

create or replace function public.com_painel_totais(
  p_ano integer,
  p_filial text default null,
  p_serie text default null,
  p_de date default null,
  p_ate date default null
)
returns table(venda numeric, devolucao numeric, liquido numeric, bonificacao numeric, unidades numeric, clientes_ativos bigint, skus_vendidos bigint)
language sql stable
set search_path to 'public'
as $function$
  select
    coalesce(sum(i.valor_nota) filter (where i.classe = 'venda'), 0),
    coalesce(sum(abs(i.valor_nota)) filter (where i.classe = 'devolucao'), 0),
    coalesce(sum(i.valor_curva) filter (where i.classe in ('venda','devolucao')), 0),
    coalesce(sum(i.valor_nota) filter (where i.classe = 'bonificacao'), 0),
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. com_conciliacao — a separação VENDA COM NOTA × VENDA SEM NOTA FICA.
--
-- Ela não tem nada a ver com o erro da publicidade: é a que provou, nos sete
-- meses informados de 2026, que a planilha do diretor é a venda com nota
-- (0,49% de folga) e que há R$ 401.302,64 de venda sem nota que ele cobra e
-- não registra. Isso se sustenta e continua.
--
-- O que muda: `publicidade` e `bonificacao` viram UMA coluna, as duas séries.
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists public.com_conciliacao(integer);

create or replace function public.com_conciliacao(p_ano integer)
returns table (
  informado numeric,
  venda_com_nota numeric,
  venda_sem_nota numeric,
  venda_total numeric,
  bonificacao numeric,
  diferenca_com_nota numeric,
  diferenca_total numeric,
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
    select ma.mes, ma.total_realizado
    from public.metas_ano ma
    where ma.tenant_id = (select public.get_user_tenant_id())
      and ma.ano = p_ano
      and ma.total_realizado is not null
  ),
  totais as (
    select
      sum(mi.total_realizado) as informado,
      count(*) as meses_comparados
    from meses_informados mi
  ),
  erp as (
    select
      coalesce(sum(i.valor_curva) filter (where i.classe in ('venda', 'devolucao') and i.serie = '1'), 0) as venda_com_nota,
      coalesce(sum(i.valor_curva) filter (where i.classe in ('venda', 'devolucao') and i.serie <> '1'), 0) as venda_sem_nota,
      -- Uma coluna só: a série não separa bonificação de publicidade, e o
      -- CFOP também não (5910 e 6910 estão nas duas séries; a diferença
      -- entre eles é dentro/fora do estado). O cashback também mora aqui.
      coalesce(sum(i.valor_nota) filter (where i.classe = 'bonificacao'), 0) as bonificacao
    from public.com_vendas_itens i
    join meses_informados mi on extract(month from i.competencia) = mi.mes
    where i.tenant_id = (select public.get_user_tenant_id())
      and extract(year from i.competencia) = p_ano
  ),
  totais_erp as (
    select
      erp.venda_com_nota, erp.venda_sem_nota, erp.bonificacao,
      erp.venda_com_nota + erp.venda_sem_nota as venda_total
    from erp
  )
  select
    t.informado,
    x.venda_com_nota,
    x.venda_sem_nota,
    x.venda_total,
    x.bonificacao,
    case when t.informado is null then null else t.informado - x.venda_com_nota end as diferenca_com_nota,
    case when t.informado is null then null else t.informado - x.venda_total end as diferenca_total,
    t.meses_comparados::int as meses_comparados
  from totais t, totais_erp x;
end;
$$;

grant execute on function public.com_conciliacao(integer) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6/7. O farol passa a contar AS DUAS SÉRIES.
--
-- Era o efeito mais concreto do erro: excluindo a série 1, o farol deixava de
-- fora R$ 2,15 milhões de produto dado de graça — e com isso não apontava
-- 3 clientes e R$ 70 mil. Medido em 2026, nas duas filiais:
--
--   recebeu sem comprar      9 clientes · R$ 222.086,71  →  10 · R$ 292.262,15
--   recebeu mais que comprou 14 clientes                 →  16
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_bonificacao_farol_clientes(
  p_de date, p_ate date, p_filial text default null
)
returns table (
  cliente_codigo text, nome text, tabela_preco text,
  bonificacao numeric, comprado numeric, percentual numeric, motivo text
)
language sql stable security invoker
set search_path = public
as $$
  with base as (
    select
      i.cliente_codigo,
      coalesce(max(c.razao_social), i.cliente_codigo) as nome,
      max(c.tabela_preco) as tabela_preco,
      coalesce(sum(i.valor_nota) filter (where i.classe = 'bonificacao'), 0) as bonificacao,
      coalesce(sum(i.valor_curva) filter (where i.classe in ('venda', 'devolucao')), 0) as comprado
    from public.com_vendas_itens i
    left join public.com_clientes c on c.tenant_id = i.tenant_id and c.codigo = i.cliente_codigo
    where i.emissao between p_de and p_ate
      and (p_filial is null or i.filial = p_filial)
    group by i.cliente_codigo
  )
  select
    b.cliente_codigo, b.nome, b.tabela_preco, b.bonificacao, b.comprado,
    (case when b.comprado <= 0 then null else round(b.bonificacao / b.comprado * 100, 2) end) as percentual,
    (case when b.comprado <= 0 then 'sem_compra' else 'recebe_mais' end) as motivo
  from base b
  where b.bonificacao > 0
    and (b.comprado <= 0 or b.bonificacao > b.comprado)
  order by b.bonificacao desc;
$$;

grant execute on function public.com_bonificacao_farol_clientes(date, date, text) to authenticated;

create or replace function public.com_bonificacao_farol_produtos(
  p_de date, p_ate date, p_filial text default null
)
returns table (
  produto_codigo text, nome text,
  vendido numeric, bonificado numeric,
  quantidade_vendida numeric, quantidade_bonificada numeric,
  vezes numeric
)
language sql stable security invoker
set search_path = public
as $$
  with base as (
    select
      i.produto_codigo,
      coalesce(max(p.nome), max(i.produto_nome), i.produto_codigo) as nome,
      coalesce(sum(i.valor_curva) filter (where i.classe in ('venda', 'devolucao')), 0) as vendido,
      coalesce(sum(i.valor_nota) filter (where i.classe = 'bonificacao'), 0) as bonificado,
      coalesce(sum(i.quantidade_curva) filter (where i.classe in ('venda', 'devolucao')), 0) as quantidade_vendida,
      coalesce(sum(i.quantidade) filter (where i.classe = 'bonificacao'), 0) as quantidade_bonificada
    from public.com_vendas_itens i
    left join public.com_produtos p on p.tenant_id = i.tenant_id and p.codigo = i.produto_codigo
    where i.emissao between p_de and p_ate
      and (p_filial is null or i.filial = p_filial)
    group by i.produto_codigo
  )
  select
    b.produto_codigo, b.nome, b.vendido, b.bonificado,
    b.quantidade_vendida, b.quantidade_bonificada,
    (case when b.quantidade_vendida <= 0 then null
          else round(b.quantidade_bonificada / b.quantidade_vendida, 1) end) as vezes
  from base b
  where b.bonificado > 0 and b.quantidade_bonificada > b.quantidade_vendida
  order by b.bonificado desc;
$$;

grant execute on function public.com_bonificacao_farol_produtos(date, date, text) to authenticated;

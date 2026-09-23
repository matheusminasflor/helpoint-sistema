-- Correções da auditoria da Frente 5a
-- (.scratch/plano-frente5a-correcoes.md). A auditoria REPROVOU a leva: sete
-- dos nove blocos estavam certos (inclusive a prova por mutação do teto de
-- 500), mas o bloco do período anterior contava em DIAS quando o §11 do
-- documento do dono dá os exemplos em MESES. Idempotente: `create or
-- replace` e `comment on function` sempre substituem a versão anterior, sem
-- erro.
--
-- A migration 20261025010000_comercial_ficha_completa.sql já está aplicada
-- no test-helpoint — não se edita migration aplicada, entra outra por cima
-- (regra do repositório).

-- ═══════════════════════════════════════════════════════════════════════════
-- Item 1 — com_periodo_anterior contava em DIAS
-- (`p_de - ((p_ate - p_de) + 1)`): para jul (31 dias) o anterior saía
-- 31/mai-30/jun em vez de 01/jun-30/jun, e piorava com o calendário (2024,
-- bissexto, dava 31/dez/2022 em vez de 01/jan/2023). O §11 linha 319 dá os
-- exemplos em MESES ("jul contra jun; mai–jul contra fev–abr"), e todo
-- seletor do sistema é alinhado ao mês — "mesmo tamanho em meses" é sempre
-- bem definido. Corrigido para contar meses corridos entre p_de e p_ate e
-- voltar a mesma quantidade de meses, terminando um dia antes de p_de.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_periodo_anterior(p_de date, p_ate date)
returns table (ant_de date, ant_ate date)
language plpgsql immutable
as $$
declare
  n_meses int;
begin
  n_meses := (extract(year from p_ate) - extract(year from p_de)) * 12
    + (extract(month from p_ate) - extract(month from p_de)) + 1;
  return query
  select
    (date_trunc('month', p_de) - (n_meses || ' months')::interval)::date,
    (date_trunc('month', p_de) - interval '1 day')::date;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Item 2 — com_ficha_evolucao_produtos: "anterior incompleto" acusava
-- falso. Competência é sempre dia 1 (`date_trunc('month', emissao)`), então
-- comparar `p_ant_ate` (fim de mês, ex. dia 30) direto com `v_comp_ate`
-- (dia 1) fazia `2025-11-30 <= 2025-11-01` dar falso com novembro inteiro
-- importado — o caso comum, porque o seletor nasce no mês corrente (ainda
-- não importado) e o aviso dispara sobre o mês anterior, que está completo.
-- Corrigido comparando competência com competência (`date_trunc('month',
-- ...)` nos dois lados) — só no cálculo de `anterior_completo`;
-- `anterior_existe` já comparava certo, porque as duas pontas de um período
-- alinhado ao mês (`p_ant_de` é sempre dia 1) já entram truncadas.
--
-- Item 5 — sem período anterior coberto, `valor_anterior`/`delta`/`marca`
-- vinham de `coalesce(..., 0)`: todo produto saía marcado 'novo' com delta
-- igual ao valor inteiro do período, mesmo com o cabeçalho avisando que não
-- há base de comparação. Corrigido: com `anterior_existe = false`, os três
-- campos são NULL (a tela mostra "—") — ausência de base não é crescimento
-- de 100%.
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
  v_anterior_completo := v_comp_de is not null
    and date_trunc('month', p_ant_de) >= v_comp_de
    and date_trunc('month', p_ant_ate) <= v_comp_ate;

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

-- ═══════════════════════════════════════════════════════════════════════════
-- Item 4 — com_ficha_indicadores confundia "mês nunca importado" (sem dado,
-- NULL) com "mês importado em que o cliente não comprou" (zero real):
-- `sum()` sobre zero linhas devolve NULL nos dois casos, e "menos de 3
-- meses com dado" zerava a variação bem no cliente que parou de comprar —
-- o número que existe para encontrá-lo desaparecia. Corrigido: cada um dos
-- 3 meses anteriores só é NULL quando está FORA do que
-- `com_periodo_importado` cobre; dentro do período importado, ausência de
-- venda do cliente naquele mês conta como zero real e entra na média.
--
-- Item 6.2 — a mesma família de defeito nos indicadores do PERÍODO
-- selecionado: faturamento/bonificação/SKUs/meses ativos usavam
-- `coalesce(..., 0)` sem checar se o período tinha QUALQUER coisa
-- importada, então um período fora do que já foi carregado mostrava
-- "R$ 0,00" em vez de "—". Corrigido com o mesmo critério de
-- `com_periodo_importado`: os quatro campos são NULL quando o período
-- selecionado não tem nenhuma sobreposição com o que foi importado; dentro
-- do que foi importado, cliente sem compra continua sendo zero real.
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
  v_comp_de date;
  v_comp_ate date;
  v_periodo_tem_dado boolean;
begin
  select competencia_de, competencia_ate into v_comp_de, v_comp_ate
  from public.com_periodo_importado(p_filial);
  v_periodo_tem_dado := v_comp_de is not null and p_de <= v_comp_ate and p_ate >= v_comp_de;

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

    -- Mês DENTRO do período importado conta como zero real (o mês existe no
    -- banco, o cliente só não comprou); mês FORA do período importado é
    -- NULL (nunca foi carregado, não é zero de ninguém).
    select count(*) filter (where valores.valor is not null), avg(valores.valor)
      into v_meses_com_dado, v_media
    from (
      select mes, (
        case when v_comp_de is not null and mes between v_comp_de and v_comp_ate then coalesce((
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
-- Item 7 (excesso) — com_ficha_evolucao_faixa repetia o MESMO bloco de 25
-- linhas para a janela atual e a anterior, diferindo só nas datas. Além de
-- duplicar código, as duas metades podiam divergir silenciosamente se
-- alguém corrigisse uma sem lembrar da outra. Refeita com um `values` das
-- duas janelas e `lateral` calculando cada uma pela MESMA consulta —
-- comportamento idêntico (confirmado contra a versão antiga antes desta
-- correção), agora impossível de divergir.
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
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'competencia', x.competencia, 'valor_a', x.valor_a, 'valor_b', x.valor_b,
      'valor_c', x.valor_c, 'valor_outros', x.valor_outros, 'total', x.total
    ) order by x.competencia) filter (where x.rotulo = 'atual'), '[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object(
      'competencia', x.competencia, 'valor_a', x.valor_a, 'valor_b', x.valor_b,
      'valor_c', x.valor_c, 'valor_outros', x.valor_outros, 'total', x.total
    ) order by x.competencia) filter (where x.rotulo = 'anterior'), '[]'::jsonb)
  into v_atual, v_anterior
  from (
    select w.rotulo, cl.competencia,
      coalesce(sum(cl.m) filter (where cl.faixa = 'A'), 0) as valor_a,
      coalesce(sum(cl.m) filter (where cl.faixa = 'B'), 0) as valor_b,
      coalesce(sum(cl.m) filter (where cl.faixa = 'C'), 0) as valor_c,
      coalesce(sum(cl.m) filter (where cl.faixa = '-'), 0) as valor_outros,
      coalesce(sum(cl.m), 0) as total
    from (values ('atual', p_de, p_ate), ('anterior', p_ant_de, p_ant_ate)) as w(rotulo, de, ate)
    cross join lateral (
      with faixas as (
        select produto_codigo, faixa from public.com_curva_abc(w.de, w.ate, p_filial, p_criterio)
      ),
      base as (
        select i.competencia, i.produto_codigo,
          (case when p_criterio = 'valor' then sum(i.valor_curva) else sum(i.quantidade_curva) end) as m
        from public.com_vendas_itens i
        where i.cliente_codigo = p_codigo and i.classe in ('venda', 'devolucao')
          and i.emissao between w.de and w.ate and (p_filial is null or i.filial = p_filial)
        group by i.competencia, i.produto_codigo
      )
      select b.competencia, coalesce(f.faixa, '-') as faixa, b.m
      from base b
      left join faixas f on f.produto_codigo = b.produto_codigo
    ) cl
    group by w.rotulo, cl.competencia
  ) x;

  select coalesce(sum((mes ->> 'total')::numeric), 0) into v_total
  from jsonb_array_elements(v_atual) as mes;

  return jsonb_build_object('atual', v_atual, 'anterior', v_anterior, 'total', v_total);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Item 7 (excesso) — com_ficha_comprou reimplementa o corte 80/95 do Pareto
-- (faixa_cliente) porque com_curva_abc classifica sobre TODOS os clientes
-- do período, e aqui o corte precisa ser escopado às compras de UM cliente
-- só. Fica como está — não há como reusar com_curva_abc sem reescrever o
-- contrato dela — mas o comentário no banco existe para os dois nunca
-- divergirem sem que quem edite um lembre do outro.
-- ═══════════════════════════════════════════════════════════════════════════
comment on function public.com_ficha_comprou(text, date, date, text, text) is
  'faixa_cliente reimplementa o corte 80/95 do Pareto — com_curva_abc é a '
  'fonte dos limiares (80/95); os dois não podem divergir se um dia '
  'mudarem. Existe como segunda definição porque com_curva_abc classifica '
  'sobre TODOS os clientes do período, e aqui o corte precisa ser escopado '
  'às compras de UM cliente só. Achado da auditoria da Frente 5a '
  '(.scratch/plano-frente5a-correcoes.md item 7).';

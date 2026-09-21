-- Painel Comercial (L6b): curva ABC, clientes a trabalhar, bonificação por
-- cliente e pedidos em condição. Ver .scratch/plano-l6b-curva-e-condicao.md
-- e .scratch/plano-painel-comercial.md §L6b. Idempotente: pode ser
-- reaplicada sem erro. Nenhuma tabela nova — tudo lê o que a L6a já grava em
-- com_vendas_itens (classe, valor_curva, quantidade_curva, competencia,
-- serie) e com_clientes (em_condicao, tabela_base).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. com_curva_abc — Pareto por produto (A até 80%, B até 95%, C acima). A
-- faixa é do ponto ACUMULADO da própria linha, nunca de um corte fixo de
-- posição — dois produtos empatados no mesmo valor podem cair em faixas
-- diferentes dependendo de quem vem antes na ordenação.
--
-- Devolução abate (valor_curva/quantidade_curva já têm o sinal, herdado da
-- L6a): um produto cujo total no período é negativo ou zero (devolveu mais
-- do que vendeu) sai da classificação — Pareto sobre número negativo não
-- significa nada — e volta numa faixa própria '-', com participacao e
-- acumulado nulos, para a tela poder listá-lo sem contaminar A/B/C.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_curva_abc(
  p_de date, p_ate date, p_filial text default null, p_criterio text default 'valor'
)
returns table (
  produto_codigo text, nome text, valor numeric, quantidade numeric,
  participacao numeric, acumulado numeric, faixa text
)
language plpgsql stable security invoker
set search_path = public
as $$
-- `use_column`: os nomes de saída (produto_codigo, nome, faixa, ...) do
-- `returns table` também viram variáveis PL/pgSQL dentro do corpo da
-- função — sem esta diretiva, qualquer referência não qualificada a um
-- desses nomes que também exista como coluna de uma tabela/CTE é recusada
-- com "column reference is ambiguous" (42702), e só ao CHAMAR a função
-- (o corpo só é validado na execução, nunca ao criar/substituir).
#variable_conflict use_column
begin
  if p_criterio not in ('valor', 'quantidade') then
    raise exception 'p_criterio inválido: % — use ''valor'' ou ''quantidade''.', p_criterio;
  end if;

  return query
  with base as (
    select
      i.produto_codigo,
      coalesce(max(p.nome), i.produto_codigo) as nome,
      sum(i.valor_curva) as valor,
      sum(i.quantidade_curva) as quantidade
    from public.com_vendas_itens i
    left join public.com_produtos p on p.tenant_id = i.tenant_id and p.codigo = i.produto_codigo
    where i.classe in ('venda', 'devolucao')
      and i.emissao between p_de and p_ate
      and (p_filial is null or i.filial = p_filial)
    group by i.produto_codigo
  ),
  metrica as (
    select b.*, (case when p_criterio = 'valor' then b.valor else b.quantidade end) as m
    from base b
  ),
  positivos as (
    select m.*,
      sum(m.m) over (order by m.m desc, m.produto_codigo rows unbounded preceding) as corrido
    from metrica m
    where m.m > 0
  ),
  total as (select coalesce(sum(m), 0) as t from positivos),
  -- Postgres não aceita expressão no ORDER BY de um UNION ALL direto ("Only
  -- result column names can be used" — 0A000): a faixa '-' vai para o fim
  -- envolvendo a união numa subconsulta e ordenando por FORA dela.
  resultado as (
    select
      p.produto_codigo, p.nome, p.valor, p.quantidade,
      round(p.m / total.t * 100, 2) as participacao,
      round(p.corrido / total.t * 100, 2) as acumulado,
      (case
        when round(p.corrido / total.t * 100, 2) <= 80 then 'A'
        when round(p.corrido / total.t * 100, 2) <= 95 then 'B'
        else 'C'
      end) as faixa
    from positivos p, total
    union all
    select m.produto_codigo, m.nome, m.valor, m.quantidade, null, null, '-'
    from metrica m
    where m.m <= 0
  )
  select * from resultado
  order by (faixa = '-'), acumulado nulls last, produto_codigo;
end;
$$;

grant execute on function public.com_curva_abc(date, date, text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. com_bonificacao_por_cliente — bonificação e o quanto ela representa do
-- que o cliente comprou (líquido, mesma conta do ranking da L6a). `percentual`
-- é nulo quando `comprado <= 0` — nunca zero, nunca divisão por zero: cliente
-- que só recebeu bonificação não tem percentual, tem um aviso.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_bonificacao_por_cliente(
  p_de date, p_ate date, p_filial text default null, p_serie text default null
)
returns table (
  cliente_codigo text, nome text, tabela_preco text,
  bonificado numeric, comprado numeric, percentual numeric
)
language sql stable security invoker
set search_path = public
as $$
  with base as (
    select
      i.cliente_codigo,
      coalesce(max(c.razao_social), i.cliente_codigo) as nome,
      max(c.tabela_preco) as tabela_preco,
      coalesce(sum(i.valor_nota) filter (where i.classe = 'bonificacao'), 0) as bonificado,
      coalesce(sum(i.valor_curva) filter (where i.classe in ('venda', 'devolucao')), 0) as comprado
    from public.com_vendas_itens i
    left join public.com_clientes c on c.tenant_id = i.tenant_id and c.codigo = i.cliente_codigo
    where i.emissao between p_de and p_ate
      and (p_filial is null or i.filial = p_filial)
      and (p_serie is null or i.serie = p_serie)
    group by i.cliente_codigo
  )
  select
    cliente_codigo, nome, tabela_preco, bonificado, comprado,
    (case when comprado <= 0 then null else round(bonificado / comprado * 100, 2) end) as percentual
  from base
  where bonificado <> 0 or comprado <> 0
  order by bonificado desc;
$$;

grant execute on function public.com_bonificacao_por_cliente(date, date, text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. com_pedidos_em_condicao — condição é série 75 E cliente com
-- em_condicao, as duas coisas, nunca uma só (§13 do INSTRUCOES v7). O join
-- com com_clientes é INNER de propósito: sem cliente cadastrado com
-- em_condicao = true não existe pedido em condição, por definição.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_pedidos_em_condicao(
  p_de date, p_ate date, p_filial text default null
)
returns table (
  cliente_codigo text, nome text, competencia date,
  venda numeric, bonificacao numeric, total numeric
)
language sql stable security invoker
set search_path = public
as $$
  select
    i.cliente_codigo,
    coalesce(max(c.razao_social), i.cliente_codigo) as nome,
    i.competencia,
    coalesce(sum(i.valor_curva) filter (where i.classe in ('venda', 'devolucao')), 0) as venda,
    coalesce(sum(i.valor_nota) filter (where i.classe = 'bonificacao'), 0) as bonificacao,
    coalesce(sum(i.valor_curva) filter (where i.classe in ('venda', 'devolucao')), 0)
      + coalesce(sum(i.valor_nota) filter (where i.classe = 'bonificacao'), 0) as total
  from public.com_vendas_itens i
  join public.com_clientes c on c.tenant_id = i.tenant_id and c.codigo = i.cliente_codigo
  where i.serie = '75' and c.em_condicao
    and i.emissao between p_de and p_ate
    and (p_filial is null or i.filial = p_filial)
  group by i.cliente_codigo, i.competencia
  order by i.competencia, nome;
$$;

grant execute on function public.com_pedidos_em_condicao(date, date, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. com_clientes_a_trabalhar — quem comprou e parou: comprou (classe =
-- 'venda') em pelo menos 2 dos 3 meses anteriores ao último mês com
-- movimento, e não comprou nesse último mês. "Nunca comprou" fica para a
-- L6c (regra do §2.4 do plano).
--
-- O último mês com movimento é max(competencia) DENTRO do recorte
-- (ano + filial) — nunca current_date: o painel vive de importação, e o mês
-- corrente pode ainda não ter sido importado (regra 10 do pgTAP aplicada a
-- este domínio). Só o ANCORAMENTO usa o recorte por ano; os três meses
-- anteriores são datas literais computadas a partir da âncora, então uma
-- âncora em janeiro olha para outubro-dezembro do ano anterior sem precisar
-- de tratamento especial.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_clientes_a_trabalhar(p_ano int, p_filial text default null)
returns table (
  cliente_codigo text, nome text, tabela_preco text,
  ultima_compra date, valor_ultimos_3m numeric
)
language plpgsql stable security invoker
set search_path = public
as $$
-- Mesmo motivo do `com_curva_abc`: `cliente_codigo`/`nome`/... são nomes de
-- saída do `returns table` e, sem esta diretiva, uma referência não
-- qualificada a um deles que também exista como coluna de tabela/CTE é
-- recusada com "column reference is ambiguous" (42702), só ao CHAMAR a
-- função.
#variable_conflict use_column
declare
  v_ultimo_mes date;
  v_m1 date;
  v_m2 date;
  v_m3 date;
begin
  select max(competencia) into v_ultimo_mes
  from public.com_vendas_itens
  where classe = 'venda'
    and extract(year from competencia) = p_ano
    and (p_filial is null or filial = p_filial);

  if v_ultimo_mes is null then
    return;
  end if;

  v_m1 := (v_ultimo_mes - interval '1 month')::date;
  v_m2 := (v_ultimo_mes - interval '2 month')::date;
  v_m3 := (v_ultimo_mes - interval '3 month')::date;

  return query
  with meses_venda as (
    select distinct tenant_id, cliente_codigo, competencia
    from public.com_vendas_itens
    where classe = 'venda'
      and competencia in (v_m1, v_m2, v_m3)
      and (p_filial is null or filial = p_filial)
  ),
  contagem as (
    select tenant_id, cliente_codigo, count(*) as meses
    from meses_venda
    group by tenant_id, cliente_codigo
  ),
  valor_3m as (
    select tenant_id, cliente_codigo, coalesce(sum(valor_curva), 0) as valor
    from public.com_vendas_itens
    where classe in ('venda', 'devolucao')
      and competencia in (v_m1, v_m2, v_m3)
      and (p_filial is null or filial = p_filial)
    group by tenant_id, cliente_codigo
  ),
  compradores_ultimo_mes as (
    select distinct cliente_codigo
    from public.com_vendas_itens
    where classe = 'venda'
      and competencia = v_ultimo_mes
      and (p_filial is null or filial = p_filial)
  ),
  ultima as (
    select tenant_id, cliente_codigo, max(emissao) as ultima_compra
    from public.com_vendas_itens
    where classe = 'venda'
      and (p_filial is null or filial = p_filial)
    group by tenant_id, cliente_codigo
  )
  select
    ct.cliente_codigo,
    coalesce(max(c.razao_social), ct.cliente_codigo) as nome,
    max(c.tabela_preco) as tabela_preco,
    max(u.ultima_compra) as ultima_compra,
    coalesce(max(v3.valor), 0) as valor_ultimos_3m
  from contagem ct
  left join valor_3m v3 on v3.tenant_id = ct.tenant_id and v3.cliente_codigo = ct.cliente_codigo
  left join ultima u on u.tenant_id = ct.tenant_id and u.cliente_codigo = ct.cliente_codigo
  left join public.com_clientes c on c.tenant_id = ct.tenant_id and c.codigo = ct.cliente_codigo
  where ct.meses >= 2
    and ct.cliente_codigo not in (select cliente_codigo from compradores_ultimo_mes)
  group by ct.cliente_codigo
  order by nome;
end;
$$;

grant execute on function public.com_clientes_a_trabalhar(int, text) to authenticated;

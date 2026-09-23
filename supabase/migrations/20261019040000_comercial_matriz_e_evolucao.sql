-- Correção da auditoria da L6f (2026-09-22). Ver .scratch/plano-l6f-
-- correcoes.md. Idempotente: pode ser reaplicada sem erro. `drop function`
-- antes de `create` nas duas funções — o `returns table` muda de forma
-- (menos colunas, mais jsonb), e `create or replace` recusa isso com 42P13
-- (mesmo motivo da correção anterior, 20261019020000).
--
-- Dois achados graves, medidos pelo auditor na base real de 2026 (todas as
-- filiais), não deduzidos:
--
-- Item 1 — a matriz tinha uma linha por CÉLULA (produto × cliente): 182
-- produtos × 58 clientes já passam de mil linhas hoje, e `buscarComTeto`
-- (teto de 500, sem ORDER BY) cortava 35,5% do valor da base real — em
-- silêncio, e o que sobrava era o que o planner do Postgres decidisse
-- emitir. Pior: o subtítulo da tela afirma "célula em branco é sem compra",
-- então a tela mentia, com todas as letras, sobre a maioria dos pares
-- produto×cliente.
--
-- A virada: uma linha por PRODUTO (182 hoje — o teto passa a contar isso,
-- nunca células), com os clientes dentro de `celulas` (jsonb). Ordenado por
-- `total` decrescente — se um dia cortar, o que sai é a cauda (os produtos
-- que menos venderam no critério), e o aviso de corte passa a significar
-- alguma coisa.
--
-- Item 5 — mesma virada na evolução por faixa: uma linha por (cliente, mês)
-- é clientes × 12 em "ano todo" — 68 × 12 = 816 hoje, contra o teto de 500;
-- só não corta ainda porque há dois meses de dado importado. Cortando,
-- ordenado por `cliente_codigo`, partiria um cliente no meio do ano. Agora
-- é uma linha por CLIENTE (68 hoje), com os meses dentro de `meses` (jsonb),
-- ordenado por `total` decrescente.
--
-- Item 4 — a célula da matriz EXISTE quando há qualquer movimento (valor <>
-- 0 OU quantidade <> 0), nunca só o que o critério escolhido mede. Sob a
-- regra antiga, uma célula com valor 0 e quantidade positiva (amostra/
-- brinde, por exemplo) desaparecia da matriz sob o critério "valor" — e
-- combinado com "célula em branco é sem compra", a tela afirmava o falso:
-- quem recebeu unidades a custo zero comprou. Hoje nenhuma célula real da
-- base cai nisso (é latente), mas a tela já estava errada em tese. O
-- critério continua decidindo o que a tela EXIBE (valor ou quantidade) e o
-- `maximo` para a escala de cor — nunca o que existe. Isto substitui, sem
-- editá-la, a explicação do comportamento antigo deixada na migration
-- 20261019030000 (já aplicada — não se edita migration aplicada).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. com_matriz_produto_cliente — uma linha por produto com movimento,
-- `celulas` jsonb com um item por cliente ({cliente_codigo, cliente_nome,
-- valor, quantidade}), `total` do produto no período pelo critério, e
-- `maximo` repetido em toda linha (o maior valor de CÉLULA da matriz
-- inteira, para a escala de cor — nunca o maior `total` de produto).
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists public.com_matriz_produto_cliente(date, date, text, text);

create function public.com_matriz_produto_cliente(
  p_de date, p_ate date, p_filial text default null, p_criterio text default 'valor'
)
returns table (
  produto_codigo text, produto_nome text, total numeric, celulas jsonb, maximo numeric
)
language plpgsql stable security invoker
set search_path = public
as $$
-- Mesmo motivo do `com_curva_abc`: os nomes de saída também são nomes de
-- coluna nas CTEs abaixo, e sem esta diretiva o Postgres recusa com
-- "column reference is ambiguous" (42702), só ao CHAMAR a função.
#variable_conflict use_column
begin
  if p_criterio not in ('valor', 'quantidade') then
    raise exception 'p_criterio inválido: % — use ''valor'' ou ''quantidade''.', p_criterio;
  end if;

  return query
  with celulas_base as (
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
  -- Item 4: a célula existe por TER movimento (em qualquer das duas
  -- métricas), nunca só pelo que o critério escolhido mede.
  com_movimento as (
    select * from celulas_base where valor <> 0 or quantidade <> 0
  ),
  maximo_global as (
    select max(case when p_criterio = 'valor' then valor else quantidade end) as m
    from com_movimento
  )
  select
    cm.produto_codigo,
    max(cm.produto_nome) as produto_nome,
    sum(case when p_criterio = 'valor' then cm.valor else cm.quantidade end) as total,
    coalesce(jsonb_agg(jsonb_build_object(
      'cliente_codigo', cm.cliente_codigo,
      'cliente_nome', cm.cliente_nome,
      'valor', cm.valor,
      'quantidade', cm.quantidade
    ) order by cm.cliente_nome), '[]'::jsonb) as celulas,
    (select m from maximo_global) as maximo
  from com_movimento cm
  group by cm.produto_codigo
  order by total desc, produto_codigo;
end;
$$;

grant execute on function public.com_matriz_produto_cliente(date, date, text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. com_evolucao_por_faixa — uma linha por cliente com movimento, `meses`
-- jsonb com um item por competência ({competencia, valor_a, valor_b,
-- valor_c, valor_outros, total}), `total` do cliente no período pelo
-- critério. A faixa continua sendo do PRODUTO (`com_curva_abc`), nunca do
-- cliente — só a forma da linha mudou, a regra de classificação não.
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists public.com_evolucao_por_faixa(date, date, text, text);

create function public.com_evolucao_por_faixa(
  p_de date, p_ate date, p_filial text default null, p_criterio text default 'valor'
)
returns table (
  cliente_codigo text, nome text, total numeric, meses jsonb
)
language plpgsql stable security invoker
set search_path = public
as $$
-- Mesmo motivo do `com_curva_abc`: os nomes de saída também são nomes de
-- coluna nas CTEs abaixo, e sem esta diretiva o Postgres recusa com
-- "column reference is ambiguous" (42702), só ao CHAMAR a função.
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
  ),
  por_mes as (
    select
      cl.cliente_codigo, cl.competencia,
      coalesce(sum(cl.m) filter (where cl.faixa = 'A'), 0) as valor_a,
      coalesce(sum(cl.m) filter (where cl.faixa = 'B'), 0) as valor_b,
      coalesce(sum(cl.m) filter (where cl.faixa = 'C'), 0) as valor_c,
      coalesce(sum(cl.m) filter (where cl.faixa = '-'), 0) as valor_outros,
      coalesce(sum(cl.m), 0) as total
    from classificado cl
    group by cl.cliente_codigo, cl.competencia
  )
  select
    pm.cliente_codigo,
    -- Cliente que não está em `com_clientes` (caso "sem tabela"/sem
    -- cadastro, registrado na L6c) sai com o próprio código, nunca nulo —
    -- o mesmo `coalesce` que as irmãs já usam.
    coalesce(max(c.razao_social), pm.cliente_codigo) as nome,
    sum(pm.total) as total,
    coalesce(jsonb_agg(jsonb_build_object(
      'competencia', pm.competencia,
      'valor_a', pm.valor_a, 'valor_b', pm.valor_b, 'valor_c', pm.valor_c,
      'valor_outros', pm.valor_outros, 'total', pm.total
    ) order by pm.competencia), '[]'::jsonb) as meses
  from por_mes pm
  left join public.com_clientes c on c.tenant_id = public.get_user_tenant_id() and c.codigo = pm.cliente_codigo
  group by pm.cliente_codigo
  order by total desc, cliente_codigo;
end;
$$;

grant execute on function public.com_evolucao_por_faixa(date, date, text, text) to authenticated;

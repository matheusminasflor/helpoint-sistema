-- A lista de clientes a trabalhar passa a vir pelo PREJUÍZO, não pelo alfabeto
--
-- Leva E (2026-09-26), achado ao desenhar a visão simplificada de Clientes.
--
-- `com_clientes_a_trabalhar` devolvia `order by nome`. A lista é de quem PAROU de
-- comprar, com o quanto ele comprava nos últimos três meses — ou seja, cada linha
-- é um prejuízo em curso. Em ordem alfabética, o cliente de R$ 71 mil senta ao
-- lado do de R$ 12, e o olho não acha nenhum dos dois.
--
-- É o mesmo defeito que a Frente 5 já corrigiu DENTRO da ficha: a lista "nunca
-- comprou" cortava os cinco primeiros de uma lista agrupada por faixa, e por isso
-- mostrava os cinco MENOS relevantes, todos em R$ 0,00. Ali a correção foi ordenar
-- antes de cortar. Aqui é a mesma coisa, um nível acima: ordenar antes de mostrar.
--
-- E TEM UM SEGUNDO MOTIVO, que é o que torna isto necessário e não cosmético:
-- `useClientesATrabalhar` passa por `buscarComTeto`, que corta em 500 linhas. Com
-- `order by nome`, um corte tira clientes ARBITRÁRIOS — inclusive os maiores. A
-- visão simplificada mostra "os 10 que mais pesam", e com a ordem alfabética esse
-- "10 maiores" seria mentira sempre que a lista passasse do teto: os maiores
-- podiam estar do lado de fora. Com `valor desc`, o teto corta a cauda, que é o
-- que um teto deve cortar.
--
-- `create or replace`, sem `drop`: a assinatura não muda, então a ACL da função
-- se preserva e não há o que revogar de novo (regra 14 do pgTAP no CLAUDE.md).
-- O corpo é o da migration 20261031010000, com UMA linha trocada — conferido com
-- `scripts/diff-corpo-funcao.mjs`.

create or replace function public.com_clientes_a_trabalhar(p_ano int, p_filial text default null)
returns table (
  cliente_codigo text, nome text, tabela_preco text,
  ultima_compra date, valor_ultimos_3m numeric, em_condicao boolean
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
  v_fim_ancora date;
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
  -- A6: fim do mês-âncora — o teto que `ultima_compra` respeita agora.
  v_fim_ancora := (v_ultimo_mes + interval '1 month' - interval '1 day')::date;

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
  -- A7: tenant_id explícito, como as demais CTEs desta função.
  compradores_ultimo_mes as (
    select distinct tenant_id, cliente_codigo
    from public.com_vendas_itens
    where classe = 'venda'
      and competencia = v_ultimo_mes
      and (p_filial is null or filial = p_filial)
  ),
  -- A6: `emissao <= v_fim_ancora` — nunca mais todo o histórico do cliente.
  ultima as (
    select tenant_id, cliente_codigo, max(emissao) as ultima_compra
    from public.com_vendas_itens
    where classe = 'venda'
      and emissao <= v_fim_ancora
      and (p_filial is null or filial = p_filial)
    group by tenant_id, cliente_codigo
  )
  select
    ct.cliente_codigo,
    coalesce(max(c.razao_social), ct.cliente_codigo) as nome,
    max(c.tabela_preco) as tabela_preco,
    max(u.ultima_compra) as ultima_compra,
    coalesce(max(v3.valor), 0) as valor_ultimos_3m,
    -- A MARCA DE CONDIÇÃO (leva F, 2026-09-26): a mesma expressão que
    -- `com_faturamento_por_cliente` já usa, sobre a MESMA coluna
    -- `com_clientes.em_condicao`. A regra do que é condição continua morando num
    -- lugar só — no banco, na coluna — e esta função passa a devolvê-la porque a
    -- lista do Comercial precisava dela e não tinha.
    coalesce(bool_or(c.em_condicao), false) as em_condicao
  from contagem ct
  left join valor_3m v3 on v3.tenant_id = ct.tenant_id and v3.cliente_codigo = ct.cliente_codigo
  left join ultima u on u.tenant_id = ct.tenant_id and u.cliente_codigo = ct.cliente_codigo
  left join public.com_clientes c on c.tenant_id = ct.tenant_id and c.codigo = ct.cliente_codigo
  where ct.meses >= 2
    -- A7: o anti-join agora casa tenant_id + cliente_codigo, não só o código.
    and not exists (
      select 1 from compradores_ultimo_mes cum
      where cum.tenant_id = ct.tenant_id and cum.cliente_codigo = ct.cliente_codigo
    )
  group by ct.tenant_id, ct.cliente_codigo
  -- ORDEM POR VALOR, nao por nome (leva E, 2026-09-26). Ver o cabecalho.
  order by valor_ultimos_3m desc, nome;
end;
$$;

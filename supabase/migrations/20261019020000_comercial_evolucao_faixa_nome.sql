-- Correção de 2026-09-22: `com_evolucao_por_faixa` (item 5 do §14, migration
-- 20261019010000) esqueceu o nome do cliente — uma tabela de A/B/C por mês
-- que só mostra `cliente_codigo` não serve para comparar clientes, que é a
-- razão da tela existir. Ver .scratch/plano-l6f-tres-telas-do-diretor.md.
-- Idempotente: pode ser reaplicada sem erro.
--
-- `create or replace` não serve aqui: adicionar uma coluna ao `returns
-- table` muda o tipo de retorno da função, e o Postgres recusa isso em
-- `create or replace function` (42P13, "cannot change return type of
-- existing function") — é preciso `drop` antes, como as correções
-- anteriores do repositório já fazem (ex.: 20260912010000, 20260919010000).
drop function if exists public.com_evolucao_por_faixa(date, date, text, text);

create function public.com_evolucao_por_faixa(
  p_de date, p_ate date, p_filial text default null, p_criterio text default 'valor'
)
returns table (
  cliente_codigo text, nome text, competencia date,
  valor_a numeric, valor_b numeric, valor_c numeric, valor_outros numeric, total numeric
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
      i.tenant_id, i.cliente_codigo, i.competencia, i.produto_codigo,
      (case when p_criterio = 'valor' then sum(i.valor_curva) else sum(i.quantidade_curva) end) as m
    from public.com_vendas_itens i
    where i.classe in ('venda', 'devolucao')
      and i.emissao between p_de and p_ate
      and (p_filial is null or i.filial = p_filial)
    group by i.tenant_id, i.cliente_codigo, i.competencia, i.produto_codigo
  ),
  -- `coalesce(faixa, '-')`: todo produto com movimento no mesmo recorte
  -- (classe, emissao, filial) aparece em com_curva_abc — o coalesce é
  -- defesa, não caminho esperado.
  classificado as (
    select b.tenant_id, b.cliente_codigo, b.competencia, coalesce(f.faixa, '-') as faixa, b.m
    from base b
    left join faixas f on f.produto_codigo = b.produto_codigo
  )
  select
    cl.cliente_codigo,
    -- Cliente que não está em `com_clientes` (caso "sem tabela"/sem
    -- cadastro, registrado na L6c) sai com o próprio código, nunca nulo —
    -- é o mesmo `coalesce` que `com_faturamento_por_cliente` e as demais
    -- irmãs já usam.
    coalesce(max(c.razao_social), cl.cliente_codigo) as nome,
    cl.competencia,
    coalesce(sum(cl.m) filter (where cl.faixa = 'A'), 0) as valor_a,
    coalesce(sum(cl.m) filter (where cl.faixa = 'B'), 0) as valor_b,
    coalesce(sum(cl.m) filter (where cl.faixa = 'C'), 0) as valor_c,
    coalesce(sum(cl.m) filter (where cl.faixa = '-'), 0) as valor_outros,
    coalesce(sum(cl.m), 0) as total
  from classificado cl
  left join public.com_clientes c on c.tenant_id = cl.tenant_id and c.codigo = cl.cliente_codigo
  group by cl.cliente_codigo, cl.competencia
  order by cl.cliente_codigo, cl.competencia;
end;
$$;

grant execute on function public.com_evolucao_por_faixa(date, date, text, text) to authenticated;

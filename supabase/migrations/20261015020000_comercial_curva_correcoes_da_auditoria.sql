-- L6b — correções da auditoria (achados A3, A6 e A7). Ver
-- .scratch/plano-l6b-correcoes.md. Idempotente: pode ser reaplicada sem
-- erro. Os achados de navegação (A1, A4, A5) e o comentário de teste (A2)
-- não tocam o banco — ficam em src/ e em supabase/tests/database/.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 (A3) — com_curva_abc_faixas: a contagem e o valor por faixa moram no
-- banco, sobre a base INTEIRA do período — nunca sobre `linhas`, que
-- `buscarComTeto` corta em 500 na tela (mesma classe do achado grave 1 da
-- auditoria da L6a: contagem feita no navegador sobre dado parcial). Reusa
-- `com_curva_abc` em vez de duplicar a regra de faixa: se a fronteira A/B/C
-- mudar um dia, muda num lugar só.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_curva_abc_faixas(
  p_de date, p_ate date, p_filial text default null, p_criterio text default 'valor'
)
returns table (faixa text, produtos bigint, valor numeric)
language sql stable security invoker
set search_path = public
as $$
  select faixa, count(*) as produtos, coalesce(sum(valor), 0) as valor
  from public.com_curva_abc(p_de, p_ate, p_filial, p_criterio)
  group by faixa;
$$;

grant execute on function public.com_curva_abc_faixas(date, date, text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2 (A6 e A7) — com_clientes_a_trabalhar, duas correções na mesma função:
--
-- A6: `ultima_compra` era `max(emissao)` sobre TODO o histórico do cliente,
-- ignorando a âncora do recorte. Um cliente que parou dentro do recorte mas
-- comprou de novo depois mostrava a compra POSTERIOR como "última" —
-- contradizendo "parou de comprar", as duas coisas certas pelas próprias
-- definições, juntas parecendo um erro. Agora `ultima_compra` para no fim
-- do mês-âncora (`v_fim_ancora`, o mesmo `v_ultimo_mes` que a função já
-- calcula, levado ao último dia do mês — `competencia` é sempre dia 1, então
-- +1 mês -1 dia é o último dia). A regra de QUEM entra na lista não muda —
-- só a data exibida.
--
-- A7: `compradores_ultimo_mes` e o `group by` final não levavam
-- `tenant_id`, diferente das CTEs irmãs (`contagem`, `valor_3m`, `ultima`).
-- Sob RLS `invoker` isso não vaza hoje (uma empresa só por chamada), mas
-- vira defeito no dia em que a função for chamada por um papel que enxergue
-- mais de uma empresa — corrigido para ficar como as irmãs.
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
    coalesce(max(v3.valor), 0) as valor_ultimos_3m
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
  order by nome;
end;
$$;

grant execute on function public.com_clientes_a_trabalhar(int, text) to authenticated;

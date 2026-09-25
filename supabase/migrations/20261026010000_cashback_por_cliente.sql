-- Etapa 3 (ficha simplificada × analítica): a ficha do cliente ganha o
-- farol de cashback — "quanto ele ganhou no período" e "quanto falta para a
-- próxima faixa". O dono, 2026-09-24: "o cashback pode estar na ficha do
-- cliente também".
--
-- NENHUMA CONTA NOVA. A apuração por cliente já existe inteira em
-- `com_cashback_mensal` / `com_cashback_resumo` — elas só não sabiam
-- responder por UM cliente: devolviam a empresa toda, e o front passa por
-- `buscarComTeto` (500 linhas) justamente porque a lista é grande. Pedir a
-- lista inteira para mostrar uma linha seria caro e, pior, ficaria SUJEITO
-- AO TETO: numa empresa com mais de 500 clientes o cliente aberto na ficha
-- poderia simplesmente não vir, e o farol mostraria "sem cashback" para
-- quem tem. Por isso a mudança é um filtro a mais, não uma função a mais —
-- uma conta só, nos dois lugares.
--
-- `p_codigo` é o TERCEIRO parâmetro, com default null (= todos os clientes,
-- o comportamento de hoje). Anexar parâmetro no fim NÃO substitui a função
-- de 2 argumentos: cria uma segunda, e a chamada com 2 argumentos passa a
-- ser AMBÍGUA (erro em tempo de execução, nas cinco telas que já chamam).
-- Por isso o `drop` explícito antes — mesma armadilha e mesma solução de
-- `20261016020000` (item 4) e `20261001020000`.
--
-- `com_cashback_indicadores` NÃO é tocada de propósito: o corpo dela é
-- string (`as $$ … $$`), então o Postgres não guarda dependência dela para
-- com `com_cashback_resumo`; a chamada `com_cashback_resumo(p_ano,
-- p_filial)` que ela faz por dentro é resolvida na hora de executar e cai
-- na nova versão, pelo default. Derrubar e recriar uma função que não muda
-- seria ruído no diff — e mais uma cópia da grade de contas para a próxima
-- correção esquecer.

drop function if exists public.com_cashback_resumo(int, text);
drop function if exists public.com_cashback_mensal(int, text);

create or replace function public.com_cashback_mensal(
  p_ano int, p_filial text default null, p_codigo text default null
)
returns table (
  cliente_codigo text, nome text, competencia date, tabela_base text,
  comprado numeric, percentual numeric, cashback numeric, sem_programa boolean,
  sem_tabela boolean
)
language sql stable security invoker
set search_path = public
as $$
  with base as (
    select
      i.cliente_codigo,
      i.competencia,
      coalesce(sum(i.valor_curva), 0) as comprado
    from public.com_vendas_itens i
    where extract(year from i.competencia) = p_ano
      and i.classe in ('venda', 'devolucao')
      and (p_filial is null or i.filial = p_filial)
      -- O filtro do cliente entra AQUI, na base, e não num `where` por cima
      -- do resultado: assim o banco lê só as linhas dele. Num `where`
      -- externo a função ainda somaria a empresa inteira para jogar fora.
      and (p_codigo is null or i.cliente_codigo = p_codigo)
    group by i.cliente_codigo, i.competencia
  ),
  com_tabela as (
    select b.cliente_codigo, b.competencia, b.comprado, c.razao_social, c.tabela_base
    from base b
    left join public.com_clientes c
      on c.tenant_id = (select public.get_user_tenant_id()) and c.codigo = b.cliente_codigo
  ),
  com_faixa as (
    select
      ct.*,
      exists (
        select 1 from public.com_faixas_cashback g
        where g.tenant_id = (select public.get_user_tenant_id())
          and g.tabela_base = ct.tabela_base
      ) as tem_programa,
      f.percentual as faixa_percentual
    from com_tabela ct
    left join lateral (
      select fc.percentual
      from public.com_faixas_cashback fc
      where fc.tenant_id = (select public.get_user_tenant_id())
        and fc.tabela_base = ct.tabela_base
        and fc.valor_minimo <= ct.comprado
      order by fc.valor_minimo desc
      limit 1
    ) f on true
  )
  select
    cf.cliente_codigo,
    coalesce(cf.razao_social, cf.cliente_codigo) as nome,
    cf.competencia,
    cf.tabela_base,
    cf.comprado,
    (case when cf.tem_programa then cf.faixa_percentual else null end) as percentual,
    (case
       when not cf.tem_programa then null
       when cf.faixa_percentual is null then 0
       else round(cf.comprado * cf.faixa_percentual / 100, 2)
     end) as cashback,
    (cf.tabela_base is not null and not cf.tem_programa) as sem_programa,
    (cf.tabela_base is null) as sem_tabela
  from com_faixa cf
  order by nome, cf.competencia;
$$;

grant execute on function public.com_cashback_mensal(int, text, text) to authenticated;

create or replace function public.com_cashback_resumo(
  p_ano int, p_filial text default null, p_codigo text default null
)
returns table (
  cliente_codigo text, nome text, tabela_base text, sem_programa boolean,
  comprado numeric, cashback numeric, meses_com_direito bigint,
  ultima_competencia date, ultima_faixa numeric,
  meta_para_ativar numeric, falta_proxima_faixa numeric, menor_distancia numeric,
  sem_tabela boolean
)
language sql stable security invoker
set search_path = public
as $$
  with mensal as (
    -- O `p_codigo` é repassado para baixo: a mensal já chega com um cliente
    -- só, e todo o resto desta função (agregado, último mês, próxima faixa)
    -- continua idêntico — é por isso que o número da ficha é, por
    -- construção, o MESMO número da lista de cashback. Duas telas, uma conta.
    select * from public.com_cashback_mensal(p_ano, p_filial, p_codigo)
  ),
  agregado as (
    select
      m.cliente_codigo,
      max(m.nome) as nome,
      max(m.tabela_base) as tabela_base,
      bool_and(m.sem_programa) as sem_programa,
      bool_and(m.sem_tabela) as sem_tabela,
      sum(m.comprado) as comprado,
      sum(m.cashback) as cashback,
      count(*) filter (where m.cashback > 0) as meses_com_direito
    from mensal m
    group by m.cliente_codigo
  ),
  ultimo_mes as (
    select distinct on (m.cliente_codigo)
      m.cliente_codigo, m.competencia, m.comprado, m.percentual, m.tabela_base
    from mensal m
    order by m.cliente_codigo, m.competencia desc
  ),
  proxima_faixa as (
    select
      um.cliente_codigo,
      (
        select min(fc.valor_minimo)
        from public.com_faixas_cashback fc
        where fc.tenant_id = (select public.get_user_tenant_id())
          and fc.tabela_base = um.tabela_base
          and fc.valor_minimo > um.comprado
      ) as proximo_minimo
    from ultimo_mes um
  ),
  menor_faixa as (
    select tabela_base, min(valor_minimo) as minimo
    from public.com_faixas_cashback
    where tenant_id = (select public.get_user_tenant_id())
    group by tabela_base
  ),
  distancia_por_mes as (
    select m.cliente_codigo, (mf.minimo - m.comprado) as distancia
    from mensal m
    join menor_faixa mf on mf.tabela_base = m.tabela_base
    where m.cashback = 0 and not m.sem_programa and m.comprado < mf.minimo
  ),
  menor_dist as (
    select cliente_codigo, min(distancia) as menor_distancia
    from distancia_por_mes
    group by cliente_codigo
  )
  select
    a.cliente_codigo, a.nome, a.tabela_base, a.sem_programa,
    a.comprado, a.cashback, a.meses_com_direito, um.competencia as ultima_competencia,
    um.percentual as ultima_faixa,
    round(a.comprado * 0.5, 2) as meta_para_ativar,
    (pf.proximo_minimo - um.comprado) as falta_proxima_faixa,
    md.menor_distancia,
    a.sem_tabela
  from agregado a
  left join ultimo_mes um on um.cliente_codigo = a.cliente_codigo
  left join proxima_faixa pf on pf.cliente_codigo = a.cliente_codigo
  left join menor_dist md on md.cliente_codigo = a.cliente_codigo
  order by a.nome;
$$;

grant execute on function public.com_cashback_resumo(int, text, text) to authenticated;

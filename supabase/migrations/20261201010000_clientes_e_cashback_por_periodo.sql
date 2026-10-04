-- CLIENTES E CASHBACK RESPONDEM AO PERÍODO — "Este mês", "Este trimestre", "Este ano" e
-- "Personalizado" (pedido do dono, 2026-10-03).
--
-- As duas visões do Insights do Comercial que ainda eram "só por ano" (ver
-- docs/nao-funciona.md, o seletor do §14): `com_clientes_a_trabalhar` e as cinco do
-- cashback. Cada uma ganha `p_de`/`p_ate` (date, default null) NO FIM da assinatura:
-- sem eles, a conta é a de sempre, pelo `p_ano`; com os dois, vale o intervalo.
--
-- ══ MESES INTEIROS, NUNCA RATEIO (decisão do dono, 2026-10-03) ══════════════════════
-- As duas contas são MENSAIS por natureza:
--   * a faixa de cashback é apurada mês a mês (`com_cashback_mensal`);
--   * "clientes a trabalhar" compara o último mês com venda com os três anteriores.
-- Com um intervalo, entram os MESES INTEIROS que ele toca: 10/03–25/04 → março e abril
-- inteiros. Nunca proporcional. A tela diz quais meses foram considerados.
-- `competencia` é coluna gerada (`date_trunc('month', emissao)`), sempre dia 1 — por isso
-- o recorte é `competencia between date_trunc('month', p_de) and date_trunc('month', p_ate)`.
--
-- ══ POR QUE `drop` + `create` ══════════════════════════════════════════════════════
-- Parâmetro novo no fim NÃO substitui a função: cria outra, e a chamada antiga fica
-- AMBÍGUA (mesma armadilha de 20261026010000). Então derruba e recria — e o `drop` não
-- preserva privilégio: a função renasce com `execute` para PUBLIC, e `anon` é público.
-- Por isso cada uma termina com o `revoke ... from public, anon` (lição 14 do pgTAP).
--
-- Os corpos são os das migrations que as definiram por último, com SÓ o filtro de período
-- trocado (e o repasse de `p_de`/`p_ate` às funções de dentro):
--   com_clientes_a_trabalhar ............ 20261102010000
--   com_cashback_mensal / _resumo ....... 20261026010000
--   com_cashback_indicadores ............ 20261016020000
--   com_cashback_farol_clientes / _tabelas 20261101010000
-- As funções de linguagem `sql` guardam o corpo como texto: o Postgres não registra
-- dependência entre elas, então a ordem de `drop` não importa.

drop function if exists public.com_clientes_a_trabalhar(int, text);
drop function if exists public.com_cashback_farol_clientes(integer, text);
drop function if exists public.com_cashback_farol_tabelas(integer, text);
drop function if exists public.com_cashback_indicadores(int, text);
drop function if exists public.com_cashback_resumo(int, text, text);
drop function if exists public.com_cashback_mensal(int, text, text);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Clientes a trabalhar
-- ─────────────────────────────────────────────────────────────────────────────
-- Com intervalo, o "mês mais recente" (a âncora) é o último mês COM VENDA entre os meses
-- que o intervalo toca — o mesmo papel que o ano fazia. Os três meses anteriores à âncora
-- continuam sendo os três anteriores, mesmo fora do intervalo: é a mesma regra de quando a
-- âncora é janeiro e os três anteriores caem no ano passado.
create function public.com_clientes_a_trabalhar(
  p_ano int, p_filial text default null, p_de date default null, p_ate date default null
)
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
    -- O período (2026-10-03): com os dois dias, os meses inteiros que eles tocam;
    -- sem eles, o ano — exatamente como antes.
    and (
      case
        when p_de is not null and p_ate is not null
          then competencia between date_trunc('month', p_de)::date and date_trunc('month', p_ate)::date
        else extract(year from competencia) = p_ano
      end
    )
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Cashback mês a mês — a base de todas as outras
-- ─────────────────────────────────────────────────────────────────────────────
create function public.com_cashback_mensal(
  p_ano int, p_filial text default null, p_codigo text default null,
  p_de date default null, p_ate date default null
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
      -- Achado 6.6 da auditoria da L6c: o `filter` aqui era redundante — o
      -- `where` desta CTE já restringe a `classe in ('venda','devolucao')`.
      -- `coalesce` fica contra a soma vazia; o filtro duplicado saiu.
      coalesce(sum(i.valor_curva), 0) as comprado
    from public.com_vendas_itens i
    -- O período (2026-10-03): com os dois dias, os MESES INTEIROS que eles tocam — a
    -- faixa é mensal e não se rateia; sem eles, o ano, como antes.
    where (
        case
          when p_de is not null and p_ate is not null
            then i.competencia between date_trunc('month', p_de)::date and date_trunc('month', p_ate)::date
          else extract(year from i.competencia) = p_ano
        end
      )
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
    -- `sem_programa` só é verdadeiro quando o cliente TEM tabela e ela não
    -- tem grade (REVENDA/SALÃO REF/DIRETORIA) — nunca quando ele não tem
    -- tabela nenhuma, que é `sem_tabela`. As duas nunca se sobrepõem.
    (cf.tabela_base is not null and not cf.tem_programa) as sem_programa,
    (cf.tabela_base is null) as sem_tabela
  from com_faixa cf
  order by nome, cf.competencia;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Cashback por cliente, no recorte
-- ─────────────────────────────────────────────────────────────────────────────
create function public.com_cashback_resumo(
  p_ano int, p_filial text default null, p_codigo text default null,
  p_de date default null, p_ate date default null
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
    -- O período vai junto, pela mesma razão.
    select * from public.com_cashback_mensal(p_ano, p_filial, p_codigo, p_de, p_ate)
  ),
  agregado as (
    select
      m.cliente_codigo,
      max(m.nome) as nome,
      max(m.tabela_base) as tabela_base,
      bool_and(m.sem_programa) as sem_programa,
      -- `tabela_base` é atributo ATUAL do cliente (§0), o mesmo em todo mês
      -- dele no recorte — `bool_and` nunca varia de um mês para outro.
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Os cinco indicadores do topo
-- ─────────────────────────────────────────────────────────────────────────────
create function public.com_cashback_indicadores(
  p_ano int, p_filial text default null, p_de date default null, p_ate date default null
)
returns table (
  cashback_total numeric, comprado_total numeric, percentual numeric,
  clientes_nao_atingiram bigint, clientes_sem_programa bigint,
  clientes_sem_tabela bigint
)
language sql stable security invoker
set search_path = public
as $$
  with resumo as (
    -- Argumentos NOMEADOS: `p_codigo` fica no default (todos os clientes).
    select * from public.com_cashback_resumo(p_ano, p_filial, p_de => p_de, p_ate => p_ate)
  ),
  com_programa as (
    -- `sem_tabela` entrou na exclusão: antes de existir a coluna, todo
    -- cliente sem tabela já saía com `sem_programa = true` e ficava fora
    -- daqui por tabela; agora as duas flags são exclusivas, então os dois
    -- filtros precisam continuar excluindo quem não gera cashback.
    select * from resumo where not sem_programa and not sem_tabela
  )
  select
    coalesce((select sum(cashback) from com_programa), 0) as cashback_total,
    coalesce((select sum(comprado) from resumo), 0) as comprado_total,
    (case when coalesce((select sum(comprado) from com_programa), 0) = 0 then null
      else round((select sum(cashback) from com_programa) / (select sum(comprado) from com_programa) * 100, 2)
    end) as percentual,
    (select count(*) from com_programa where coalesce(cashback, 0) = 0 and comprado > 0) as clientes_nao_atingiram,
    (select count(*) from resumo where sem_programa) as clientes_sem_programa,
    (select count(*) from resumo where sem_tabela) as clientes_sem_tabela;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. O farol: clientes
-- ─────────────────────────────────────────────────────────────────────────────
-- O cabeçalho de 20261101010000 explica o corte de um quarto e por que o farol devolve o
-- MÊS. "No ano", aqui dentro, passa a ser "no recorte" — o ano, ou os meses do intervalo.
create function public.com_cashback_farol_clientes(
  p_ano integer,
  p_filial text default null,
  p_de date default null,
  p_ate date default null
)
returns table (
  cliente_codigo text,
  nome text,
  tabela_base text,
  /** O mês em que ele chegou mais perto. Nulo em `sem_tabela`, que não tem faixa. */
  competencia date,
  comprado_no_mes numeric,
  minimo numeric,
  faltou numeric,
  /** Quanto da faixa ele já comprou, em % — 82% significa "faltou 18%". */
  comprou_da_faixa numeric,
  comprado_no_ano numeric,
  motivo text
)
language sql
stable
set search_path = public
as $$
  with mensal as (
    select * from public.com_cashback_mensal(p_ano, p_filial, p_de => p_de, p_ate => p_ate)
  ),
  -- O mínimo de cada tabela: é a primeira faixa, a que o cliente precisa tocar
  -- para entrar no programa naquele mês.
  menor_faixa as (
    select fc.tabela_base, min(fc.valor_minimo) as minimo
    from public.com_faixas_cashback fc
    where fc.tenant_id = (select public.get_user_tenant_id())
    group by fc.tabela_base
  ),
  ano as (
    select m.cliente_codigo,
      max(m.nome) as nome,
      max(m.tabela_base) as tabela_base,
      bool_and(m.sem_programa) as sem_programa,
      bool_and(m.sem_tabela) as sem_tabela,
      sum(m.comprado) as comprado_no_ano,
      coalesce(sum(m.cashback), 0) as cashback_no_ano
    from mensal m
    group by m.cliente_codigo
  ),
  -- O MELHOR MÊS entre os que não renderam cashback: o que chegou mais perto da
  -- primeira faixa. `distinct on` com `order by comprado desc` — e o
  -- `cliente_codigo` primeiro no `order by`, que é o que o `distinct on` exige.
  melhor_mes as (
    select distinct on (m.cliente_codigo)
      m.cliente_codigo, m.competencia, m.comprado, m.tabela_base
    from mensal m
    where coalesce(m.cashback, 0) = 0 and not m.sem_programa and not m.sem_tabela
    order by m.cliente_codigo, m.comprado desc, m.competencia desc
  )
  -- PERTO DE BATER: não ganhou nada no ano, e no melhor mês comprou 75% ou mais
  -- da primeira faixa.
  select
    a.cliente_codigo, a.nome, a.tabela_base,
    mm.competencia, mm.comprado, mf.minimo,
    (mf.minimo - mm.comprado) as faltou,
    round(mm.comprado / mf.minimo * 100, 1) as comprou_da_faixa,
    a.comprado_no_ano,
    'perto_de_bater'::text as motivo
  from ano a
  join melhor_mes mm on mm.cliente_codigo = a.cliente_codigo
  join menor_faixa mf on mf.tabela_base = mm.tabela_base
  where a.cashback_no_ano = 0
    and a.comprado_no_ano > 0
    and not a.sem_programa and not a.sem_tabela
    -- O corte: faltou até um quarto da faixa. Ver o cabeçalho para a medição
    -- que sustenta o número.
    and (mf.minimo - mm.comprado) <= mf.minimo * 0.25

  union all

  -- SEM TABELA: comprou e não está no cadastro de tabela de preço, então nem
  -- entra na conta do cashback. Não é "não bateu": é "nem foi medido", e o
  -- conserto é de cadastro, não de venda. As colunas de faixa ficam nulas porque
  -- não existe faixa para quem não tem tabela — nulo aqui é ausência, não zero.
  select
    a.cliente_codigo, a.nome, a.tabela_base,
    null::date, null::numeric, null::numeric, null::numeric, null::numeric,
    a.comprado_no_ano,
    'sem_tabela'::text
  from ano a
  where a.sem_tabela and a.comprado_no_ano > 0

  -- Perto de bater primeiro, e dentro de cada motivo o que está mais perto —
  -- `comprou_da_faixa` decrescente. O `sem_tabela` vem com nulo ali e cai no
  -- fim do grupo dele, ordenado pelo que comprou.
  order by motivo desc, comprou_da_faixa desc nulls last, comprado_no_ano desc;
$$;

comment on function public.com_cashback_farol_clientes(integer, text, date, date) is
  'O farol do cashback, lado dos clientes: quem faltou ate um quarto da primeira faixa no melhor mes (perto_de_bater) e quem comprou sem ter tabela de preco no cadastro (sem_tabela). Devolve o MES, nao o ano: comprado_no_mes + faltou = minimo, sempre. Com p_de/p_ate, o recorte sao os meses inteiros que o intervalo toca.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. O farol: tabelas de preço sem faixa nenhuma
-- ─────────────────────────────────────────────────────────────────────────────
create function public.com_cashback_farol_tabelas(
  p_ano integer,
  p_filial text default null,
  p_de date default null,
  p_ate date default null
)
returns table (
  tabela_base text,
  clientes bigint,
  comprado numeric
)
language sql
stable
set search_path = public
as $$
  with mensal as (
    select * from public.com_cashback_mensal(p_ano, p_filial, p_de => p_de, p_ate => p_ate)
  ),
  ano as (
    select m.cliente_codigo,
      max(m.tabela_base) as tabela_base,
      bool_and(m.sem_programa) as sem_programa,
      sum(m.comprado) as comprado
    from mensal m
    group by m.cliente_codigo
  )
  select a.tabela_base, count(*)::bigint, sum(a.comprado)
  from ano a
  where a.sem_programa and a.comprado > 0
  group by a.tabela_base
  order by sum(a.comprado) desc;
$$;

comment on function public.com_cashback_farol_tabelas(integer, text, date, date) is
  'O farol do cashback, lado das tabelas: tabelas de preco que tem cliente comprando e nenhuma faixa cadastrada. Agrupado por tabela porque a decisao e por tabela.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Quem executa: `drop` + `create` reabriu as seis para PUBLIC (lição 14)
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on function public.com_clientes_a_trabalhar(int, text, date, date) from public, anon;
grant execute on function public.com_clientes_a_trabalhar(int, text, date, date) to authenticated;

revoke all on function public.com_cashback_mensal(int, text, text, date, date) from public, anon;
grant execute on function public.com_cashback_mensal(int, text, text, date, date) to authenticated;

revoke all on function public.com_cashback_resumo(int, text, text, date, date) from public, anon;
grant execute on function public.com_cashback_resumo(int, text, text, date, date) to authenticated;

revoke all on function public.com_cashback_indicadores(int, text, date, date) from public, anon;
grant execute on function public.com_cashback_indicadores(int, text, date, date) to authenticated;

revoke all on function public.com_cashback_farol_clientes(integer, text, date, date) from public, anon;
grant execute on function public.com_cashback_farol_clientes(integer, text, date, date) to authenticated;

revoke all on function public.com_cashback_farol_tabelas(integer, text, date, date) from public, anon;
grant execute on function public.com_cashback_farol_tabelas(integer, text, date, date) to authenticated;

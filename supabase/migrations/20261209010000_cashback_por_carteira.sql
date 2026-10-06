-- CASHBACK POR CARTEIRA (pedido do dono, 2026-10-06).
--
-- O dono: "O cashback Insights ter como filtrar por carteira e os atendentes devem ver apenas
-- dados da sua carteira."
--
-- MEDIDO NA PRODUÇÃO: as cinco funções do cashback não olhavam carteira nenhuma — qualquer
-- vendedora com acesso ao Comercial via o cashback de todos os clientes da empresa. A chave
-- `vendedorSoVeSuaCarteira` da empresa (lida por `com_so_a_minha_carteira()`) está `false`, e o
-- dono quer a restrição valendo no cashback de qualquer jeito — por isso a regra aqui NÃO depende
-- dessa chave.
--
-- A REGRA é a de `com_pode_ver_carteira(...)`, a mesma dos Indicadores e da ficha do cliente:
--   * quem gere carteiras (`com_pode_gerir_carteiras()`: admin, caixinha "Carteiras: gerir" ou
--     quem altera a aba "Equipe e carteiras") e quem tem a Diretoria veem todos os clientes, e
--     podem filtrar por UMA carteira (`p_carteira`);
--   * as outras pessoas veem só os clientes das próprias carteiras (`com_minhas_carteiras()`).
--     Mandar outra carteira em `p_carteira` não abre nada: a condição de acesso vem antes e devolve
--     vazio. Cliente sem carteira no cadastro (ou sem cadastro) só aparece para quem vê tudo.
-- Ela é avaliada UMA vez por chamada (o CTE `acesso`), não uma vez por linha como
-- `com_pode_ver_carteira` faria — compõe exatamente as mesmas três funções.
--
-- Só `com_cashback_mensal` aplica a regra; as outras quatro leem dela e só repassam `p_carteira`.
-- Assim a ficha, a lista, os indicadores e o farol continuam com a MESMA conta.
--
-- `p_carteira` entra no FIM com default nulo: chamada antiga (posicional ou nomeada) segue
-- valendo. A assinatura muda, então é drop + create e a lição 14 no fim.

drop function if exists public.com_cashback_farol_clientes(integer, text, date, date);
drop function if exists public.com_cashback_farol_tabelas(integer, text, date, date);
drop function if exists public.com_cashback_indicadores(int, text, date, date);
drop function if exists public.com_cashback_resumo(int, text, text, date, date);
drop function if exists public.com_cashback_mensal(int, text, text, date, date);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Cashback mês a mês — a base de todas as outras, e o único lugar da regra
-- ─────────────────────────────────────────────────────────────────────────────
create function public.com_cashback_mensal(
  p_ano int, p_filial text default null, p_codigo text default null,
  p_de date default null, p_ate date default null, p_carteira text default null
)
returns table (
  cliente_codigo text, nome text, competencia date, tabela_base text,
  comprado numeric, percentual numeric, cashback numeric, sem_programa boolean,
  sem_tabela boolean
)
language sql stable security invoker
set search_path = public
as $$
  with acesso as (
    select (public.com_pode_gerir_carteiras() or public.has_diretoria_access(auth.uid())) as ve_tudo,
           coalesce(public.com_minhas_carteiras(), array[]::text[]) as minhas
  ),
  base as (
    select
      i.cliente_codigo,
      i.competencia,
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
      and (p_codigo is null or i.cliente_codigo = p_codigo)
    group by i.cliente_codigo, i.competencia
  ),
  com_tabela as (
    select b.cliente_codigo, b.competencia, b.comprado, c.razao_social, c.tabela_base
    from base b
    cross join acesso a
    left join public.com_clientes c
      on c.tenant_id = (select public.get_user_tenant_id()) and c.codigo = b.cliente_codigo
    -- A carteira (2026-10-06): quem não vê tudo, só as próprias; o filtro escolhido por cima.
    where (a.ve_tudo or public.normalizar_nome_carteira(c.carteira) = any (a.minhas))
      and (p_carteira is null
           or public.normalizar_nome_carteira(c.carteira) = public.normalizar_nome_carteira(p_carteira))
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Cashback por cliente, no recorte
-- ─────────────────────────────────────────────────────────────────────────────
create function public.com_cashback_resumo(
  p_ano int, p_filial text default null, p_codigo text default null,
  p_de date default null, p_ate date default null, p_carteira text default null
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
    -- Código, período e carteira descem para a mensal: a ficha e a lista fazem a MESMA conta.
    select * from public.com_cashback_mensal(p_ano, p_filial, p_codigo, p_de, p_ate, p_carteira)
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Os indicadores do topo
-- ─────────────────────────────────────────────────────────────────────────────
create function public.com_cashback_indicadores(
  p_ano int, p_filial text default null, p_de date default null, p_ate date default null,
  p_carteira text default null
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
    select * from public.com_cashback_resumo(p_ano, p_filial, p_de => p_de, p_ate => p_ate, p_carteira => p_carteira)
  ),
  com_programa as (
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
-- 4. O farol: clientes (o cabeçalho de 20261101010000 explica o corte de um quarto)
-- ─────────────────────────────────────────────────────────────────────────────
create function public.com_cashback_farol_clientes(
  p_ano integer,
  p_filial text default null,
  p_de date default null,
  p_ate date default null,
  p_carteira text default null
)
returns table (
  cliente_codigo text,
  nome text,
  tabela_base text,
  competencia date,
  comprado_no_mes numeric,
  minimo numeric,
  faltou numeric,
  comprou_da_faixa numeric,
  comprado_no_ano numeric,
  motivo text
)
language sql
stable
set search_path = public
as $$
  with mensal as (
    select * from public.com_cashback_mensal(p_ano, p_filial, p_de => p_de, p_ate => p_ate, p_carteira => p_carteira)
  ),
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
  melhor_mes as (
    select distinct on (m.cliente_codigo)
      m.cliente_codigo, m.competencia, m.comprado, m.tabela_base
    from mensal m
    where coalesce(m.cashback, 0) = 0 and not m.sem_programa and not m.sem_tabela
    order by m.cliente_codigo, m.comprado desc, m.competencia desc
  )
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
    and (mf.minimo - mm.comprado) <= mf.minimo * 0.25

  union all

  select
    a.cliente_codigo, a.nome, a.tabela_base,
    null::date, null::numeric, null::numeric, null::numeric, null::numeric,
    a.comprado_no_ano,
    'sem_tabela'::text
  from ano a
  where a.sem_tabela and a.comprado_no_ano > 0

  order by motivo desc, comprou_da_faixa desc nulls last, comprado_no_ano desc;
$$;

comment on function public.com_cashback_farol_clientes(integer, text, date, date, text) is
  'O farol do cashback, lado dos clientes: quem faltou ate um quarto da primeira faixa no melhor mes (perto_de_bater) e quem comprou sem ter tabela de preco no cadastro (sem_tabela). Devolve o MES, nao o ano. Com p_de/p_ate, os meses inteiros do intervalo; com p_carteira, so aquela carteira (e quem nao gere carteiras ve so as proprias).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. O farol: tabelas de preço sem faixa nenhuma
-- ─────────────────────────────────────────────────────────────────────────────
create function public.com_cashback_farol_tabelas(
  p_ano integer,
  p_filial text default null,
  p_de date default null,
  p_ate date default null,
  p_carteira text default null
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
    select * from public.com_cashback_mensal(p_ano, p_filial, p_de => p_de, p_ate => p_ate, p_carteira => p_carteira)
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

comment on function public.com_cashback_farol_tabelas(integer, text, date, date, text) is
  'O farol do cashback, lado das tabelas: tabelas de preco que tem cliente comprando e nenhuma faixa cadastrada. Respeita a carteira como com_cashback_mensal.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Quem executa: `drop` + `create` reabriu as cinco para PUBLIC (lição 14)
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on function public.com_cashback_mensal(int, text, text, date, date, text) from public, anon;
grant execute on function public.com_cashback_mensal(int, text, text, date, date, text) to authenticated;

revoke all on function public.com_cashback_resumo(int, text, text, date, date, text) from public, anon;
grant execute on function public.com_cashback_resumo(int, text, text, date, date, text) to authenticated;

revoke all on function public.com_cashback_indicadores(int, text, date, date, text) from public, anon;
grant execute on function public.com_cashback_indicadores(int, text, date, date, text) to authenticated;

revoke all on function public.com_cashback_farol_clientes(integer, text, date, date, text) from public, anon;
grant execute on function public.com_cashback_farol_clientes(integer, text, date, date, text) to authenticated;

revoke all on function public.com_cashback_farol_tabelas(integer, text, date, date, text) from public, anon;
grant execute on function public.com_cashback_farol_tabelas(integer, text, date, date, text) to authenticated;

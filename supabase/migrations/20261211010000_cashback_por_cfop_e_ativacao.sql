-- CASHBACK: SÓ CFOP DE VENDA, E SÓ LIBERA SE O MÊS SEGUINTE BATER A METADE (dono, 2026-10-06).
-- A especificação inteira está em `docs/regra-cashback.md`.
--
-- 1. O QUE CONTA. Nota com CFOP de VENDA, de qualquer série — o dono: "série 75 porém a natureza
--    da operação é Venda, então de fato é venda e deve contar". Quem decide é `com_classe_do_cfop`,
--    a função que a importação já usa para gravar `com_vendas_itens.classe` (e daí `valor_curva`,
--    coluna gerada). Medido na produção: duas classes estavam erradas contra a memória fiscal do
--    Forteplus —
--      * 7949 estava em 'venda'; na memória fiscal é BONIFICAÇÃO (R$ 24,3 mil no histórico,
--        2023-10 a 2026-06; em 2026 só junho, R$ 2.792,46);
--      * 5405 caía em 'outros'; na memória fiscal é VENDA (R$ 52,12, 2025-05, série 75).
--    O espelho da prévia (`src/lib/comercial-import.ts`) muda junto — o Vitest compara os dois.
--    As linhas já importadas são reclassificadas abaixo; `valor_curva` se recalcula sozinho.
--
-- 2. A ATIVAÇÃO. O cashback GERADO no mês M (compra de M × % da faixa da tabela, como já era) só é
--    LIBERADO se a compra do mês M+1 for ≥ metade da compra de M ("setembro gera, outubro libera").
--    Situação por cliente e mês:
--      * 'liberado'     — M+1 já bateu a metade (mesmo com o mês em andamento: compra só cresce);
--      * 'aguardando'   — M+1 ainda não bateu e a importação ainda não passou do fim de M+1;
--      * 'nao_liberado' — a importação já passou do fim de M+1 e ele não bateu.
--    "A importação passou do fim de M+1" é `com_faturado_importado_ate()` > último dia de M+1: só se
--    diz "não liberado" com o mês seguinte inteiro já no sistema.
--    Mês sem cashback (sem programa, ou abaixo da primeira faixa) não tem situação.
--
-- A carteira (20261209010000) continua igual: a regra de quem vê mora no CTE `acesso`, e as outras
-- funções só repassam `p_carteira`. Os dois faróis não mudam (leem colunas que continuam aqui).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A classe do CFOP
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.com_classe_do_cfop(p_cfop text)
returns text
language sql
immutable
as $function$
  select case
    when p_cfop in ('5101','5102','5401','5403','5405','6101','6102','6107','6401','6403','7101') then 'venda'
    when p_cfop in ('1201','1202','1410','1411','2201') then 'devolucao'
    when p_cfop in ('5910','5911','6910','6911','7949') then 'bonificacao'
    when p_cfop in ('5901','5902','6901','6902','6903','1901','1902') then 'industrializacao'
    else 'outros'
  end;
$function$;

update public.com_vendas_itens
   set classe = public.com_classe_do_cfop(cfop)
 where classe is distinct from public.com_classe_do_cfop(cfop);

update public.com_vendas_itens_espera
   set classe = public.com_classe_do_cfop(cfop)
 where classe is distinct from public.com_classe_do_cfop(cfop);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. As três funções que mudam de forma (drop + create; lição 14 no fim)
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.com_cashback_indicadores(int, text, date, date, text);
drop function if exists public.com_cashback_resumo(int, text, text, date, date, text);
drop function if exists public.com_cashback_mensal(int, text, text, date, date, text);

create function public.com_cashback_mensal(
  p_ano int, p_filial text default null, p_codigo text default null,
  p_de date default null, p_ate date default null, p_carteira text default null
)
returns table (
  cliente_codigo text, nome text, competencia date, tabela_base text,
  comprado numeric, percentual numeric, cashback numeric, sem_programa boolean,
  sem_tabela boolean,
  compra_para_ativar numeric, compra_mes_seguinte numeric, situacao text, cashback_liberado numeric
)
language sql stable security invoker
set search_path = public
as $$
  with acesso as (
    select (public.com_pode_gerir_carteiras() or public.has_diretoria_access(auth.uid())) as ve_tudo,
           coalesce(public.com_minhas_carteiras(), array[]::text[]) as minhas,
           -- Até onde o faturado já foi importado: antes disso, M+1 não está fechado no sistema.
           coalesce(public.com_faturado_importado_ate(), (now() at time zone 'America/Sao_Paulo')::date) as importado_ate
  ),
  base as (
    select
      i.cliente_codigo,
      i.competencia,
      coalesce(sum(i.valor_curva), 0) as comprado
    from public.com_vendas_itens i
    where (
        case
          when p_de is not null and p_ate is not null
            then i.competencia between date_trunc('month', p_de)::date and date_trunc('month', p_ate)::date
          else extract(year from i.competencia) = p_ano
        end
      )
      -- Só CFOP de venda (de qualquer série) e a devolução que abate: a classe vem de
      -- `com_classe_do_cfop`. Bonificação, publicidade, cashback (5910/6910/7949) ficam fora.
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
      f.percentual as faixa_percentual,
      -- A compra do mês SEGUINTE, pela mesma regra (pode estar fora do recorte pedido).
      (
        select coalesce(sum(s.valor_curva), 0)
        from public.com_vendas_itens s
        where s.cliente_codigo = ct.cliente_codigo
          and s.competencia = (ct.competencia + interval '1 month')::date
          and s.classe in ('venda', 'devolucao')
          and (p_filial is null or s.filial = p_filial)
      ) as seguinte
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
  ),
  apurado as (
    select
      cf.*,
      (case
         when not cf.tem_programa then null
         when cf.faixa_percentual is null then 0
         else round(cf.comprado * cf.faixa_percentual / 100, 2)
       end) as gerado,
      round(cf.comprado / 2, 2) as para_ativar,
      -- Último dia do mês seguinte: só depois dele importado o "não liberado" é definitivo.
      ((cf.competencia + interval '2 months')::date - 1) as fim_seguinte
    from com_faixa cf
  )
  select
    ap.cliente_codigo,
    coalesce(ap.razao_social, ap.cliente_codigo) as nome,
    ap.competencia,
    ap.tabela_base,
    ap.comprado,
    (case when ap.tem_programa then ap.faixa_percentual else null end) as percentual,
    ap.gerado as cashback,
    (ap.tabela_base is not null and not ap.tem_programa) as sem_programa,
    (ap.tabela_base is null) as sem_tabela,
    ap.para_ativar as compra_para_ativar,
    ap.seguinte as compra_mes_seguinte,
    (case
       when coalesce(ap.gerado, 0) = 0 then null
       when ap.seguinte >= ap.para_ativar then 'liberado'
       when (select importado_ate from acesso) > ap.fim_seguinte then 'nao_liberado'
       else 'aguardando'
     end) as situacao,
    (case
       when coalesce(ap.gerado, 0) > 0 and ap.seguinte >= ap.para_ativar then ap.gerado
       else 0
     end) as cashback_liberado
  from apurado ap
  order by nome, ap.competencia;
$$;

comment on function public.com_cashback_mensal(int, text, text, date, date, text) is
  'Cashback por cliente e mes (docs/regra-cashback.md): compra = CFOP de venda de qualquer serie, menos devolucao; gerado = compra x faixa da tabela; liberado se a compra do mes seguinte >= metade. Situacao: liberado / aguardando / nao_liberado. Respeita a carteira (quem nao gere ve so as proprias).';

create function public.com_cashback_resumo(
  p_ano int, p_filial text default null, p_codigo text default null,
  p_de date default null, p_ate date default null, p_carteira text default null
)
returns table (
  cliente_codigo text, nome text, tabela_base text, sem_programa boolean,
  comprado numeric, cashback numeric, meses_com_direito bigint,
  ultima_competencia date, ultima_faixa numeric,
  meta_para_ativar numeric, falta_proxima_faixa numeric, menor_distancia numeric,
  sem_tabela boolean,
  cashback_liberado numeric, cashback_aguardando numeric,
  ultima_compra_seguinte numeric, ultima_situacao text
)
language sql stable security invoker
set search_path = public
as $$
  with mensal as (
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
      count(*) filter (where m.cashback > 0) as meses_com_direito,
      coalesce(sum(m.cashback_liberado), 0) as cashback_liberado,
      coalesce(sum(m.cashback) filter (where m.situacao = 'aguardando'), 0) as cashback_aguardando
    from mensal m
    group by m.cliente_codigo
  ),
  ultimo_mes as (
    select distinct on (m.cliente_codigo)
      m.cliente_codigo, m.competencia, m.comprado, m.percentual, m.tabela_base,
      m.compra_para_ativar, m.compra_mes_seguinte, m.situacao
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
    -- A compra para ativar é a do ÚLTIMO mês (metade dele), a que o mês seguinte precisa bater —
    -- não mais 50% do período inteiro.
    um.compra_para_ativar as meta_para_ativar,
    (pf.proximo_minimo - um.comprado) as falta_proxima_faixa,
    md.menor_distancia,
    a.sem_tabela,
    a.cashback_liberado,
    a.cashback_aguardando,
    um.compra_mes_seguinte as ultima_compra_seguinte,
    um.situacao as ultima_situacao
  from agregado a
  left join ultimo_mes um on um.cliente_codigo = a.cliente_codigo
  left join proxima_faixa pf on pf.cliente_codigo = a.cliente_codigo
  left join menor_dist md on md.cliente_codigo = a.cliente_codigo
  order by a.nome;
$$;

create function public.com_cashback_indicadores(
  p_ano int, p_filial text default null, p_de date default null, p_ate date default null,
  p_carteira text default null
)
returns table (
  cashback_total numeric, comprado_total numeric, percentual numeric,
  clientes_nao_atingiram bigint, clientes_sem_programa bigint,
  clientes_sem_tabela bigint,
  cashback_liberado_total numeric, cashback_aguardando_total numeric
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
    (select count(*) from resumo where sem_tabela) as clientes_sem_tabela,
    coalesce((select sum(cashback_liberado) from com_programa), 0) as cashback_liberado_total,
    coalesce((select sum(cashback_aguardando) from com_programa), 0) as cashback_aguardando_total;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Lição 14: `drop` + `create` reabre para PUBLIC
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on function public.com_cashback_mensal(int, text, text, date, date, text) from public, anon;
grant execute on function public.com_cashback_mensal(int, text, text, date, date, text) to authenticated;
revoke all on function public.com_cashback_resumo(int, text, text, date, date, text) from public, anon;
grant execute on function public.com_cashback_resumo(int, text, text, date, date, text) to authenticated;
revoke all on function public.com_cashback_indicadores(int, text, date, date, text) from public, anon;
grant execute on function public.com_cashback_indicadores(int, text, date, date, text) to authenticated;

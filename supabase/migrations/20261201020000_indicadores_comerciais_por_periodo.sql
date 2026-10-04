-- COMERCIAL › INDICADORES RESPONDE AO PERÍODO — "Este mês", "Este trimestre", "Este ano" e
-- "Personalizado" (pedido do dono, 2026-10-03). Diretoria › Indicadores dos setores lê o
-- mesmo `com_resumo_da_carteira` e ganha junto.
--
-- O painel era só por competência (um mês). As quatro funções ganham `p_de`/`p_ate`
-- (date, default null) no fim. Sem eles, TUDO é como antes, pelo mês de `p_competencia`;
-- com os dois, o recorte é o intervalo:
--
--   * o que tem data de verdade (o lançamento, `com_interacoes.data`) usa os DIAS EXATOS:
--     venda lançada, clientes com venda, clientes relacionados, marcas dos indicadores,
--     ações do farol;
--   * a META é mensal por natureza (decisão do dono, 2026-10-03): entram os MESES INTEIROS
--     que o intervalo toca — 10/03–25/04 soma a meta de março e a de abril, inteiras.
--     Nunca rateio. A meta de valor (`com_metas`, da Diretoria) e as metas dos indicadores
--     (`com_metas_indicador`, que valem "a partir de" e atravessam os meses) somam mês a mês;
--   * o indicador SEMANAL, no intervalo, conta as marcas do intervalo inteiro e a meta é a
--     soma das SEMANAS INTEIRAS que ele toca — a mesma regra dos meses, um degrau abaixo;
--   * o que é FOTOGRAFIA ("em aberto", ativos/inativos da carteira) continua fotografia:
--     a referência é o último dia do intervalo, ou hoje se ele ainda não chegou — o mesmo
--     papel que o fim do mês tinha.
--
-- POR QUE `drop` + `create`: parâmetro novo no fim cria outra função e deixa a chamada
-- antiga ambígua. E o `drop` reabre a função para PUBLIC — o fim desta migration fecha
-- (lição 14 do pgTAP).
--
-- Corpos copiados das últimas definições, com só o recorte trocado:
--   com_vendedoras_do_painel, com_resumo_da_carteira, com_painel_do_gestor ... 20261119060000
--   com_farol_de_acoes ......................................................... 20261113010000

drop function if exists public.com_vendedoras_do_painel(date);
drop function if exists public.com_resumo_da_carteira(date);
drop function if exists public.com_painel_do_gestor(date);
drop function if exists public.com_farol_de_acoes(date);

-- ── 1. Quem aparece no painel ────────────────────────────────────────────────────────────────
-- `p_ate` (opcional) é o último dia do intervalo. Sem ele, a janela é o mês que começa em
-- `p_competencia`, como sempre foi. Com ele, quem lançou entre `p_competencia` e `p_ate`
-- sem estar em carteira também aparece.
create function public.com_vendedoras_do_painel(p_competencia date, p_ate date default null)
returns table (vendedor_id uuid, vendedor_nome text, carteira text)
language sql
stable
security invoker
set search_path to 'public'
as $$
  with pessoas as (
    select m.user_id, m.carteira from public.com_carteira_membros m
     where m.tenant_id = public.get_user_tenant_id()
    union
    select i.vendedor_id, null from public.com_interacoes i
     where i.data >= p_competencia
       and i.data < coalesce(p_ate + 1, (p_competencia + interval '1 month')::date)
       and not exists (select 1 from public.com_carteira_membros m2
                        where m2.user_id = i.vendedor_id and m2.tenant_id = i.tenant_id)
  )
  select p.user_id, coalesce(nullif(btrim(pr.full_name), ''), pr.email),
         string_agg(distinct p.carteira, ', ' order by p.carteira)
    from pessoas p
    join public.profiles pr on pr.id = p.user_id
   where p.user_id = auth.uid()
      or public.com_pode_gerir_carteiras()
      or public.has_diretoria_access(auth.uid())
   group by p.user_id, pr.full_name, pr.email;
$$;

-- ── 2. O resumo da carteira ──────────────────────────────────────────────────────────────────
-- Com intervalo: a venda e os contatos são os do intervalo (dias exatos); a situação da base
-- (ativo/inativo) é a do último dia dele (ou hoje), e o "era ativo antes da venda" é a da
-- véspera do primeiro dia — a mesma leitura que a véspera da competência tinha.
create function public.com_resumo_da_carteira(
  p_competencia date, p_de date default null, p_ate date default null
)
returns table (
  vendedor_id uuid, vendedor_nome text, carteira text,
  total_carteira bigint, ativos bigint, inativos bigint, nunca_compraram bigint,
  relacionados bigint, compradores bigint, relacionados_sem_compra bigint, valor_vendido numeric,
  compradores_ativos bigint, vendas_ativos numeric, ticket_ativos numeric,
  compradores_inativos bigint, vendas_inativos numeric, ticket_inativos numeric,
  media_base_ativa numeric
)
language sql
stable
security invoker
set search_path to 'public'
as $$
  with janela as (
    select case when x.intervalo then p_de
                else date_trunc('month', p_competencia)::date end as de,
           -- `ate` é EXCLUSIVO: o dia seguinte ao último.
           case when x.intervalo then p_ate + 1
                else (date_trunc('month', p_competencia) + interval '1 month')::date end as ate,
           least((now() at time zone 'America/Sao_Paulo')::date,
                 case when x.intervalo then p_ate
                      else (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date end) as ref
      from (select p_de is not null and p_ate is not null as intervalo) x
  ),
  situacao_agora as (
    select * from public.com_situacao_120_dias((select ref from janela))
  ),
  situacao_antes as (
    select * from public.com_situacao_120_dias((select de - 1 from janela))
  ),
  vend as (
    select * from public.com_vendedoras_do_painel(
      case when p_de is not null and p_ate is not null then p_de else p_competencia end,
      case when p_de is not null and p_ate is not null then p_ate end)
  ),
  carteiras_de as (
    select m.user_id, m.carteira from public.com_carteira_membros m
     where m.tenant_id = public.get_user_tenant_id()
  ),
  base as (
    select cd.user_id, s.* from carteiras_de cd join situacao_agora s on s.carteira = cd.carteira
  ),
  mes as (
    select i.* from public.com_interacoes i, janela
     where i.data >= janela.de and i.data < janela.ate and i.cliente_codigo is not null
  ),
  venda as (
    select m.vendedor_id, m.cliente_codigo, sum(m.valor_venda) as valor
      from mes m where m.status = 'concluido' and m.valor_venda > 0
     group by m.vendedor_id, m.cliente_codigo
  ),
  venda_classificada as (
    select v.*, coalesce(sa.situacao = 'ativo', false) as era_ativo
      from venda v left join situacao_antes sa on sa.cliente_codigo = v.cliente_codigo
  )
  select vd.vendedor_id, vd.vendedor_nome, vd.carteira,
         (select count(*) from base b where b.user_id = vd.vendedor_id),
         (select count(*) from base b where b.user_id = vd.vendedor_id and b.situacao = 'ativo'),
         (select count(*) from base b where b.user_id = vd.vendedor_id and b.situacao = 'inativo'),
         (select count(*) from base b where b.user_id = vd.vendedor_id and b.situacao = 'nunca_comprou'),
         (select count(distinct m.cliente_codigo) from mes m where m.vendedor_id = vd.vendedor_id),
         (select count(*) from venda_classificada c where c.vendedor_id = vd.vendedor_id),
         (select count(distinct m.cliente_codigo) from mes m
           where m.vendedor_id = vd.vendedor_id
             and not exists (select 1 from venda v where v.vendedor_id = vd.vendedor_id and v.cliente_codigo = m.cliente_codigo)),
         coalesce((select sum(c.valor) from venda_classificada c where c.vendedor_id = vd.vendedor_id), 0),
         (select count(*) from venda_classificada c where c.vendedor_id = vd.vendedor_id and c.era_ativo),
         coalesce((select sum(c.valor) from venda_classificada c where c.vendedor_id = vd.vendedor_id and c.era_ativo), 0),
         (select round(sum(c.valor) / nullif(count(*), 0), 2) from venda_classificada c
           where c.vendedor_id = vd.vendedor_id and c.era_ativo),
         (select count(*) from venda_classificada c where c.vendedor_id = vd.vendedor_id and not c.era_ativo),
         coalesce((select sum(c.valor) from venda_classificada c where c.vendedor_id = vd.vendedor_id and not c.era_ativo), 0),
         (select round(sum(c.valor) / nullif(count(*), 0), 2) from venda_classificada c
           where c.vendedor_id = vd.vendedor_id and not c.era_ativo),
         (select round(coalesce(sum(c.valor), 0)
                       / nullif((select count(*) from base b where b.user_id = vd.vendedor_id and b.situacao = 'ativo'), 0), 2)
            from venda_classificada c where c.vendedor_id = vd.vendedor_id and c.era_ativo)
    from vend vd
   order by vd.vendedor_nome;
$$;

-- ── 3. O Painel do gestor ────────────────────────────────────────────────────────────────────
create function public.com_painel_do_gestor(
  p_competencia date, p_de date default null, p_ate date default null
)
returns table (
  vendedor_id uuid, vendedor_nome text, carteira text,
  ordem int, metrica text, rotulo text, periodo text,
  meta numeric, realizado numeric, cor text
)
language sql
stable
security invoker
set search_path to 'public'
as $$
  with janela as (
    select x.intervalo,
           case when x.intervalo then p_de
                else date_trunc('month', p_competencia)::date end as de,
           -- `ate` é EXCLUSIVO: o dia seguinte ao último.
           case when x.intervalo then p_ate + 1
                else (date_trunc('month', p_competencia) + interval '1 month')::date end as ate,
           least((now() at time zone 'America/Sao_Paulo')::date,
                 case when x.intervalo then p_ate
                      else (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date end) as ref
      from (select p_de is not null and p_ate is not null as intervalo) x
  ),
  -- No mês, o indicador semanal conta a semana da referência. No intervalo, conta o
  -- intervalo inteiro (e a meta soma as semanas inteiras que ele toca — ver `metas`).
  semana as (
    select case when janela.intervalo then janela.de
                else date_trunc('week', janela.ref)::date end as de,
           case when janela.intervalo then janela.ate
                else (date_trunc('week', janela.ref) + interval '7 days')::date end as ate
      from janela
  ),
  vend as (
    select * from public.com_vendedoras_do_painel(
      case when p_de is not null and p_ate is not null then p_de else p_competencia end,
      case when p_de is not null and p_ate is not null then p_ate end)
  ),
  mes as (
    select i.* from public.com_interacoes i, janela
     where i.data >= janela.de and i.data < janela.ate
  ),
  vendas as (
    select m.vendedor_id,
           sum(m.valor_venda) as valor,
           count(distinct m.cliente_codigo) as clientes
      from mes m
     where m.status = 'concluido' and m.valor_venda > 0 and m.cliente_codigo is not null
     group by m.vendedor_id
  ),
  relacionados as (
    select m.vendedor_id, count(distinct m.cliente_codigo) as clientes
      from mes m where m.cliente_codigo is not null
     group by m.vendedor_id
  ),
  catalogo as (
    select * from public.com_indicadores where ativo
  ),
  marcas as (
    select i.vendedor_id, ind.id as indicador_id, count(*) as qtd
      from public.com_interacao_marcas mk
      join public.com_interacoes i on i.id = mk.interacao_id
      join catalogo ind on ind.id = mk.indicador_id
      cross join janela cross join semana
     where (ind.periodo = 'mes'    and i.data >= janela.de and i.data < janela.ate)
        or (ind.periodo = 'semana' and i.data >= semana.de and i.data < semana.ate)
     group by i.vendedor_id, ind.id
  ),
  abertas as (
    select i.vendedor_id, ind.id as indicador_id, count(*) as qtd
      from public.com_interacao_marcas mk
      join public.com_interacoes i on i.id = mk.interacao_id
      join catalogo ind on ind.id = mk.indicador_id and ind.conta_em_aberto
      cross join janela
     where i.status <> 'concluido' and i.data <= janela.ref
     group by i.vendedor_id, ind.id
  ),
  -- A meta do mês: a que vale "a partir de" (a última competência até o mês). É a conta de
  -- antes, e só vale sem intervalo.
  metas_do_mes as (
    select distinct on (mi.vendedor_id, mi.metrica)
           mi.vendedor_id, mi.metrica, mi.meta
      from public.com_metas_indicador mi, janela
     where not janela.intervalo and mi.competencia <= janela.de
     order by mi.vendedor_id, mi.metrica, mi.competencia desc
  ),
  -- No intervalo: os MESES INTEIROS e as SEMANAS INTEIRAS que ele toca.
  meses_do_intervalo as (
    select generate_series(date_trunc('month', janela.de), date_trunc('month', janela.ate - 1),
                           interval '1 month')::date as mes
      from janela where janela.intervalo
  ),
  semanas_do_intervalo as (
    select generate_series(date_trunc('week', janela.de), date_trunc('week', janela.ate - 1),
                           interval '1 week')::date as semana
      from janela where janela.intervalo
  ),
  -- A meta que vale em cada um desses meses / semanas (a semana pega a do mês em que começa).
  meta_por_mes as (
    select ms.mes, v.vendedor_id, v.metrica, v.meta
      from meses_do_intervalo ms
      cross join lateral (
        select distinct on (mi.vendedor_id, mi.metrica) mi.vendedor_id, mi.metrica, mi.meta
          from public.com_metas_indicador mi
         where mi.competencia <= ms.mes
         order by mi.vendedor_id, mi.metrica, mi.competencia desc
      ) v
  ),
  meta_por_semana as (
    select sm.semana, v.vendedor_id, v.metrica, v.meta
      from semanas_do_intervalo sm
      cross join lateral (
        select distinct on (mi.vendedor_id, mi.metrica) mi.vendedor_id, mi.metrica, mi.meta
          from public.com_metas_indicador mi
         where mi.competencia <= date_trunc('month', sm.semana)::date
         order by mi.vendedor_id, mi.metrica, mi.competencia desc
      ) v
  ),
  metas_do_intervalo as (
    -- O que se acumula no mês: a soma dos meses inteiros.
    select m.vendedor_id, m.metrica, sum(m.meta) as meta
      from meta_por_mes m
     where m.metrica not like 'aberto:%'
       and not exists (select 1 from catalogo ind
                        where ind.periodo = 'semana' and m.metrica = 'ind:' || ind.id)
     group by m.vendedor_id, m.metrica
    union all
    -- O semanal: a soma das semanas inteiras.
    select m.vendedor_id, m.metrica, sum(m.meta)
      from meta_por_semana m
     where exists (select 1 from catalogo ind
                    where ind.periodo = 'semana' and m.metrica = 'ind:' || ind.id)
     group by m.vendedor_id, m.metrica
    union all
    -- "Em aberto" é fotografia, não se soma: a meta que vale no mês da referência.
    (select distinct on (mi.vendedor_id, mi.metrica) mi.vendedor_id, mi.metrica, mi.meta
       from public.com_metas_indicador mi, janela
      where janela.intervalo and mi.metrica like 'aberto:%'
        and mi.competencia <= date_trunc('month', janela.ref)::date
      order by mi.vendedor_id, mi.metrica, mi.competencia desc)
  ),
  metas as (
    select * from metas_do_mes
    union all
    select * from metas_do_intervalo
  ),
  -- A META DE VALOR É A DA DIRETORIA: a soma de `com_metas` das carteiras da vendedora.
  -- Os meses cujo dia 1 cai em [início do mês de `de`, `ate`): sem intervalo é exatamente o
  -- mês da competência (a conta de antes, `ano`/`mes` iguais); com intervalo, os meses
  -- inteiros que ele toca.
  meta_da_carteira as (
    select m.user_id as vendedor_id, sum(cm.valor) as meta
      from public.com_carteira_membros m
      cross join janela
      join public.com_metas cm
        on cm.tenant_id = m.tenant_id
       and cm.carteira is not null
       and public.normalizar_nome_carteira(cm.carteira) = m.carteira
       and make_date(cm.ano, cm.mes, 1) >= date_trunc('month', janela.de)::date
       and make_date(cm.ano, cm.mes, 1) < janela.ate
     where m.tenant_id = public.get_user_tenant_id()
     group by m.user_id
  ),
  linhas as (
    select v.vendedor_id, v.vendedor_nome, v.carteira, 1 as ordem,
           'valor_vendas'::text as metrica,
           (case when (select intervalo from janela) then 'Valor de venda acumulada do período'
                 else 'Valor de venda acumulada do mês' end)::text as rotulo,
           'mes'::text as periodo, coalesce(vd.valor, 0)::numeric as realizado
      from vend v left join vendas vd on vd.vendedor_id = v.vendedor_id
    union all
    select v.vendedor_id, v.vendedor_nome, v.carteira, 2, 'pct_meta',
           '% de vendas acumulada x meta', 'mes', null
      from vend v
    union all
    select v.vendedor_id, v.vendedor_nome, v.carteira, 3, 'clientes_com_venda',
           case when (select intervalo from janela) then 'Quantidade de clientes com vendas no período'
                else 'Quantidade de clientes com vendas no mês' end,
           'mes', coalesce(vd.clientes, 0)
      from vend v left join vendas vd on vd.vendedor_id = v.vendedor_id
    union all
    select v.vendedor_id, v.vendedor_nome, v.carteira, 4, 'clientes_relacionados',
           'Quantidade de clientes que relacionou', 'mes', coalesce(r.clientes, 0)
      from vend v left join relacionados r on r.vendedor_id = v.vendedor_id
    union all
    select v.vendedor_id, v.vendedor_nome, v.carteira, 10 + ind.ordem * 2,
           'ind:' || ind.id,
           case when (select intervalo from janela)
                then regexp_replace(coalesce(ind.rotulo_painel, ind.nome), ' na semana$| no mês$', ' no período')
                else coalesce(ind.rotulo_painel, ind.nome) end,
           ind.periodo,
           coalesce(mk.qtd, 0)
      from vend v
      cross join catalogo ind
      left join marcas mk on mk.vendedor_id = v.vendedor_id and mk.indicador_id = ind.id
     where ind.tipo = 'indicador'
    union all
    select v.vendedor_id, v.vendedor_nome, v.carteira, 11 + ind.ordem * 2,
           'aberto:' || ind.id, regexp_replace(coalesce(ind.rotulo_painel, ind.nome), ' na semana$| no mês$', '') || ' em aberto',
           'aberto', coalesce(ab.qtd, 0)
      from vend v
      cross join catalogo ind
      left join abertas ab on ab.vendedor_id = v.vendedor_id and ab.indicador_id = ind.id
     where ind.tipo = 'indicador' and ind.conta_em_aberto
  )
  select l.vendedor_id, l.vendedor_nome, l.carteira, l.ordem, l.metrica, l.rotulo, l.periodo,
         case l.metrica
           when 'valor_vendas' then mc.meta
           when 'pct_meta' then case when mc.meta > 0 then 100 end
           else mt.meta
         end as meta,
         case when l.metrica = 'pct_meta'
              then case when mc.meta > 0 then round(coalesce(vd.valor, 0) / mc.meta * 100, 1) end
              else l.realizado end as realizado,
         case l.metrica
           when 'valor_vendas' then public.com_cor_do_farol(l.realizado, mc.meta)
           when 'pct_meta' then public.com_cor_do_farol(coalesce(vd.valor, 0), mc.meta)
           else public.com_cor_do_farol(l.realizado, mt.meta)
         end as cor
    from linhas l
    left join metas mt on mt.vendedor_id = l.vendedor_id and mt.metrica = l.metrica
    left join meta_da_carteira mc on mc.vendedor_id = l.vendedor_id
    left join vendas vd on vd.vendedor_id = l.vendedor_id
   order by l.vendedor_nome, l.ordem;
$$;

-- ── 4. O FAROL de ações ──────────────────────────────────────────────────────────────────────
create function public.com_farol_de_acoes(
  p_competencia date, p_de date default null, p_ate date default null
)
returns table (indicador_id uuid, acao text, ordem int, vendedor_id uuid, vendedor_nome text, quantidade bigint)
language sql
stable
security invoker
set search_path to 'public'
as $$
  select ind.id, ind.nome, ind.ordem, v.vendedor_id, v.vendedor_nome,
         count(i.id) as quantidade
    from public.com_indicadores ind
    cross join public.com_vendedoras_do_painel(
      case when p_de is not null and p_ate is not null then p_de else p_competencia end,
      case when p_de is not null and p_ate is not null then p_ate end) v
    left join public.com_interacao_marcas mk on mk.indicador_id = ind.id
    left join public.com_interacoes i
           on i.id = mk.interacao_id
          and i.vendedor_id = v.vendedor_id
          and i.data >= case when p_de is not null and p_ate is not null then p_de
                             else date_trunc('month', p_competencia)::date end
          and i.data < case when p_de is not null and p_ate is not null then p_ate + 1
                            else (date_trunc('month', p_competencia) + interval '1 month')::date end
   where ind.tipo = 'acao' and ind.ativo
   group by ind.id, ind.nome, ind.ordem, v.vendedor_id, v.vendedor_nome
   order by ind.ordem, v.vendedor_nome;
$$;

-- ── 5. Quem executa: `drop` + `create` reabriu as quatro para PUBLIC (lição 14) ─────────────
revoke all on function public.com_vendedoras_do_painel(date, date) from public, anon;
grant execute on function public.com_vendedoras_do_painel(date, date) to authenticated;

revoke all on function public.com_resumo_da_carteira(date, date, date) from public, anon;
grant execute on function public.com_resumo_da_carteira(date, date, date) to authenticated;

revoke all on function public.com_painel_do_gestor(date, date, date) from public, anon;
grant execute on function public.com_painel_do_gestor(date, date, date) to authenticated;

revoke all on function public.com_farol_de_acoes(date, date, date) from public, anon;
grant execute on function public.com_farol_de_acoes(date, date, date) to authenticated;

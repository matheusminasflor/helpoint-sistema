-- ATINGIMENTO SÓ NOS MESES QUE TÊM META (decisão do dono, 2026-11-12). As metas das carteiras começam em out/2026; no
-- período "Ano" os Indicadores comparavam a venda de jan–nov (R$ 1,83 mi do Fenicio) com a meta de out–dez (R$ 947 mil)
-- e diziam "193% · Na meta". Agora o % e o farol comparam a meta com a venda DOS MESES QUE TÊM META (cada mês recortado
-- pelo período): CTEs `meses_com_meta` e `venda_com_meta`. A linha "venda do período" continua mostrando a venda
-- inteira. Num mês só nada muda: o mês com meta é ele mesmo.
-- A função inteira (texto de produção + a mudança), não uma troca de trecho. `create or replace` preserva a ACL.
create or replace function public.com_painel_do_gestor(p_competencia date, p_de date default null::date, p_ate date default null::date)
 returns table(vendedor_id uuid, vendedor_nome text, carteira text, ordem integer, metrica text, rotulo text, periodo text, meta numeric, realizado numeric, cor text)
 language sql
 stable
 set search_path to 'public'
as $function$
  with janela as (
    select x.intervalo,
           case when x.intervalo then p_de
                else date_trunc('month', p_competencia)::date end as de,
           case when x.intervalo then p_ate + 1
                else (date_trunc('month', p_competencia) + interval '1 month')::date end as ate,
           least((now() at time zone 'America/Sao_Paulo')::date,
                 case when x.intervalo then p_ate
                      else (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date end) as ref
      from (select p_de is not null and p_ate is not null as intervalo) x
  ),
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
    select i.* from public.com_interacoes_que_contam i, janela
     where i.data >= janela.de and i.data < janela.ate
  ),
  vendas as (
    select a.vendedor_id,
           sum(a.faturado + a.previa) as valor,
           count(distinct a.cliente_codigo) filter (where a.faturado + a.previa > 0) as clientes
      from public.com_venda_atribuida((select de from janela), (select ate - 1 from janela)) a
     group by a.vendedor_id
  ),
  relacionados as (
    select m.vendedor_id, count(distinct m.cliente_codigo) as clientes
      from mes m where m.cliente_codigo is not null
     group by m.vendedor_id
  ),
  catalogo as (select * from public.com_indicadores where ativo),
  marcas as (
    select i.vendedor_id, ind.id as indicador_id, count(*) as qtd
      from public.com_interacao_marcas mk
      join public.com_interacoes_que_contam i on i.id = mk.interacao_id
      join catalogo ind on ind.id = mk.indicador_id
      cross join janela cross join semana
     where (ind.periodo = 'mes'    and i.data >= janela.de and i.data < janela.ate)
        or (ind.periodo = 'semana' and i.data >= semana.de and i.data < semana.ate)
     group by i.vendedor_id, ind.id
  ),
  abertas as (
    select i.vendedor_id, ind.id as indicador_id, count(*) as qtd
      from public.com_interacao_marcas mk
      join public.com_interacoes_que_contam i on i.id = mk.interacao_id
      join catalogo ind on ind.id = mk.indicador_id and ind.conta_em_aberto
      cross join janela
     where i.status <> 'concluido' and i.data <= janela.ref
     group by i.vendedor_id, ind.id
  ),
  metas_do_mes as (
    select distinct on (mi.vendedor_id, mi.metrica) mi.vendedor_id, mi.metrica, mi.meta
      from public.com_metas_indicador mi, janela
     where not janela.intervalo and mi.competencia <= janela.de
     order by mi.vendedor_id, mi.metrica, mi.competencia desc
  ),
  meses_do_intervalo as (
    select generate_series(date_trunc('month', janela.de), date_trunc('month', janela.ate - 1), interval '1 month')::date as mes
      from janela where janela.intervalo
  ),
  semanas_do_intervalo as (
    select generate_series(date_trunc('week', janela.de), date_trunc('week', janela.ate - 1), interval '1 week')::date as semana
      from janela where janela.intervalo
  ),
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
    select m.vendedor_id, m.metrica, sum(m.meta) as meta
      from meta_por_mes m
     where m.metrica not like 'aberto:%'
       and not exists (select 1 from catalogo ind where ind.periodo = 'semana' and m.metrica = 'ind:' || ind.id)
     group by m.vendedor_id, m.metrica
    union all
    select m.vendedor_id, m.metrica, sum(m.meta)
      from meta_por_semana m
     where exists (select 1 from catalogo ind where ind.periodo = 'semana' and m.metrica = 'ind:' || ind.id)
     group by m.vendedor_id, m.metrica
    union all
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
  -- Os meses do período em que a carteira da vendedora tem meta, e a venda dela nesses meses (2026-11-12).
  meses_com_meta as (
    select distinct m.user_id as vendedor_id, make_date(cm.ano, cm.mes, 1) as mes_da_meta
      from public.com_carteira_membros m
      cross join janela
      join public.com_metas cm
        on cm.tenant_id = m.tenant_id
       and cm.carteira is not null
       and public.normalizar_nome_carteira(cm.carteira) = m.carteira
       and make_date(cm.ano, cm.mes, 1) >= date_trunc('month', janela.de)::date
       and make_date(cm.ano, cm.mes, 1) < janela.ate
       and cm.valor > 0
     where m.tenant_id = public.get_user_tenant_id()
  ),
  venda_com_meta as (
    select mm.vendedor_id, sum(a.faturado + a.previa) as valor
      from (select distinct mcm.mes_da_meta from meses_com_meta mcm) ms
      cross join janela
      cross join lateral public.com_venda_atribuida(greatest(ms.mes_da_meta, janela.de),
                                                    least((ms.mes_da_meta + interval '1 month - 1 day')::date, janela.ate - 1)) a
      join meses_com_meta mm on mm.mes_da_meta = ms.mes_da_meta and mm.vendedor_id = a.vendedor_id
     group by mm.vendedor_id
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
              then case when mc.meta > 0 then round(coalesce(vm.valor, 0) / mc.meta * 100, 1) end
              else l.realizado end as realizado,
         case l.metrica
           when 'valor_vendas' then public.com_cor_do_farol(coalesce(vm.valor, 0), mc.meta)
           when 'pct_meta' then public.com_cor_do_farol(coalesce(vm.valor, 0), mc.meta)
           else public.com_cor_do_farol(l.realizado, mt.meta)
         end as cor
    from linhas l
    left join metas mt on mt.vendedor_id = l.vendedor_id and mt.metrica = l.metrica
    left join meta_da_carteira mc on mc.vendedor_id = l.vendedor_id
    left join vendas vd on vd.vendedor_id = l.vendedor_id
    left join venda_com_meta vm on vm.vendedor_id = l.vendedor_id
   order by l.vendedor_nome, l.ordem;
$function$;

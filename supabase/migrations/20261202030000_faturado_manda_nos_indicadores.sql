-- O FATURADO MANDA NOS INDICADORES DO COMERCIAL (decisões do dono, 2026-10-03).
--
-- Até aqui a venda dos Indicadores (painel do gestor, resumo da carteira, carteira mês a mês) era o
-- que a vendedora DIGITOU no lançamento. O dono decidiu:
--   * o FATURADO (a nota importada do Forteplus) manda; o lançado vale só como PRÉVIA nos dias que a
--     importação ainda não cobre — o corte é a data da última nota importada
--     (`com_faturado_importado_ate`, 20261202020000), porque ele importa "semanal, mensal ou quando
--     quiser";
--   * a nota é do CLIENTE e conta para a vendedora da CARTEIRA dele (`com_clientes.carteira` =
--     `com_carteira_membros.carteira`, a mesma regra das metas por carteira).
-- Contatos, clientes relacionados, ações e indicadores de atividade continuam saindo dos
-- lançamentos: o lançamento segue obrigatório (é o gancho da carteira).
--
-- Consequências escritas para não surpreender:
--   * lançamento ANTES do corte não soma por cima do faturado — aquele período já tem nota;
--   * vendedora sem carteira: faturado zero, só a prévia do que lançar depois do corte;
--   * carteira com duas vendedoras: a nota conta para as duas (o total da equipe não é a soma das
--     linhas) — o mesmo que já acontece com a meta da carteira.
-- As assinaturas não mudam (`create or replace` preserva a ACL). A tela mostra a separação
-- faturado × prévia pela função nova `com_venda_atribuida`.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A venda atribuída: faturado pela carteira até o corte + lançado depois do corte
-- ─────────────────────────────────────────────────────────────────────────────
-- Dias inclusivos (`p_de` a `p_ate`). `security invoker`: a RLS de `com_vendas_itens` e de
-- `com_interacoes` continua valendo para quem pergunta.
create or replace function public.com_venda_atribuida(p_de date, p_ate date)
returns table (vendedor_id uuid, cliente_codigo text, faturado numeric, previa numeric, corte date)
language sql
stable
security invoker
set search_path = public
as $$
  with c as (select public.com_faturado_importado_ate() as d),
  fat as (
    select mb.user_id as vendedor_id, v.cliente_codigo, sum(v.valor_curva) as faturado
      from public.com_vendas_itens v
      cross join c
      join public.com_clientes cl on cl.tenant_id = v.tenant_id and cl.codigo = v.cliente_codigo
      join public.com_carteira_membros mb on mb.tenant_id = v.tenant_id and mb.carteira = cl.carteira
     where v.tenant_id = public.get_user_tenant_id()
       and c.d is not null
       and v.classe in ('venda', 'devolucao')
       and v.emissao between p_de and least(p_ate, c.d)
     group by mb.user_id, v.cliente_codigo
  ),
  prev as (
    select i.vendedor_id, i.cliente_codigo, sum(i.valor_venda) as previa
      from public.com_interacoes i
      cross join c
     where i.tenant_id = public.get_user_tenant_id()
       and i.data between p_de and p_ate
       and (c.d is null or i.data > c.d)
       and i.status = 'concluido' and i.valor_venda > 0
       and i.cliente_codigo is not null
     group by i.vendedor_id, i.cliente_codigo
  )
  select coalesce(f.vendedor_id, p.vendedor_id), coalesce(f.cliente_codigo, p.cliente_codigo),
         coalesce(f.faturado, 0), coalesce(p.previa, 0), (select d from c)
    from fat f
    full join prev p on p.vendedor_id = f.vendedor_id and p.cliente_codigo = f.cliente_codigo;
$$;

comment on function public.com_venda_atribuida(date, date) is
  'Venda por vendedora e cliente: faturado (nota importada) pela carteira do cliente até o corte + lançado depois do corte como prévia. Decisão do dono, 2026-10-03.';

revoke all on function public.com_venda_atribuida(date, date) from public, anon;
grant execute on function public.com_venda_atribuida(date, date) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. O painel do gestor — só o CTE `vendas` muda
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.com_painel_do_gestor(
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
  -- A VENDA (2026-10-03): faturado da carteira até o corte + prévia lançada depois dele.
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
  metas_do_mes as (
    select distinct on (mi.vendedor_id, mi.metrica)
           mi.vendedor_id, mi.metrica, mi.meta
      from public.com_metas_indicador mi, janela
     where not janela.intervalo and mi.competencia <= janela.de
     order by mi.vendedor_id, mi.metrica, mi.competencia desc
  ),
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
       and not exists (select 1 from catalogo ind
                        where ind.periodo = 'semana' and m.metrica = 'ind:' || ind.id)
     group by m.vendedor_id, m.metrica
    union all
    select m.vendedor_id, m.metrica, sum(m.meta)
      from meta_por_semana m
     where exists (select 1 from catalogo ind
                    where ind.periodo = 'semana' and m.metrica = 'ind:' || ind.id)
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. O resumo da carteira — só o CTE `venda` muda
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.com_resumo_da_carteira(
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
  -- A VENDA (2026-10-03): faturado da carteira até o corte + prévia lançada depois dele.
  venda as (
    select a.vendedor_id, a.cliente_codigo, sum(a.faturado + a.previa) as valor
      from public.com_venda_atribuida((select de from janela), (select ate - 1 from janela)) a
     where a.faturado + a.previa > 0
     group by a.vendedor_id, a.cliente_codigo
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. A carteira mês a mês — a venda do mês: faturado da carteira até o corte + lançado depois
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.com_carteira_mes_a_mes(p_carteira text, p_ano integer)
returns table (mes integer, meta numeric, venda numeric, cor text)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_carteira text := public.normalizar_nome_carteira(p_carteira);
  v_corte date := public.com_faturado_importado_ate();
begin
  if v_tenant is null or not public.com_pode_ver_carteira(p_carteira) then
    raise exception 'Você não tem acesso a esta carteira.' using errcode = '42501';
  end if;

  return query
  with base as (
    select m.mes as m_mes,
           (select cm.valor from public.com_metas cm
             where cm.tenant_id = v_tenant and cm.ano = p_ano and cm.mes = m.mes
               and cm.carteira is not null
               and public.normalizar_nome_carteira(cm.carteira) = v_carteira
             limit 1) as m_meta,
           -- O faturado (nota importada) dos clientes da carteira, até o corte.
           coalesce((select sum(v.valor_curva)
                       from public.com_vendas_itens v
                       join public.com_clientes c
                         on c.tenant_id = v.tenant_id and c.codigo = v.cliente_codigo
                      where v.tenant_id = v_tenant and c.carteira = v_carteira
                        and v_corte is not null and v.emissao <= v_corte
                        and v.classe in ('venda', 'devolucao')
                        and extract(year from v.emissao)::int = p_ano
                        and extract(month from v.emissao)::int = m.mes), 0)
           -- + a prévia: o lançado depois do corte (a nota ainda não foi importada).
           + coalesce((select sum(i.valor_venda)
                         from public.com_interacoes i
                         join public.com_clientes c
                           on c.tenant_id = i.tenant_id and c.codigo = i.cliente_codigo
                        where i.tenant_id = v_tenant and c.carteira = v_carteira
                          and i.status = 'concluido' and i.valor_venda > 0
                          and (v_corte is null or i.data > v_corte)
                          and extract(year from i.data)::int = p_ano
                          and extract(month from i.data)::int = m.mes), 0) as m_venda
      from generate_series(1, 12) as m(mes)
  )
  select b.m_mes, b.m_meta, b.m_venda, public.com_cor_do_farol(b.m_venda, b.m_meta)
    from base b
   order by b.m_mes;
end;
$function$;

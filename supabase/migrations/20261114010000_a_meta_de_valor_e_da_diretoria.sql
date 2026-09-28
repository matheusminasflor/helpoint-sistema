-- A meta de valor da vendedora é a da Diretoria (LEVA O, parte 1)
--
-- DECISÃO DO DONO (2026-09-28), perguntado sobre de onde sairia a meta por cliente: "a meta é
-- definida diretamente pelo diretor, onde já existe o campo onde ele define a meta … dentro do
-- módulo diretor é definida a meta de cada carteira." O campo é `com_metas` (ano, mês,
-- carteira, valor), editado em Diretoria › Metas e carteiras.
--
-- O QUE ESTAVA ERRADO NA LEVA 1. O Painel do Gestor tinha um campo próprio para a meta de
-- "Valor de venda acumulada do mês", gravado em `com_metas_indicador`. Era uma SEGUNDA meta de
-- valor para a mesma pessoa no mesmo mês, concorrendo com a do diretor — e as duas divergiriam
-- na primeira vez que alguém mudasse uma sem lembrar da outra. Agora a linha de valor (e o %
-- da meta, que é valor ÷ meta) lê `com_metas` pela carteira da vendedora; e `com_metas_indicador`
-- deixa de aceitar `valor_vendas`. As metas dos outros indicadores (quantidades de contato,
-- reunião, prospecção…) continuam com o gestor, porque essas a Diretoria não define.
--
-- O NOME DA CARTEIRA É COMPARADO NORMALIZADO. `com_metas.carteira` é gravado pela tela da
-- Diretoria sem passar pela normalização que a leva 1 pôs em `com_clientes` e
-- `com_carteira_membros`; comparar cru faria "Mg" da meta não achar "MG" da vendedora.
--
-- TETO CONHECIDO: carteira com duas vendedoras compara cada uma à meta inteira da carteira. O
-- total certo da carteira contra a meta é o acompanhamento por carteira (parte 2).

-- Nenhuma linha existe fora de teste (a leva 1 tem horas), mas o CHECK abaixo não entraria com
-- uma delas no banco — e apagar é o certo: essa meta passou a morar em `com_metas`.
delete from public.com_metas_indicador where metrica = 'valor_vendas';

alter table public.com_metas_indicador drop constraint if exists com_metas_indicador_metrica_check;
alter table public.com_metas_indicador
  add constraint com_metas_indicador_metrica_check
  check (metrica ~ '^(clientes_com_venda|clientes_relacionados|ind:[0-9a-f-]{36}|aberto:[0-9a-f-]{36})$');

-- `create or replace` preserva a ACL (lição 14). O corpo é o de `20261113010000`, com a meta de
-- valor trocada — marcado em `meta_da_carteira` e no select final.
create or replace function public.com_painel_do_gestor(p_competencia date)
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
    select date_trunc('month', p_competencia)::date as de,
           (date_trunc('month', p_competencia) + interval '1 month')::date as ate,
           least((now() at time zone 'America/Sao_Paulo')::date,
                 (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date) as ref
  ),
  semana as (
    select date_trunc('week', janela.ref)::date as de,
           (date_trunc('week', janela.ref) + interval '7 days')::date as ate
      from janela
  ),
  vend as (select * from public.com_vendedoras_do_painel(p_competencia)),
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
  metas as (
    select distinct on (mi.vendedor_id, mi.metrica)
           mi.vendedor_id, mi.metrica, mi.meta
      from public.com_metas_indicador mi, janela
     where mi.competencia <= janela.de
     order by mi.vendedor_id, mi.metrica, mi.competencia desc
  ),
  -- A META DE VALOR É A DA DIRETORIA: `com_metas` da carteira da vendedora, no mês.
  meta_da_carteira as (
    select v.vendedor_id, cm.valor as meta
      from vend v
      cross join janela
      join public.com_metas cm
        on cm.tenant_id = public.get_user_tenant_id()
       and cm.carteira is not null
       and public.normalizar_nome_carteira(cm.carteira) = v.carteira
       and cm.ano = extract(year from janela.de)::int
       and cm.mes = extract(month from janela.de)::int
  ),
  linhas as (
    select v.vendedor_id, v.vendedor_nome, v.carteira, 1 as ordem,
           'valor_vendas'::text as metrica, 'Valor de venda acumulada do mês'::text as rotulo,
           'mes'::text as periodo, coalesce(vd.valor, 0)::numeric as realizado
      from vend v left join vendas vd on vd.vendedor_id = v.vendedor_id
    union all
    select v.vendedor_id, v.vendedor_nome, v.carteira, 2, 'pct_meta',
           '% de vendas acumulada x meta', 'mes', null
      from vend v
    union all
    select v.vendedor_id, v.vendedor_nome, v.carteira, 3, 'clientes_com_venda',
           'Quantidade de clientes com vendas no mês', 'mes', coalesce(vd.clientes, 0)
      from vend v left join vendas vd on vd.vendedor_id = v.vendedor_id
    union all
    select v.vendedor_id, v.vendedor_nome, v.carteira, 4, 'clientes_relacionados',
           'Quantidade de clientes que relacionou', 'mes', coalesce(r.clientes, 0)
      from vend v left join relacionados r on r.vendedor_id = v.vendedor_id
    union all
    select v.vendedor_id, v.vendedor_nome, v.carteira, 10 + ind.ordem * 2,
           'ind:' || ind.id, coalesce(ind.rotulo_painel, ind.nome), ind.periodo,
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

-- A comissão da carteira fecha MÊS A MÊS (docs/regra-comissao.md: "0,5% só se bater a meta do mês", "fecha no último dia
-- do mês"). Até aqui, num período de vários meses, `com_comissao` somava a venda do período inteiro contra a soma das
-- metas: no "Ano" de 2026 a venda de janeiro a novembro (sem meta antes de outubro) "batia" a meta de out–dez e a tela
-- mostrava R$ 9.178,32 de comissão para quem não bateu a meta em nenhum mês. Agora cada mês do período é apurado
-- sozinho (a venda do mês, recortada pelo período, contra a meta do mês) e o período é a soma dos meses. "Quanto falta"
-- só existe quando o período é um mês só — num período longo não há uma meta única a perseguir.
-- `create or replace` com a mesma assinatura preserva a ACL (regra 14).
create or replace function public.com_comissao(p_de date, p_ate date)
returns table(pessoa_id uuid, pessoa_nome text, tipo text, origem text, percentual numeric, base_garantida numeric,
              base_a_confirmar numeric, meta numeric, falta numeric, garantida numeric, a_confirmar numeric)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_todos boolean := public.com_pode_gerir_carteiras();
begin
  if v_tenant is null or not (v_todos or public.pode_no_setor('comercial', 'reports', 'view')) then
    raise exception 'sem acesso à comissão' using errcode = '42501';
  end if;

  return query
  with
  carteiras(carteira) as (values ('ESPECIAL'), ('DEMAIS ESTADOS')),
  donos as (
    select distinct on (m.carteira) m.carteira, m.user_id, p.full_name
      from public.com_carteira_membros m join public.profiles p on p.id = m.user_id
     where m.tenant_id = v_tenant and m.carteira in (select carteira from carteiras)
     order by m.carteira, m.responsavel desc nulls last, m.created_at
  ),
  -- Os meses que o período toca, cada um recortado pelo período (um personalizado de 10/10 a 20/11 dá 10–31/10 e 01–20/11).
  meses as (
    select m::date as mes, greatest(p_de, m::date) as de, least(p_ate, (m + interval '1 month - 1 day')::date) as ate
      from generate_series(date_trunc('month', p_de), date_trunc('month', p_ate), interval '1 month') m
  ),
  por_mes as (
    select c.carteira, ms.mes, v.venda_total, v.a_confirmar, mt.meta, r.garantida, r.a_confirmar as r_a_confirmar, r.falta
      from carteiras c
     cross join meses ms
     cross join lateral public.com_composicao_da_venda(ms.de, ms.ate, c.carteira, null, null) v
      left join lateral (
        select sum(cm.valor) as meta from public.com_metas cm
         where cm.tenant_id = v_tenant and cm.carteira = c.carteira and make_date(cm.ano, cm.mes, 1) = ms.mes
      ) mt on true
     cross join lateral public.com_comissao_da_carteira(v.venda_total, v.a_confirmar, mt.meta) r
  ),
  da_carteira as (
    select d.user_id, d.full_name, 'carteira'::text as tipo, c.carteira as origem, 0.005::numeric as percentual,
           coalesce(sum(coalesce(pm.venda_total, 0) - coalesce(pm.a_confirmar, 0)), 0) as base_garantida,
           coalesce(sum(coalesce(pm.a_confirmar, 0)), 0) as base_a_confirmar,
           sum(pm.meta) as meta,
           case when count(pm.mes) = 1 then max(pm.falta) end as falta,
           coalesce(sum(pm.garantida), 0) as garantida, coalesce(sum(pm.r_a_confirmar), 0) as a_confirmar
      from carteiras c
      join donos d on d.carteira = c.carteira
      left join por_mes pm on pm.carteira = c.carteira
     group by d.user_id, d.full_name, c.carteira
  ),
  -- CRM: as vendas ganhas no Kommo no período, fora as da equipe (etiqueta "Equipe interna" e afins).
  ganhas as (
    select v.lead_id, v.funil, coalesce(v.valor, 0) as valor, v.fechou, v.documento, u.user_id, u.nome
      from public.mkt_kommo_vendas v
      join public.kommo_usuarios u on u.tenant_id = v.tenant_id and u.kommo_id = v.responsavel and u.user_id is not null
     where v.tenant_id = v_tenant and v.situacao = 'ganha' and v.fechou between p_de and p_ate
       and not exists (select 1 from public.kommo_leads l where l.tenant_id = v_tenant and l.lead_id = v.lead_id and l.interno)
  ),
  -- Distribuidor novo: o cliente do CNPJ não tinha nota de venda antes da janela do 1º pedido (15 dias antes do
  -- fechamento); o 1º pedido é a nota (ou as notas do mesmo dia) mais antiga da janela.
  distribuidor as (
    select g.lead_id, g.user_id, g.nome, g.valor as valor_kommo,
           (select sum(i.valor_nota) from public.com_vendas_itens i
             where i.tenant_id = v_tenant and i.cliente_codigo = c.codigo and i.classe = 'venda'
               and i.emissao = (select min(j.emissao) from public.com_vendas_itens j
                                 where j.tenant_id = v_tenant and j.cliente_codigo = c.codigo and j.classe = 'venda'
                                   and j.emissao between g.fechou - 15 and g.fechou + 7)) as primeira_nota,
           not exists (select 1 from public.com_vendas_itens k
                        where k.tenant_id = v_tenant and k.cliente_codigo = c.codigo and k.classe = 'venda'
                          and k.emissao < g.fechou - 15) as novo
      from ganhas g
      left join public.com_clientes c on c.tenant_id = v_tenant and g.documento is not null
                                     and regexp_replace(coalesce(c.documento, ''), '\D', '', 'g') = g.documento
     where g.funil = 'distribuidor'
  ),
  do_crm as (
    -- Consumidor final e salão: sem a nota da loja no Helpoint, tudo é "a confirmar" pelo valor do Kommo.
    select g.user_id, g.nome, 'crm'::text as tipo,
           case g.funil when 'consumidor' then 'Consumidor final' else 'Salão' end as origem, 0.10::numeric as percentual,
           0::numeric as base_garantida, sum(g.valor) as base_a_confirmar
      from ganhas g where g.funil in ('consumidor', 'salao')
     group by g.user_id, g.nome, g.funil
    union all
    select d.user_id, d.nome, 'crm', 'Novo distribuidor', 0.05,
           coalesce(sum(d.primeira_nota) filter (where d.primeira_nota is not null), 0),
           coalesce(sum(d.valor_kommo) filter (where d.primeira_nota is null), 0)
      from distribuidor d where d.novo
     group by d.user_id, d.nome
  )
  select x.user_id, x.full_name, x.tipo, x.origem, x.percentual, x.base_garantida, x.base_a_confirmar, x.meta, x.falta,
         x.garantida, x.a_confirmar
    from da_carteira x
   where v_todos or x.user_id = auth.uid()
  union all
  select c.user_id, c.nome, c.tipo, c.origem, c.percentual, c.base_garantida, c.base_a_confirmar, null::numeric, null::numeric,
         round(c.base_garantida * c.percentual, 2), round(c.base_a_confirmar * c.percentual, 2)
    from do_crm c
   where v_todos or c.user_id = auth.uid();
end;
$function$;

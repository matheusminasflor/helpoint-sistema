-- A CONFERÊNCIA COMO O FINANCEIRO JÁ USAVA, E OS KPIs POR VENDEDORA (LEVA S). 2026-09-30.
--
-- O dono, com a tela do sistema antigo na mão: "no ato da conferência do Financeiro ele precisa ter
-- o resumo igual era no checklist — resumo do pedido e depois o checklist que o Comercial preencheu"
-- e "KPI do maior vendedor com falha nos pedidos, para sabermos se precisa de treinamento; ao clicar
-- vemos o ranking de erros dele; e um KPI geral de ranking de motivos de recusa".
--
-- 1. A view ganha `criado_por_nome` — o resumo antigo dizia "Enviado em 29/09/26, 15:34 por
--    Jacqueline". Coluna nova no FIM (`create or replace view` só aceita acrescentar).
-- 2. `ped_indicadores` ganha `por_vendedora`: checklists, quantos tiveram recusa, quantas recusas
--    (todas as tentativas — retrabalho não zera, manual §3.4), a taxa e o ranking de motivos DELA.

create or replace view public.ped_checklists_situacao with (security_invoker = on) as
select
  c.id, c.tenant_id, c.interacao_id, c.protocolo, c.versao, c.criado_por, c.criado_em, c.enviado_em,
  c.editado_em, c.contato, c.rota, c.observacao,
  c.vendedor_id, vp.full_name as vendedor_nome, c.cliente_codigo, c.cliente_nome, c.tabela_preco,
  (select count(*) from public.ped_pedidos p where p.checklist_id = c.id)::int as qtd_pedidos,
  (select coalesce(sum(p.valor), 0) from public.ped_pedidos p where p.checklist_id = c.id and p.tipo = 'Venda') as valor_total,
  (select count(*) from public.ped_decisoes d where d.checklist_id = c.id and d.status = 'Recusado')::int as recusas,
  (select coalesce(jsonb_agg(jsonb_build_object('tentativa', d.versao, 'em', d.registrado_em, 'por', dp.full_name,
                                                'motivos', d.motivos, 'observacao', d.observacao) order by d.seq), '[]'::jsonb)
     from public.ped_decisoes d left join public.profiles dp on dp.id = d.registrado_por
    where d.checklist_id = c.id and d.status = 'Recusado') as historico_recusas,
  (select coalesce(jsonb_agg(jsonb_build_object('status', p.status, 'data', p.data_pagamento, 'em', p.registrado_em,
                                                'por', pp.full_name, 'observacao', p.observacao) order by p.seq), '[]'::jsonb)
     from public.ped_pagamentos p left join public.profiles pp on pp.id = p.registrado_por
    where p.checklist_id = c.id) as historico_pagamentos,
  vig.status as retorno_status, vig.motivos as retorno_motivos, vig.observacao as retorno_observacao,
  vig.registrado_em as retorno_em, vigp.full_name as retorno_por,
  case when f.checklist_id is not null then 'Finalizado' else coalesce(vig.status, 'Em análise') end as situacao,
  coalesce(pg.status, case when vig.status = 'Aprovado' then 'Em negociação' end) as pagamento_status,
  pg.data_pagamento as pagamento_data,
  f.registrado_em as finalizado_em, fp.full_name as finalizado_por, f.observacao as finalizado_observacao,
  cp.full_name as criado_por_nome
from public.ped_checklists c
left join public.profiles vp on vp.id = c.vendedor_id
left join lateral (select d.* from public.ped_decisoes d
                    where d.checklist_id = c.id and d.versao = c.versao order by d.seq desc limit 1) vig on true
left join public.profiles vigp on vigp.id = vig.registrado_por
left join lateral (select p.* from public.ped_pagamentos p where p.checklist_id = c.id order by p.seq desc limit 1) pg on true
left join public.ped_finalizacoes f on f.checklist_id = c.id
left join public.profiles fp on fp.id = f.registrado_por
left join public.profiles cp on cp.id = c.criado_por;

create or replace function public.ped_indicadores(p_de date, p_ate date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_resultado jsonb;
begin
  if v_tenant is null or not public.ped_ve_todos() then
    raise exception 'Só quem acompanha a conferência de pedidos vê os indicadores.' using errcode = '42501';
  end if;

  with ck as (
    select c.id, c.cliente_codigo, c.cliente_nome, c.vendedor_id,
           (select coalesce(sum(p.valor), 0) from public.ped_pedidos p where p.checklist_id = c.id and p.tipo = 'Venda') as valor,
           case when exists (select 1 from public.ped_finalizacoes f where f.checklist_id = c.id) then 'Finalizado'
                else coalesce(public.ped_decisao_vigente(c.id), 'Em análise') end as situacao,
           (select count(*) from public.ped_decisoes d where d.checklist_id = c.id and d.status = 'Recusado') as recusas,
           public.ped_ultimo_pagamento(c.id) = 'Pago' as pago
      from public.ped_checklists c
     where c.tenant_id = v_tenant
       and (c.criado_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
  ),
  faturado as (
    select i.cliente_codigo, sum(i.valor_curva) as valor
      from public.com_vendas_itens i
     where i.tenant_id = v_tenant and i.classe in ('venda', 'devolucao')
       and i.emissao between p_de and p_ate
       and i.cliente_codigo in (select ck.cliente_codigo from ck)
     group by i.cliente_codigo
  ),
  por_cliente as (
    select ck.cliente_codigo as codigo, max(ck.cliente_nome) as nome,
           sum(ck.valor) as registrado,
           sum(ck.valor) filter (where ck.situacao in ('Aprovado', 'Finalizado')) as conciliado,
           sum(ck.valor) filter (where ck.pago) as recebido,
           max(f.valor) as faturado
      from ck left join faturado f on f.cliente_codigo = ck.cliente_codigo
     group by ck.cliente_codigo
  ),
  recusas as (
    select ck.vendedor_id, m as motivo
      from public.ped_decisoes d join ck on ck.id = d.checklist_id, unnest(d.motivos) m
     where d.status = 'Recusado'
  ),
  motivos as (
    select motivo, count(*) as vezes from recusas group by motivo
  ),
  por_vendedora as (
    select ck.vendedor_id, coalesce(max(p.full_name), 'Sem nome') as nome,
           count(*) as checklists,
           count(*) filter (where ck.recusas > 0) as com_recusa,
           sum(ck.recusas) as recusas,
           sum(ck.valor) as valor,
           (select coalesce(jsonb_agg(jsonb_build_object('motivo', x.motivo, 'vezes', x.vezes) order by x.vezes desc, x.motivo), '[]'::jsonb)
              from (select r.motivo, count(*) as vezes from recusas r where r.vendedor_id = ck.vendedor_id group by r.motivo) x) as motivos
      from ck left join public.profiles p on p.id = ck.vendedor_id
     group by ck.vendedor_id
  )
  select jsonb_build_object(
    'registrado', (select jsonb_build_object('qtd', count(*), 'valor', coalesce(sum(valor), 0)) from ck),
    'conciliado', (select jsonb_build_object('qtd', count(*), 'valor', coalesce(sum(valor), 0)) from ck
                    where situacao in ('Aprovado', 'Finalizado')),
    'pendente', (select jsonb_build_object('qtd', count(*), 'valor', coalesce(sum(valor), 0)) from ck
                  where situacao in ('Em análise', 'Recusado')),
    'divergente', (select jsonb_build_object('qtd', count(*), 'valor', coalesce(sum(valor), 0)) from ck where recusas > 0),
    'recebido', (select jsonb_build_object('qtd', count(*), 'valor', coalesce(sum(valor), 0)) from ck where pago),
    'percentual_conciliacao', (select case when sum(valor) > 0
                                        then round(100 * coalesce(sum(valor) filter (where situacao in ('Aprovado', 'Finalizado')), 0) / sum(valor), 1)
                                      end from ck),
    'faturado', (select coalesce(sum(valor), 0) from faturado),
    'motivos', (select coalesce(jsonb_agg(jsonb_build_object('motivo', motivo, 'vezes', vezes) order by vezes desc, motivo), '[]'::jsonb) from motivos),
    'por_vendedora', (select coalesce(jsonb_agg(jsonb_build_object(
                        'vendedor_id', vendedor_id, 'nome', nome, 'checklists', checklists, 'com_recusa', com_recusa,
                        'recusas', recusas, 'valor', valor,
                        'taxa', round(100.0 * com_recusa / nullif(checklists, 0), 1), 'motivos', motivos)
                        order by recusas desc, com_recusa desc, nome), '[]'::jsonb) from por_vendedora),
    'por_cliente', (select coalesce(jsonb_agg(jsonb_build_object(
                      'codigo', codigo, 'nome', nome, 'registrado', registrado,
                      'conciliado', coalesce(conciliado, 0), 'recebido', coalesce(recebido, 0),
                      'faturado', coalesce(faturado, 0)) order by registrado desc), '[]'::jsonb) from por_cliente)
  ) into v_resultado;

  return v_resultado;
end;
$$;

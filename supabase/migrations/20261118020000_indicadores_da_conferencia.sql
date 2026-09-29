-- OS INDICADORES DA CONFERÊNCIA DE PEDIDOS (LEVA S, parte 5). 2026-09-29.
--
-- O pedido do dono (anexo de `docs/manual-checklist-pedidos.md`, 18.4 e 18.5): um painel com vendas
-- registradas pelo Comercial, vendas conciliadas, pendências, divergências, recebimentos confirmados
-- e o percentual de conciliação — distinguindo venda registrada, faturamento fiscal e valor recebido.
--
-- AS DEFINIÇÕES (todas sobre os checklists ENVIADOS no período, pela data do Brasil — uma safra só,
-- para as colunas somarem o mesmo universo):
--   registrado  → todo checklist; valor = pedidos tipo Venda (manual §6.7)
--   conciliado  → o Financeiro conferiu e aprovou (Aprovado ou Finalizado)
--   pendente    → ainda sem conferência aprovada: Em análise ou Recusado
--   divergente  → teve ao menos uma recusa, em qualquer tentativa (o retrabalho não zera)
--   recebido    → pagamento registrado como Pago
--   % conciliação = valor conciliado ÷ valor registrado
--   faturado    → a nota fiscal do Forteplus (`com_vendas_itens`, venda − devolução, a mesma conta de
--                 `com_conciliacao`), emitida no período, para os clientes que têm checklist nele.
--                 A nota não traz o número do pedido: o cruzamento é por cliente e período, e é
--                 MOSTRADO, não ajustado.
--
-- Quem vê: quem vê todos os checklists (`ped_ve_todos` — Financeiro com a permissão, gestor do
-- Comercial, Diretoria, admin). `security definer` porque o faturamento vem de tabela do Comercial,
-- e o Financeiro recebe só a soma, nunca a nota.
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
    select c.id, c.cliente_codigo, c.cliente_nome,
           (select coalesce(sum(p.valor), 0) from public.ped_pedidos p where p.checklist_id = c.id and p.tipo = 'Venda') as valor,
           case when exists (select 1 from public.ped_finalizacoes f where f.checklist_id = c.id) then 'Finalizado'
                else coalesce(public.ped_decisao_vigente(c.id), 'Em análise') end as situacao,
           exists (select 1 from public.ped_decisoes d where d.checklist_id = c.id and d.status = 'Recusado') as teve_recusa,
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
  motivos as (
    select m as motivo, count(*) as vezes
      from public.ped_decisoes d join ck on ck.id = d.checklist_id, unnest(d.motivos) m
     where d.status = 'Recusado'
     group by m
  )
  select jsonb_build_object(
    'registrado', (select jsonb_build_object('qtd', count(*), 'valor', coalesce(sum(valor), 0)) from ck),
    'conciliado', (select jsonb_build_object('qtd', count(*), 'valor', coalesce(sum(valor), 0)) from ck
                    where situacao in ('Aprovado', 'Finalizado')),
    'pendente', (select jsonb_build_object('qtd', count(*), 'valor', coalesce(sum(valor), 0)) from ck
                  where situacao in ('Em análise', 'Recusado')),
    'divergente', (select jsonb_build_object('qtd', count(*), 'valor', coalesce(sum(valor), 0)) from ck where teve_recusa),
    'recebido', (select jsonb_build_object('qtd', count(*), 'valor', coalesce(sum(valor), 0)) from ck where pago),
    'percentual_conciliacao', (select case when sum(valor) > 0
                                        then round(100 * coalesce(sum(valor) filter (where situacao in ('Aprovado', 'Finalizado')), 0) / sum(valor), 1)
                                      end from ck),
    'faturado', (select coalesce(sum(valor), 0) from faturado),
    'motivos', (select coalesce(jsonb_agg(jsonb_build_object('motivo', motivo, 'vezes', vezes) order by vezes desc, motivo), '[]'::jsonb) from motivos),
    'por_cliente', (select coalesce(jsonb_agg(jsonb_build_object(
                      'codigo', codigo, 'nome', nome, 'registrado', registrado,
                      'conciliado', coalesce(conciliado, 0), 'recebido', coalesce(recebido, 0),
                      'faturado', coalesce(faturado, 0)) order by registrado desc), '[]'::jsonb) from por_cliente)
  ) into v_resultado;

  return v_resultado;
end;
$$;

revoke all on function public.ped_indicadores(date, date) from public, anon;
grant execute on function public.ped_indicadores(date, date) to authenticated;

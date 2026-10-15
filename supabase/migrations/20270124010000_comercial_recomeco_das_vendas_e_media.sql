-- COMERCIAL: RECOMEÇAR AS VENDAS DO FORTEPLUS, MÉDIA DE 12 E 3 MESES, CLIENTES SEM CARTEIRA (dono, 2026-10-15).
-- A revisão (artifact "Revisão do Comercial Minasflor") conferiu a Daniele (1096) nota por nota contra os PDFs do
-- Forteplus: NENHUMA nota batia, e havia uma "série 75" com números de notas da série 1. O leitor do Helpoint está
-- certo (bate com o "Totais" impresso); o ARQUIVO da primeira importação saiu consolidado. Decisões do dono:
--   1. apagar TODAS as vendas importadas e recomeçar: ele reimporta por ano e por filial (séries 1 e 75 no mesmo
--      arquivo, em Excel, com as devoluções) e, depois, importa toda sexta às 17h o mês corrente com "substituir".
--      Ficam o cadastro de clientes, as carteiras, os lançamentos e os checklists;
--   2. Carteira: média mensal de 12 meses e dos últimos 3 meses, lado a lado, divididas pelo período inteiro (o mês
--      sem compra conta) — o padrão de gestão de carteira: a de 12 é a base, a de 3 a tendência. "12 meses" passa a
--      somar na mesma base da média (o Forteplus até a última nota importada; depois, o lançamento com nota);
--   3. clientes sem carteira: UF MG vai para a carteira MG; outra UF (inclusive exterior), para DEMAIS ESTADOS; sem UF
--      fica sem carteira (Configurações › Cadastro de clientes › "Sem carteira").

-- ─── 1. A Carteira com a média de 12 meses ───────────────────────────────────────────────────────
drop function if exists public.com_acompanhamento_da_carteira(text, date);
create function public.com_acompanhamento_da_carteira(p_carteira text, p_competencia date)
returns table(grupo_chave text, grupo_nome text, codigos text[], tabelas text, uf_cidade text, situacao text,
              ultima_compra date, dias_sem_comprar integer, faturado_12m numeric, meses_com_compra integer,
              media_meses_compra numeric, recompra boolean, venda_mes numeric, contatos_mes integer, ultimo_contato date,
              status_ultimo_contato text, proximo_prazo date, observacao text,
              venda_mes_passado numeric, faturado_mes numeric, a_faturar numeric, media_3m numeric, media_12m numeric)
language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_carteira text := public.normalizar_nome_carteira(p_carteira);
  v_de date := date_trunc('month', p_competencia)::date;
  v_ate date := (date_trunc('month', p_competencia) + interval '1 month')::date;
  v_de_passado date := (date_trunc('month', p_competencia) - interval '1 month')::date;
  -- "Hoje" do Brasil, ou o fim do mês se ele já passou — como no painel (lição 10).
  v_ref date := least((now() at time zone 'America/Sao_Paulo')::date, (v_ate - 1));
  -- Faturado manda (20261202030000): o Forteplus até a última nota importada; depois, o lançamento com nota.
  v_corte date := public.com_faturado_importado_ate();
begin
  if v_tenant is null or not public.com_pode_ver_carteira(p_carteira) then
    raise exception 'Você não tem acesso a esta carteira.' using errcode = '42501';
  end if;

  return query
  with clientes as (
    select c.codigo, c.razao_social, c.tabela_preco, c.cidade, c.estado,
           public.com_chave_do_grupo(c.grupo, c.codigo) as chave,
           coalesce(nullif(btrim(c.grupo), ''), c.razao_social) as nome
      from public.com_clientes c
     where c.tenant_id = v_tenant and c.carteira = v_carteira
  ),
  -- Histórico do Forteplus: vendas (não bonificação) dos 12 meses ANTERIORES à competência.
  historico as (
    select cl.chave,
           sum(vi.valor_nota) as faturado,
           count(distinct vi.competencia)::int as meses
      from clientes cl
      join public.com_vendas_itens vi
        on vi.tenant_id = v_tenant and vi.cliente_codigo = cl.codigo
     where vi.classe = 'venda' and vi.valor_nota > 0
       and vi.competencia >= (v_de - interval '12 months')::date and vi.competencia < v_de
     group by cl.chave
  ),
  -- Última compra consolidada (§10): o faturado e o lançamento com nota, a mais recente.
  ultima as (
    select cl.chave,
           greatest(
             (select max(vi.emissao) from public.com_vendas_itens vi
               where vi.tenant_id = v_tenant and vi.cliente_codigo = cl.codigo
                 and vi.classe = 'venda' and vi.valor_nota > 0 and vi.emissao <= v_ref),
             (select max(i.nota_em) from public.com_interacoes i
               where i.tenant_id = v_tenant and i.cliente_codigo = cl.codigo
                 and i.valor_venda > 0 and i.nota_em <= v_ref)
           ) as data
      from clientes cl
  ),
  ultima_grupo as (
    select u.chave, max(u.data) as data from ultima u group by u.chave
  ),
  -- Comprado no mês e no mês passado: o Forteplus até o corte, o lançamento com nota depois dele.
  comprado as (
    select cl.chave,
           coalesce((select sum(vi.valor_curva) from public.com_vendas_itens vi
                      where vi.tenant_id = v_tenant and vi.cliente_codigo = cl.codigo
                        and vi.classe in ('venda', 'devolucao') and v_corte is not null
                        and vi.emissao >= v_de and vi.emissao < v_ate and vi.emissao <= v_corte), 0)
         + coalesce((select sum(i.valor_venda) from public.com_interacoes i
                      where i.tenant_id = v_tenant and i.cliente_codigo = cl.codigo and i.valor_venda > 0
                        and i.nota_em >= v_de and i.nota_em < v_ate and (v_corte is null or i.nota_em > v_corte)), 0) as mes,
           coalesce((select sum(vi.valor_curva) from public.com_vendas_itens vi
                      where vi.tenant_id = v_tenant and vi.cliente_codigo = cl.codigo
                        and vi.classe in ('venda', 'devolucao') and v_corte is not null
                        and vi.emissao >= v_de_passado and vi.emissao < v_de and vi.emissao <= v_corte), 0)
         + coalesce((select sum(i.valor_venda) from public.com_interacoes i
                      where i.tenant_id = v_tenant and i.cliente_codigo = cl.codigo and i.valor_venda > 0
                        and i.nota_em >= v_de_passado and i.nota_em < v_de and (v_corte is null or i.nota_em > v_corte)), 0) as passado,
           -- Média dos 3 meses completos antes da competência, ÷ 3 com o mês sem compra (dono, 2026-10-15).
           (coalesce((select sum(vi.valor_curva) from public.com_vendas_itens vi
                       where vi.tenant_id = v_tenant and vi.cliente_codigo = cl.codigo
                         and vi.classe in ('venda', 'devolucao') and v_corte is not null
                         and vi.emissao >= (v_de - interval '3 months')::date and vi.emissao < v_de and vi.emissao <= v_corte), 0)
          + coalesce((select sum(i.valor_venda) from public.com_interacoes i
                       where i.tenant_id = v_tenant and i.cliente_codigo = cl.codigo and i.valor_venda > 0
                         and i.nota_em >= (v_de - interval '3 months')::date and i.nota_em < v_de
                         and (v_corte is null or i.nota_em > v_corte)), 0)) as tres,
           -- E a dos 12 meses completos (÷ 12): a base do cliente, imune à sazonalidade (dono, 2026-10-15).
           (coalesce((select sum(vi.valor_curva) from public.com_vendas_itens vi
                       where vi.tenant_id = v_tenant and vi.cliente_codigo = cl.codigo
                         and vi.classe in ('venda', 'devolucao') and v_corte is not null
                         and vi.emissao >= (v_de - interval '12 months')::date and vi.emissao < v_de and vi.emissao <= v_corte), 0)
          + coalesce((select sum(i.valor_venda) from public.com_interacoes i
                       where i.tenant_id = v_tenant and i.cliente_codigo = cl.codigo and i.valor_venda > 0
                         and i.nota_em >= (v_de - interval '12 months')::date and i.nota_em < v_de
                         and (v_corte is null or i.nota_em > v_corte)), 0)) as doze,
           -- Faturado do mês pelo lançamento: as notas postas pelas vendedoras.
           coalesce((select sum(i.valor_venda) from public.com_interacoes i
                      where i.tenant_id = v_tenant and i.cliente_codigo = cl.codigo and i.valor_venda > 0
                        and i.nota_em >= v_de and i.nota_em < v_ate), 0) as faturado,
           -- A faturar: o pedido fechado no lançamento do mês que ainda não tem nota.
           coalesce((select sum(p.valor) from public.com_interacoes i
                      join public.ped_checklists ck on ck.interacao_id = i.id
                      join public.ped_pedidos p on p.checklist_id = ck.id and p.tipo = 'Venda'
                      where i.tenant_id = v_tenant and i.cliente_codigo = cl.codigo and i.nota_fiscal is null
                        and i.data >= v_de and i.data < v_ate), 0) as a_faturar
      from clientes cl
  ),
  comprado_grupo as (
    select c.chave, sum(c.mes) as mes, sum(c.passado) as passado, sum(c.faturado) as faturado, sum(c.a_faturar) as a_faturar,
           sum(c.tres) as tres, sum(c.doze) as doze
      from comprado c group by c.chave
  ),
  -- O mês, dos lançamentos de QUALQUER vendedora para os clientes desta carteira.
  mes as (
    select cl.chave, i.*
      from clientes cl
      join public.com_interacoes i on i.tenant_id = v_tenant and i.cliente_codigo = cl.codigo
     where i.data >= v_de and i.data < v_ate
  ),
  mes_grupo as (
    select m.chave, count(*)::int as contatos from mes m group by m.chave
  ),
  -- O último contato do mês, com o status, o prazo e a observação dele (§8.2, colunas Q–U).
  ultimo as (
    select distinct on (m.chave) m.chave, m.data, m.status, m.prazo, m.observacoes
      from mes m
     order by m.chave, m.data desc, m.created_at desc
  )
  select g.chave,
         min(g.nome),
         array_agg(g.codigo order by g.codigo),
         string_agg(distinct g.tabela_preco, ', '),
         string_agg(distinct nullif(concat_ws(' - ', g.estado, g.cidade), ''), '; '),
         case
           when ug.data is null then 'nunca_comprou'
           when v_ref - ug.data <= 120 then 'ativo'
           else 'inativo'
         end,
         ug.data,
         (v_ref - ug.data)::int,
         -- "12 meses" na mesma base da média (Forteplus até o corte + notas lançadas depois), não só o Forteplus.
         coalesce(cg.doze, 0),
         coalesce(h.meses, 0),
         case when coalesce(h.meses, 0) > 0 then round(h.faturado / h.meses, 2) end,
         coalesce(h.meses, 0) >= 2,
         coalesce(cg.mes, 0),
         coalesce(mg.contatos, 0),
         ul.data,
         ul.status,
         ul.prazo,
         ul.observacoes,
         coalesce(cg.passado, 0),
         coalesce(cg.faturado, 0),
         coalesce(cg.a_faturar, 0),
         round(coalesce(cg.tres, 0) / 3, 2),
         round(coalesce(cg.doze, 0) / 12, 2)
    from clientes g
    left join historico h on h.chave = g.chave
    left join ultima_grupo ug on ug.chave = g.chave
    left join comprado_grupo cg on cg.chave = g.chave
    left join mes_grupo mg on mg.chave = g.chave
    left join ultimo ul on ul.chave = g.chave
   group by g.chave, ug.data, h.faturado, h.meses, cg.mes, cg.passado, cg.faturado, cg.a_faturar, cg.tres, cg.doze, mg.contatos,
            ul.data, ul.status, ul.prazo, ul.observacoes
   order by coalesce(cg.doze, 0) desc, min(g.nome);
end;
$function$;
revoke all on function public.com_acompanhamento_da_carteira(text, date) from public, anon;
grant execute on function public.com_acompanhamento_da_carteira(text, date) to authenticated;

-- ─── 2. Clientes sem carteira ────────────────────────────────────────────────────────────────────
-- Uma vez, agora: o cliente novo continua nascendo sem carteira, e quem distribui é o Cadastro de clientes.
update public.com_clientes
   set carteira = case when upper(btrim(estado)) = 'MG' then 'MG' else 'DEMAIS ESTADOS' end
 where carteira is null and nullif(btrim(estado), '') is not null;

-- ─── 3. Recomeçar as vendas do Forteplus ─────────────────────────────────────────────────────────
delete from public.com_vendas_itens_espera;
delete from public.com_vendas_itens;
delete from public.com_vendas_competencias;
delete from public.com_vendas_importacoes where tipo = 'vendas';

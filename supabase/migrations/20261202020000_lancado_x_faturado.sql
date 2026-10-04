-- INFORMADO × FATURADO, LADO A LADO (decisão do dono, 2026-10-03).
--
-- Dois números de venda convivem no Comercial: o que a vendedora DIGITOU no lançamento
-- (`com_interacoes.valor_venda`) e o que foi FATURADO (a nota fiscal importada do Forteplus,
-- `com_vendas_itens`). O dono pediu uma lista lado a lado — "Informado × Faturado × Diferença",
-- por vendedora e por cliente, num período.
--
-- O CORTE. A importação é semanal, mensal ou quando der: o faturado só existe até a última nota
-- importada. Lançamento depois dessa data ainda não tem nota para comparar — se entrasse na
-- diferença, ela cresceria só porque a importação não chegou. Então o lançado se divide em dois:
--   * `lancado_ate_corte` — compara com o faturado;
--   * `lancado_previa` — depois do corte, "prévia (ainda não importado)", em coluna própria.
-- O corte é a maior emissão importada da empresa, nas duas filiais.
-- ponytail: um corte só para as duas filiais. O teto: se uma filial importar até o dia 30 e a
-- outra até o dia 15, o faturado da segunda entre 16 e 30 falta e a diferença dela cresce. A
-- saída é corte por filial — o lançamento não tem filial, então isso pede decisão do dono.
--
-- A QUEM O FATURADO PERTENCE NESTA LISTA. A nota é do cliente; o lançamento é da vendedora. Cada
-- linha é (vendedora, cliente) e o faturado da linha é o do CLIENTE no período — o que a
-- vendedora informou contra o que aquele cliente faturou. Quando duas vendedoras lançaram para o
-- mesmo cliente, as duas linhas mostram o mesmo faturado, marcadas `compartilhado`; a tela soma
-- o total geral por cliente, nunca por linha. Atribuir a nota a uma vendedora (por carteira,
-- por exemplo) é a outra decisão do dono, e vive nos Indicadores — não aqui.
--
-- Cliente com faturado e SEM lançamento no período também aparece, com vendedora nula ("sem
-- lançamento"): nada fica escondido. Só gestor (quem gere carteiras) e Diretoria veem essas
-- linhas; a vendedora vê só as dela — o mesmo critério de `com_vendedoras_do_painel`.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Até quando o faturado foi importado
-- ─────────────────────────────────────────────────────────────────────────────
-- `security definer` de propósito: com "a vendedora só vê a carteira dela" ligada, a RLS de
-- `com_vendas_itens` esconde as notas dos outros clientes, e o `max` visível a ela seria a última
-- compra de UM cliente dela — o corte andaria para trás e a prévia incharia. A data da última
-- importação não é dado sensível; o filtro de empresa e de módulo fica aqui dentro.
create or replace function public.com_faturado_importado_ate()
returns date
language sql
stable
security definer
set search_path = public
as $$
  select max(i.emissao)
    from public.com_vendas_itens i
   where i.tenant_id = public.get_user_tenant_id()
     and (public.has_comercial_access(auth.uid()) or public.has_diretoria_access(auth.uid()));
$$;

comment on function public.com_faturado_importado_ate() is
  'A maior emissão importada da empresa (as duas filiais): até onde o faturado existe. 2026-10-03.';

revoke all on function public.com_faturado_importado_ate() from public, anon;
grant execute on function public.com_faturado_importado_ate() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. A lista lado a lado
-- ─────────────────────────────────────────────────────────────────────────────
-- Lançado = o que os Indicadores já somam: status `concluido`, valor > 0, com cliente.
-- Faturado = o que a ficha soma em "comprou": classe venda e devolução, `valor_curva` (a
-- devolução entra negativa), emissão entre `p_de` e o menor de `p_ate` e o corte.
create or replace function public.com_lancado_x_faturado(p_de date, p_ate date)
returns table (
  vendedor_id uuid, vendedor_nome text, cliente_codigo text, cliente_nome text,
  lancado_ate_corte numeric, lancado_previa numeric, faturado numeric, diferenca numeric,
  corte date, compartilhado boolean
)
language plpgsql
stable
security invoker
set search_path = public
as $$
#variable_conflict use_column
-- As colunas de saída têm os nomes das colunas das tabelas; dentro da consulta, coluna ganha.
declare
  v_corte date := public.com_faturado_importado_ate();
begin
  if p_de is null or p_ate is null or p_de > p_ate then
    raise exception 'Período inválido: % a %.', p_de, p_ate using errcode = '22023';
  end if;

  return query
  with lanc as (
    select i.vendedor_id, i.cliente_codigo,
           coalesce(sum(i.valor_venda) filter (where v_corte is not null and i.data <= v_corte), 0) as ate_corte,
           coalesce(sum(i.valor_venda) filter (where v_corte is null or i.data > v_corte), 0) as previa
      from public.com_interacoes i
     where i.tenant_id = public.get_user_tenant_id()
       and i.data between p_de and p_ate
       and i.status = 'concluido' and i.valor_venda > 0
       and i.cliente_codigo is not null
     group by i.vendedor_id, i.cliente_codigo
  ),
  fat as (
    -- Sem corte (nada importado), nada faturado: `v_corte is not null` não deixa o `least`
    -- ignorar o nulo e cair em `p_ate`.
    select v.cliente_codigo, sum(v.valor_curva) as valor
      from public.com_vendas_itens v
     where v.tenant_id = public.get_user_tenant_id()
       and v_corte is not null
       and v.classe in ('venda', 'devolucao')
       and v.emissao between p_de and least(p_ate, v_corte)
     group by v.cliente_codigo
  ),
  quantas as (
    select l.cliente_codigo, count(*) as n from lanc l group by l.cliente_codigo
  ),
  linhas as (
    select l.vendedor_id, coalesce(l.cliente_codigo, f.cliente_codigo) as cliente_codigo,
           coalesce(l.ate_corte, 0) as ate_corte, coalesce(l.previa, 0) as previa,
           coalesce(f.valor, 0) as faturado
      from lanc l
      full join fat f on f.cliente_codigo = l.cliente_codigo
  )
  select x.vendedor_id,
         coalesce(nullif(btrim(pr.full_name), ''), pr.email)::text,
         x.cliente_codigo,
         coalesce(c.razao_social, x.cliente_codigo)::text,
         x.ate_corte::numeric, x.previa::numeric, x.faturado::numeric,
         (x.ate_corte - x.faturado)::numeric,
         v_corte,
         coalesce(q.n, 0) > 1
    from linhas x
    left join public.profiles pr on pr.id = x.vendedor_id
    left join public.com_clientes c on c.tenant_id = public.get_user_tenant_id() and c.codigo = x.cliente_codigo
    left join quantas q on q.cliente_codigo = x.cliente_codigo
   where x.vendedor_id = auth.uid()
      or public.com_pode_gerir_carteiras()
      or public.has_diretoria_access(auth.uid())
   order by abs(x.ate_corte - x.faturado) desc, x.cliente_codigo;
end;
$$;

comment on function public.com_lancado_x_faturado(date, date) is
  'Informado × faturado por (vendedora, cliente), com o lançado depois do corte em prévia. Decisão do dono, 2026-10-03.';

revoke all on function public.com_lancado_x_faturado(date, date) from public, anon;
grant execute on function public.com_lancado_x_faturado(date, date) to authenticated;

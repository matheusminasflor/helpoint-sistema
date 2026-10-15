-- DIRETORIA: O REALIZADO VEM DAS VENDAS, IGUAL AO COMERCIAL (dono, 2026-10-15). Depois de apagar as vendas do
-- Forteplus, a Diretoria continuou mostrando venda: o realizado dela vinha de `metas_carteira`/`metas_ano`, o histórico
-- da planilha antiga (HISTORICO_METAS.json, 2022 a 2026) e o que o diretor digitava. O dono: "apaga tudo, e valer o que
-- for reimportado agora igual do Comercial". Então:
--   1. o histórico da planilha antiga sai inteiro (realizado e metas importadas); ficam as metas que o diretor DEFINE
--      no sistema (`com_metas`);
--   2. o realizado por carteira e o total da empresa passam a ser CALCULADOS, com a regra da Carteira: o Forteplus
--      (venda menos devolução) até a última nota importada, e depois dela o lançamento com nota fiscal. Um número só;
--   3. a grade de digitar realizado e a Conciliação (informado × ERP) saem da tela — sem informado, não há o que
--      conciliar.
-- ponytail: `metas_carteira`, `metas_ano` e `com_conciliacao` ficam no banco, vazias e sem tela; sair de vez é uma
-- limpeza à parte, quando ninguém mais lembrar delas.

delete from public.metas_carteira;
delete from public.metas_ano;
delete from public.com_vendas_importacoes where tipo = 'metas';

/** O realizado por carteira e mês, dos anos pedidos: o Forteplus até o corte e, depois, o lançamento com nota. */
create or replace function public.dir_realizado_carteiras(p_anos integer[])
returns table(ano integer, mes integer, carteira text, realizado numeric)
language sql stable security definer set search_path = public as $$
  with c as (select public.com_faturado_importado_ate() as d),
  vendas as (
    select extract(year from v.emissao)::int as ano, extract(month from v.emissao)::int as mes, cl.carteira, v.valor_curva as valor
      from public.com_vendas_itens v
      cross join c
      join public.com_clientes cl on cl.tenant_id = v.tenant_id and cl.codigo = v.cliente_codigo
     where v.tenant_id = public.get_user_tenant_id() and c.d is not null and v.emissao <= c.d
       and v.classe in ('venda', 'devolucao') and cl.carteira is not null
       and extract(year from v.emissao)::int = any (p_anos)
    union all
    select extract(year from i.nota_em)::int, extract(month from i.nota_em)::int, cl.carteira, i.valor_venda
      from public.com_interacoes i
      cross join c
      join public.com_clientes cl on cl.tenant_id = i.tenant_id and cl.codigo = i.cliente_codigo
     where i.tenant_id = public.get_user_tenant_id() and i.valor_venda > 0
       and (c.d is null or i.nota_em > c.d) and cl.carteira is not null
       and extract(year from i.nota_em)::int = any (p_anos)
  )
  select x.ano, x.mes, x.carteira, round(sum(x.valor), 2)
    from vendas x
   where public.has_comercial_access(auth.uid()) or public.has_diretoria_access(auth.uid())
   group by x.ano, x.mes, x.carteira
   order by x.ano, x.mes, x.carteira;
$$;
revoke all on function public.dir_realizado_carteiras(integer[]) from public, anon;
grant execute on function public.dir_realizado_carteiras(integer[]) to authenticated;

/** O total da empresa por mês (todo cliente, com ou sem carteira), na mesma regra. `meta` fica nula: a meta é `com_metas`. */
create or replace function public.dir_realizado_total(p_anos integer[])
returns table(ano integer, mes integer, total_realizado numeric, meta numeric)
language sql stable security definer set search_path = public as $$
  with c as (select public.com_faturado_importado_ate() as d),
  vendas as (
    select extract(year from v.emissao)::int as ano, extract(month from v.emissao)::int as mes, v.valor_curva as valor
      from public.com_vendas_itens v
      cross join c
     where v.tenant_id = public.get_user_tenant_id() and c.d is not null and v.emissao <= c.d
       and v.classe in ('venda', 'devolucao')
       and extract(year from v.emissao)::int = any (p_anos)
    union all
    select extract(year from i.nota_em)::int, extract(month from i.nota_em)::int, i.valor_venda
      from public.com_interacoes i
      cross join c
     where i.tenant_id = public.get_user_tenant_id() and i.valor_venda > 0
       and (c.d is null or i.nota_em > c.d)
       and extract(year from i.nota_em)::int = any (p_anos)
  )
  select x.ano, x.mes, round(sum(x.valor), 2), null::numeric
    from vendas x
   where public.has_comercial_access(auth.uid()) or public.has_diretoria_access(auth.uid())
   group by x.ano, x.mes
   order by x.ano, x.mes;
$$;
revoke all on function public.dir_realizado_total(integer[]) from public, anon;
grant execute on function public.dir_realizado_total(integer[]) to authenticated;

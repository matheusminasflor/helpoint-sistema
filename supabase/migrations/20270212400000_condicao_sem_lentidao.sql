-- A consulta do cliente linha a linha deixou o cashback do ano em 46 s (medido em produção, 2026-11-05). A tabela de preço
-- passa a vir de um join, uma vez só, e a regra pode ser embutida pelo Postgres na consulta.
create or replace function public.com_parte_da_condicao(p_tabela text, p_dia date)
returns numeric language sql immutable as $$
  select case
    when p_dia >= date '2026-10-01'
     and upper(btrim(p_tabela)) in ('VIP MAIS CONDICAO', 'VIP MAIS CONDIÇÃO', 'ATACADISTA CONDICAO', 'ATACADISTA CONDIÇÃO', 'VIP CONDICAO', 'VIP CONDIÇÃO')
    then 1 else 0 end::numeric;
$$;

create or replace function pg_temp.troca(p_funcao regprocedure, p_pares text[][])
returns void language plpgsql as $$
declare
  v_def text := pg_get_functiondef(p_funcao);
  i int;
begin
  for i in 1 .. array_length(p_pares, 1) loop
    if position(p_pares[i][1] in v_def) = 0 then
      raise exception 'trecho não encontrado em %: %', p_funcao, left(p_pares[i][1], 80);
    end if;
    v_def := replace(v_def, p_pares[i][1], p_pares[i][2]);
  end loop;
  execute v_def;
end;
$$;

select pg_temp.troca('public.com_cashback_mensal(integer, text, text, date, date, text)', array[
  ['coalesce(sum(i.valor_curva * (1 + public.com_parte_do_cliente(i.cliente_codigo, i.competencia))), 0) as comprado',
   'coalesce(sum(i.valor_curva * (1 + public.com_parte_da_condicao(cc.tabela_preco, i.competencia))), 0) as comprado'],
  ['from public.com_vendas_itens i',
   'from public.com_vendas_itens i left join public.com_clientes cc on cc.tenant_id = i.tenant_id and cc.codigo = i.cliente_codigo'],
  ['select b.cliente_codigo, b.competencia, b.comprado, c.razao_social, c.tabela_base',
   'select b.cliente_codigo, b.competencia, b.comprado, c.razao_social, c.tabela_base, c.tabela_preco'],
  ['select coalesce(sum(s.valor_curva * (1 + public.com_parte_do_cliente(s.cliente_codigo, s.competencia))), 0)',
   'select coalesce(sum(s.valor_curva), 0) * (1 + public.com_parte_da_condicao(ct.tabela_preco, (ct.competencia + interval ''1 month'')::date))']
]);

select pg_temp.troca('public.dir_realizado_total(integer[])', array[
  ['v.valor_curva * (1 + public.com_parte_do_cliente(v.cliente_codigo, v.emissao)) as valor',
   'v.valor_curva * (1 + public.com_parte_da_condicao(cl.tabela_preco, v.emissao)) as valor'],
  ['from public.com_vendas_itens v',
   'from public.com_vendas_itens v left join public.com_clientes cl on cl.tenant_id = v.tenant_id and cl.codigo = v.cliente_codigo']
]);

select pg_temp.troca('public.com_composicao_da_venda(date, date, text, text, text)', array[
  ['select u.codigo, u.valor, 1 + public.com_parte_do_cliente(u.codigo, u.dia) as fator',
   'select u.codigo, u.valor, 1 + public.com_parte_da_condicao(cl.tabela_preco, u.dia) as fator'],
  ['from public.com_vendas_unificadas(v_codigos, p_de, p_ate + 1, nullif(upper(btrim(p_filial)), '''')) u',
   'from public.com_vendas_unificadas(v_codigos, p_de, p_ate + 1, nullif(upper(btrim(p_filial)), '''')) u left join public.com_clientes cl on cl.tenant_id = v_tenant and cl.codigo = u.codigo']
]);

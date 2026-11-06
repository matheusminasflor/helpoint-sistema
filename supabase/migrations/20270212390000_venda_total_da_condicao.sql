-- Venda total da condição (dono, 2026-11-05): nas tabelas VIP MAIS CONDIÇÃO, ATACADISTA CONDIÇÃO e VIP CONDIÇÃO, o que
-- foi faturado é só parte da venda; o restante, de igual valor, foi pago por fora. De outubro de 2026 em diante, Carteira,
-- Indicadores, metas e cashback leem a Venda total (Faturado + Condição). `com_vendas_itens` não muda: a nota importada
-- continua igual ao Forteplus, e os relatórios de faturamento e de produto continuam no faturado.

-- 1 para quem tem a parte da condição, 0 para os demais. A regra mora só aqui.
create or replace function public.com_parte_da_condicao(p_tabela text, p_dia date)
returns numeric language sql immutable set search_path to 'public' as $$
  select case
    when p_dia >= date '2026-10-01'
     and upper(btrim(p_tabela)) in ('VIP MAIS CONDICAO', 'VIP MAIS CONDIÇÃO', 'ATACADISTA CONDICAO', 'ATACADISTA CONDIÇÃO', 'VIP CONDICAO', 'VIP CONDIÇÃO')
    then 1 else 0 end::numeric;
$$;

create or replace function public.com_parte_do_cliente(p_codigo text, p_dia date)
returns numeric language sql stable set search_path to 'public' as $$
  select coalesce((select public.com_parte_da_condicao(c.tabela_preco, p_dia) from public.com_clientes c
                    where c.tenant_id = public.get_user_tenant_id() and c.codigo = p_codigo), 0);
$$;

revoke all on function public.com_parte_da_condicao(text, date) from public, anon;
revoke all on function public.com_parte_do_cliente(text, date) from public, anon;
grant execute on function public.com_parte_da_condicao(text, date) to authenticated;
grant execute on function public.com_parte_do_cliente(text, date) to authenticated;

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

-- Carteira: a venda do cliente, o mês a mês e o Raio-X.
select pg_temp.troca('public.com_vendas_unificadas(text[], date, date, text)', array[
  ['select vi.cliente_codigo, vi.emissao, vi.valor_curva',
   'select vi.cliente_codigo, vi.emissao, vi.valor_curva * (1 + public.com_parte_da_condicao(cl.tabela_preco, vi.emissao))'],
  ['from public.com_vendas_itens vi, corte',
   'from public.com_vendas_itens vi cross join corte left join public.com_clientes cl on cl.tenant_id = vi.tenant_id and cl.codigo = vi.cliente_codigo'],
  ['select i.cliente_codigo, i.nota_em, i.valor_venda',
   'select i.cliente_codigo, i.nota_em, i.valor_venda * (1 + public.com_parte_do_cliente(i.cliente_codigo, i.nota_em))']
]);

-- Indicadores: o realizado de cada vendedora e de cada carteira.
select pg_temp.troca('public.com_venda_atribuida(date, date)', array[
  ['sum(v.valor_curva) as faturado', 'sum(v.valor_curva * (1 + public.com_parte_da_condicao(cl.tabela_preco, v.emissao))) as faturado'],
  ['sum(i.valor_venda) as previa', 'sum(i.valor_venda * (1 + public.com_parte_do_cliente(i.cliente_codigo, i.nota_em))) as previa']
]);

-- O farol do mês e o Analítico da carteira.
select pg_temp.troca('public.com_carteira_mes_a_mes(text, integer)', array[
  ['select sum(v.valor_curva)', 'select sum(v.valor_curva * (1 + public.com_parte_da_condicao(c.tabela_preco, v.emissao)))'],
  ['select sum(i.valor_venda)', 'select sum(i.valor_venda * (1 + public.com_parte_da_condicao(c.tabela_preco, i.nota_em)))']
]);

-- Diretoria: realizado × meta.
select pg_temp.troca('public.dir_realizado_carteiras(integer[])', array[
  ['cl.carteira, v.valor_curva as valor', 'cl.carteira, v.valor_curva * (1 + public.com_parte_da_condicao(cl.tabela_preco, v.emissao)) as valor'],
  ['cl.carteira, i.valor_venda', 'cl.carteira, i.valor_venda * (1 + public.com_parte_da_condicao(cl.tabela_preco, i.nota_em))']
]);
select pg_temp.troca('public.dir_realizado_total(integer[])', array[
  ['v.valor_curva as valor', 'v.valor_curva * (1 + public.com_parte_do_cliente(v.cliente_codigo, v.emissao)) as valor'],
  ['extract(month from i.nota_em)::int, i.valor_venda', 'extract(month from i.nota_em)::int, i.valor_venda * (1 + public.com_parte_do_cliente(i.cliente_codigo, i.nota_em))']
]);

-- Cashback sobre a Venda total, no mês que gera e no mês que libera.
select pg_temp.troca('public.com_cashback_mensal(integer, text, text, date, date, text)', array[
  ['coalesce(sum(i.valor_curva), 0) as comprado',
   'coalesce(sum(i.valor_curva * (1 + public.com_parte_do_cliente(i.cliente_codigo, i.competencia))), 0) as comprado'],
  ['select coalesce(sum(s.valor_curva), 0)',
   'select coalesce(sum(s.valor_curva * (1 + public.com_parte_do_cliente(s.cliente_codigo, s.competencia))), 0)']
]);

-- As três linhas que a tela mostra: Faturado, Condição e Venda total, da mesma leitura da Carteira.
create or replace function public.com_composicao_da_venda(
  p_de date, p_ate date, p_carteira text default null, p_filial text default null, p_codigo text default null
) returns table (faturado numeric, condicao numeric, venda_total numeric, clientes integer)
language plpgsql stable security definer set search_path to 'public' as $$
#variable_conflict use_column
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_carteira text := nullif(public.normalizar_nome_carteira(coalesce(p_carteira, '')), '');
  v_codigos text[];
begin
  select array_agg(c.codigo) into v_codigos
    from public.com_clientes c
   where c.tenant_id = v_tenant
     and public.com_pode_ver_carteira(coalesce(c.carteira, ''))
     and (v_carteira is null or c.carteira = v_carteira)
     and (p_codigo is null or c.codigo = any (public.com_codigos_do_grupo(p_codigo)));
  return query
  with v as (
    select u.codigo, u.valor, 1 + public.com_parte_do_cliente(u.codigo, u.dia) as fator
      from public.com_vendas_unificadas(v_codigos, p_de, p_ate + 1, nullif(upper(btrim(p_filial)), '')) u
  )
  select round(coalesce(sum(v.valor / v.fator), 0), 2),
         round(coalesce(sum(v.valor - v.valor / v.fator), 0), 2),
         round(coalesce(sum(v.valor), 0), 2),
         (count(distinct v.codigo) filter (where v.fator > 1))::int
    from v;
end;
$$;

revoke all on function public.com_composicao_da_venda(date, date, text, text, text) from public, anon;
grant execute on function public.com_composicao_da_venda(date, date, text, text, text) to authenticated;

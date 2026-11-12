-- QUANTOS CLIENTES COMPRARAM CADA PRODUTO no período (Curva ABC, revisão do Comercial aprovada pelo dono,
-- https://claude.ai/artifact/DogLjeM9MuJUzFt2H7ALFV, 7.6). Mesma base da curva: venda (classe 'venda'), por emissão e
-- filial. `security invoker`: quem lê é o RLS de com_vendas_itens.
create or replace function public.com_clientes_por_produto(p_de date, p_ate date, p_filial text default null)
returns table (produto_codigo text, clientes integer)
language sql stable security invoker
set search_path = public
as $$
  select i.produto_codigo, count(distinct i.cliente_codigo)::int
    from public.com_vendas_itens i
   where i.classe = 'venda'
     and i.emissao between p_de and p_ate
     and (p_filial is null or i.filial = p_filial)
   group by i.produto_codigo;
$$;
-- Lição 14 do CLAUDE.md: função nova nasce executável por PUBLIC (e anon é público).
revoke all on function public.com_clientes_por_produto(date, date, text) from public, anon;
grant execute on function public.com_clientes_por_produto(date, date, text) to authenticated;

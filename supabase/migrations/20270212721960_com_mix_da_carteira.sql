-- MIX MÉDIO (revisão do Comercial aprovada pelo dono, https://claude.ai/artifact/DogLjeM9MuJUzFt2H7ALFV, seção 4; o dono
-- pediu em 2026-11-11 para fazer): quantos produtos diferentes, em média, cada cliente que comprou levou no período, por
-- carteira. A tela soma as carteiras da vendedora pesando pelos clientes. `security invoker`: quem lê é o RLS.
create or replace function public.com_mix_da_carteira(p_de date, p_ate date)
returns table (carteira text, clientes integer, produtos bigint)
language sql stable security invoker
set search_path = public
as $$
  select c.carteira, count(*)::int as clientes, sum(x.produtos) as produtos
    from (select i.tenant_id, i.cliente_codigo, count(distinct i.produto_codigo) as produtos
            from public.com_vendas_itens i
           where i.classe = 'venda' and i.emissao between p_de and p_ate
           group by i.tenant_id, i.cliente_codigo) x
    join public.com_clientes c on c.tenant_id = x.tenant_id and c.codigo = x.cliente_codigo
   where c.carteira is not null
   group by c.carteira;
$$;
revoke all on function public.com_mix_da_carteira(date, date) from public, anon;
grant execute on function public.com_mix_da_carteira(date, date) to authenticated;

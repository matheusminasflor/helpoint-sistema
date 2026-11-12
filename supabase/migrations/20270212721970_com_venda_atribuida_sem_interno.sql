-- COMPRA DE FUNCIONÁRIO FORA DA VENDA DA VENDEDORA, TAMBÉM PELA PRÉVIA (revisão dos números, 2026-11-11).
-- A 20270212721950 tirou o cliente interno da carteira, e com isso do faturado (que soma pela carteira). Mas a PRÉVIA de
-- `com_venda_atribuida` soma por quem lançou, não pela carteira: a nota de R$ 64,98 que a Jacqueline lançou para o
-- RONDINELLY LIMA (funcionário) ainda entrava na venda dela — painel 47.113,50 contra 47.048,52 da carteira, e 11
-- clientes positivados contra 10. Regra do dono: compra de funcionário não conta na meta.
create or replace function pg_temp.troca(p_funcao regprocedure, p_de text, p_para text)
returns void language plpgsql as $$
declare
  v_def text := pg_get_functiondef(p_funcao);
begin
  if position(p_de in v_def) = 0 then
    raise exception 'trecho não encontrado em %: %', p_funcao, left(p_de, 80);
  end if;
  execute replace(v_def, p_de, p_para);
end;
$$;

-- `create or replace` (o que pg_get_functiondef devolve) preserva a ACL.
select pg_temp.troca('public.com_venda_atribuida(date, date)'::regprocedure,
  $$     group by x.vendedor_id, x.cliente_codigo$$,
  $$     where not exists (select 1 from public.com_clientes ci
                        where ci.tenant_id = public.get_user_tenant_id() and ci.codigo = x.cliente_codigo and ci.interno)
     group by x.vendedor_id, x.cliente_codigo$$);

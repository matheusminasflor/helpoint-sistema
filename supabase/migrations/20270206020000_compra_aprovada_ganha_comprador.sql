-- A compra aprovada antes da rodada 2 sem atendente no chamado (#88, 2026-10-25) ficou sem `comprador_id` na cópia:
-- os avisos dela ("mensagem no pedido", reajuste) iriam para a equipe inteira de Compras. Ganha quem compra, como a
-- aprovação daria hoje (`compras_vai_para_quem_compra`): o responsável da Caixinha, ou o comprador de Compras.
update public.compras_solicitacoes s
   set comprador_id = case when s.caixinha then public.responsavel_da_caixinha(s.caixinha_id) else c.comprador_id end
  from public.compras_config c
 where c.tenant_id = s.tenant_id and s.status = 'approved' and s.comprador_id is null;

-- CORREÇÃO de 20261124010000: a policy de INSERT em `suppliers` deixava cadastrar quem "lança conta
-- a pagar" no Financeiro, com a justificativa de que `SeletorFornecedor` ficava na conta a pagar. Não
-- fica: ele está no formulário de pedido de compra (`PurchaseRequestFields`), que qualquer pessoa abre.
-- A tela de contas não cadastra fornecedor. Fica só o que o dono decidiu — a caixinha "Fornecedores"
-- do Marketing ou de Compras; quem só pede compra digita o nome (o orçamento aceita texto).
drop policy if exists suppliers_insert on public.suppliers;
create policy suppliers_insert on public.suppliers for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id())
              and ((select public.pode_no_setor('marketing', 'suppliers', 'create'))
                   or (select public.pode_no_setor('compras', 'fornecedores', 'create'))));

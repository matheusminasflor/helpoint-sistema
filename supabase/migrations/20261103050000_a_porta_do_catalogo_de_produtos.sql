-- `purchases:manage_products` deixava a tela cinza e a porta do banco aberta
--
-- Leva I (Compras), 2026-09-26. Não é decisão do dono: é a permissão que ele já
-- tem no catálogo de acessos passando a valer de verdade.
--
-- ══ O QUE ACONTECIA ═════════════════════════════════════════════════════════
--
-- A L8 fez `FinProducts.tsx` ler `can('purchases','manage_products')` e deixar
-- a tela de catálogo cinza para quem não tem a permissão. A RLS de
-- `fin_purchase_products`, porém, era:
--
--   insert  with check (tenant_id = get_user_tenant_id())
--   update  using/with check (tenant_id = get_user_tenant_id())
--
-- Qualquer pessoa da empresa — inclusive `viewer` — podia inserir e renomear
-- produto do catálogo pelo PostgREST. Botão cinza não é fechadura; está
-- registrado em `nao-funciona.md` desde a L8 como "controle só de tela".
--
-- ══ POR QUE NÃO FOI FECHADO ANTES, E O QUE MUDA AGORA ═══════════════════════
--
-- Porque o **cadastro rápido** dentro do formulário de compra dependia da porta
-- aberta: quem abre uma compra é qualquer pessoa, e o formulário só deixava
-- preencher o produto escolhendo do catálogo ou cadastrando um novo. Fechar a
-- porta sem mexer no formulário tiraria de muita gente a possibilidade de abrir
-- compra — pior que o buraco.
--
-- Nesta leva o formulário ganha a terceira saída, que faltava: **usar o nome
-- digitado sem cadastrar**. `fin_purchase_requests.product_id` sempre foi
-- opcional e `product_name` é texto — a compra nunca precisou do catálogo, só a
-- tela é que não oferecia o caminho. Com ele, a porta pode fechar:
--
--   quem tem a permissão   escolhe do catálogo, ou cadastra e escolhe
--   quem não tem           escolhe do catálogo, ou digita o nome livre
--
-- A expressão da policy é a MESMA que o front usa em `can()`: gestor para cima
-- passa direto (é assim que `useDepartmentPermissions` responde), e quem não é
-- gestor passa se a permissão estiver marcada no perfil de acesso. Tela e porta
-- concordam — que é o que faltava.
--
-- DELETE fica como está (`is_manager_or_higher`): apagar produto do catálogo é
-- mais do que cadastrar, e a tela não oferece.

begin;

alter policy "tenant insert products" on public.fin_purchase_products
  with check (
    tenant_id = get_user_tenant_id()
    and (
      is_manager_or_higher(auth.uid())
      or tem_permissao(auth.uid(), 'financeiro', 'purchases', 'manage_products')
    )
  );

alter policy "tenant update products" on public.fin_purchase_products
  using (
    tenant_id = get_user_tenant_id()
    and (
      is_manager_or_higher(auth.uid())
      or tem_permissao(auth.uid(), 'financeiro', 'purchases', 'manage_products')
    )
  )
  with check (
    tenant_id = get_user_tenant_id()
    and (
      is_manager_or_higher(auth.uid())
      or tem_permissao(auth.uid(), 'financeiro', 'purchases', 'manage_products')
    )
  );

commit;

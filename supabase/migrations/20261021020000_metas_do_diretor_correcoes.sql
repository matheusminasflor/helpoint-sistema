-- Frente 2 (correções da auditoria, item 2) — quem tem `metas.definir` não
-- conseguia importar. `com_importar_metas`/`com_importar_metas_do_ano` são
-- `security invoker` e gravam o log da importação em
-- `com_vendas_importacoes` (mesma tabela usada por vendas/clientes), cuja
-- policy de INSERT só aceitava admin OU `vendas.importar` — um member com
-- só `metas.definir` (o perfil que a tela de Metas exige para mostrar o
-- botão "Importar") passava pela policy de `metas_carteira`/`metas_ano`
-- (que já aceitava `metas.definir`) e quebrava no INSERT do log, com 42501
-- e zero linhas gravadas. O log é o mesmo para vendas e para metas: quem
-- pode importar UM dos dois pode escrever a linha do que importou.
drop policy if exists com_vendas_importacoes_insert on public.com_vendas_importacoes;
create policy com_vendas_importacoes_insert on public.com_vendas_importacoes for insert
  with check (tenant_id = (select public.get_user_tenant_id())
          and ((select public.is_admin_or_higher(auth.uid()))
            or (select public.tem_permissao(auth.uid(), 'comercial', 'vendas', 'importar'))
            or (select public.tem_permissao(auth.uid(), 'comercial', 'metas', 'definir'))));

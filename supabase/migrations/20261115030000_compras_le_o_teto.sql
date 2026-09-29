-- LEVA P — o teto de gasto aparece em Compras › Configurações (decisão do dono, 2026-09-28:
-- "Em Compras", com o resto do que é de compra).
--
-- Quem EDITA não muda: a policy de escrita continua exigindo o Financeiro com permissão de
-- teto (quem paga define o limite; decisão da leva N). O que muda é a LEITURA da chave "teto
-- ligado ou desligado": `fin_budget_settings` só era legível por `has_fin_access`, então quem é
-- só de Compras abriria a tela e veria o teto como desligado — sem erro, e errado. Os limites
-- por setor (`fin_department_budgets`) já eram legíveis por Compras desde a leva N.
create policy fin_budget_settings_le_compras on public.fin_budget_settings
  for select to authenticated
  using (
    tenant_id = (select public.get_user_tenant_id())
    and (select public.has_compras_access(auth.uid()))
  );

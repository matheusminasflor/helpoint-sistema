-- Financeiro: o razão da empresa deixa de ser legível por qualquer usuário do
-- tenant.
--
-- O QUE ESTAVA ABERTO
-- ───────────────────
-- `StaffRoute` (o guard de rota do front) checa login, cliente de SAC e slug
-- do tenant — e mais nada. Não checa módulo nem cargo. Esconder o item no
-- menu não é fronteira: qualquer usuário autenticado digita
-- `/t/<slug>/financeiro/contas-a-pagar` e chega na tela.
--
-- E o RLS não segurava atrás: as sete tabelas `fin_*` tinham só
-- `tenant_id = get_user_tenant_id()`. O RH já é protegido por
-- `has_rh_access`; o Financeiro não tinha equivalente.
--
-- Esta migration cria o equivalente e o aplica. A fronteira passa a viver no
-- banco, que é onde ela se sustenta mesmo com o front errado.
--
-- ┌─ CONSEQUÊNCIA IMEDIATA, LEIA ANTES DE APLICAR ────────────────────────┐
-- │ `user_module_access` hoje só tem linhas com module = 'ti'. Ninguém     │
-- │ tem 'financeiro' concedido.                                            │
-- │                                                                        │
-- │ Depois desta migration, quem enxerga o Financeiro é: owner, admin,     │
-- │ manager (pelo fallback `is_supervisor_or_higher`) e mais ninguém, até  │
-- │ que você conceda o módulo em Configurações → Usuários e acessos.       │
-- │                                                                        │
-- │ Se hoje alguém sem cargo de supervisor usa o Financeiro no dia a dia,  │
-- │ conceda o módulo a essa pessoa ANTES de aplicar — senão ela perde o    │
-- │ acesso no mesmo instante.                                              │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- O fallback por cargo é cópia deliberada de `has_rh_access`: os dois módulos
-- passam a ter a mesma forma. Se você quiser que nem supervisor entre sem
-- concessão explícita, apague o `OR public.is_supervisor_or_higher(...)`.

create or replace function public.has_fin_access(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_module_access
    WHERE user_id = _user_id AND module = 'financeiro'
  ) OR public.is_supervisor_or_higher(_user_id)
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- As policies das sete tabelas ganham a checagem de módulo.
--
-- O que NÃO muda: o recorte por tenant, e as exigências de cargo que já
-- existiam (`is_manager_or_higher` em orçamento e nas exclusões). Só é
-- acrescentado `has_fin_access` a cada regra.
-- ───────────────────────────────────────────────────────────────────────────

-- fin_entries — o razão
drop policy if exists fin_entries_select on public.fin_entries;
create policy fin_entries_select on public.fin_entries for select to authenticated
  using (tenant_id = get_user_tenant_id() and public.has_fin_access(auth.uid()));

drop policy if exists fin_entries_insert on public.fin_entries;
create policy fin_entries_insert on public.fin_entries for insert to authenticated
  with check (tenant_id = get_user_tenant_id() and public.has_fin_access(auth.uid()));

drop policy if exists fin_entries_update on public.fin_entries;
create policy fin_entries_update on public.fin_entries for update to authenticated
  using      (tenant_id = get_user_tenant_id() and public.has_fin_access(auth.uid()))
  with check (tenant_id = get_user_tenant_id() and public.has_fin_access(auth.uid()));

drop policy if exists fin_entries_delete on public.fin_entries;
create policy fin_entries_delete on public.fin_entries for delete to authenticated
  using (tenant_id = get_user_tenant_id() and public.has_fin_access(auth.uid()));

-- fin_imports — histórico de importação de planilha
drop policy if exists fin_imports_select on public.fin_imports;
create policy fin_imports_select on public.fin_imports for select to authenticated
  using (tenant_id = get_user_tenant_id() and public.has_fin_access(auth.uid()));

drop policy if exists fin_imports_insert on public.fin_imports;
create policy fin_imports_insert on public.fin_imports for insert to authenticated
  with check (tenant_id = get_user_tenant_id() and public.has_fin_access(auth.uid()));

drop policy if exists fin_imports_update on public.fin_imports;
create policy fin_imports_update on public.fin_imports for update to authenticated
  using      (tenant_id = get_user_tenant_id() and public.has_fin_access(auth.uid()))
  with check (tenant_id = get_user_tenant_id() and public.has_fin_access(auth.uid()));

drop policy if exists fin_imports_delete on public.fin_imports;
create policy fin_imports_delete on public.fin_imports for delete to authenticated
  using (tenant_id = get_user_tenant_id() and public.has_fin_access(auth.uid()));

-- fin_budget_settings — teto de gasto, chave geral
drop policy if exists "tenant read budget settings" on public.fin_budget_settings;
create policy "tenant read budget settings" on public.fin_budget_settings for select to authenticated
  using (tenant_id = get_user_tenant_id() and public.has_fin_access(auth.uid()));

drop policy if exists "managers write budget settings" on public.fin_budget_settings;
create policy "managers write budget settings" on public.fin_budget_settings for all to authenticated
  using      (tenant_id = get_user_tenant_id() and is_manager_or_higher(auth.uid()) and public.has_fin_access(auth.uid()))
  with check (tenant_id = get_user_tenant_id() and is_manager_or_higher(auth.uid()) and public.has_fin_access(auth.uid()));

-- fin_department_budgets — teto por setor
drop policy if exists "tenant read department budgets" on public.fin_department_budgets;
create policy "tenant read department budgets" on public.fin_department_budgets for select to authenticated
  using (tenant_id = get_user_tenant_id() and public.has_fin_access(auth.uid()));

drop policy if exists "managers write department budgets" on public.fin_department_budgets;
create policy "managers write department budgets" on public.fin_department_budgets for all to authenticated
  using      (tenant_id = get_user_tenant_id() and is_manager_or_higher(auth.uid()) and public.has_fin_access(auth.uid()))
  with check (tenant_id = get_user_tenant_id() and is_manager_or_higher(auth.uid()) and public.has_fin_access(auth.uid()));

-- ───────────────────────────────────────────────────────────────────────────
-- Compras: aqui a fronteira é OUTRA, de propósito.
--
-- Solicitação de compra nasce de um chamado aberto por qualquer setor — quem
-- pede um monitor não é do Financeiro. Se estas três tabelas exigissem
-- `has_fin_access`, o fluxo de pedir compra morreria.
--
-- O que se conserta aqui é o que a auditoria achou junto: o UPDATE era
-- tenant-wide, então qualquer usuário editava o pedido de compra de outra
-- pessoa. Passa a ser: o próprio autor, ou quem tem o Financeiro.
-- ───────────────────────────────────────────────────────────────────────────

drop policy if exists "tenant update purchase requests" on public.fin_purchase_requests;
create policy "tenant update purchase requests" on public.fin_purchase_requests for update to authenticated
  using (
    tenant_id = get_user_tenant_id()
    and (created_by = auth.uid() or public.has_fin_access(auth.uid()))
  )
  with check (
    tenant_id = get_user_tenant_id()
    and (created_by = auth.uid() or public.has_fin_access(auth.uid()))
  );

-- `fin_purchase_products` e `fin_purchase_quotes` ficam como estão: são
-- alimentadas pelo mesmo fluxo de pedido, por qualquer setor.

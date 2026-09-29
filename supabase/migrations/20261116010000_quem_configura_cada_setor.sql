-- LEVA P, parte 6 — quem configura cada setor.
--
-- O dono, 2026-09-29: "é importante ter em permissões de acesso a opção de marcar quem tem acesso
-- a todas as configurações de cada setor e seus parâmetros", e "quem tiver acesso à configuração
-- apenas de um determinado setor vai aparecer ativo apenas aquele".
--
-- MEDIDO ANTES: os perfis Gestor dos sete setores já traziam `settings: {view, edit}` desde que
-- foram semeados — e nada lia essa chave. Quem alterava a configuração de um setor era decidido
-- pelo CARGO, de uma vez para todos os setores: categoria e formulário por `is_supervisor_or_higher`,
-- automação por `is_manager_or_higher`, apagar categoria e prazo por `is_diretor`. Um supervisor do
-- RH mudava as categorias da TI; uma pessoa com o perfil Gestor do RH, sem cargo, não mudava as do
-- próprio RH.
--
-- AGORA: dono e admin configuram todos os setores; os demais, o setor cujo perfil tem
-- `settings.edit` (pergunta `tem_permissao`, a mesma que o resto do sistema já usa). Vale para a
-- aba Chamados, que é a mesma em todo setor: categorias, formulários, automações e prazo do setor.
-- As abas próprias de cada setor (folha do RH, carteiras do Comercial, SAC…) continuam com as
-- regras que já tinham.
--
-- Custo, dito com todas as letras: supervisor e gerente SEM o perfil do setor deixam de configurá-lo.
-- Os perfis Gestor têm a chave; quem deve configurar recebe o Gestor (ou a chave marcada) em
-- Configurações › Pessoas e acessos.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A pergunta: esta pessoa pode configurar este setor?
-- ─────────────────────────────────────────────────────────────────────────────
-- O módulo das tabelas não é o nome do setor do perfil: chamados e cadastros da TI são
-- `tickets`, `inventory`, `contracts`, `licenses`, `maintenances`. O CRM não tem perfil próprio e
-- responde ao Comercial, que é o setor das vendas (ADR-009). O resto coincide.
create or replace function public.setor_do_modulo(p_modulo text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_modulo in ('tickets', 'inventory', 'contracts', 'licenses', 'maintenances') then 'ti'
    when p_modulo = 'crm' then 'comercial'
    when p_modulo in ('marketing', 'rh', 'qualidade', 'financeiro', 'compras', 'comercial', 'educacional') then p_modulo
    else null
  end;
$$;

create or replace function public.pode_configurar_setor(p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_diretor(auth.uid())
      or coalesce(public.tem_permissao(auth.uid(), public.setor_do_modulo(p_modulo), 'settings', 'edit'), false);
$$;

revoke all on function public.setor_do_modulo(text) from public, anon;
grant execute on function public.setor_do_modulo(text) to authenticated;
revoke all on function public.pode_configurar_setor(text) from public, anon;
grant execute on function public.pode_configurar_setor(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. As portas da aba Chamados
-- ─────────────────────────────────────────────────────────────────────────────
drop policy "Supervisors can create categories" on public.ti_categories;
drop policy "Supervisors can update categories" on public.ti_categories;
drop policy "Directors can delete categories" on public.ti_categories;

create policy ti_categories_quem_configura_insere on public.ti_categories
  for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_configurar_setor(module));
create policy ti_categories_quem_configura_altera on public.ti_categories
  for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_configurar_setor(module))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_configurar_setor(module));
create policy ti_categories_quem_configura_apaga on public.ti_categories
  for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_configurar_setor(module));

-- O formulário é da categoria: o setor vem dela. A leitura segue na policy de SELECT que já
-- existe (todo mundo da empresa lê, porque precisa para abrir chamado).
drop policy "Supervisors can manage form fields" on public.ticket_form_fields;
create policy ticket_form_fields_quem_configura on public.ticket_form_fields
  for all to authenticated
  using (
    tenant_id = (select public.get_user_tenant_id())
    and exists (select 1 from public.ti_categories c
                 where c.id = ticket_form_fields.category_id and public.pode_configurar_setor(c.module))
  )
  with check (
    tenant_id = (select public.get_user_tenant_id())
    and exists (select 1 from public.ti_categories c
                 where c.id = ticket_form_fields.category_id and public.pode_configurar_setor(c.module))
  );

drop policy "Managers can insert workflows" on public.automation_workflows;
drop policy "Managers can update workflows" on public.automation_workflows;
drop policy "Managers can delete workflows" on public.automation_workflows;
create policy automation_workflows_quem_configura_insere on public.automation_workflows
  for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_configurar_setor(module));
create policy automation_workflows_quem_configura_altera on public.automation_workflows
  for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_configurar_setor(module))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_configurar_setor(module));
create policy automation_workflows_quem_configura_apaga on public.automation_workflows
  for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_configurar_setor(module));

-- O prazo PADRÃO da empresa (module nulo) continua com dono e admin, pela policy que já existe.
-- O prazo de um setor passa a ser de quem configura o setor.
create policy sla_policies_prazo_do_setor on public.sla_policies
  for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and module is not null and public.pode_configurar_setor(module))
  with check (tenant_id = (select public.get_user_tenant_id()) and module is not null and public.pode_configurar_setor(module));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Compras: o Gestor ganha a chave, como os outros sete
-- ─────────────────────────────────────────────────────────────────────────────
update public.access_profiles
   set permissions = permissions || '{"settings": {"view": true, "edit": true}}'::jsonb
 where department = 'compras' and name = 'Gestor' and permissions -> 'settings' is null;

create or replace function public.seed_perfis_de_compras(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.access_profiles (tenant_id, department, name, description, is_default, permissions)
  select p_tenant_id, 'compras', v.name, v.description, v.is_default, v.permissions
    from (values
      ('Gestor', 'Acesso completo: aprova, executa, cuida do catálogo, dos fornecedores e das configurações', false,
       '{"solicitacoes": {"view": true, "approve": true, "execute": true},
         "catalogo": {"view": true, "edit": true},
         "fornecedores": {"view": true, "create": true, "edit": true, "delete": true},
         "settings": {"view": true, "edit": true},
         "reports": {"view": true, "export": true, "view_team_metrics": true}}'::jsonb),
      ('Operador', 'Trabalho do dia a dia: vê as solicitações, executa a compra e mantém o catálogo', true,
       '{"solicitacoes": {"view": true, "execute": true},
         "catalogo": {"view": true, "edit": true},
         "fornecedores": {"view": true, "create": true, "edit": true},
         "reports": {"view": true}}'::jsonb),
      ('Somente leitura', 'Visualização sem permitir alterações', false,
       '{"solicitacoes": {"view": true},
         "catalogo": {"view": true},
         "fornecedores": {"view": true},
         "reports": {"view": true}}'::jsonb)
    ) as v(name, description, is_default, permissions)
   where not exists (
     select 1 from public.access_profiles ap
      where ap.tenant_id = p_tenant_id and ap.department = 'compras' and ap.name = v.name
   );
end;
$$;

do $$
declare v_aberta text;
begin
  select string_agg(p.proname, ', ') into v_aberta
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
     and p.proname in ('setor_do_modulo', 'pode_configurar_setor', 'seed_perfis_de_compras')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_aberta is not null then
    raise exception 'funções abertas para anon: %', v_aberta;
  end if;
end $$;

-- LEVA P, parte 7 — a configuração de cada setor se libera ABA POR ABA.
--
-- O dono, 2026-09-29, depois de ver a simulação: "Opção Abrir e Alterar, Jeito 1". No perfil de
-- acesso, cada aba da configuração do setor é uma linha com duas marcações: ABRIR (a pessoa vê a
-- aba) e ALTERAR (a pessoa muda o que está nela). Aba sem nenhuma marcação nem aparece.
--
-- A chave de cada aba é `config_<aba>` no perfil do setor, com `view` (abrir) e `edit` (alterar).
-- Substitui a chave única `settings` da parte 6, que é convertida aqui.
--
-- O banco confere `edit` da aba em TODAS as tabelas que a aba grava — era esse o ponto que a
-- parte 6 deixou de fora ("as abas próprias seguem as regras delas"). Dono e admin passam sempre.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. As abas de cada setor — a mesma lista de `src/config/abas-de-configuracao.ts`
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.abas_de_configuracao(p_setor text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case p_setor
    when 'ti'          then array['chamados', 'cadastros', 'checklists', 'alertas']
    when 'qualidade'   then array['chamados', 'sac_link', 'sac_produtos', 'sac_categorias', 'sac_campos']
    when 'rh'          then array['chamados', 'empresas', 'departamentos', 'folha']
    when 'marketing'   then array['chamados']
    when 'financeiro'  then array['chamados', 'importacoes']
    when 'compras'     then array['chamados', 'teto']
    when 'comercial'   then array['chamados', 'equipe', 'indicadores', 'cashback']
    when 'educacional' then array['chamados']
    else array[]::text[]
  end;
$$;

-- A pergunta de toda porta desta migration.
create or replace function public.pode_alterar_aba(p_setor text, p_aba text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_diretor(auth.uid())
      or coalesce(public.tem_permissao(auth.uid(), p_setor, 'config_' || p_aba, 'edit'), false);
$$;

-- A aba Chamados (parte 6) passa a perguntar a chave da aba; os cadastros da TI (inventário,
-- contratos, licenças, manutenções) têm aba própria.
create or replace function public.pode_configurar_setor(p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.pode_alterar_aba(
    public.setor_do_modulo(p_modulo),
    case when p_modulo in ('inventory', 'contracts', 'licenses', 'maintenances') then 'cadastros' else 'chamados' end
  );
$$;

revoke all on function public.abas_de_configuracao(text) from public, anon;
grant execute on function public.abas_de_configuracao(text) to authenticated;
revoke all on function public.pode_alterar_aba(text, text) from public, anon;
grant execute on function public.pode_alterar_aba(text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. A chave `settings` vira uma chave por aba — nos perfis que existem e nos que nascerem
-- ─────────────────────────────────────────────────────────────────────────────
-- `settings.view` abre todas as abas do setor; `settings.edit` altera todas. É a tradução fiel do
-- que a chave única dizia. Um trigger faz a mesma conversão em todo perfil gravado, para as
-- sementes de empresa nova (`seed_default_access_profiles`, `seed_perfis_de_compras`) continuarem
-- escrevendo `settings` sem ninguém precisar reescrevê-las.
create or replace function public.config_por_aba(p_setor text, p_permissions jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v jsonb := coalesce(p_permissions, '{}'::jsonb);
  v_ver boolean := coalesce((v -> 'settings' ->> 'view')::boolean, false);
  v_alterar boolean := coalesce((v -> 'settings' ->> 'edit')::boolean, false);
  a text;
begin
  if not (v ? 'settings') then return v; end if;
  foreach a in array public.abas_de_configuracao(p_setor) loop
    v := v || jsonb_build_object('config_' || a,
      coalesce(v -> ('config_' || a), '{}'::jsonb)
      || jsonb_build_object('view', v_ver or v_alterar, 'edit', v_alterar));
  end loop;
  return v - 'settings';
end;
$$;

create or replace function public.access_profiles_config_por_aba()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.permissions := public.config_por_aba(new.department, new.permissions);
  return new;
end;
$$;

create trigger trg_access_profiles_config_por_aba
  before insert or update of permissions on public.access_profiles
  for each row execute function public.access_profiles_config_por_aba();

-- Os perfis que já existem.
update public.access_profiles set permissions = public.config_por_aba(department, permissions)
 where permissions ? 'settings';

-- O cashback tinha permissão própria (`cashback.configurar`), que a aba absorve: quem tinha, passa a
-- ter a aba. (O teto tinha `budgets.manage` no Financeiro; nenhum perfil a tinha marcada — medido
-- em 2026-09-29 — e o teto é liberado agora na aba de Compras.)
update public.access_profiles
   set permissions = permissions || '{"config_cashback": {"view": true, "edit": true}}'::jsonb
 where department = 'comercial' and coalesce((permissions -> 'cashback' ->> 'configurar')::boolean, false);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. As portas de cada aba
-- ─────────────────────────────────────────────────────────────────────────────
-- Onde a policy antiga era `for all` e servia também de LEITURA para quem ela deixava, a leitura
-- ganha policy própria, para ninguém perder o que já via.

-- TI › Checklists (eram de supervisor para cima).
drop policy "Admins manage checklist templates" on public.checklist_templates;
drop policy "Admins manage checklist template items" on public.checklist_template_items;
drop policy "Admins manage checklist bindings" on public.checklist_template_bindings;
create policy checklist_templates_le on public.checklist_templates for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()));
create policy checklist_templates_altera on public.checklist_templates for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('ti', 'checklists'))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('ti', 'checklists'));
create policy checklist_template_items_le on public.checklist_template_items for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()));
create policy checklist_template_items_altera on public.checklist_template_items for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('ti', 'checklists'))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('ti', 'checklists'));
create policy checklist_template_bindings_le on public.checklist_template_bindings for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()));
create policy checklist_template_bindings_altera on public.checklist_template_bindings for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('ti', 'checklists'))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('ti', 'checklists'));

-- RH › Empresas, Departamentos, Parâmetros da folha (eram de supervisor para cima).
drop policy rh_companies_escreve_supervisor on public.rh_companies;
create policy rh_companies_le_supervisor on public.rh_companies for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.is_supervisor_or_higher(auth.uid()));
create policy rh_companies_altera on public.rh_companies for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('rh', 'empresas'))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('rh', 'empresas'));

drop policy rh_dep_write on public.rh_departments_catalog;
create policy rh_departments_catalog_altera on public.rh_departments_catalog for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('rh', 'departamentos'))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('rh', 'departamentos'));

-- Os parâmetros da folha são lidos por quem calcula a folha: a leitura fica com quem já lia
-- (supervisor) e com quem tem o RH.
drop policy rh_payroll_settings_all on public.rh_payroll_settings;
create policy rh_payroll_settings_le on public.rh_payroll_settings for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and (public.is_supervisor_or_higher(auth.uid()) or public.has_rh_access(auth.uid())));
create policy rh_payroll_settings_altera on public.rh_payroll_settings for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('rh', 'folha'))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('rh', 'folha'));

-- Qualidade › SAC: produtos e lotes (qualquer pessoa da empresa alterava), categorias e campos do
-- formulário (só admin alterava). O cliente continua lendo o que está ativo, pelas policies dele.
drop policy "Tenant staff manages products" on public.sac_products;
drop policy "Tenant staff manages batches" on public.sac_product_batches;
create policy sac_products_le_a_equipe on public.sac_products for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()));
create policy sac_products_altera on public.sac_products for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('qualidade', 'sac_produtos'))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('qualidade', 'sac_produtos'));
create policy sac_product_batches_le_a_equipe on public.sac_product_batches for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()));
create policy sac_product_batches_altera on public.sac_product_batches for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('qualidade', 'sac_produtos'))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('qualidade', 'sac_produtos'));

drop policy "Internal team can manage SAC categories" on public.sac_categories;
create policy sac_categories_le_a_equipe on public.sac_categories for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()));
create policy sac_categories_altera on public.sac_categories for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('qualidade', 'sac_categorias'))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('qualidade', 'sac_categorias'));

drop policy "Internal team can manage SAC form fields" on public.sac_form_fields;
create policy sac_form_fields_le_a_equipe on public.sac_form_fields for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()));
create policy sac_form_fields_altera on public.sac_form_fields for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('qualidade', 'sac_campos'))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('qualidade', 'sac_campos'));

-- Financeiro › Planilhas importadas: remover uma importação apaga os lançamentos dela. Importar
-- continua em Contas a Pagar/Receber, com a regra de sempre.
drop policy fin_imports_delete on public.fin_imports;
create policy fin_imports_remove on public.fin_imports for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('financeiro', 'importacoes'));

-- Compras › Teto de gasto. Era o Financeiro com `budgets.manage`; o teto mora em Compras desde a
-- parte 5 e agora se libera na aba dele.
drop policy fin_budget_settings_escreve_o_financeiro on public.fin_budget_settings;
drop policy fin_department_budgets_escreve_o_financeiro on public.fin_department_budgets;
create policy fin_budget_settings_altera on public.fin_budget_settings for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('compras', 'teto'))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('compras', 'teto'));
create policy fin_department_budgets_altera on public.fin_department_budgets for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('compras', 'teto'))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('compras', 'teto'));

-- Comercial › Cashback e Indicadores.
drop policy com_faixas_cashback_insert on public.com_faixas_cashback;
drop policy com_faixas_cashback_update on public.com_faixas_cashback;
drop policy com_faixas_cashback_delete on public.com_faixas_cashback;
create policy com_faixas_cashback_altera on public.com_faixas_cashback for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('comercial', 'cashback'))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('comercial', 'cashback'));

drop policy com_indicadores_escrita on public.com_indicadores;
create policy com_indicadores_altera on public.com_indicadores for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('comercial', 'indicadores'))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('comercial', 'indicadores'));

-- Comercial › Equipe e carteiras. Montar carteira é o poder de gestor do Comercial
-- (`com_pode_gerir_carteiras`, lido por várias funções); quem altera a aba Equipe passa a tê-lo.
-- A lista de vendedores do Forteplus era alterável por qualquer pessoa do Comercial.
create or replace function public.com_pode_gerir_carteiras()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.is_admin_or_higher(auth.uid())
      or public.tem_permissao(auth.uid(), 'comercial', 'carteiras', 'gerir')
      or public.pode_alterar_aba('comercial', 'equipe');
$function$;

drop policy com_carteira_membros_insert on public.com_carteira_membros;
drop policy com_carteira_membros_update on public.com_carteira_membros;
drop policy com_carteira_membros_delete on public.com_carteira_membros;
create policy com_carteira_membros_altera on public.com_carteira_membros for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.com_pode_gerir_carteiras()))
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.com_pode_gerir_carteiras()));

drop policy com_vendedores_write on public.com_vendedores;
create policy com_vendedores_altera on public.com_vendedores for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.com_pode_gerir_carteiras()))
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.com_pode_gerir_carteiras()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. O que a aba grava dentro das configurações da empresa (`tenants.settings`)
-- ─────────────────────────────────────────────────────────────────────────────
-- Alertas da TI e "quem vê o quê" do Comercial moram no JSON de configurações da empresa, que só
-- dono e admin gravam. Esta função grava SÓ a parte daquela aba, conferindo a aba.
create or replace function public.salvar_configuracao_da_aba(p_parte text, p_valor jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_setor text;
  v_aba text;
begin
  case p_parte
    when 'alerts' then v_setor := 'ti'; v_aba := 'alertas';
    when 'comercial' then v_setor := 'comercial'; v_aba := 'equipe';
    else raise exception 'Parte de configuração desconhecida: %', p_parte using errcode = '22023';
  end case;
  if v_tenant is null or not public.pode_alterar_aba(v_setor, v_aba) then
    raise exception 'Você não pode alterar esta configuração.' using errcode = '42501';
  end if;
  update public.tenants
     set settings = jsonb_set(coalesce(settings, '{}'::jsonb), array[p_parte],
                              coalesce(settings -> p_parte, '{}'::jsonb) || coalesce(p_valor, '{}'::jsonb))
   where id = v_tenant;
end;
$$;

revoke all on function public.salvar_configuracao_da_aba(text, jsonb) from public, anon;
grant execute on function public.salvar_configuracao_da_aba(text, jsonb) to authenticated;
-- `config_por_aba` roda dentro do trigger com o papel de quem grava o perfil (admin, pela tela):
-- fechar para `authenticated` quebraria a edição de perfil. Ela é pura — só transforma o JSON.
revoke all on function public.config_por_aba(text, jsonb) from public, anon;
grant execute on function public.config_por_aba(text, jsonb) to authenticated;
revoke all on function public.access_profiles_config_por_aba() from public, anon;

do $$
declare v_aberta text;
begin
  select string_agg(p.proname, ', ') into v_aberta
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
     and p.proname in ('abas_de_configuracao', 'pode_alterar_aba', 'config_por_aba',
                       'salvar_configuracao_da_aba', 'access_profiles_config_por_aba')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_aberta is not null then
    raise exception 'funções abertas para anon: %', v_aberta;
  end if;
end $$;

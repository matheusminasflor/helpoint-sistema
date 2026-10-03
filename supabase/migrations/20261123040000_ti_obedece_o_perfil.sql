-- TI OBEDECE AO PERFIL, NO BANCO (decisão do dono, 2026-10-02).
--
-- Equipamentos, contratos, licenças e manutenções: até aqui o banco decidia pelo CARGO (supervisor
-- cria, diretor exclui) e qualquer pessoa da empresa lia tudo. O perfil de acesso dizia outra coisa
-- (o Operador da TI "cria equipamento", e o banco recusava). Decisão do dono:
--   * criar, editar e excluir seguem as caixinhas do perfil da TI;
--   * ler: só com "Ver" — com as exceções do dia a dia: o equipamento atribuído à própria pessoa, o
--     equipamento de um chamado que ela abriu, e a LISTA de equipamentos ao abrir chamado (só nome,
--     etiqueta e onde fica, pela função `equipamentos_para_chamado`);
--   * a chave da licença só com "Ver chaves".
-- Dono e administrador passam em tudo (como `tem_permissao`). Medido antes: as sete tabelas estão
-- vazias na produção, e os três perfis da TI já têm as caixinhas preenchidas.

-- A pergunta de sempre, para qualquer setor: administrador ou a caixinha do perfil.
create or replace function public.pode_no_setor(p_setor text, p_secao text, p_acao text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.is_admin_or_higher(auth.uid()) or public.tem_permissao(auth.uid(), p_setor, p_secao, p_acao);
$$;
revoke all on function public.pode_no_setor(text, text, text) from public, anon;
grant execute on function public.pode_no_setor(text, text, text) to authenticated;

-- ─── Equipamentos ─────────────────────────────────────────────────────────────
drop policy if exists "Users can view assets in their tenant" on public.assets;
drop policy if exists "Supervisors can create assets" on public.assets;
drop policy if exists "Supervisors can update assets" on public.assets;
drop policy if exists "Directors can delete assets" on public.assets;

create policy assets_select on public.assets for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.pode_no_setor('ti', 'inventory', 'view'))
              or assigned_to = auth.uid()
              or exists (select 1 from public.tickets t where t.asset_id = assets.id and t.requester_id = auth.uid())));
create policy assets_insert on public.assets for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'inventory', 'create')));
create policy assets_update on public.assets for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.pode_no_setor('ti', 'inventory', 'edit')) or (select public.pode_no_setor('ti', 'inventory', 'transfer'))))
  with check (tenant_id = (select public.get_user_tenant_id())
              and ((select public.pode_no_setor('ti', 'inventory', 'edit')) or (select public.pode_no_setor('ti', 'inventory', 'transfer'))));
create policy assets_delete on public.assets for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'inventory', 'delete')));

-- A lista ao abrir chamado ("Outros equipamentos" — a impressora do setor): qualquer pessoa da
-- empresa, mas só o que identifica o equipamento.
create or replace function public.equipamentos_para_chamado()
returns table (id uuid, name text, asset_tag text, category text, location text, status text, assigned_to uuid)
language sql
stable
security definer
set search_path to 'public'
as $$
  select a.id, a.name, a.asset_tag, a.category::text, a.location, a.status::text, a.assigned_to
    from public.assets a
   where a.tenant_id = public.get_user_tenant_id() and a.status::text <> 'decommissioned'
   order by a.name;
$$;
revoke all on function public.equipamentos_para_chamado() from public, anon;
grant execute on function public.equipamentos_para_chamado() to authenticated;

-- ─── Contratos ────────────────────────────────────────────────────────────────
drop policy if exists "Supervisors can view contracts" on public.software_contracts;
drop policy if exists "Supervisors can create contracts" on public.software_contracts;
drop policy if exists "Supervisors can update contracts" on public.software_contracts;
drop policy if exists "Directors can delete contracts" on public.software_contracts;
create policy software_contracts_select on public.software_contracts for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'contracts', 'view')));
create policy software_contracts_insert on public.software_contracts for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'contracts', 'create')));
create policy software_contracts_update on public.software_contracts for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'contracts', 'edit')))
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'contracts', 'edit')));
create policy software_contracts_delete on public.software_contracts for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'contracts', 'delete')));

-- ─── Licenças ─────────────────────────────────────────────────────────────────
drop policy if exists "Users can view licenses in their tenant" on public.software_licenses;
drop policy if exists "Supervisors can create licenses" on public.software_licenses;
drop policy if exists "Supervisors can update licenses" on public.software_licenses;
drop policy if exists "Directors can delete licenses" on public.software_licenses;
create policy software_licenses_select on public.software_licenses for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'licenses', 'view')));
create policy software_licenses_insert on public.software_licenses for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'licenses', 'create')));
create policy software_licenses_update on public.software_licenses for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'licenses', 'edit')))
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'licenses', 'edit')));
create policy software_licenses_delete on public.software_licenses for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'licenses', 'delete')));

-- A chave mora em `software_license_keys`; a coluna antiga da licença fica proibida de guardar
-- chave (medido: vazia em todas), senão quem só "vê licenças" leria a chave por ela.
alter table public.software_licenses drop constraint if exists software_licenses_sem_chave;
alter table public.software_licenses add constraint software_licenses_sem_chave
  check (license_key is null or btrim(license_key) = '');

drop policy if exists "Supervisors can view license keys" on public.software_license_keys;
drop policy if exists "Supervisors can create license keys" on public.software_license_keys;
drop policy if exists "Supervisors can update license keys" on public.software_license_keys;
drop policy if exists "Supervisors can delete license keys" on public.software_license_keys;
create policy software_license_keys_select on public.software_license_keys for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'licenses', 'view_keys')));
-- Gravar a chave é cadastrar ou editar a licença.
create policy software_license_keys_insert on public.software_license_keys for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id())
              and ((select public.pode_no_setor('ti', 'licenses', 'create')) or (select public.pode_no_setor('ti', 'licenses', 'edit'))));
create policy software_license_keys_update on public.software_license_keys for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'licenses', 'edit')))
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'licenses', 'edit')));
create policy software_license_keys_delete on public.software_license_keys for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'licenses', 'edit')));

drop policy if exists "Users can view license assignments in their tenant" on public.license_assignments;
drop policy if exists "Supervisors can create license assignments" on public.license_assignments;
drop policy if exists "Supervisors can update license assignments" on public.license_assignments;
drop policy if exists "Supervisors can delete license assignments" on public.license_assignments;
create policy license_assignments_select on public.license_assignments for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.pode_no_setor('ti', 'licenses', 'view')) or assigned_to = auth.uid()));
create policy license_assignments_insert on public.license_assignments for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'licenses', 'assign')));
create policy license_assignments_update on public.license_assignments for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'licenses', 'assign')))
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'licenses', 'assign')));
create policy license_assignments_delete on public.license_assignments for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'licenses', 'assign')));

drop policy if exists "View renewals in tenant" on public.software_license_renewals;
drop policy if exists "Supervisors insert renewals" on public.software_license_renewals;
drop policy if exists "Supervisors update renewals" on public.software_license_renewals;
drop policy if exists "Admins delete renewals" on public.software_license_renewals;
create policy software_license_renewals_select on public.software_license_renewals for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'licenses', 'view')));
create policy software_license_renewals_insert on public.software_license_renewals for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'licenses', 'edit')));
create policy software_license_renewals_update on public.software_license_renewals for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'licenses', 'edit')))
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'licenses', 'edit')));
create policy software_license_renewals_delete on public.software_license_renewals for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'licenses', 'delete')));

-- ─── Manutenções ──────────────────────────────────────────────────────────────
drop policy if exists "Users can view maintenances in their tenant" on public.asset_maintenances;
drop policy if exists "Technicians can create maintenances" on public.asset_maintenances;
drop policy if exists "Technicians can update maintenances" on public.asset_maintenances;
drop policy if exists "Directors can delete maintenances" on public.asset_maintenances;
create policy asset_maintenances_select on public.asset_maintenances for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.pode_no_setor('ti', 'maintenances', 'view')) or technician_id = auth.uid()));
create policy asset_maintenances_insert on public.asset_maintenances for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'maintenances', 'create')));
create policy asset_maintenances_update on public.asset_maintenances for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'maintenances', 'edit')))
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'maintenances', 'edit')));
create policy asset_maintenances_delete on public.asset_maintenances for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'maintenances', 'delete')));

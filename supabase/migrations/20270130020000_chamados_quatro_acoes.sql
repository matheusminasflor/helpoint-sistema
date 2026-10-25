-- QUATRO AÇÕES NOVAS EM "CHAMADOS" (proposta "Helpoint no dia a dia", etapa 0b, aprovada em 2026-10-24).
--
-- Até aqui cada uma pegava carona em outra coisa, e não havia como dar ou tirar só ela:
--   Abrir em nome de outra pessoa   ← "Assumir / atender" em algum setor (ou ter Compras)
--   Chamar para atender junto       ← "Transferir" no setor do chamado (o gestor)
--   Registrar viagem                ← "Transferir" num setor da pessoa que viaja
--   Editar automações               ← "Configurar chamados · alterar"
--
-- NINGUÉM PERDE ACESSO: cada ação nasce ligada no perfil que hoje passa pela carona. Quem atende o chamado continua
-- chamando alguém para atender junto sem caixinha (é o chamado dele); a caixinha vale para os chamados dos outros.

-- O padrão dos perfis de chamado (o que o perfil novo recebe) já com as quatro: o Gestor todas, o Operador abre em nome.
create or replace function public.chamados_do_perfil_padrao(p_nome text)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    when p_nome = 'Gestor' then
      '{"view_all":true,"assume":true,"change_status":true,"close":true,"reopen":true,
        "transfer":true,"change_priority":true,"schedule":true,"change_category":true,"internal_notes":true,"delete":true,
        "repassar_ausencias":true,"abrir_em_nome":true,"atender_junto":true,"registrar_viagem":true,"automacoes":true}'::jsonb
    when p_nome = 'Somente leitura' then
      '{"view_all":true,"assume":false,"change_status":false,"close":false,"reopen":false,
        "transfer":false,"change_priority":false,"schedule":false,"change_category":false,"internal_notes":false,"delete":false,
        "abrir_em_nome":false,"atender_junto":false,"registrar_viagem":false,"automacoes":false}'::jsonb
    else
      '{"view_all":true,"assume":true,"change_status":true,"close":true,"reopen":true,
        "transfer":false,"change_priority":true,"schedule":true,"change_category":true,"internal_notes":true,"delete":false,
        "abrir_em_nome":true,"atender_junto":false,"registrar_viagem":false,"automacoes":false}'::jsonb
  end;
$$;

-- A mesma conta serve à empresa nova: o gatilho que semeia os perfis padrão chama esta função depois de semeá-los.
create or replace function public.perfis_ganham_acoes_de_chamado(p_tenant uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.access_profiles ap
     set permissions = ap.permissions || jsonb_build_object('tickets', coalesce(ap.permissions -> 'tickets', '{}'::jsonb) || n.novas)
    from (
      select id,
             (case when coalesce((permissions -> 'tickets' ->> 'assume')::boolean, false) or department = 'compras'
                   then '{"abrir_em_nome": true}'::jsonb else '{}'::jsonb end)
          || (case when coalesce((permissions -> 'tickets' ->> 'transfer')::boolean, false)
                   then '{"atender_junto": true, "registrar_viagem": true}'::jsonb else '{}'::jsonb end)
          || (case when coalesce((permissions -> 'config_chamados' ->> 'edit')::boolean, false)
                   then '{"automacoes": true}'::jsonb else '{}'::jsonb end) as novas
        from public.access_profiles
       where tenant_id = p_tenant
    ) n
   where n.id = ap.id and n.novas <> '{}'::jsonb;
$$;
revoke all on function public.perfis_ganham_acoes_de_chamado(uuid) from public, anon, authenticated;

select public.perfis_ganham_acoes_de_chamado(t.id) from public.tenants t;

-- Empresa nova: os perfis padrão já nascem com as quatro ações, e a Diretoria com o "Diretor" (20270130010000).
create or replace function public.seed_default_categories_novos_modulos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare d text;
begin
  perform public.seed_categorias_comercial_educacional(new.id);
  perform public.seed_categorias_expedicao_producao(new.id);
  foreach d in array array['ti', 'marketing', 'rh', 'qualidade', 'financeiro', 'comercial', 'educacional',
                           'expedicao', 'producao'] loop
    perform public.seed_default_access_profiles(new.id, d);
  end loop;
  perform public.completar_perfis_do_financeiro(new.id);
  perform public.seed_perfis_de_compras(new.id);
  perform public.perfis_ganham_acoes_de_chamado(new.id);
  insert into public.access_profiles (tenant_id, department, name, description, is_default, permissions)
  values (new.id, 'diretoria', 'Diretor', 'Vê todas as telas da Diretoria', true,
          '{"resumo": {"view": true}, "indicadores": {"view": true}, "metas": {"view": true},
            "clientes": {"view": true}, "produtos": {"view": true}, "diretrizes": {"view": true}}'::jsonb)
  on conflict (tenant_id, department, name) do nothing;
  return new;
end;
$$;

-- ═══ Abrir em nome de outra pessoa: em qualquer setor em que a caixinha esteja ligada ═══
create or replace function public.pode_abrir_em_nome_de_outro()
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select public.is_admin_or_higher(auth.uid())
      or exists (select 1 from public.user_access_profiles uap
                  where uap.user_id = auth.uid() and uap.tenant_id = public.get_user_tenant_id()
                    and public.tem_permissao(auth.uid(), uap.department, 'tickets', 'abrir_em_nome'));
$$;
revoke all on function public.pode_abrir_em_nome_de_outro() from public, anon;
grant execute on function public.pode_abrir_em_nome_de_outro() to authenticated;

drop policy if exists "Users can create tickets" on public.tickets;
create policy "Users can create tickets" on public.tickets for insert to authenticated
  with check (tenant_id = public.get_user_tenant_id()
              and (requester_id = auth.uid()
                   or (created_by = auth.uid()
                       and public.pode_abrir_em_nome_de_outro()
                       and exists (select 1 from public.profiles p
                                    where p.id = requester_id and p.tenant_id = public.get_user_tenant_id()))));

-- ═══ Chamar para atender junto ═══
create or replace function public.pode_chamar_para_atender_junto(p_ticket uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select exists (select 1 from public.tickets t
                  where t.id = p_ticket and t.tenant_id = public.get_user_tenant_id()
                    and (t.assigned_to = auth.uid()
                         or public.tem_permissao(auth.uid(), public.setor_do_modulo(t.module), 'tickets', 'atender_junto')
                         or public.is_admin_or_higher(auth.uid())));
$$;

-- ═══ Registrar viagem: num setor em que a pessoa que viaja atende ═══
create or replace function public.pode_registrar_viagem(p_user uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select public.is_admin_or_higher(auth.uid())
      or exists (select 1 from public.user_module_access m
                  where m.user_id = p_user and m.tenant_id = public.get_user_tenant_id()
                    and public.tem_permissao(auth.uid(), m.module, 'tickets', 'registrar_viagem'));
$$;

-- ═══ Editar automações ═══
create or replace function public.pode_editar_automacoes(p_modulo text)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select public.is_diretor(auth.uid())
      or coalesce(public.tem_permissao(auth.uid(), public.setor_do_modulo(p_modulo), 'tickets', 'automacoes'), false);
$$;
revoke all on function public.pode_editar_automacoes(text) from public, anon;
grant execute on function public.pode_editar_automacoes(text) to authenticated;

drop policy automation_workflows_quem_configura_insere on public.automation_workflows;
drop policy automation_workflows_quem_configura_altera on public.automation_workflows;
drop policy automation_workflows_quem_configura_apaga on public.automation_workflows;
create policy automation_workflows_quem_edita_insere on public.automation_workflows
  for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_editar_automacoes(module));
create policy automation_workflows_quem_edita_altera on public.automation_workflows
  for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_editar_automacoes(module))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_editar_automacoes(module));
create policy automation_workflows_quem_edita_apaga on public.automation_workflows
  for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_editar_automacoes(module));

-- AS PERMISSÕES QUE FALTAVAM NO MENU (proposta "Helpoint no dia a dia", etapa 0b, aprovada em 2026-10-24).
--
-- Cada linha abaixo existia no sistema sem caixinha no perfil: ou só o administrador passava, ou bastava ter o módulo,
-- ou pegava carona em outra caixinha. NINGUÉM PERDE ACESSO: a caixinha nova nasce ligada para quem hoje já passa.
--
--   TI · Inventário · "Conferir devolução e a conferência do mês"   ← carona em "Inventário · editar"
--   RH · "Reembolsos" (vale-alimentação, transporte, combustível, descontos)   ← só dono e administrador
--   Financeiro · "Relatório de compras"   ← carona em "Contas a pagar"
--   Compras · "Aprovar / reprovar compra" passa a valer também para a compra da Caixinha (antes: só o responsável)
--   Qualidade · "SACs de clientes" e "Laudos técnicos" (escrever, assinar)   ← bastava ter o módulo
--   Educacional · "Treinamentos"   ← ver e inscrever: o módulo; montar e abrir turma: dono e administrador

-- ═══ Nascem ligadas ═══
-- O Gestor do setor também ganha o que até aqui só o administrador fazia na tela do próprio setor (Reembolsos do RH;
-- montar treinamento e abrir turma no Educacional): sem isso a tela do setor continuaria sem ninguém do setor.
-- A mesma conta serve à empresa nova (o gatilho que semeia os perfis chama esta função).
create or replace function public.perfis_ganham_secoes_da_etapa_0b(p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  liga constant text := 'permissions || jsonb_build_object(%1$L, coalesce(permissions -> %1$L, ''{}''::jsonb) || %2$L::jsonb)';
begin
  execute format('update public.access_profiles set permissions = ' || liga
                 || ' where tenant_id = $1 and department = ''ti'' and coalesce((permissions -> ''inventory'' ->> ''edit'')::boolean, false)',
                 'inventory', '{"conferir": true}') using p_tenant;
  execute format('update public.access_profiles set permissions = ' || liga
                 || ' where tenant_id = $1 and department = ''rh'' and name = ''Gestor''',
                 'reembolsos', '{"view": true, "edit": true, "delete": true}') using p_tenant;
  execute format('update public.access_profiles set permissions = ' || liga
                 || ' where tenant_id = $1 and department = ''financeiro'' and coalesce((permissions -> ''payables'' ->> ''view'')::boolean, false)',
                 'relatorio_compras', '{"view": true}') using p_tenant;
  -- "Produtos & Lotes" nunca foi lida (o cadastro mora em Configurações › SAC: produtos e lotes) e sai.
  update public.access_profiles set permissions = permissions - 'products' where tenant_id = p_tenant and department = 'qualidade';
  execute format('update public.access_profiles set permissions = ' || liga
                 || ' where tenant_id = $1 and department = ''qualidade''',
                 'sacs', '{"view": true, "edit": true}') using p_tenant;
  execute format('update public.access_profiles set permissions = ' || liga
                 || ' where tenant_id = $1 and department = ''qualidade''',
                 'technical_reports', '{"view": true, "edit": true, "sign": true}') using p_tenant;
  execute format('update public.access_profiles set permissions = ' || liga
                 || ' where tenant_id = $1 and department = ''educacional''',
                 'treinamentos', '{"view": true, "create": true}') using p_tenant;
  execute format('update public.access_profiles set permissions = ' || liga
                 || ' where tenant_id = $1 and department = ''educacional'' and name = ''Gestor''',
                 'treinamentos', '{"edit": true, "delete": true}') using p_tenant;
end;
$$;
revoke all on function public.perfis_ganham_secoes_da_etapa_0b(uuid) from public, anon, authenticated;

select public.perfis_ganham_secoes_da_etapa_0b(t.id) from public.tenants t;

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
  perform public.perfis_ganham_secoes_da_etapa_0b(new.id);
  insert into public.access_profiles (tenant_id, department, name, description, is_default, permissions)
  values (new.id, 'diretoria', 'Diretor', 'Vê todas as telas da Diretoria', true,
          '{"resumo": {"view": true}, "indicadores": {"view": true}, "metas": {"view": true},
            "clientes": {"view": true}, "produtos": {"view": true}, "diretrizes": {"view": true}}'::jsonb)
  on conflict (tenant_id, department, name) do nothing;
  return new;
end;
$$;

-- ═══ TI: marcar o item e anexar o termo de devolução ═══
do $$
declare
  r record;
  v_def text;
begin
  for r in select * from (values
    ('ti_marcar_item', $a$pode_no_setor('ti', 'inventory', 'edit')$a$, $b$pode_no_setor('ti', 'inventory', 'conferir')$b$),
    ('ti_marcar_item', 'Marcar equipamento pede a permissão de editar no Inventário da TI.',
                       'Marcar equipamento pede "Conferir devolução e a conferência do mês" no Inventário da TI.'),
    ('ti_anexar_termo_de_devolucao', $a$pode_no_setor('ti', 'inventory', 'edit')$a$, $b$pode_no_setor('ti', 'inventory', 'conferir')$b$),
    ('ti_anexar_termo_de_devolucao', 'Anexar o termo pede a permissão de editar no Inventário da TI.',
                                     'Anexar o termo pede "Conferir devolução e a conferência do mês" no Inventário da TI.')
  ) x(funcao, de, para) loop
    select pg_get_functiondef(p.oid) into v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = r.funcao;
    if v_def is null or position(r.de in v_def) = 0 then
      raise exception 'permissões: % não tem o trecho "%"', r.funcao, r.de;
    end if;
    execute replace(v_def, r.de, r.para);
  end loop;
end;
$$;

-- ═══ RH: Reembolsos ═══
do $$
declare t text;
begin
  foreach t in array array['rh_transport_vouchers', 'rh_meal_vouchers', 'rh_fuel_reimbursements', 'rh_monthly_deductions'] loop
    execute (select string_agg(format('drop policy %I on public.%I;', policyname, t), ' ')
               from pg_policies where schemaname = 'public' and tablename = t);
    execute format($p$
      create policy %1$s_le on public.%1$I for select to authenticated
        using (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_setor('rh', 'reembolsos', 'view'));
      create policy %1$s_lanca on public.%1$I for insert to authenticated
        with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_setor('rh', 'reembolsos', 'edit'));
      create policy %1$s_altera on public.%1$I for update to authenticated
        using (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_setor('rh', 'reembolsos', 'edit'))
        with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_setor('rh', 'reembolsos', 'edit'));
      create policy %1$s_apaga on public.%1$I for delete to authenticated
        using (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_setor('rh', 'reembolsos', 'delete'));
    $p$, t);
  end loop;
end;
$$;

-- ═══ Financeiro: Relatório de compras lê as compras ═══
create or replace function public.compras_ve_as_solicitacoes()
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select public.pode_no_setor('compras', 'solicitacoes', 'view')
      or public.pode_no_setor('compras', 'solicitacoes', 'approve')
      or public.pode_no_setor('compras', 'solicitacoes', 'execute')
      or public.pode_no_financeiro('payable', 'settle')
      or public.pode_no_setor('financeiro', 'relatorio_compras', 'view')
      or exists (select 1 from public.user_module_access m
                  where m.user_id = auth.uid() and m.module = 'diretoria');
$$;

-- ═══ Compras: quem aprova compra aprova também a da Caixinha ═══
create or replace function public.pode_decidir_compra(p_caixinha boolean)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select case when p_caixinha
              then public.is_admin_or_higher(auth.uid()) or public.e_responsavel_de_caixinha()
                or public.pode_no_setor('compras', 'solicitacoes', 'approve')
              else public.pode_no_setor('compras', 'solicitacoes', 'approve') end;
$$;

create or replace function public.pode_decidir_compra(p_caixinha boolean, p_caixinha_id uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select case when p_caixinha
              then public.is_admin_or_higher(auth.uid())
                or auth.uid() = public.responsavel_da_caixinha(coalesce(p_caixinha_id, public.caixinha_padrao(public.get_user_tenant_id())))
                or public.pode_no_setor('compras', 'solicitacoes', 'approve')
              else public.pode_no_setor('compras', 'solicitacoes', 'approve') end;
$$;

-- ═══ Qualidade: SACs e laudos ═══
-- Ver todos os SACs: a caixinha (a Diretoria continua vendo, pelo módulo dela).
create or replace function public.ve_o_sac()
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select coalesce(
    public.is_supervisor_or_higher(auth.uid())
    or exists (select 1 from public.user_module_access uma
                where uma.user_id = auth.uid() and uma.module = 'diretoria')
    or (exists (select 1 from public.user_module_access uma
                 where uma.user_id = auth.uid() and uma.module = 'qualidade')
        and public.tem_permissao(auth.uid(), 'qualidade', 'sacs', 'view')),
    false
  );
$$;

-- Atender e alterar: quem atende aquele SAC, ou a caixinha "Atender e alterar".
create or replace function public.pode_atender_o_sac()
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select public.is_supervisor_or_higher(auth.uid())
      or exists (select 1 from public.user_module_access uma
                  where uma.user_id = auth.uid() and uma.module = 'diretoria')
      or public.pode_no_setor('qualidade', 'sacs', 'edit');
$$;
revoke all on function public.pode_atender_o_sac() from public, anon;
grant execute on function public.pode_atender_o_sac() to authenticated;

drop policy "Quem cuida do SAC abre chamado de SAC" on public.sac_tickets;
drop policy "Quem cuida do SAC atende o chamado" on public.sac_tickets;
create policy "Quem cuida do SAC abre chamado de SAC" on public.sac_tickets for insert to authenticated
  with check (tenant_id = public.get_user_tenant_id() and (assigned_to = auth.uid() or (select public.pode_atender_o_sac())));
create policy "Quem cuida do SAC atende o chamado" on public.sac_tickets for update to authenticated
  using (tenant_id = public.get_user_tenant_id() and (assigned_to = auth.uid() or (select public.pode_atender_o_sac())))
  with check (tenant_id = public.get_user_tenant_id() and (assigned_to = auth.uid() or (select public.pode_atender_o_sac())));

-- Laudo: lê quem vê o SAC; escreve quem tem "Escrever o laudo"; finaliza quem tem "Assinar".
drop policy "Quem cuida daquele SAC escreve o laudo" on public.sac_technical_reports;
create policy "Quem cuida daquele SAC le o laudo" on public.sac_technical_reports for select to authenticated
  using (tenant_id = public.get_user_tenant_id() and (select public.posso_no_sac(sac_technical_reports.ticket_id)));
create policy "Quem escreve laudo grava" on public.sac_technical_reports for insert to authenticated
  with check (tenant_id = public.get_user_tenant_id() and (select public.posso_no_sac(sac_technical_reports.ticket_id))
              and public.pode_no_setor('qualidade', 'technical_reports', 'edit'));
create policy "Quem escreve laudo altera" on public.sac_technical_reports for update to authenticated
  using (tenant_id = public.get_user_tenant_id() and (select public.posso_no_sac(sac_technical_reports.ticket_id))
         and public.pode_no_setor('qualidade', 'technical_reports', 'edit'))
  with check (tenant_id = public.get_user_tenant_id() and (select public.posso_no_sac(sac_technical_reports.ticket_id))
              and public.pode_no_setor('qualidade', 'technical_reports', 'edit'));
create policy "Quem escreve laudo apaga" on public.sac_technical_reports for delete to authenticated
  using (tenant_id = public.get_user_tenant_id() and (select public.posso_no_sac(sac_technical_reports.ticket_id))
         and public.pode_no_setor('qualidade', 'technical_reports', 'edit'));

create or replace function public.laudo_so_finaliza_quem_assina()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed')
     and auth.uid() is not null and not public.pode_no_setor('qualidade', 'technical_reports', 'sign') then
    raise exception 'Finalizar o laudo pede "Assinar/Finalizar" em Laudos técnicos (Qualidade).' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.laudo_so_finaliza_quem_assina() from public, anon;
create trigger laudo_so_finaliza_quem_assina before insert or update of status on public.sac_technical_reports
  for each row execute function public.laudo_so_finaliza_quem_assina();

-- ═══ Educacional: Treinamentos ═══
drop policy "Gestor apaga inscricao lancada por engano" on public.training_enrollments;
drop policy "Quem tem o Educacional inscreve na turma" on public.training_enrollments;
drop policy "Quem tem o Educacional marca presenca" on public.training_enrollments;
drop policy "Quem tem o Educacional ve os participantes" on public.training_enrollments;
drop policy "Gestor abre a turma" on public.training_sessions;
drop policy "Quem tem o Educacional ve as turmas" on public.training_sessions;
drop policy "Gestor monta o treinamento" on public.trainings;
drop policy "Quem tem o Educacional ve os treinamentos" on public.trainings;

create policy trainings_le on public.trainings for select to authenticated
  using (tenant_id = public.get_user_tenant_id() and public.pode_no_setor('educacional', 'treinamentos', 'view'));
create policy trainings_monta on public.trainings for all to authenticated
  using (tenant_id = public.get_user_tenant_id() and public.pode_no_setor('educacional', 'treinamentos', 'edit'))
  with check (tenant_id = public.get_user_tenant_id() and public.pode_no_setor('educacional', 'treinamentos', 'edit'));
create policy training_sessions_le on public.training_sessions for select to authenticated
  using (tenant_id = public.get_user_tenant_id() and public.pode_no_setor('educacional', 'treinamentos', 'view'));
create policy training_sessions_abre on public.training_sessions for all to authenticated
  using (tenant_id = public.get_user_tenant_id() and public.pode_no_setor('educacional', 'treinamentos', 'edit'))
  with check (tenant_id = public.get_user_tenant_id() and public.pode_no_setor('educacional', 'treinamentos', 'edit'));
create policy training_enrollments_le on public.training_enrollments for select to authenticated
  using (tenant_id = public.get_user_tenant_id() and public.pode_no_setor('educacional', 'treinamentos', 'view'));
create policy training_enrollments_inscreve on public.training_enrollments for insert to authenticated
  with check (tenant_id = public.get_user_tenant_id() and public.pode_no_setor('educacional', 'treinamentos', 'create'));
create policy training_enrollments_presenca on public.training_enrollments for update to authenticated
  using (tenant_id = public.get_user_tenant_id() and public.pode_no_setor('educacional', 'treinamentos', 'create'))
  with check (tenant_id = public.get_user_tenant_id() and public.pode_no_setor('educacional', 'treinamentos', 'create'));
create policy training_enrollments_apaga on public.training_enrollments for delete to authenticated
  using (tenant_id = public.get_user_tenant_id() and public.pode_no_setor('educacional', 'treinamentos', 'delete'));

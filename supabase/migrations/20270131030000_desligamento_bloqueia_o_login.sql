-- Desligamento como assistente (proposta "Helpoint no dia a dia", etapa 4 · RH; decisão do dono de 2026-10-25).
--
-- Antes: "Desligar" em RH › Colaboradores era um clique que gravava `status = 'desligado'` e a data de HOJE. Não
-- abria o chamado de acessos para a TI e não tirava o login — a pessoa continuava entrando.
--
-- Agora (`rh_desligar`): data e motivo; o chamado da TI (equipamentos + acessos a revogar) abre NA HORA, o mesmo que o
-- chamado "Desligamento" do RH já abria; e o login para NO DIA do desligamento — data futura, a pessoa entra
-- normalmente até lá, e o robô das 00:05 (Brasil) desativa quem chegou ao dia.
--
-- E "desativado" passa a ser login barrado de verdade. Medido em 2026-10-25: `archive_profile` (Configurações ›
-- Pessoas › Desativar) só apagava os módulos e marcava `is_active = false`; nada lia `is_active` na entrada, e o
-- papel continuava. O trigger `login_segue_o_ativo` amarra o login (`auth.users.banned_until`) ao `is_active`, nas
-- duas direções: desativar barra, reativar libera. Vale só para a MUDANÇA: quem já estava desativado antes desta
-- migration não é tocado aqui.

alter table public.rh_employee_profiles add column if not exists termination_reason text;

-- ─── 1. O login segue o "ativo" ────────────────────────────────────────────────────────────────────────────
create or replace function public.login_segue_o_ativo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_active is distinct from old.is_active then
    update auth.users
       set banned_until = case when coalesce(new.is_active, true) then null else 'infinity'::timestamptz end
     where id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.login_segue_o_ativo() from public, anon, authenticated;
drop trigger if exists trg_login_segue_o_ativo on public.profiles;
create trigger trg_login_segue_o_ativo after update of is_active on public.profiles
  for each row execute function public.login_segue_o_ativo();

-- ─── 2. O chamado da TI do desligamento, numa função só ────────────────────────────────────────────────────
-- Era o corpo de `create_offboarding_ti_ticket` (20270129100000), preso ao chamado do RH. Agora o chamado do RH e o
-- assistente chamam a mesma coisa. O texto da descrição é o mesmo.
create or replace function public.abrir_desligamento_na_ti(p_tenant uuid, p_colaborador uuid, p_quem uuid, p_origem text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_categoria uuid;
  v_acessos text;
  v_equipamentos text;
  v_nome text;
  v_chamado uuid;
  v_checagem uuid;
begin
  select id into v_categoria from public.ti_categories
   where tenant_id = p_tenant and module = 'tickets' and name = 'Demissional' and is_active limit 1;
  if v_categoria is null then
    select id into v_categoria from public.ti_categories
     where tenant_id = p_tenant and module = 'tickets' and (name = 'Conta AD' or name ilike 'Acesso%') limit 1;
  end if;

  select coalesce(full_name, email, 'colaborador') into v_nome from public.profiles where id = p_colaborador;

  select string_agg(format('• [%s] %s%s', access_type, name,
           case when nullif(details ->> 'note', '') is not null then ' — ' || (details ->> 'note') else '' end),
         E'\n' order by access_type, name)
    into v_acessos
    from public.employee_access_grants
   where tenant_id = p_tenant and employee_id = p_colaborador and revoked_at is null;

  select string_agg(format('• %s%s', name, coalesce(' — patrimônio ' || asset_tag, '')), E'\n' order by name)
    into v_equipamentos
    from public.assets where tenant_id = p_tenant and assigned_to = p_colaborador;

  insert into public.tickets (tenant_id, module, title, description, category_id, priority, status,
                              requester_id, created_by, colaborador_id)
  values (p_tenant, 'tickets', 'Desligamento — devolver equipamentos e acessos — ' || v_nome,
          format(E'Gerado pelo desligamento (%s).\n\nColaborador: %s\n\nEquipamentos no nome da pessoa (marque cada um no painel "Devolução de equipamentos"):\n%s\n\nAcessos a revogar:\n%s',
                 p_origem, v_nome,
                 coalesce(v_equipamentos, '(nenhum equipamento no nome da pessoa no Inventário)'),
                 coalesce(v_acessos, '(nenhum acesso registrado na admissão — confira com o RH)')),
          v_categoria, 'high', 'open', p_quem, p_quem, p_colaborador)
  returning id into v_chamado;

  insert into public.ti_checagens (tenant_id, tipo, ticket_id, colaborador_id, colaborador_nome)
  values (p_tenant, 'devolucao', v_chamado, p_colaborador, v_nome)
  returning id into v_checagem;

  insert into public.ti_checagem_itens (tenant_id, checagem_id, asset_id, pessoa_id, pessoa_nome, descricao, patrimonio, serie)
  select p_tenant, v_checagem, a.id, p_colaborador, v_nome,
         a.name || coalesce(' — ' || nullif(btrim(concat_ws(' ', a.manufacturer, a.model)), ''), ''),
         a.asset_tag, a.serial_number
    from public.assets a where a.tenant_id = p_tenant and a.assigned_to = p_colaborador;

  update public.employee_access_grants set revoke_ticket_id = v_chamado, updated_at = now()
   where tenant_id = p_tenant and employee_id = p_colaborador and revoked_at is null;
  return v_chamado;
end;
$$;
revoke all on function public.abrir_desligamento_na_ti(uuid, uuid, uuid, text) from public, anon, authenticated;

create or replace function public.create_offboarding_ti_ticket()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.module <> 'rh' or new.subcategory is null or new.subcategory not ilike 'desligamento%' then
    return new;
  end if;
  if new.colaborador_id is null then
    raise exception 'Desligamento: escolha o colaborador que está saindo.' using errcode = '23514';
  end if;
  perform public.abrir_desligamento_na_ti(new.tenant_id, new.colaborador_id, new.requester_id,
                                          format('chamado RH #%s', new.ticket_number));
  return new;
end;
$$;

-- ─── 3. Desativar quem chegou ao dia ───────────────────────────────────────────────────────────────────────
-- Mesmo efeito de Configurações › Pessoas › Desativar (`archive_profile`): guarda a foto para reativar, tira os
-- módulos e marca inativo (o trigger acima barra o login). Sem a guarda de supervisor: quem chama é o assistente do
-- RH (que já checou a permissão) ou o robô.
create or replace function public.rh_desativa_o_desligado(p_user uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from public.profiles where id = p_user and coalesce(is_active, true);
  if v_tenant is null then return; end if;
  insert into public.profile_history (tenant_id, user_id, archived_by, reason, snapshot)
  select v_tenant, p_user, auth.uid(), coalesce(p_motivo, 'Desligamento registrado pelo RH'),
         jsonb_build_object(
           'profile', to_jsonb(p),
           'roles', coalesce((select jsonb_agg(role) from public.user_roles where user_id = p_user), '[]'::jsonb),
           'modules', coalesce((select jsonb_agg(module) from public.user_module_access where user_id = p_user), '[]'::jsonb),
           'ti_profile', (select to_jsonb(t) from public.ti_user_profiles t where user_id = p_user limit 1),
           'qualidade_profile', (select to_jsonb(q) from public.qualidade_user_profiles q where user_id = p_user limit 1))
    from public.profiles p where p.id = p_user;
  delete from public.user_module_access where user_id = p_user;
  delete from public.ti_user_profiles where user_id = p_user;
  delete from public.qualidade_user_profiles where user_id = p_user;
  update public.profiles set is_active = false, updated_at = now() where id = p_user;
end;
$$;
revoke all on function public.rh_desativa_o_desligado(uuid, text) from public, anon, authenticated;

-- ─── 4. O assistente ───────────────────────────────────────────────────────────────────────────────────────
create or replace function public.rh_desligar(p_colaborador uuid, p_data date, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp public.rh_employee_profiles%rowtype;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_chamado uuid;
  v_numero int;
begin
  if not public.pode_no_rh('employees', 'edit') then
    raise exception 'Desligar pede "Editar" em Colaboradores do RH.' using errcode = '42501';
  end if;
  if p_data is null then
    raise exception 'Escolha a data do desligamento.' using errcode = '23514';
  end if;
  select * into v_emp from public.rh_employee_profiles
   where id = p_colaborador and tenant_id = public.get_user_tenant_id() for update;
  if not found then
    raise exception 'Colaborador não encontrado.' using errcode = 'P0002';
  end if;
  if v_emp.status = 'desligado' then
    raise exception 'Este colaborador já está desligado.' using errcode = '23514';
  end if;

  update public.rh_employee_profiles
     set status = 'desligado', termination_date = p_data, termination_reason = nullif(btrim(p_motivo), ''), updated_at = now()
   where id = p_colaborador;

  if v_emp.user_id is not null then
    v_chamado := public.abrir_desligamento_na_ti(v_emp.tenant_id, v_emp.user_id, auth.uid(),
                   'registrado pelo RH em Colaboradores, saída em ' || to_char(p_data, 'DD/MM/YYYY'));
    select ticket_number into v_numero from public.tickets where id = v_chamado;
    if p_data <= v_hoje then
      perform public.rh_desativa_o_desligado(v_emp.user_id, nullif(btrim(p_motivo), ''));
    end if;
  end if;

  return jsonb_build_object('tem_login', v_emp.user_id is not null, 'chamado_ti', v_numero,
                            'bloqueado_agora', v_emp.user_id is not null and p_data <= v_hoje);
end;
$$;
revoke all on function public.rh_desligar(uuid, date, text) from public, anon;
grant execute on function public.rh_desligar(uuid, date, text) to authenticated;

-- ─── 5. O robô do dia ──────────────────────────────────────────────────────────────────────────────────────
create or replace function public.rh_desativa_os_desligados_do_dia()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_feitos int := 0;
begin
  for r in
    select e.user_id, e.termination_reason
      from public.rh_employee_profiles e
      join public.profiles p on p.id = e.user_id and coalesce(p.is_active, true)
     where e.status = 'desligado'
       and e.termination_date <= (now() at time zone 'America/Sao_Paulo')::date
  loop
    perform public.rh_desativa_o_desligado(r.user_id, r.termination_reason);
    v_feitos := v_feitos + 1;
  end loop;
  return v_feitos;
end;
$$;
revoke all on function public.rh_desativa_os_desligados_do_dia() from public, anon, authenticated;

-- 00:05 no Brasil (03:05 UTC): no primeiro minuto do dia do desligamento, o login já não entra.
select cron.unschedule('rh-desativa-desligados') where exists (select 1 from cron.job where jobname = 'rh-desativa-desligados');
select cron.schedule('rh-desativa-desligados', '5 3 * * *', $cron$select public.rh_desativa_os_desligados_do_dia()$cron$);

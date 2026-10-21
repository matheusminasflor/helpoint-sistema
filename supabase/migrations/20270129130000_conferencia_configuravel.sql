-- CONFERÊNCIA DE EQUIPAMENTOS CONFIGURÁVEL (dono, 2026-10-21). O #175 abriu "no nome do Mairon": a rotina de
-- 20270129100000 pegava o primeiro dono da empresa como solicitante, e não havia tela para mudar nada. Agora a TI
-- configura em TI › Configurações › Inventário e cadastros: ligada ou não, o dia do mês e quem aparece como
-- solicitante. Sem configuração, vale como antes (ligada, dia 1, primeiro dono).

create table if not exists public.ti_conferencia_config (
  tenant_id uuid primary key default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  ativo boolean not null default true,
  dia_do_mes int not null default 1 check (dia_do_mes between 1 and 28),
  solicitante_id uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
alter table public.ti_conferencia_config enable row level security;

-- Quem edita os cadastros da TI (a mesma caixinha da aba) ou o administrador.
create or replace function public.pode_configurar_conferencia()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_or_higher(auth.uid()) or public.tem_permissao(auth.uid(), 'ti', 'cadastros', 'edit');
$$;
revoke all on function public.pode_configurar_conferencia() from public, anon;
grant execute on function public.pode_configurar_conferencia() to authenticated;

create policy ti_conferencia_config_le on public.ti_conferencia_config for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()));
create policy ti_conferencia_config_cria on public.ti_conferencia_config for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_configurar_conferencia());
create policy ti_conferencia_config_muda on public.ti_conferencia_config for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_configurar_conferencia())
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_configurar_conferencia());

create or replace function public.ti_abrir_conferencia_do_mes()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes date := date_trunc('month', v_hoje)::date;
  v_rotulo text := to_char(v_mes, 'MM/YYYY');
  t record;
  v_solicitante uuid;
  v_categoria uuid;
  v_chamado uuid;
  v_checagem uuid;
  n int := 0;
begin
  for t in
    select distinct a.tenant_id, c.dia_do_mes, c.solicitante_id
      from public.assets a
      left join public.ti_conferencia_config c on c.tenant_id = a.tenant_id
     where a.assigned_to is not null
       and coalesce(c.ativo, true)
       and extract(day from v_hoje) >= coalesce(c.dia_do_mes, 1)
       and not exists (select 1 from public.ti_checagens k
                        where k.tenant_id = a.tenant_id and k.tipo = 'conferencia' and k.referencia = v_mes)
  loop
    -- O solicitante escolhido na configuração, se ainda está ativo; senão, o primeiro dono, como antes.
    select p.id into v_solicitante from public.profiles p
     where p.id = t.solicitante_id and p.tenant_id = t.tenant_id and coalesce(p.is_active, true);
    v_solicitante := coalesce(v_solicitante, (public.donos_da_empresa(t.tenant_id))[1]);
    if v_solicitante is null then
      continue;
    end if;
    select id into v_categoria from public.ti_categories
     where tenant_id = t.tenant_id and module = 'tickets' and parent_id is null and is_active and name = 'Hardware'
     limit 1;
    insert into public.tickets (tenant_id, module, title, description, category_id, priority, status, requester_id, created_by)
    values (t.tenant_id, 'tickets', 'Conferência de equipamentos — ' || v_rotulo,
            E'Conferência mensal (automática, configurada em TI › Configurações › Inventário e cadastros). Confira com cada pessoa se o equipamento no nome dela está com ela — '
            || E'patrimônio e número de série batendo — e marque no painel "Conferência de equipamentos".\n'
            || E'Divergência (trocado, sumido, levado para casa) pede o motivo e avisa o gestor da pessoa, o RH e a diretoria.',
            v_categoria, 'medium', 'open', v_solicitante, v_solicitante)
    returning id into v_chamado;
    insert into public.ti_checagens (tenant_id, tipo, ticket_id, referencia)
    values (t.tenant_id, 'conferencia', v_chamado, v_mes) returning id into v_checagem;
    insert into public.ti_checagem_itens (tenant_id, checagem_id, asset_id, pessoa_id, pessoa_nome, descricao, patrimonio, serie)
    select a.tenant_id, v_checagem, a.id, a.assigned_to, coalesce(p.full_name, p.email),
           a.name || coalesce(' — ' || nullif(btrim(concat_ws(' ', a.manufacturer, a.model)), ''), ''),
           a.asset_tag, a.serial_number
      from public.assets a left join public.profiles p on p.id = a.assigned_to
     where a.tenant_id = t.tenant_id and a.assigned_to is not null;
    n := n + 1;
  end loop;
  return n;
end;
$$;

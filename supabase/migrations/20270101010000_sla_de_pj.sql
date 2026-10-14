-- PRAZOS PARA PJ (dono, 2026-10-13): "o colaborador PJ presta serviço para a Minasflor e para outras
-- empresas, então na prática o SLA dele é diferente do interno". Decisão (múltipla escolha, a recomendada):
-- tabela de prazos PRÓPRIA do PJ, por setor e urgência. Chamado com atendente PJ usa a dela; sem prazo de PJ
-- preenchido para aquela urgência, vale o do setor (ou o padrão da empresa), como hoje.
--
-- Quem é PJ é marcado na configuração de prazos do PRÓPRIO setor (`sla_pj`), por quem configura o setor —
-- a mesma porta de `sla_policies` — e não no cadastro geral de pessoas.

create table if not exists public.sla_pj (
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  module text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tenant_id, module, user_id)
);
alter table public.sla_pj enable row level security;
create policy sla_pj_le on public.sla_pj for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()));
create policy sla_pj_marca on public.sla_pj for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_configurar_setor(public.setor_do_modulo(module)));
create policy sla_pj_desmarca on public.sla_pj for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_configurar_setor(public.setor_do_modulo(module)));

alter table public.sla_policies add column if not exists para_pj boolean not null default false;

/** O atendente é PJ neste setor? */
create or replace function public.atendente_pj(p_tenant uuid, p_module text, p_atendente uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_atendente is not null
     and exists (select 1 from public.sla_pj s where s.tenant_id = p_tenant and s.module = p_module and s.user_id = p_atendente);
$$;
revoke all on function public.atendente_pj(uuid, text, uuid) from public, anon;
grant execute on function public.atendente_pj(uuid, text, uuid) to authenticated;

-- Os dois prazos escolhem a linha: a do setor antes da da empresa; para o PJ, a de PJ antes da comum.
create or replace function public.prazo_da_primeira_resposta(p_tenant uuid, p_module text, p_priority text, p_inicio timestamp with time zone, p_atendente uuid)
returns timestamp with time zone language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_minutos integer;
  v_pj boolean := public.atendente_pj(p_tenant, p_module, p_atendente);
begin
  select s.first_response_time into v_minutos
    from public.sla_policies s
   where s.tenant_id = p_tenant and s.priority::text = p_priority and s.is_active
     and (s.module = p_module or s.module is null)
     and (not s.para_pj or v_pj)
   order by s.module nulls last, s.para_pj desc
   limit 1;
  if v_minutos is null then
    return null;
  end if;
  p_inicio := coalesce(public.volta_da_viagem(p_tenant, p_module, p_atendente, p_inicio), p_inicio);
  return public.prazo_do_chamado(p_tenant, p_module, p_inicio, v_minutos, p_atendente);
end;
$$;

create or replace function public.prazo_padrao_do_chamado(p_tenant uuid, p_module text, p_priority text, p_inicio timestamp with time zone, p_atendente uuid, p_due_date timestamp with time zone)
returns timestamp with time zone language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_minutos integer;
  v_prazo timestamptz;
  v_pj boolean := public.atendente_pj(p_tenant, p_module, p_atendente);
begin
  select s.resolution_time into v_minutos
    from public.sla_policies s
   where s.tenant_id = p_tenant and s.priority::text = p_priority and s.is_active
     and (s.module = p_module or s.module is null)
     and (not s.para_pj or v_pj)
   order by s.module nulls last, s.para_pj desc
   limit 1;
  if v_minutos is null then
    return null;
  end if;
  -- Nasceu com quem atende em viagem: conta da volta (20261219020000).
  p_inicio := coalesce(public.volta_da_viagem(p_tenant, p_module, p_atendente, p_inicio), p_inicio);
  v_prazo := public.prazo_do_chamado(p_tenant, p_module, p_inicio, v_minutos, p_atendente);
  if p_due_date is not null and p_due_date > v_prazo then
    return p_due_date;
  end if;
  return v_prazo;
end;
$$;

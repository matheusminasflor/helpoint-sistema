-- Meta fixa de cada indicador dos setores (Diretoria › Indicadores dos setores; decisão do dono, 2026-10-25: "meta
-- fixa por número" — o diretor escreve uma vez e vale todo mês até ele mudar).
--
-- O número é só o alvo. O sentido ("até 24h" ou "pelo menos 90%") é do indicador e mora na tela, junto da lista de
-- quais indicadores aceitam meta (`MELHOR_QUANDO` em DiretoriaIndicadores.tsx): os "(hoje)" e os neutros não têm.
create table if not exists public.dir_metas_dos_setores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  setor text not null,
  indicador text not null,
  meta numeric not null check (meta >= 0),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (tenant_id, setor, indicador)
);
alter table public.dir_metas_dos_setores enable row level security;

-- Quem define: a nova ação "Definir as metas" em Indicadores dos setores. Nasce ligada para quem vê a tela hoje (abaixo).
create or replace function public.dir_pode_definir_metas_dos_setores()
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select public.has_diretoria_access(auth.uid())
     and (public.is_admin_or_higher(auth.uid())
          or public.tem_permissao(auth.uid(), 'diretoria', 'indicadores', 'definir_metas'));
$$;
revoke all on function public.dir_pode_definir_metas_dos_setores() from public, anon;
grant execute on function public.dir_pode_definir_metas_dos_setores() to authenticated;

create policy dir_metas_le on public.dir_metas_dos_setores for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.dir_pode_ver('indicadores'));
create policy dir_metas_cria on public.dir_metas_dos_setores for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and public.dir_pode_definir_metas_dos_setores());
-- Lição 15: o `with check` do UPDATE repete a permissão do `using`, nunca só o tenant.
create policy dir_metas_muda on public.dir_metas_dos_setores for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.dir_pode_definir_metas_dos_setores())
  with check (tenant_id = (select public.get_user_tenant_id()) and public.dir_pode_definir_metas_dos_setores());
create policy dir_metas_apaga on public.dir_metas_dos_setores for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.dir_pode_definir_metas_dos_setores());

create or replace function public.dir_metas_carimba()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger dir_metas_carimba before update on public.dir_metas_dos_setores
  for each row execute function public.dir_metas_carimba();

-- Nasce ligada para quem já vê os Indicadores dos setores (nenhuma opção nova tira acesso de ninguém).
update public.access_profiles
   set permissions = jsonb_set(permissions, '{indicadores,definir_metas}', 'true'::jsonb, true)
 where department = 'diretoria'
   and coalesce((permissions -> 'indicadores' ->> 'view')::boolean, false);

-- E o perfil "Diretor" das empresas novas já nasce com ela.
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
          '{"resumo": {"view": true}, "indicadores": {"view": true, "definir_metas": true}, "metas": {"view": true},
            "clientes": {"view": true}, "produtos": {"view": true}, "diretrizes": {"view": true}}'::jsonb)
  on conflict (tenant_id, department, name) do nothing;
  return new;
end;
$$;

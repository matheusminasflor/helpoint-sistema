-- TIPOS DE HOLERITE CADASTRÁVEIS (dono, 2026-11-04: "ter como cadastrar opções de pagamento, atualmente não tem
-- adiantamento salarial"). Proposta https://claude.ai/artifact/1AQYFWLJQxwzPxq22bMc2H, Parte 5, lista completa aprovada.
--
-- O tipo era texto livre preso a 4 valores no front (mensal, 13o, ferias, rescisao). Agora é uma lista por empresa,
-- editada em RH › Configurações › Holerites. `rh_payslips.type` continua sendo o CÓDIGO do tipo (nada muda para quem lê),
-- com chave estrangeira: código que não existe não entra, e tipo que já tem holerite não se apaga (só desativa).
-- Renomear não mexe no holerite: ele aponta para o código, e o nome vem da lista.

-- ─── 1. A lista ───────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.rh_tipos_holerite (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  codigo text not null default gen_random_uuid()::text,
  nome text not null check (length(btrim(nome)) between 1 and 60),
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, codigo)
);
create unique index if not exists rh_tipos_holerite_nome on public.rh_tipos_holerite (tenant_id, lower(btrim(nome)));

alter table public.rh_tipos_holerite enable row level security;
revoke all on public.rh_tipos_holerite from public, anon;
grant select, insert, update, delete on public.rh_tipos_holerite to authenticated;

-- Todo mundo da empresa lê (o Meu RH mostra o nome do tipo); só quem altera a aba Holerites do RH grava.
drop policy if exists rh_tipos_holerite_le on public.rh_tipos_holerite;
create policy rh_tipos_holerite_le on public.rh_tipos_holerite for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()));
drop policy if exists rh_tipos_holerite_cria on public.rh_tipos_holerite;
create policy rh_tipos_holerite_cria on public.rh_tipos_holerite for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('rh', 'holerites'));
drop policy if exists rh_tipos_holerite_altera on public.rh_tipos_holerite;
create policy rh_tipos_holerite_altera on public.rh_tipos_holerite for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('rh', 'holerites'))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('rh', 'holerites'));
drop policy if exists rh_tipos_holerite_apaga on public.rh_tipos_holerite;
create policy rh_tipos_holerite_apaga on public.rh_tipos_holerite for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('rh', 'holerites'));

-- O código não muda depois de criado (é a chave que os holerites guardam).
create or replace function public.rh_tipo_holerite_codigo_fixo()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.codigo is distinct from old.codigo or new.tenant_id is distinct from old.tenant_id then
    raise exception 'O código do tipo de holerite não muda' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.rh_tipo_holerite_codigo_fixo() from public, anon, authenticated;
drop trigger if exists trg_rh_tipo_holerite_codigo_fixo on public.rh_tipos_holerite;
create trigger trg_rh_tipo_holerite_codigo_fixo before update on public.rh_tipos_holerite
  for each row execute function public.rh_tipo_holerite_codigo_fixo();

-- ─── 2. A lista inicial: em toda empresa que existe e em toda que nascer ──────────────────────────────────────────────
-- Semente é exemplo, não regra (assistentes por módulo): o RH renomeia, reordena e desativa.
create or replace function public.rh_semear_tipos_holerite(p_tenant uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.rh_tipos_holerite (tenant_id, codigo, nome, ativo, ordem)
  values (p_tenant, 'mensal', 'Mensal', true, 1),
         (p_tenant, 'adiantamento', 'Adiantamento salarial', true, 2),
         (p_tenant, '13o_1', '13º salário · 1ª parcela', true, 3),
         (p_tenant, '13o_2', '13º salário · 2ª parcela', true, 4),
         (p_tenant, 'ferias', 'Férias', true, 5),
         (p_tenant, 'rescisao', 'Rescisão', true, 6),
         (p_tenant, 'plr', 'PLR', false, 7)
  on conflict (tenant_id, codigo) do nothing;
$$;
revoke all on function public.rh_semear_tipos_holerite(uuid) from public, anon, authenticated;

select public.rh_semear_tipos_holerite(id) from public.tenants;

create or replace function public.rh_tipos_holerite_da_empresa_nova()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.rh_semear_tipos_holerite(new.id);
  return null;
end;
$$;
revoke all on function public.rh_tipos_holerite_da_empresa_nova() from public, anon, authenticated;
drop trigger if exists trg_rh_tipos_holerite_da_empresa_nova on public.tenants;
create trigger trg_rh_tipos_holerite_da_empresa_nova after insert on public.tenants
  for each row execute function public.rh_tipos_holerite_da_empresa_nova();

-- O "13º Salário" antigo (código 13o) vira um tipo desativado onde já foi usado; qualquer outro código que já
-- exista em holerite entra também, desativado, para a chave estrangeira valer sem perder nada.
insert into public.rh_tipos_holerite (tenant_id, codigo, nome, ativo, ordem)
select distinct p.tenant_id, p.type,
       case p.type when '13o' then '13º salário' else initcap(replace(p.type, '_', ' ')) end, false, 90
  from public.rh_payslips p
 where p.type is not null
on conflict (tenant_id, codigo) do nothing;

-- ─── 3. O holerite aponta para a lista ────────────────────────────────────────────────────────────────────────────
-- A trava antiga aceitava só os 4 tipos fixos: com ela, o Adiantamento salarial seria recusado.
alter table public.rh_payslips drop constraint if exists rh_payslips_type_check;
alter table public.rh_payslips drop constraint if exists rh_payslips_tipo_fk;
alter table public.rh_payslips add constraint rh_payslips_tipo_fk
  foreign key (tenant_id, type) references public.rh_tipos_holerite (tenant_id, codigo);

-- ─── 4. A aba nova no perfil: herda de "Parâmetros da folha" ──────────────────────────────────────────────────────
create or replace function public.abas_de_configuracao(p_setor text)
returns text[]
language sql
immutable
set search_path to 'public'
as $$
  select case p_setor
    when 'ti'          then array['chamados', 'cadastros', 'checklists', 'alertas']
    when 'qualidade'   then array['chamados', 'sac_link', 'sac_produtos', 'sac_categorias', 'sac_campos']
    when 'rh'          then array['chamados', 'empresas', 'departamentos', 'folha', 'feriados', 'holerites']
    when 'marketing'   then array['chamados', 'beneficio']
    when 'financeiro'  then array['chamados', 'importacoes', 'conferencia']
    when 'compras'     then array['chamados', 'teto', 'comprador']
    when 'comercial'   then array['chamados', 'equipe', 'indicadores', 'cashback', 'familias', 'diretrizes']
    when 'educacional' then array['chamados']
    when 'expedicao'   then array['chamados']
    when 'producao'    then array['chamados']
    else array[]::text[]
  end;
$$;

update public.access_profiles
   set permissions = permissions || jsonb_build_object('config_holerites', jsonb_build_object(
         'view', coalesce((permissions -> 'config_folha' ->> 'view')::boolean, false),
         'edit', coalesce((permissions -> 'config_folha' ->> 'edit')::boolean, false)))
 where department = 'rh' and not (permissions ? 'config_holerites');

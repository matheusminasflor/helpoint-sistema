-- EXPEDIÇÃO E PRODUÇÃO VIRAM SETORES DE ATENDIMENTO (decisão do dono, 2026-10-02).
--
-- O dono: "ao abrir solicitação não tem como abrir para Expedição e nem Produção; Expedição ser
-- somente para atendimento, não ter estoque e separação mais. Produção mesma coisa: somente para
-- atendimento e ter os indicadores de atendimento igual de outros setores."
--
-- Decisões (múltipla escolha):
--   * estoque e separação SAEM — telas e tabelas. Medido antes: zero registro em exp_lots,
--     exp_stock_moves e exp_shipments, e ninguém com o módulo Expedição ou Produção;
--   * os dois setores ganham os três perfis (Gestor, Operador, Somente leitura) como os outros;
--   * categorias de partida sugeridas (o administrador edita em Configurações).
--
-- A receita é a do Educacional (20260909020000): CHECKs, perfis, categorias, o mapa de
-- visibilidade da fila, o setor do módulo (que `pode_no_chamado` usa), as abas de configuração,
-- o nome do setor nos avisos e o painel de chamados da Diretoria.

-- ─── 1. Sai o estoque e a separação da Expedição ──────────────────────────────
drop policy if exists "Expedicao reads crm_orders" on public.crm_orders;
drop policy if exists "Expedicao reads crm_order_items" on public.crm_order_items;
drop policy if exists "Expedicao reads crm_contacts" on public.crm_contacts;
drop policy if exists "Expedicao reads crm_products" on public.crm_products;

-- Nesta ordem: o saldo por produto é feito em cima do saldo por lote.
drop view if exists public.exp_product_balances;
drop view if exists public.exp_lot_balances;
drop table if exists public.exp_shipment_items cascade;
drop table if exists public.exp_stock_moves cascade;
drop table if exists public.exp_shipments cascade;
drop table if exists public.exp_lots cascade;

drop function if exists public.exp_scan(uuid, text, numeric);
drop function if exists public.exp_ship(uuid, text, text);
drop function if exists public.exp_start(uuid);
drop function if exists public.exp_cancel(uuid, text);
drop function if exists public.exp_queue();
drop function if exists public.exp_shipping_status();
drop function if exists public.exp_pick_lot(uuid, uuid, numeric);
drop function if exists public.exp_set_config(text, jsonb);
drop function if exists public.exp_saldo_nao_fica_negativo();
drop function if exists public.exp_shipments_set_number();
drop function if exists public.has_expedicao_access(uuid);
-- A etiqueta dos Correios saía da separação; sem separação, sem etiqueta. Zero linhas medidas.
drop table if exists public.tenant_correios_credentials cascade;

-- A configuração da separação e da etiqueta morava nas configurações da empresa.
update public.tenants set settings = settings - 'expedicao' where settings ? 'expedicao';

-- ─── 2. Os dois setores entram onde o chamado e o perfil são conhecidos ───────
alter table public.tickets drop constraint if exists tickets_module_check;
alter table public.tickets add constraint tickets_module_check check (module = any (array[
  'tickets', 'marketing', 'qualidade', 'rh', 'financeiro', 'comercial', 'educacional', 'compras',
  'expedicao', 'producao']));

alter table public.sla_policies drop constraint if exists sla_policies_module_check;
alter table public.sla_policies add constraint sla_policies_module_check check (module is null or module = any (array[
  'tickets', 'marketing', 'qualidade', 'rh', 'financeiro', 'comercial', 'educacional', 'compras',
  'expedicao', 'producao']));

alter table public.automation_workflows drop constraint if exists automation_workflows_module_check;
alter table public.automation_workflows add constraint automation_workflows_module_check check (module = any (array[
  'tickets', 'marketing', 'qualidade', 'rh', 'financeiro', 'comercial', 'educacional', 'crm',
  'expedicao', 'producao']));

alter table public.access_profiles drop constraint if exists access_profiles_department_check;
alter table public.access_profiles add constraint access_profiles_department_check check (department = any (array[
  'ti', 'marketing', 'rh', 'qualidade', 'financeiro', 'compras', 'comercial', 'educacional',
  'expedicao', 'producao']));

alter table public.user_access_profiles drop constraint if exists user_access_profiles_department_check;
alter table public.user_access_profiles add constraint user_access_profiles_department_check check (department = any (array[
  'ti', 'marketing', 'rh', 'qualidade', 'financeiro', 'compras', 'comercial', 'educacional',
  'expedicao', 'producao']));

-- Duas funções longas só precisam de dois nomes a mais numa lista. Trocar o texto da definição
-- que está no banco (e falhar alto se o trecho não estiver lá) é mais seguro que recopiar 8 KB
-- à mão. `create or replace` preserva a ACL.
do $$
declare
  d text;
  n text;
begin
  d := pg_get_functiondef('public.seed_default_access_profiles(uuid, text)'::regprocedure);
  n := replace(d, $t$'comercial', 'educacional') then$t$, $t$'comercial', 'educacional', 'expedicao', 'producao') then$t$);
  if n = d then raise exception 'seed_default_access_profiles: lista de setores não encontrada'; end if;
  execute n;

  d := pg_get_functiondef('public.automation_validate_flow(jsonb, jsonb)'::regprocedure);
  n := replace(d, $t$'comercial', 'educacional') then$t$, $t$'comercial', 'educacional', 'expedicao', 'producao') then$t$);
  if n = d then raise exception 'automation_validate_flow: lista de módulos não encontrada'; end if;
  execute n;

  d := pg_get_functiondef('public.dir_chamados_por_setor(timestamp with time zone)'::regprocedure);
  n := replace(d, $t$('financeiro'), ('comercial'), ('educacional')$t$, $t$('financeiro'), ('comercial'), ('educacional'), ('expedicao'), ('producao')$t$);
  if n = d then raise exception 'dir_chamados_por_setor: lista de setores não encontrada'; end if;
  execute n;
end $$;

-- Quem vê a fila: o mesmo mapa concessão → módulo do chamado, com os dois setores.
create or replace function public.modulos_de_chamado_visiveis()
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $function$
  with mapa(concessao, modulo_do_chamado) as (values
    ('ti',          'tickets'),
    ('marketing',   'marketing'),
    ('qualidade',   'qualidade'),
    ('rh',          'rh'),
    ('financeiro',  'financeiro'),
    ('comercial',   'comercial'),
    ('educacional', 'educacional'),
    ('compras',     'compras'),
    ('expedicao',   'expedicao'),
    ('producao',    'producao')
  ),
  minhas as (
    select coalesce(array_agg(uma.module), array[]::text[]) as concessoes
    from public.user_module_access uma
    where uma.user_id = auth.uid()
  )
  select case
    when 'diretoria' = any (coalesce((select concessoes from minhas), array[]::text[]))
      then (select array_agg(modulo_do_chamado) from mapa)
    else coalesce(
      (select array_agg(m.modulo_do_chamado) from mapa m
        where m.concessao = any (coalesce((select concessoes from minhas), array[]::text[]))
          and (m.concessao = 'compras'
               -- o ::text antes do parêntese é de propósito: a asserção 14 lê os pares do mapa
               -- pelo padrão aspa-nome-aspa-parêntese, e a ação entraria na conta como módulo.
               or public.tem_permissao(auth.uid(), m.concessao, 'tickets', 'view_all'::text))),
      array[]::text[])
  end;
$function$;

-- O setor de cada módulo — é por ele que `pode_no_chamado` lê o perfil. Sem os dois aqui, um
-- chamado da Expedição seria julgado pelo perfil da TI.
create or replace function public.setor_do_modulo(p_modulo text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select case
    when p_modulo in ('tickets', 'inventory', 'contracts', 'licenses', 'maintenances') then 'ti'
    when p_modulo = 'crm' then 'comercial'
    when p_modulo in ('marketing', 'rh', 'qualidade', 'financeiro', 'compras', 'comercial', 'educacional',
                      'expedicao', 'producao') then p_modulo
    else null
  end;
$function$;

create or replace function public.abas_de_configuracao(p_setor text)
returns text[]
language sql
immutable
set search_path to 'public'
as $function$
  select case p_setor
    when 'ti'          then array['chamados', 'cadastros', 'checklists', 'alertas']
    when 'qualidade'   then array['chamados', 'sac_link', 'sac_produtos', 'sac_categorias', 'sac_campos']
    when 'rh'          then array['chamados', 'empresas', 'departamentos', 'folha']
    when 'marketing'   then array['chamados']
    when 'financeiro'  then array['chamados', 'importacoes', 'conferencia']
    when 'compras'     then array['chamados', 'teto']
    when 'comercial'   then array['chamados', 'equipe', 'indicadores', 'cashback']
    when 'educacional' then array['chamados']
    when 'expedicao'   then array['chamados']
    when 'producao'    then array['chamados']
    else array[]::text[]
  end;
$function$;

create or replace function public.nome_do_setor_do_chamado(p_module text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case p_module
    when 'tickets' then 'TI' when 'marketing' then 'Marketing' when 'qualidade' then 'Qualidade'
    when 'rh' then 'RH' when 'financeiro' then 'Financeiro' when 'comercial' then 'Comercial'
    when 'educacional' then 'Educacional' when 'compras' then 'Compras'
    when 'expedicao' then 'Expedição' when 'producao' then 'Produção'
    else coalesce(p_module, 'outro setor') end;
$$;

-- ─── 3. Categorias de partida (sugestão; o administrador edita em Configurações) ───
create or replace function public.seed_categorias_expedicao_producao(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (select 1 from public.ti_categories where tenant_id = p_tenant_id and module = 'expedicao') then
    insert into public.ti_categories (tenant_id, module, name, sort_order) values
      (p_tenant_id, 'expedicao', 'Envio de pedido', 1),
      (p_tenant_id, 'expedicao', 'Rastreio e entrega', 2),
      (p_tenant_id, 'expedicao', 'Avaria ou troca', 3),
      (p_tenant_id, 'expedicao', 'Outros', 99);
  end if;
  if not exists (select 1 from public.ti_categories where tenant_id = p_tenant_id and module = 'producao') then
    insert into public.ti_categories (tenant_id, module, name, sort_order) values
      (p_tenant_id, 'producao', 'Ordem de produção', 1),
      (p_tenant_id, 'producao', 'Matéria-prima', 2),
      (p_tenant_id, 'producao', 'Problema no lote', 3),
      (p_tenant_id, 'producao', 'Manutenção de equipamento', 4),
      (p_tenant_id, 'producao', 'Outros', 99);
  end if;
end;
$$;
revoke all on function public.seed_categorias_expedicao_producao(uuid) from public, anon, authenticated;

-- Empresa nova nasce com os dois setores.
create or replace function public.seed_default_categories_novos_modulos()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare d text;
begin
  perform public.seed_categorias_comercial_educacional(new.id);
  perform public.seed_categorias_expedicao_producao(new.id);
  foreach d in array array['ti', 'marketing', 'rh', 'qualidade', 'financeiro', 'comercial', 'educacional',
                           'expedicao', 'producao'] loop
    perform public.seed_default_access_profiles(new.id, d);
  end loop;
  -- LEVA P: Compras ganhou perfis. Função própria porque as chaves do esquema de Compras não
  -- têm fila de chamados nem configurações, e nenhum ramo de `seed_default_access_profiles` serve.
  perform public.seed_perfis_de_compras(new.id);
  return new;
end;
$function$;

-- E as que já existem também.
do $$
declare t record;
begin
  for t in select id from public.tenants loop
    perform public.seed_categorias_expedicao_producao(t.id);
    perform public.seed_default_access_profiles(t.id, 'expedicao');
    perform public.seed_default_access_profiles(t.id, 'producao');
  end loop;
end $$;

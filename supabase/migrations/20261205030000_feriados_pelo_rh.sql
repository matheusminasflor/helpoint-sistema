-- QUEM CADASTRA OS FERIADOS É O RH (correção do dono, 2026-10-04).
--
-- 20261203050000 deixou cadastrar e tirar feriado quem configura os chamados de QUALQUER setor. O
-- dono: "quem define os feriados é o RH". Vira uma aba nova nas Configurações do RH, "Feriados", com
-- Abrir e Alterar no perfil (`config_feriados`); só quem altera essa aba cadastra e tira. Ler
-- continua sendo da empresa toda (a tela de prazos de cada setor mostra a lista).

-- A lista de abas (espelho de `src/config/abas-de-configuracao.ts`; o Vitest compara as duas).
create or replace function public.abas_de_configuracao(p_setor text)
returns text[]
language sql
immutable
set search_path to 'public'
as $$
  select case p_setor
    when 'ti'          then array['chamados', 'cadastros', 'checklists', 'alertas']
    when 'qualidade'   then array['chamados', 'sac_link', 'sac_produtos', 'sac_categorias', 'sac_campos']
    when 'rh'          then array['chamados', 'empresas', 'departamentos', 'folha', 'feriados']
    when 'marketing'   then array['chamados']
    when 'financeiro'  then array['chamados', 'importacoes', 'conferencia']
    when 'compras'     then array['chamados', 'teto']
    when 'comercial'   then array['chamados', 'equipe', 'indicadores', 'cashback', 'familias', 'diretrizes']
    when 'educacional' then array['chamados']
    when 'expedicao'   then array['chamados']
    when 'producao'    then array['chamados']
    else array[]::text[]
  end;
$$;

drop policy if exists feriados_da_empresa_quem_configura on public.feriados_da_empresa;
create policy feriados_da_empresa_quem_configura on public.feriados_da_empresa
  for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('rh', 'feriados'));
drop policy if exists feriados_da_empresa_tira on public.feriados_da_empresa;
create policy feriados_da_empresa_tira on public.feriados_da_empresa
  for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('rh', 'feriados'));

-- Os perfis do RH que já mexem em alguma aba das Configurações do RH ganham a aba Feriados do mesmo
-- jeito: quem altera alguma, altera esta; quem só abre, só abre.
update public.access_profiles ap
   set permissions = ap.permissions || jsonb_build_object('config_feriados', jsonb_build_object(
         'view', true,
         'edit', exists (select 1 from unnest(array['config_empresas', 'config_departamentos', 'config_folha']) k
                          where coalesce((ap.permissions -> k ->> 'edit')::boolean, false))))
 where ap.department = 'rh'
   and not (ap.permissions ? 'config_feriados')
   and exists (select 1 from unnest(array['config_empresas', 'config_departamentos', 'config_folha']) k
                where coalesce((ap.permissions -> k ->> 'view')::boolean, false)
                   or coalesce((ap.permissions -> k ->> 'edit')::boolean, false));

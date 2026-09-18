-- L5: Diretoria entra na lista de módulos. 2026-09-17.
--
-- A Diretoria é **visão**, não módulo com fila (decisão D6): não tem tabela,
-- não tem chamado, não tem configuração. O que ela precisa do banco é só isto —
-- aparecer na lista de módulos que a empresa pode conceder, senão o painel
-- existe e ninguém além de dono e administrador consegue abri-lo.
--
-- `user_module_access.module` é texto livre, sem CHECK: a concessão em si não
-- precisa de nada. E `access_profiles.department` fica de fora de propósito —
-- perfil de acesso é para quem atende fila, e a Diretoria não tem uma.

-- O padrão, para a empresa que ainda vai nascer.
alter table public.tenants
  alter column plan_config set default jsonb_build_object(
    'plan', 'free',
    'trial_ends_at', null,
    'max_users', 5,
    'available_modules', jsonb_build_array(
      'ti', 'crm', 'comercial', 'marketing', 'rh', 'financeiro',
      'producao', 'expedicao', 'educacional', 'qualidade', 'diretoria'),
    'features', jsonb_build_object(
      'lyra_advanced', true, 'advanced_reports', true, 'export_data', true));

-- E as que já existem. `- 'diretoria' || 'diretoria'` em vez de um `||` direto:
-- rodar duas vezes não pode deixar o módulo duplicado na lista.
update public.tenants
   set plan_config = jsonb_set(
         plan_config,
         '{available_modules}',
         (
           select jsonb_agg(m order by m)
             from (
               select jsonb_array_elements_text(plan_config -> 'available_modules') as m
               union
               select 'diretoria'
             ) todos
         ))
 where plan_config ? 'available_modules';

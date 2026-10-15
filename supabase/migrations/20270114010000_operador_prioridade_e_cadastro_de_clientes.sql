-- AJUSTES DE PERFIL (dono, 2026-10-15).
--   1. "Todos os operadores de cada setor podem mudar a prioridade se necessário": "Mudar prioridade e prazo" ligada
--      em todo perfil Operador, e no padrão de chamados de perfil novo.
--   2. "Cadastro de clientes não deve ficar no Comercial, somente Matheus Baeta e Mairon têm acesso; deveria ficar em
--      Configurações": a tela volta para Configurações (front) e a caixinha "Cadastrar cliente" sai de todo perfil —
--      dono e administradores passam sempre (`com_clientes_insert`), e são eles os dois.

update public.access_profiles
   set permissions = jsonb_set(permissions, '{tickets,change_priority}', 'true'::jsonb)
 where name = 'Operador' and jsonb_typeof(permissions -> 'tickets') = 'object';

update public.access_profiles
   set permissions = jsonb_set(permissions, '{clientes,cadastrar}', 'false'::jsonb)
 where department = 'comercial' and jsonb_typeof(permissions -> 'clientes') = 'object';

create or replace function public.chamados_do_perfil_padrao(p_nome text)
returns jsonb language sql immutable set search_path to 'public' as $function$
  select case
    when p_nome = 'Gestor' then
      '{"view_all":true,"assume":true,"change_status":true,"close":true,"reopen":true,
        "transfer":true,"change_priority":true,"schedule":true,"change_category":true,"internal_notes":true,"delete":true,
        "repassar_ausencias":true}'::jsonb
    when p_nome = 'Somente leitura' then
      '{"view_all":true,"assume":false,"change_status":false,"close":false,"reopen":false,
        "transfer":false,"change_priority":false,"schedule":false,"change_category":false,"internal_notes":false,"delete":false}'::jsonb
    else
      '{"view_all":true,"assume":true,"change_status":true,"close":true,"reopen":true,
        "transfer":false,"change_priority":true,"schedule":true,"change_category":true,"internal_notes":true,"delete":false}'::jsonb
  end;
$function$;

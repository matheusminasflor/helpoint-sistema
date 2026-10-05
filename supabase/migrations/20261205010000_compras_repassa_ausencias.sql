-- COMPRAS TAMBÉM RECEBE O AVISO DE AUSÊNCIA (revisão de permissões, 2026-10-04; o dono aprovou).
--
-- A revisão achou: quando um comprador sai 2 dias ou mais, `gestores_da_pessoa` procura quem tem
-- `tickets.repassar_ausencias` num setor em comum — e o perfil de Compras não tem a seção Chamados
-- (a solicitação de compra é o pedido, decisão de 2026-09-27). Ninguém de Compras podia ter a
-- caixinha, e o aviso caía sempre no dono.
--
-- O banco já pergunta do jeito certo (`tem_permissao(pessoa, 'compras', 'tickets',
-- 'repassar_ausencias')`); faltava a chave existir no perfil. A tela de perfis ganha a linha
-- "Ausências da equipe" em Compras (só essa ação — não abre fila de chamados nenhuma: as outras
-- ações de chamado de Compras continuam inexistentes e o `pode_no_chamado` segue respondendo não).

-- Os perfis Gestor de Compras de hoje ganham a caixinha marcada, como os Gestores dos outros setores
-- ganharam em 20261128010000. Os demais ficam com ela desmarcada.
update public.access_profiles
   set permissions = jsonb_set(permissions, '{tickets}',
                               coalesce(permissions -> 'tickets', '{}'::jsonb) || '{"repassar_ausencias": true}'::jsonb)
 where department = 'compras' and name = 'Gestor';

-- E os que nascerem com uma empresa nova.
create or replace function public.seed_perfis_de_compras(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.access_profiles (tenant_id, department, name, description, is_default, permissions)
  select p_tenant_id, 'compras', v.name, v.description, v.is_default, v.permissions
    from (values
      ('Gestor', 'Acesso completo: aprova, executa, cuida do catálogo, dos fornecedores e das configurações', false,
       '{"solicitacoes": {"view": true, "approve": true, "execute": true},
         "catalogo": {"view": true, "edit": true},
         "fornecedores": {"view": true, "create": true, "edit": true, "delete": true},
         "settings": {"view": true, "edit": true},
         "reports": {"view": true, "export": true, "view_team_metrics": true},
         "tickets": {"repassar_ausencias": true}}'::jsonb),
      ('Operador', 'Trabalho do dia a dia: vê as solicitações, executa a compra e mantém o catálogo', true,
       '{"solicitacoes": {"view": true, "execute": true},
         "catalogo": {"view": true, "edit": true},
         "fornecedores": {"view": true, "create": true, "edit": true},
         "reports": {"view": true}}'::jsonb),
      ('Somente leitura', 'Visualização sem permitir alterações', false,
       '{"solicitacoes": {"view": true},
         "catalogo": {"view": true},
         "fornecedores": {"view": true},
         "reports": {"view": true}}'::jsonb)
    ) as v(name, description, is_default, permissions)
   where not exists (
     select 1 from public.access_profiles ap
      where ap.tenant_id = p_tenant_id and ap.department = 'compras' and ap.name = v.name
   );
end;
$function$;

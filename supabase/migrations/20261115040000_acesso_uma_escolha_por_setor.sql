-- LEVA P, parte 3 — o acesso de uma pessoa é UMA escolha por setor.
--
-- Decisão do dono (2026-09-28): na janela da pessoa, cada setor tem uma lista — "Sem acesso" ou
-- o perfil dela. Some o par "marcar o módulo" + "escolher o perfil", que eram dois passos para
-- a mesma ideia e deixavam um terceiro estado sem nome: módulo marcado SEM perfil, em que a
-- pessoa via o menu e `tem_permissao` respondia falso para tudo.
--
-- Duas coisas no banco para a escolha única funcionar:
--
--   1. COMPRAS NÃO TINHA PERFIS. Os outros sete setores nascem com Gestor, Operador e Somente
--      leitura (`seed_default_access_profiles`, chamado pelo trigger de `tenants`); Compras virou
--      setor na leva N e ficou fora. A lista de Compras teria só "Sem acesso". Os perfis nascem
--      aqui, para as empresas que existem e — pelo trigger — para as que vierem, com as chaves do
--      esquema de Compras (`access-profile-schemas.ts`).
--
--   2. QUEM TEM O MÓDULO SEM PERFIL recebe o perfil padrão do setor (Operador). Custo aceito pelo
--      dono ao escolher: essa pessoa passa a poder o que o Operador pode. Medido no test-helpoint:
--      1 pessoa, em TI.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Os perfis de Compras
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.seed_perfis_de_compras(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.access_profiles (tenant_id, department, name, description, is_default, permissions)
  select p_tenant_id, 'compras', v.name, v.description, v.is_default, v.permissions
    from (values
      ('Gestor', 'Acesso completo: aprova, executa e cuida do catálogo e dos fornecedores', false,
       '{"solicitacoes": {"view": true, "approve": true, "execute": true},
         "catalogo": {"view": true, "edit": true},
         "fornecedores": {"view": true, "create": true, "edit": true, "delete": true},
         "reports": {"view": true, "export": true, "view_team_metrics": true}}'::jsonb),
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
$$;

-- Semente: só o trigger e esta migration chamam. Ninguém de fora.
revoke all on function public.seed_perfis_de_compras(uuid) from public, anon, authenticated;

create or replace function public.seed_default_categories_novos_modulos()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare d text;
begin
  perform public.seed_categorias_comercial_educacional(new.id);
  foreach d in array array['ti', 'marketing', 'rh', 'qualidade', 'financeiro', 'comercial', 'educacional'] loop
    perform public.seed_default_access_profiles(new.id, d);
  end loop;
  -- LEVA P: Compras ganhou perfis. Função própria porque as chaves do esquema de Compras não
  -- têm fila de chamados nem configurações, e nenhum ramo de `seed_default_access_profiles` serve.
  perform public.seed_perfis_de_compras(new.id);
  return new;
end;
$function$;

select public.seed_perfis_de_compras(t.id) from public.tenants t;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Módulo sem perfil recebe o perfil padrão do setor
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.user_access_profiles (tenant_id, user_id, department, profile_id)
select m.tenant_id, m.user_id, m.module, ap.id
  from public.user_module_access m
  join public.access_profiles ap
    on ap.tenant_id = m.tenant_id and ap.department = m.module and ap.is_default
 where m.module in ('ti', 'marketing', 'rh', 'qualidade', 'financeiro', 'compras', 'comercial', 'educacional')
on conflict (tenant_id, user_id, department)
  do update set profile_id = excluded.profile_id
  where public.user_access_profiles.profile_id is null;

-- ARQUIVO DE REFERÊNCIA — NÃO roda contra o schema deste sistema, e por isso
-- não mora junto com a suíte pgTAP.
-- Veio da reconstrução Next.js encerrada (`helpoint-saas`, tag
-- `arquivo/next-js-saas`), preservado aqui porque aquela pasta foi apagada em
-- 03/09/2026 — o histórico dela está em `../arquivo/V2 Helpoint.bundle`.
-- Fala de `orgs`/`current_user_id`, que não são as tabelas daqui
-- (`tenants`/`profiles`). Vale pelas duas lições documentadas abaixo e pelo
-- formato — não como helper pronto para usar.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- Helpers de teste — schema `tests`
-- Referência: §3.8 do docs/arquitetura.md
--
-- Não é um teste (não termina em .test.sql). É aplicado antes da suíte:
--   · local (Docker):  incluído por supabase/seed.sql
--   · projeto de teste: aplicado por `npm run db:test:setup`
--
-- A ideia central: simular a identidade de um usuário sem depender do GoTrue,
-- usando a variável de sessão `app.current_user_id` que public.current_user_id()
-- consulta ANTES do auth.uid() (§3.4). É exatamente para isso que aquela
-- indireção existe — ela é o que torna o RLS testável.
--
-- ┌─ Duas lições que custaram uma rodada de depuração ─────────────────────┐
-- │ 1. Os lookups (uid_of, org_id, ...) precisam de SECURITY DEFINER: eles │
-- │    rodam DEPOIS do primeiro login e, sem isso, o próprio RLS os cega   │
-- │    para as demais organizações.                                        │
-- │ 2. SET ROLE não pode acontecer dentro de uma função SECURITY DEFINER.  │
-- │    Por isso authenticate_as é INVOKER e delega o lookup a uid_of.      │
-- └───────────────────────────────────────────────────────────────────────┘
-- ═══════════════════════════════════════════════════════════════════════════

create schema if not exists tests;

grant usage on schema tests to authenticated, anon, service_role;
alter default privileges in schema tests
  grant execute on functions to authenticated, anon, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- Lookups — SECURITY DEFINER para ignorar o RLS
-- ───────────────────────────────────────────────────────────────────────────
create or replace function tests.uid_of(p_email text)
returns uuid language sql security definer set search_path = '' as $$
  select id from public.users where email = p_email;
$$;

create or replace function tests.org_id(p_slug text)
returns uuid language sql security definer set search_path = '' as $$
  select id from public.organizations where slug = p_slug;
$$;

create or replace function tests.membership_id(p_email text, p_org_slug text)
returns uuid language sql security definer set search_path = '' as $$
  select m.id from public.memberships m
    join public.users u on u.id = m.user_id
   where u.email = p_email and m.organization_id = tests.org_id(p_org_slug);
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Autenticação simulada — INVOKER, porque faz SET ROLE
-- ───────────────────────────────────────────────────────────────────────────
create or replace function tests.authenticate_as(p_email text)
returns void language plpgsql as $$
declare v_user_id uuid;
begin
  v_user_id := tests.uid_of(p_email);
  if v_user_id is null then
    raise exception 'tests.authenticate_as: usuario % nao existe', p_email;
  end if;
  perform set_config('app.current_user_id', v_user_id::text, true);
  execute 'set local role authenticated';
end;
$$;

create or replace function tests.clear_authentication()
returns void language plpgsql as $$
begin
  perform set_config('app.current_user_id', '', true);
  execute 'reset role';
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Fábricas
-- ───────────────────────────────────────────────────────────────────────────
create or replace function tests.create_org(p_slug text, p_name text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.organizations (name, slug, status)
  values (coalesce(p_name, 'Org ' || p_slug), p_slug, 'active')
  returning id into v_id;
  insert into public.organization_settings (organization_id) values (v_id);
  return v_id;
end;
$$;

create or replace function tests.create_user(
  p_email text,
  p_org_slug text,
  p_role public.member_role default 'member',
  p_scope public.membership_scope default 'staff'
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := gen_random_uuid();
  v_org_id uuid := tests.org_id(p_org_slug);
begin
  if v_org_id is null then
    raise exception 'tests.create_user: organizacao % nao existe', p_org_slug;
  end if;

  -- ┌─ AS COLUNAS DE TOKEN PRECISAM SER '' , NUNCA NULL ──────────────────┐
  -- │ O GoTrue lê confirmation_token, recovery_token,                     │
  -- │ email_change_token_new e email_change como `string` do Go — e NULL   │
  -- │ quebra o scan com "converting NULL to string is unsupported".       │
  -- │ Diferente das outras colunas de token, estas quatro NÃO têm default. │
  -- │                                                                      │
  -- │ Sem isto, o usuário é criado, os testes pgTAP passam (eles simulam a │
  -- │ identidade com `set local role`, sem tocar no GoTrue) — e só o login │
  -- │ real falha, com erro 500 que não menciona a causa.                   │
  -- └──────────────────────────────────────────────────────────────────────┘
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email,
    extensions.crypt('test-password', extensions.gen_salt('bf')), now(),
    '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', split_part(p_email, '@', 1)),
    now(), now()
  );

  -- public.users é criado pelo trigger on_auth_user_created.
  insert into public.memberships (organization_id, user_id, role, scope, status)
  values (v_org_id, v_user_id, p_role, p_scope, 'active');

  return v_user_id;
end;
$$;

create or replace function tests.grant_access_profile(
  p_email text,
  p_org_slug text,
  p_department public.department,
  p_permissions jsonb default '{}'::jsonb
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := tests.org_id(p_org_slug);
  v_profile uuid;
begin
  insert into public.access_profiles (organization_id, department, name, permissions)
  values (v_org, p_department,
          'Teste ' || p_department || ' ' || substr(gen_random_uuid()::text, 1, 8),
          p_permissions)
  returning id into v_profile;

  insert into public.membership_access_profiles (organization_id, membership_id, access_profile_id)
  values (v_org, tests.membership_id(p_email, p_org_slug), v_profile);

  return v_profile;
end;
$$;

-- Limpeza entre execuções contra um banco persistente (projeto de teste).
create or replace function tests.reset_fixtures(p_slugs text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from auth.users u
   where exists (
     select 1 from public.memberships m
      join public.organizations o on o.id = m.organization_id
     where m.user_id = u.id and o.slug = any(p_slugs)
   );
  delete from public.organizations where slug = any(p_slugs);
end;
$$;

grant execute on all functions in schema tests to authenticated, anon, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- Fixture do E2E (§9.4)
--
-- Uma única RPC, porque a API REST não expõe SQL cru. Chamada apenas pelo
-- `globalSetup` do Playwright, com `service_role`.
--
-- ┌─ POR QUE OS IDs SÃO FIXOS ────────────────────────────────────────────┐
-- │ A primeira versão apagava e recriava as organizações a cada execução, │
-- │ gerando UUIDs novos. O proxy cacheia host→organização por 60 s (§3.6) │
-- │ e continuava servindo o id ANTIGO: o header levava uma organização    │
-- │ que já não existia, a busca de membership não achava nada, e o login  │
-- │ falhava com "Você não tem acesso a esta empresa".                      │
-- │                                                                        │
-- │ Com ids fixos e upsert, o cache nunca fica obsoleto entre execuções.   │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- As senhas são hash bcrypt de verdade: o E2E precisa passar pelo GoTrue,
-- que é justamente o caminho que os testes pgTAP não exercitam.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.e2e_upsert_user(
  p_id uuid, p_email text, p_org uuid,
  p_role public.member_role default 'owner'
)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  -- Colunas de token como '' e nunca NULL: o GoTrue as lê como string do Go.
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    p_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email,
    extensions.crypt('SenhaE2E-2026x', extensions.gen_salt('bf')), now(),
    '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', 'Usuario E2E'), now(), now()
  )
  on conflict (id) do update set email = excluded.email;

  insert into public.memberships (organization_id, user_id, role, scope, status, accepted_at)
  values (p_org, p_id, p_role, 'staff', 'active', now())
  on conflict (organization_id, user_id) do update set status = 'active', deleted_at = null;
end;
$$;

create or replace function public.e2e_seed(p_action text)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_org_a uuid := '11111111-1111-4111-8111-111111111111';
  v_org_b uuid := '22222222-2222-4222-8222-222222222222';
  v_usr_a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_usr_b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  -- ┌─ UM USUÁRIO POR CENÁRIO ────────────────────────────────────────────┐
  -- │ O rate limit de login é 5 tentativas por IP+e-mail em 15 min (§7.4). │
  -- │ Concentrar os cenários num e-mail só faz a suíte brigar com a        │
  -- │ própria proteção na segunda execução.                                │
  -- │                                                                       │
  -- │ Todos os três abaixo são membros da ORG A com credencial VÁLIDA — é   │
  -- │ isso que dá sentido aos cenários: o de host errado prova que          │
  -- │ credencial boa não basta sem membership NAQUELA empresa, e o de senha │
  -- │ errada prova que a mensagem é a mesma de usuário inexistente.         │
  -- └───────────────────────────────────────────────────────────────────────┘
  v_usr_c uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';  -- configurações
  v_usr_d uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';  -- host errado
  v_usr_e uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';  -- senha errada
  v_usr_f uuid := 'ffffffff-ffff-4fff-8fff-ffffffffffff';  -- alvo das permissões
begin
  if p_action = 'reset' then
    -- Limpa o que os testes sujam, PRESERVANDO organizações e usuários — e
    -- portanto os ids que o cache do proxy pode estar servindo.
    delete from public.invites where organization_id in (v_org_a, v_org_b);
    -- O vínculo perfil↔membro é estado que os testes sujam e que sobrevive à
    -- exclusão das memberships de fixture (elas são preservadas de propósito).
    -- Sem limpar aqui, o teste de atribuição encontra o perfil já vinculado da
    -- execução anterior e a própria pré-condição dele deixa de valer.
    delete from public.membership_access_profiles
     where organization_id in (v_org_a, v_org_b);
    -- Domínios criados pelos cenários: `hostname` é único no sistema inteiro,
    -- então cada execução cadastra um nome novo e a lista cresce para sempre.
    delete from public.organization_domains where organization_id in (v_org_a, v_org_b);
    delete from public.memberships
     where organization_id in (v_org_a, v_org_b) and user_id not in (v_usr_a, v_usr_b, v_usr_c, v_usr_d, v_usr_e, v_usr_f);
    return 'reset ok';
  end if;

  if p_action <> 'create' then
    raise exception 'e2e_seed: acao invalida %', p_action;
  end if;

  -- ┌─ POR QUE O `seats_limit` É EXPLÍCITO ────────────────────────────────┐
  -- │ O padrão da coluna é 5 (§5.3.1), e a ORG A tem 5 membros de fixture.  │
  -- │ Com isso a organização nasce no limite e o teste de convite falha —   │
  -- │ corretamente, pela regra de assentos, mas medindo o que não queria.   │
  -- │                                                                       │
  -- │ Custou uma execução do E2E para descobrir. O teto de assentos é       │
  -- │ comportamento real e tem de continuar valendo; o que não pode é a     │
  -- │ fixture chegar acidentalmente nele. Folga explícita resolve, e um     │
  -- │ teste que queira PROVAR o limite ajusta o próprio `seats_limit`.      │
  -- └───────────────────────────────────────────────────────────────────────┘
  insert into public.organizations (id, name, slug, status, primary_color, enabled_modules, seats_limit)
  values (v_org_a, 'Alfa Distribuidora', 'e2e-alfa', 'active', '#0F6FDE',
          array['ti','comercial']::text[], 20)
  on conflict (id) do update
    set name = excluded.name, status = 'active', seats_limit = excluded.seats_limit;

  insert into public.organizations (id, name, slug, status, primary_color, enabled_modules, seats_limit)
  values (v_org_b, 'Beta Alimentos', 'e2e-beta', 'active', '#e07b39', array['ti']::text[], 20)
  on conflict (id) do update
    set name = excluded.name, status = 'active', seats_limit = excluded.seats_limit;

  insert into public.organization_settings (organization_id) values (v_org_a), (v_org_b)
  on conflict (organization_id) do nothing;

  perform public.seed_default_access_profiles(v_org_a);
  perform public.seed_default_access_profiles(v_org_b);
  perform public.e2e_upsert_user(v_usr_a, 'owner@e2e-alfa.test', v_org_a);
  perform public.e2e_upsert_user(v_usr_b, 'owner@e2e-beta.test', v_org_b);
  perform public.e2e_upsert_user(v_usr_c, 'config@e2e-alfa.test',     v_org_a, 'admin');
  perform public.e2e_upsert_user(v_usr_d, 'hosterrado@e2e-alfa.test', v_org_a, 'member');
  perform public.e2e_upsert_user(v_usr_e, 'senhaerrada@e2e-alfa.test', v_org_a, 'member');
  perform public.e2e_upsert_user(v_usr_f, 'membro@e2e-alfa.test',      v_org_a, 'member');

  return 'create ok';
end;
$$;

revoke execute on function public.e2e_seed(text) from public, anon, authenticated;
revoke execute on function public.e2e_upsert_user(uuid, text, uuid, public.member_role)
  from public, anon, authenticated;

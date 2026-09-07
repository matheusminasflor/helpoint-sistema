-- O cliente do SAC edita o próprio cadastro — telefone, endereço — mas não
-- consegue se mudar de empresa, trocar de e-mail nem se desbloquear.
-- E o staff da empresa continua conseguindo bloqueá-lo.
--
-- Prova da migration 20260905020400. Nasceu vermelha (o cliente conseguia
-- trocar o próprio tenant_id) e ficou verde com a migration aplicada.
--
-- Rode com:  npx supabase test db --linked   (precisa do Docker Desktop de pé)

begin;
\ir _helpers.psql

select plan(7);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-guard-a', 'Empresa A') as tenant_a,
       tests.create_tenant('pgtap-guard-b', 'Empresa B') as tenant_b;

create temporary table u on commit drop as
select tests.create_customer('cliente@pgtap.test', (select tenant_a from f)) as cliente,
       tests.create_user('gerente@pgtap.test',     (select tenant_a from f)) as gerente;

-- Fixtures são do runner; depois de `authenticate_as` o teste é `authenticated`
-- e precisa de permissão para lê-las.
grant select on f, u to authenticated;

select tests.grant_role((select gerente from u), 'manager');

-- ───────────────────────────────────────────────────────────────────────────
-- Como o cliente
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('cliente@pgtap.test');

select lives_ok(
  $q$update public.customer_profiles set phone = '31 99999-0000'$q$,
  'cliente edita o proprio telefone'
);

select is(
  (select phone from public.customer_profiles),
  '31 99999-0000',
  'e o telefone realmente gravou'
);

select throws_ok(
  format($q$update public.customer_profiles set tenant_id = %L$q$, (select tenant_b from f)),
  '42501',
  null,
  'cliente NAO se muda para outra empresa'
);

select throws_ok(
  $q$update public.customer_profiles set email = 'outro@pgtap.test'$q$,
  '42501',
  null,
  'cliente NAO troca o proprio e-mail'
);

select throws_ok(
  $q$update public.customer_profiles set is_blocked = true$q$,
  '42501',
  null,
  'cliente NAO mexe no proprio bloqueio'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Como o gerente da empresa A: bloquear o cliente é trabalho dele
-- ───────────────────────────────────────────────────────────────────────────
select tests.clear_authentication();
select tests.authenticate_as('gerente@pgtap.test');

select lives_ok(
  $q$update public.customer_profiles set is_blocked = true, blocked_at = now()$q$,
  'gerente bloqueia o cliente'
);

select is(
  (select is_blocked from public.customer_profiles),
  true,
  'e o bloqueio realmente gravou'
);

select * from finish();
rollback;

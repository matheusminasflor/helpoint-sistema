-- SUGESTÕES DA IA (migration 20270212350000).
--   1  administrador cria (com RETURNING, como o PostgREST), vê e decide
--   2  quem não é administrador não vê, não cria e não decide
--   3  administrador de outra empresa não vê
begin;
\ir _helpers.psql

select plan(7);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-sug', 'Sugestões', false) as a, tests.create_tenant('pgtap-sug2', 'Outra', false) as b;
create temporary table u on commit drop as
select tests.create_user('dono@sug.test', (select a from f)) as dono,
       tests.create_user('pessoa@sug.test', (select a from f)) as pessoa,
       tests.create_user('dono@outra.test', (select b from f)) as outro;
select tests.grant_role((select dono from u), 'owner');
select tests.grant_role((select pessoa from u), 'member');
select tests.grant_role((select outro from u), 'owner');
grant select on f, u to authenticated;

-- 1 ───────────────────────────────────
select tests.authenticate_as('dono@sug.test');
select lives_ok(
  $$ insert into public.ia_sugestoes (tenant_id, tipo, titulo, motivo)
     select a, 'tutorial', 'Impressora', 'Seis chamados' from f returning id $$,
  'o administrador cria a sugestão');
select is((select count(*)::int from public.ia_sugestoes), 1, 'o administrador vê');
update public.ia_sugestoes set status = 'aprovada';
select is((select status from public.ia_sugestoes), 'aprovada', 'o administrador decide');
select tests.clear_authentication();

-- 2 ───────────────────────────────────
select tests.authenticate_as('pessoa@sug.test');
select is((select count(*)::int from public.ia_sugestoes), 0, 'quem não é administrador não vê');
select throws_ok(
  $$ insert into public.ia_sugestoes (tenant_id, tipo, titulo, motivo) select a, 'tutorial', 'X', 'Y' from f $$,
  '42501', null, 'quem não é administrador não cria');
update public.ia_sugestoes set status = 'recusada';
select tests.clear_authentication();
select is((select status from public.ia_sugestoes), 'aprovada', 'quem não é administrador não decide');

-- 3 ───────────────────────────────────
select tests.authenticate_as('dono@outra.test');
select is((select count(*)::int from public.ia_sugestoes), 0, 'outra empresa não vê');
select tests.clear_authentication();

select * from finish();
rollback;

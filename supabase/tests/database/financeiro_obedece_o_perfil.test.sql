-- O Financeiro obedece ao perfil no banco (migration 20261123030000; decisão do dono, 2026-10-02).
--
--   op    Financeiro, Operador — vê, lança, edita e baixa; não exclui
--   leit  Financeiro, Somente leitura — só vê
--   so    só o módulo, sem perfil — não vê nada
--   rec   Operador com "Contas a Pagar" desligado no próprio acesso — vê só as a receber
begin;
\ir _helpers.psql

select plan(8);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-fin-perfil', 'Fin perfil', false) as a;
create temporary table u on commit drop as
select tests.create_user('op@finperfil.test',   (select a from f)) as op,
       tests.create_user('leit@finperfil.test', (select a from f)) as leit,
       tests.create_user('so@finperfil.test',   (select a from f)) as so,
       tests.create_user('rec@finperfil.test',  (select a from f)) as rec;
select tests.grant_module(x, (select a from f), 'financeiro')
  from (select op x from u union all select leit from u union all select so from u union all select rec from u) s;
select tests.grant_profile((select op from u), (select a from f), 'financeiro', 'Operador');
select tests.grant_profile((select leit from u), (select a from f), 'financeiro', 'Somente leitura');
select tests.grant_profile((select rec from u), (select a from f), 'financeiro', 'Operador');
update public.user_access_profiles set overrides = '{"payables":{"view":false},"cashflow":{"view":false},"reports":{"view":false}}'::jsonb
 where user_id = (select rec from u) and department = 'financeiro';

insert into public.fin_entries (tenant_id, kind, description, amount, due_date, competence, status) values
  ((select a from f), 'payable', 'Aluguel', 1000, '2026-10-10', '2026-10-01', 'pending'),
  ((select a from f), 'receivable', 'Venda', 500, '2026-10-10', '2026-10-01', 'pending');

create temporary table cnt (n int) on commit drop;
grant select on f, u to authenticated;
grant select, insert, delete on cnt to authenticated;

-- ═══ 1-2. Operador lança (como o PostgREST, com returning) e não exclui. ═══
select tests.authenticate_as('op@finperfil.test');
select lives_ok($$ insert into public.fin_entries (tenant_id, kind, description, amount, due_date, competence, status)
  values ((select a from f), 'payable', 'Luz', 200, '2026-10-12', '2026-10-01', 'pending') returning id $$,
  'o Operador lanca conta a pagar');
with x as (delete from public.fin_entries where description = 'Aluguel' returning 1) insert into cnt select count(*) from x;
select is((select n from cnt), 0, 'o Operador nao exclui (zero linhas, licao 12)');
select tests.clear_authentication();

-- ═══ 3-4. Somente leitura vê e não lança. ═══
select tests.authenticate_as('leit@finperfil.test');
select is((select count(*)::int from public.fin_entries), 3, 'Somente leitura ve as contas');
select throws_ok($$ insert into public.fin_entries (tenant_id, kind, description, amount, due_date, competence, status)
  values ((select a from f), 'payable', 'X', 1, '2026-10-12', '2026-10-01', 'pending') returning id $$,
  '42501', null, 'Somente leitura nao lanca');
select tests.clear_authentication();

-- ═══ 5. Só o módulo, sem perfil: nada. ═══
select tests.authenticate_as('so@finperfil.test');
select is((select count(*)::int from public.fin_entries), 0, 'so o modulo, sem perfil, nao le conta nenhuma');
select tests.clear_authentication();

-- ═══ 6-7. Cada tipo segue a sua caixinha. ═══
select tests.authenticate_as('rec@finperfil.test');
select is((select array_agg(distinct kind::text) from public.fin_entries), array['receivable'],
  'sem "Contas a Pagar", ve so as contas a receber');
select throws_ok($$ insert into public.fin_entries (tenant_id, kind, description, amount, due_date, competence, status)
  values ((select a from f), 'payable', 'Y', 1, '2026-10-12', '2026-10-01', 'pending') returning id $$,
  '42501', null, 'e nao lanca conta a pagar');
select tests.clear_authentication();

-- ═══ 8. A função de permissão não abre para anon. ═══
select ok(not has_function_privilege('anon', 'public.pode_no_financeiro(text, text)', 'execute'), 'anon nao chama');

select * from finish();
rollback;

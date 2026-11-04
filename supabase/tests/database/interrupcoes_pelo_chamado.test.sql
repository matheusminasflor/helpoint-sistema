-- INTERRUPÇÕES PELO CHAMADO (migration 20270212320000).
--   1  categoria marcada abre a interrupção; a subcategoria herda; categoria comum não conta
--   2  outro chamado do mesmo tipo entra na queda aberta; de outro tipo abre outra
--   3  só fecha no último chamado, na hora do "voltou às"; reabrir reabre
--   4  corrigir a categoria tira o chamado; a queda sem chamado some
--   5  atendente marca; quem só abriu o chamado não muda
begin;
\ir _helpers.psql

select plan(15);

create temporary table f on commit drop as select tests.create_tenant('pgtap-int', 'Interrupcoes', false) as a;
create temporary table u on commit drop as
select tests.create_user('ti@int.test', (select a from f)) as ti,
       tests.create_user('pessoa@int.test', (select a from f)) as pessoa;
select tests.grant_role((select ti from u), 'owner');
select tests.grant_role((select pessoa from u), 'member');
grant select on f, u to authenticated;

create temporary table c on commit drop as select gen_random_uuid() as rede, gen_random_uuid() as queda, gen_random_uuid() as luz, gen_random_uuid() as comum;
insert into public.ti_categories (id, tenant_id, module, name, is_active, interrupcao_tipo) values
  ((select rede from c), (select a from f), 'tickets', 'Rede', true, 'internet'),
  ((select luz from c), (select a from f), 'tickets', 'Energia', true, 'luz'),
  ((select comum from c), (select a from f), 'tickets', 'Outros', true, null);
insert into public.ti_categories (id, tenant_id, module, name, parent_id, is_active)
values ((select queda from c), (select a from f), 'tickets', 'Queda', (select rede from c), true);

create temporary table t on commit drop as select gen_random_uuid() as c1, gen_random_uuid() as c2, gen_random_uuid() as c3, gen_random_uuid() as c4, gen_random_uuid() as c5;
grant select on t, c to authenticated;

create function pg_temp.abre(p_id uuid, p_categoria uuid) returns void language sql as $$
  insert into public.tickets (id, tenant_id, module, title, description, priority, status, created_by, requester_id, category_id)
  select p_id, a, 'tickets', 'Sem internet', 'x', 'medium', 'open', u.pessoa, u.pessoa, p_categoria from f, u;
$$;
create temporary view quedas as select * from public.ti_interrupcoes where tenant_id = (select a from f);
grant select on quedas to authenticated;

-- 1 ──────────────────────────────────────────────────────────────────────────
select pg_temp.abre((select c1 from t), (select queda from c));
select is((select tipo from quedas), 'internet', 'a subcategoria herda o tipo e o chamado abre a interrupção');
select is((select interrupcao_id from public.tickets where id = (select c1 from t)), (select id from quedas), 'o chamado fica ligado a ela');
select pg_temp.abre((select c5 from t), (select comum from c));
select is((select interrupcao_id from public.tickets where id = (select c5 from t)), null, 'categoria comum não conta');

-- 2 ──────────────────────────────────────────────────────────────────────────
select pg_temp.abre((select c2 from t), (select rede from c));
select is((select count(*)::int from quedas), 1, 'o segundo chamado da mesma queda não abre outra');
select pg_temp.abre((select c3 from t), (select luz from c));
select is((select count(*)::int from quedas), 2, 'outro tipo abre outra');

-- 3 ──────────────────────────────────────────────────────────────────────────
update public.tickets set status = 'resolved', resolved_at = now(), interrupcao_voltou_em = now() - interval '5 minutes' where id = (select c1 from t);
select is((select fim from quedas where tipo = 'internet'), null, 'com outro chamado aberto, a queda continua');
update public.tickets set status = 'resolved', resolved_at = now(), interrupcao_voltou_em = now() - interval '5 minutes' where id = (select c2 from t);
select is((select fim from quedas where tipo = 'internet'), greatest((select inicio from quedas where tipo = 'internet'), now() - interval '5 minutes'),
          'o último chamado fecha, na hora do "voltou às"');
update public.tickets set status = 'in_progress' where id = (select c2 from t);
select is((select fim from quedas where tipo = 'internet'), null, 'reabrir o chamado reabre a queda');

-- 4 ──────────────────────────────────────────────────────────────────────────
update public.tickets set category_id = (select comum from c) where id = (select c3 from t);
select is((select interrupcao_id from public.tickets where id = (select c3 from t)), null, 'corrigir a categoria tira o chamado da queda');
select is((select count(*)::int from quedas where tipo = 'luz'), 0, 'a queda que ficou sem chamado some');

-- 5 ──────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('ti@int.test');
select lives_ok($$ update public.tickets set interrupcao_tipo = 'luz' where id = (select c5 from t) returning id $$, 'o atendente marca');
select is((select interrupcao_id is not null from public.tickets where id = (select c5 from t)), true, 'marcado, entra numa interrupção');
select lives_ok($$ update public.tickets set interrupcao_tipo = null where id = (select c5 from t) returning id $$, 'o atendente desmarca');
select is((select count(*)::int from public.ti_interrupcoes where tipo = 'luz' and tenant_id = (select a from f)), 0, 'desmarcado, a queda some');
select tests.clear_authentication();

select tests.authenticate_as('pessoa@int.test');
-- Barrado pela policy (zero linhas) ou pelo perfil (42501): nos dois casos nada muda.
do $$
begin
  update public.tickets set interrupcao_tipo = 'luz' where id = (select c5 from t);
exception when insufficient_privilege then
  null;
end;
$$;
select tests.clear_authentication();
select is((select interrupcao_tipo from public.tickets where id = (select c5 from t)), null, 'quem só abriu o chamado não marca');

select * from finish();
rollback;

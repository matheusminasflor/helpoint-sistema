-- LIMITES DA IA (migration 20270212340000).
--   1  sem uso, pode; 100 usos no dia bloqueiam a pessoa; cache não conta
--   2  o teto do mês bloqueia a empresa toda
--   3  o gasto só aparece para dono e administrador; a tabela é fechada
begin;
\ir _helpers.psql

select plan(7);

create temporary table f on commit drop as select tests.create_tenant('pgtap-ia', 'IA', false) as a;
create temporary table u on commit drop as
select tests.create_user('dono@ia.test', (select a from f)) as dono,
       tests.create_user('pessoa@ia.test', (select a from f)) as pessoa;
select tests.grant_role((select dono from u), 'owner');
select tests.grant_role((select pessoa from u), 'member');
grant select on f, u to authenticated;

-- 1 ──────────────────────────────────────────────────────────────────────────
select is(public.ia_motivo_do_bloqueio((select a from f), (select pessoa from u)), null, 'sem uso, pode');

insert into public.ia_uso (tenant_id, user_id, recurso, do_cache)
select (select a from f), (select pessoa from u), 'melhorar_texto', true from generate_series(1, 150);
select is(public.ia_motivo_do_bloqueio((select a from f), (select pessoa from u)), null, 'resposta guardada não conta');

insert into public.ia_uso (tenant_id, user_id, recurso)
select (select a from f), (select pessoa from u), 'melhorar_texto' from generate_series(1, 100);
select ok(public.ia_motivo_do_bloqueio((select a from f), (select pessoa from u)) like '%de hoje%', '100 usos no dia bloqueiam a pessoa');
select is(public.ia_motivo_do_bloqueio((select a from f), (select dono from u)), null, 'o limite é de cada pessoa');

-- 2 ──────────────────────────────────────────────────────────────────────────
insert into public.ia_uso (tenant_id, user_id, recurso, custo_usd) values ((select a from f), null, 'teste', 30);
select ok(public.ia_motivo_do_bloqueio((select a from f), (select dono from u)) like '%limite do mês%', 'o teto bloqueia a empresa');

-- 3 ──────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('dono@ia.test');
select is((select teto_mes from public.ia_situacao()), 30::numeric, 'o dono vê a situação');
select tests.clear_authentication();

select tests.authenticate_as('pessoa@ia.test');
select is((select count(*)::int from public.ia_situacao()), 0, 'quem não administra não vê o gasto');
select tests.clear_authentication();

select * from finish();
rollback;

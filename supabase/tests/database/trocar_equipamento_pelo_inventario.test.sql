-- TROCAR EQUIPAMENTO PELO INVENTÁRIO (migration 20270131050000; proposta "Helpoint no dia a dia", etapa 4 · TI).
begin;
\ir _helpers.psql

select plan(6);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-trocainv', 'TrocaInv', false) as a;
create temporary table u on commit drop as
select tests.create_user('tec@trocainv.test', (select a from f)) as tec,
       tests.create_user('ana@trocainv.test', (select a from f)) as ana,
       tests.create_user('zeca@trocainv.test', (select a from f)) as zeca;
insert into public.access_profiles (tenant_id, department, name, permissions)
select a, 'ti', 'Inventario', '{"inventory": {"view": true, "edit": true}}'::jsonb from f;
select tests.grant_module((select tec from u), (select a from f), 'ti');
select tests.grant_profile((select tec from u), (select a from f), 'ti', 'Inventario');

create temporary table eq on commit drop as
with antigo as (insert into public.assets (tenant_id, name, asset_tag, category, status, assigned_to)
                select a, 'Mouse velho', 'MS-1', 'hardware', 'in_use', (select ana from u) from f returning id),
     novo as (insert into public.assets (tenant_id, name, asset_tag, category, status)
              select a, 'Mouse novo', 'MS-2', 'hardware', 'in_stock' from f returning id),
     sem_dono as (insert into public.assets (tenant_id, name, asset_tag, category, status)
                  select a, 'Teclado', 'TC-1', 'hardware', 'in_stock' from f returning id)
select (select id from antigo) as antigo, (select id from novo) as novo, (select id from sem_dono) as sem_dono;
grant select on f, u, eq to authenticated;

select tests.authenticate_as('zeca@trocainv.test');
select throws_ok($$ select public.trocar_equipamento((select antigo from eq), (select novo from eq), 'quebrou') $$,
  '42501', null, 'sem "Inventário · editar" não troca');
select tests.clear_authentication();

select tests.authenticate_as('tec@trocainv.test');
select throws_ok($$ select public.trocar_equipamento((select sem_dono from eq), (select novo from eq), 'x') $$,
  '23514', null, 'equipamento sem dono não se troca: se entrega');
select throws_ok($$ select public.trocar_equipamento((select antigo from eq), (select novo from eq), '  ') $$,
  '23514', null, 'sem motivo não troca');
select lives_ok($$ select public.trocar_equipamento((select antigo from eq), (select novo from eq), 'Clique falhando') $$,
  'troca com motivo');
select tests.clear_authentication();

select is((select assigned_to from public.assets where id = (select novo from eq)), (select ana from u), 'o novo fica no nome da pessoa');
select is((select status || coalesce(assigned_to::text, '-') from public.assets where id = (select antigo from eq)), 'maintenance-',
  'o antigo vai para manutenção, sem dono');

select * from finish();
rollback;

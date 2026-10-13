-- CATEGORIAS EM TRÊS NÍVEIS (migration 20261228010000; dono, 2026-10-13).
--   1  categoria › subcategoria › item entra
--   2  um quarto nível é recusado
--   3  o item fica no setor da categoria de cima
--   4  o item herda os responsáveis do nível de cima mais próximo (aqui, da categoria principal)
--   5  com responsável próprio na subcategoria, o item herda dela, não da principal
--   6  o chamado aberto no item vai para quem responde por ele
--   7  o caminho do item: principal + "Forteplus › Correções"
begin;
\ir _helpers.psql

select plan(7);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-cat-3', 'Cat 3', false) as a;
create temporary table u on commit drop as
select tests.create_user('ti1@cat3.test', (select a from f)) as ti1,
       tests.create_user('ti2@cat3.test', (select a from f)) as ti2,
       tests.create_user('ana@cat3.test', (select a from f)) as ana;
select tests.grant_module(x, (select a from f), 'ti') from (select ti1 x from u union all select ti2 from u) s;

create temporary table cat on commit drop as
with sw as (
  insert into public.ti_categories (tenant_id, module, name) select a, 'tickets', 'Software (pgTAP)' from f returning id
), fp as (
  insert into public.ti_categories (tenant_id, module, name, parent_id) select a, 'tickets', 'Forteplus', (select id from sw) from f returning id
), it as (
  insert into public.ti_categories (tenant_id, module, name, parent_id) select a, 'tickets', 'Correções', (select id from fp) from f returning id
) select (select id from sw) sw, (select id from fp) fp, (select id from it) item;
grant select on f, u, cat to authenticated;

select ok((select count(*) from public.ti_categories where id in (select sw from cat union all select fp from cat union all select item from cat)) = 3,
  'categoria, subcategoria e item entram');

select throws_ok($$ insert into public.ti_categories (tenant_id, module, name, parent_id)
                    select a, 'tickets', 'Quarto nivel', (select item from cat) from f $$,
  '23514', null, 'um quarto nivel e recusado');

select throws_ok($$ insert into public.ti_categories (tenant_id, module, name, parent_id)
                    select a, 'marketing', 'Outro setor', (select fp from cat) from f $$,
  '23514', null, 'o item fica no setor da categoria de cima');

insert into public.ti_category_responsaveis (tenant_id, category_id, user_id)
select a, (select sw from cat), (select ti1 from u) from f;
select is((select string_agg(id::text, ',') from public.responsaveis_da_categoria((select item from cat))),
  (select ti1::text from u), 'sem responsavel proprio, o item herda o da categoria principal');

insert into public.ti_category_responsaveis (tenant_id, category_id, user_id)
select a, (select fp from cat), (select ti2 from u) from f;
select is((select string_agg(id::text, ',') from public.responsaveis_da_categoria((select item from cat))),
  (select ti2::text from u), 'com responsavel na subcategoria, o item herda dela (a mais proxima)');

create temporary table novo (id uuid, assigned_to uuid) on commit drop;
grant select, insert on novo to authenticated;
select tests.authenticate_as('ana@cat3.test');
with t as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, category_id)
  select a, 'tickets', 'Erro no Forteplus', 'x', (select ana from u), (select item from cat) from f
  returning id, assigned_to
) insert into novo select * from t;
select tests.clear_authentication();
select is((select assigned_to from novo), (select ti2 from u), 'o chamado aberto no item vai para quem responde por ele');

select is((select principal || ' | ' || resto from public.caminho_da_categoria((select item from cat))),
  'Software (pgTAP) | Forteplus › Correções', 'o caminho do item: a principal e o resto');

select * from finish();
rollback;

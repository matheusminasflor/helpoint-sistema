-- A TI obedece ao perfil no banco (migration 20261123040000; decisão do dono, 2026-10-02).
--
--   gest  TI, Gestor — tudo, inclusive "Ver chaves"
--   op    TI, Operador — cria e edita equipamento; não exclui; não vê chaves
--   leit  TI, Somente leitura — só vê
--   sol   sem módulo — vê o equipamento DELE e a lista do formulário de chamado
begin;
\ir _helpers.psql

select plan(9);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-ti-perfil', 'TI perfil', false) as a;
create temporary table u on commit drop as
select tests.create_user('gest@tiperfil.test', (select a from f)) as gest,
       tests.create_user('op@tiperfil.test',   (select a from f)) as op,
       tests.create_user('leit@tiperfil.test', (select a from f)) as leit,
       tests.create_user('sol@tiperfil.test',  (select a from f)) as sol;
select tests.grant_module(x, (select a from f), 'ti')
  from (select gest x from u union all select op from u union all select leit from u) s;
select tests.grant_profile((select gest from u), (select a from f), 'ti', 'Gestor');
select tests.grant_profile((select op from u), (select a from f), 'ti', 'Operador');
select tests.grant_profile((select leit from u), (select a from f), 'ti', 'Somente leitura');

insert into public.assets (tenant_id, name, asset_tag, category, status, assigned_to)
select a, 'Notebook da Sol', 'NB-1', 'hardware', 'in_use', (select sol from u) from f;
insert into public.assets (tenant_id, name, asset_tag, category, status)
select a, 'Impressora do setor', 'IMP-1', 'peripheral', 'in_use' from f;
insert into public.software_licenses (tenant_id, name) select a, 'Office' from f;
insert into public.software_license_keys (tenant_id, license_id, license_key)
select a, (select id from public.software_licenses where name = 'Office'), 'CHAVE-SECRETA' from f;

create temporary table cnt (n int) on commit drop;
grant select on f, u to authenticated;
grant select, insert, delete on cnt to authenticated;

-- ═══ 1-2. Operador cria equipamento (com returning) e não exclui. ═══
select tests.authenticate_as('op@tiperfil.test');
select lives_ok($$ insert into public.assets (tenant_id, name, asset_tag, category, status)
  select a, 'Monitor', 'MON-1', 'peripheral', 'in_stock' from f returning id $$, 'o Operador da TI cria equipamento (antes so supervisor)');
with x as (delete from public.assets where asset_tag = 'IMP-1' returning 1) insert into cnt select count(*) from x;
select is((select n from cnt), 0, 'o Operador nao exclui');

-- ═══ 3. Operador sem "Ver chaves" não lê a chave. ═══
select is((select count(*)::int from public.software_license_keys), 0, 'sem "Ver chaves", a chave nao aparece');
select tests.clear_authentication();

-- ═══ 4. O Gestor lê a chave. ═══
select tests.authenticate_as('gest@tiperfil.test');
select is((select license_key from public.software_license_keys), 'CHAVE-SECRETA', 'com "Ver chaves", aparece');
select tests.clear_authentication();

-- ═══ 5-6. Somente leitura vê e não cria. ═══
select tests.authenticate_as('leit@tiperfil.test');
select is((select count(*)::int from public.assets), 3, 'Somente leitura ve o inventario');
select throws_ok($$ insert into public.assets (tenant_id, name, asset_tag, category, status)
  select a, 'X', 'X-1', 'peripheral', 'in_stock' from f returning id $$, '42501', null, 'e nao cria');
select tests.clear_authentication();

-- ═══ 7-8. Quem não é da TI vê o equipamento dele, e a lista do formulário de chamado. ═══
select tests.authenticate_as('sol@tiperfil.test');
select is((select array_agg(asset_tag order by asset_tag) from public.assets), array['NB-1'],
  'sem a TI, o inventario mostra so o equipamento atribuido a pessoa');
select is((select count(*)::int from public.equipamentos_para_chamado()), 3,
  'a lista ao abrir chamado continua com os equipamentos da empresa');
select tests.clear_authentication();

-- ═══ 9. A coluna antiga da licença não guarda chave (o trigger que já existia a esvazia). ═══
insert into public.software_licenses (tenant_id, name, license_key) select a, 'Y', 'VAZOU' from f;
select is((select license_key from public.software_licenses where name = 'Y'), null,
  'a chave nao fica na coluna que todo mundo que ve licencas le');

select * from finish();
rollback;

-- DIRETRIZES DO COMERCIAL (migration 20270129090000; dono, 2026-10-20): o Comercial ganha diretriz de processo,
-- igual aos outros setores. gestor: Comercial com "Criar e editar" e "Publicar"; vendedora: só o módulo Comercial.
begin;
\ir _helpers.psql

select plan(3);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-diretrizes-comercial', 'Diretrizes do Comercial', false) as a;
create temporary table u on commit drop as
select tests.create_user('gestor@dir-com.test',    (select a from f)) as gestor,
       tests.create_user('vendedora@dir-com.test', (select a from f)) as vendedora;
select tests.grant_module((select gestor from u),    (select a from f), 'comercial');
select tests.grant_module((select vendedora from u), (select a from f), 'comercial');
insert into public.access_profiles (tenant_id, department, name, is_default, permissions)
values ((select a from f), 'comercial', 'Cuida das diretrizes (pgTAP)', false,
        '{"diretrizes": {"view": true, "edit": true, "publish": true}}'::jsonb);
select tests.grant_profile((select gestor from u), (select a from f), 'comercial', 'Cuida das diretrizes (pgTAP)');
grant select on f, u to authenticated;

create temporary table d (id uuid) on commit drop;
grant select, insert on d to authenticated;

select tests.authenticate_as('gestor@dir-com.test');
select lives_ok($$
  with t as (insert into public.diretrizes (setor, titulo, conteudo)
             values ('comercial', 'Pedido da Diretoria', 'Sempre Série 75, venda em nome da pessoa da Diretoria.')
             returning id)
  insert into d select id from t $$,
  'o Comercial cria diretriz de processo (antes o CHECK do setor recusava)');
select is(public.diretriz_publicar((select id from d)), 1, 'e publica a versao 1');
select tests.clear_authentication();

select tests.authenticate_as('vendedora@dir-com.test');
select is((select titulo from public.diretrizes), 'Pedido da Diretoria', 'quem e do Comercial le a diretriz publicada');
select tests.clear_authentication();

select * from finish();
rollback;

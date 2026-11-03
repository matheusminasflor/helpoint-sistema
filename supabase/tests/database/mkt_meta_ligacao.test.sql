-- A LIGAÇÃO DO MARKETING COM A META (migration 20270212240000).
--   1  quem vê os Indicadores do Marketing lê as contas conectadas
--   2  e não grava nada (quem grava é a função, pela chave de serviço)
--   3  ninguém logado lê a credencial
--   4  quem não vê os Indicadores do Marketing não lê nem as contas
begin;
\ir _helpers.psql

select plan(4);

create temporary table f on commit drop as select tests.create_tenant('pgtap-mkt-meta', 'MKT Meta', false) as a;
create temporary table u on commit drop as
select tests.create_user('gestor@mktmeta.test', (select a from f)) as gestor,
       tests.create_user('fora@mktmeta.test',   (select a from f)) as fora;
select tests.grant_module((select gestor from u), (select a from f), 'marketing');
select tests.grant_profile((select gestor from u), (select a from f), 'marketing', 'Gestor');
update public.access_profiles set permissions = permissions || '{"reports": {"view": true}}'::jsonb
 where tenant_id = (select a from f) and department = 'marketing' and name = 'Gestor';
insert into public.mkt_meta_ligacao (tenant_id, contas) select a, '[{"tipo": "instagram", "id": "1", "nome": "@conta"}]' from f;
insert into public.mkt_meta_ligacao_segredo (tenant_id, access_token) select a, 'segredo' from f;
grant select on f, u to authenticated;

select tests.authenticate_as('gestor@mktmeta.test');
select is((select count(*)::int from public.mkt_meta_ligacao), 1, 'quem ve os Indicadores do Marketing le as contas conectadas');
select throws_ok($$ update public.mkt_meta_ligacao set contas = '[]' $$, '42501', null, 'e nao grava nada');
select throws_ok($$ select access_token from public.mkt_meta_ligacao_segredo $$, '42501', null, 'ninguem logado le a credencial');
select tests.clear_authentication();

select tests.authenticate_as('fora@mktmeta.test');
select is((select count(*)::int from public.mkt_meta_ligacao), 0, 'quem nao ve os Indicadores do Marketing nao le nem as contas');
select tests.clear_authentication();

select * from finish();
rollback;

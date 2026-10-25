-- META FIXA DOS INDICADORES DOS SETORES (migration 20270131020000, decisão do dono de 2026-10-25).
begin;
\ir _helpers.psql

select plan(7);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-metasdir', 'MetasDir', false) as a;
create temporary table u on commit drop as
select tests.create_user('dir@metasdir.test', (select a from f)) as dir,
       tests.create_user('ve@metasdir.test', (select a from f)) as ve,
       tests.create_user('zeca@metasdir.test', (select a from f)) as zeca;
grant select on f, u to authenticated;

insert into public.access_profiles (tenant_id, department, name, permissions)
select a, 'diretoria', 'Só vê', '{"indicadores": {"view": true, "definir_metas": false}}'::jsonb from f;
select tests.grant_module((select dir from u), (select a from f), 'diretoria');
select tests.grant_profile((select dir from u), (select a from f), 'diretoria', 'Diretor');
select tests.grant_module((select ve from u), (select a from f), 'diretoria');
select tests.grant_profile((select ve from u), (select a from f), 'diretoria', 'Só vê');

select is((select permissions -> 'indicadores' ->> 'definir_metas' from public.access_profiles
            where tenant_id = (select a from f) and department = 'diretoria' and name = 'Diretor'), 'true',
  'empresa nova: o perfil "Diretor" já nasce podendo definir as metas');

select tests.authenticate_as('dir@metasdir.test');
select lives_ok($$
  insert into public.dir_metas_dos_setores (tenant_id, setor, indicador, meta)
  select a, 'compras', 'tempo_aprovacao', 24 from f returning id
$$, 'o Diretor define a meta (com RETURNING, como o PostgREST)');
update public.dir_metas_dos_setores set meta = 12 where indicador = 'tempo_aprovacao';
select is((select meta from public.dir_metas_dos_setores where indicador = 'tempo_aprovacao'), 12::numeric, 'e muda');
select tests.clear_authentication();

select tests.authenticate_as('ve@metasdir.test');
select is((select meta from public.dir_metas_dos_setores where indicador = 'tempo_aprovacao'), 12::numeric,
  'quem só vê os indicadores lê a meta');
select throws_ok($$
  insert into public.dir_metas_dos_setores (tenant_id, setor, indicador, meta)
  select a, 'sac', 'taxa_resolucao', 90 from f
$$, '42501', null, 'e não define meta nova');
update public.dir_metas_dos_setores set meta = 99 where indicador = 'tempo_aprovacao';
select is((select meta from public.dir_metas_dos_setores where indicador = 'tempo_aprovacao'), 12::numeric,
  'nem muda a que existe (o UPDATE barrado afeta zero linhas, sem erro)');
select tests.clear_authentication();

select tests.authenticate_as('zeca@metasdir.test');
select is((select count(*)::int from public.dir_metas_dos_setores), 0, 'sem a Diretoria, não vê meta nenhuma');
select tests.clear_authentication();

select * from finish();
rollback;

-- DIRETORIA VIRA SETOR (migration 20270130010000; proposta "Helpoint no dia a dia", decisão 5).
-- "Ver" por tela: quem tem só "Indicadores dos setores" vê os indicadores e não os chamados por setor do Resumo.
begin;
\ir _helpers.psql

select plan(9);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-diretoria', 'Diretoria', false) as a;
create temporary table u on commit drop as
select tests.create_user('ind@dir.test', (select a from f)) as ind,
       tests.create_user('tudo@dir.test', (select a from f)) as tudo,
       tests.create_user('zeca@dir.test', (select a from f)) as zeca;
grant select on f, u to authenticated;

select lives_ok($$
  insert into public.access_profiles (tenant_id, department, name, permissions)
  select a, 'diretoria', 'Só indicadores', '{"indicadores": {"view": true}}'::jsonb from f
$$, 'a Diretoria aceita perfil, como os outros setores');
select is((select (permissions -> 'resumo' ->> 'view') || (permissions -> 'diretrizes' ->> 'view') from public.access_profiles
            where tenant_id = (select a from f) and department = 'diretoria' and name = 'Diretor'), 'truetrue',
  'empresa nova já nasce com o perfil "Diretor", tudo ligado (20270130020000)');
select tests.grant_module((select ind from u), (select a from f), 'diretoria');
select tests.grant_profile((select ind from u), (select a from f), 'diretoria', 'Só indicadores');
select tests.grant_module((select tudo from u), (select a from f), 'diretoria');
select tests.grant_profile((select tudo from u), (select a from f), 'diretoria', 'Diretor');

-- ═══ Só "Indicadores dos setores" ═══
select tests.authenticate_as('ind@dir.test');
select lives_ok($$ select * from public.dir_indicadores_dos_setores(current_date) $$, 'com "Indicadores" vê os indicadores dos setores');
select throws_ok($$ select * from public.dir_chamados_por_setor(now() - interval '30 days') $$,
  '42501', null, 'sem "Resumo" não vê os chamados por setor');
select is(public.diretriz_pode_ler('rh', 'publicada', 'setor', null), false, 'sem "Diretrizes" não lê a diretriz de outro setor');
select tests.clear_authentication();

-- ═══ O perfil com tudo ═══
select tests.authenticate_as('tudo@dir.test');
select lives_ok($$ select * from public.dir_chamados_por_setor(now() - interval '30 days') $$, 'com "Resumo" vê os chamados por setor');
select is(public.diretriz_pode_ler('rh', 'publicada', 'setor', null), true, 'com "Diretrizes" lê a diretriz publicada de outro setor');
select tests.clear_authentication();

-- ═══ Quem não entra na Diretoria ═══
select tests.authenticate_as('zeca@dir.test');
select is(public.dir_pode_ver('resumo'), false, 'sem a Diretoria, nenhuma tela');
select throws_ok($$ select * from public.dir_indicadores_dos_setores(current_date) $$, '42501', null, 'sem a Diretoria não vê os indicadores');
select tests.clear_authentication();

select * from finish();
rollback;

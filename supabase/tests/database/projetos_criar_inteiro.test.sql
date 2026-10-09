-- PROJETOS: CRIAR INTEIRO, PESSOA DO SETOR, QUEM EDITA E O ERRO DO MODELO (20261220010000; dono, 2026-10-09).
-- "DELETE requires a WHERE clause" vinha do `safeupdate`, que o PostgREST carrega (role `authenticator`) e
-- que o teste não pode carregar (o supautils recusa o `load`). Pelo psql, o erro passava verde. Então a
-- asserção 1 varre TODA função do `public` atrás de delete/update sem where — a classe inteira do defeito.
--   1    nenhuma função tem delete sem where (a trava da tela recusaria);
--   2    criar a partir do modelo continua funcionando;
--   3-5  `criar_projeto` grava setores com a pessoa, fases e atividades revisadas, numa chamada só;
--   6    a pessoa escolhida recebe aviso com e-mail;
--   7-9  pessoa de outro setor, setor sem pessoa e atividade de setor não marcado são recusados;
--   10-11 só o setor edita a atividade: o dono do projeto (de outro setor) não, a pessoa do setor sim;
--   12   anon não cria.
begin;
\ir _helpers.psql

select plan(12);

select is((select array_agg(p.proname::text order by p.proname) from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
              and pg_get_functiondef(p.oid) ~* 'delete\s+from\s+[a-z_."]+\s*;'),
  null, 'nenhuma funcao apaga sem where (o safeupdate da tela recusaria: "DELETE requires a WHERE clause")');

create temporary table f on commit drop as
select tests.create_tenant('pgtap-projinteiro', 'Proj Inteiro') as a;
create temporary table u on commit drop as
select tests.create_user('dono@projinteiro.test', (select a from f)) as dono,
       tests.create_user('gis@projinteiro.test',  (select a from f)) as gis,
       tests.create_user('lu@projinteiro.test',   (select a from f)) as lu;
update public.profiles set department = 'comercial' where id = (select dono from u);
update public.profiles set department = 'marketing' where id = (select gis from u);
update public.profiles set department = 'qualidade' where id = (select lu from u);
grant select on f, u to authenticated;
create temporary table ids (nome text primary key, id uuid);
grant select, insert on ids to authenticated;

-- Um modelo com fase e atividade, como os semeados.
insert into public.projects (id, tenant_id, name, status, e_modelo)
select gen_random_uuid(), a, 'Modelo de teste', 'planned', true from f returning id;
insert into ids select 'modelo', id from public.projects where name = 'Modelo de teste';
insert into public.project_fases (tenant_id, project_id, nome, ordem)
select (select a from f), (select id from ids where nome = 'modelo'), 'Briefing', 1;
insert into public.tasks (tenant_id, project_id, fase_id, title, setor, status, position, priority)
select (select a from f), (select id from ids where nome = 'modelo'), pf.id, 'Briefing do produto', 'marketing', 'pending', 1, 3
  from public.project_fases pf where pf.project_id = (select id from ids where nome = 'modelo');

select tests.authenticate_as('dono@projinteiro.test');
select lives_ok(
  $$ insert into ids select 'do_modelo', public.criar_projeto_do_modelo(
       (select id from ids where nome = 'modelo'), 'Do modelo', 'x', null, array['marketing']) $$,
  'criar a partir do modelo continua funcionando');

insert into ids select 'inteiro', public.criar_projeto('Nutribalance 1 Litro', 'Lançar o 1 L', date '2026-12-15',
  jsonb_build_array(jsonb_build_object('setor', 'marketing', 'referencia_id', (select gis from u)),
                    jsonb_build_object('setor', 'qualidade', 'referencia_id', (select lu from u))),
  jsonb_build_array(
    jsonb_build_object('nome', 'Briefing', 'atividades', jsonb_build_array(
      jsonb_build_object('titulo', 'Arte da embalagem', 'setor', 'marketing', 'descricao', 'Frente e verso'),
      jsonb_build_object('titulo', '   ', 'setor', 'marketing'))),
    jsonb_build_object('nome', 'Testes', 'atividades', jsonb_build_array(
      jsonb_build_object('titulo', 'Estabilidade', 'setor', 'qualidade')))));
select tests.clear_authentication();

select is((select string_agg(setor || '>' || (referencia_id is not null)::text, ',' order by setor)
             from public.project_setores where project_id = (select id from ids where nome = 'inteiro')),
  'marketing>true,qualidade>true', 'os setores nascem com a pessoa de cada um');
select is((select string_agg(f.ordem || ':' || f.nome, ',' order by f.ordem) from public.project_fases f
            where f.project_id = (select id from ids where nome = 'inteiro')),
  '1:Briefing,2:Testes', 'as fases nascem na ordem da tela');
select is((select string_agg(title || '/' || setor, ',' order by position) from public.tasks
            where project_id = (select id from ids where nome = 'inteiro')),
  'Arte da embalagem/marketing,Estabilidade/qualidade', 'as atividades revisadas nascem; a sem titulo fica de fora');
select is((select string_agg(email_sent::text, ',') from public.notifications
            where user_id = (select gis from u) and reference_id = (select id from ids where nome = 'inteiro')),
  'false', 'a pessoa escolhida do setor recebe aviso com e-mail');

select tests.authenticate_as('dono@projinteiro.test');
select throws_ok(
  $$ select public.criar_projeto('X', null, null,
       jsonb_build_array(jsonb_build_object('setor', 'marketing', 'referencia_id', (select lu from u))), '[]') $$,
  '23514', null, 'pessoa de outro setor nao e escolhida para o setor');
select throws_ok(
  $$ select public.criar_projeto('X', null, null, jsonb_build_array(jsonb_build_object('setor', 'marketing')), '[]') $$,
  '22023', null, 'setor sem pessoa e recusado');
select throws_ok(
  $$ select public.criar_projeto('X', null, null,
       jsonb_build_array(jsonb_build_object('setor', 'marketing', 'referencia_id', (select gis from u))),
       jsonb_build_array(jsonb_build_object('nome', 'F', 'atividades',
         jsonb_build_array(jsonb_build_object('titulo', 'T', 'setor', 'producao'))))) $$,
  '22023', null, 'atividade de setor nao marcado e recusada');

-- O dono do projeto é do Comercial: não edita a atividade do Marketing (UPDATE barrado afeta zero linhas).
update public.tasks set title = 'Mudada pelo dono'
 where project_id = (select id from ids where nome = 'inteiro') and title = 'Arte da embalagem';
select tests.clear_authentication();
select is((select count(*)::int from public.tasks where title = 'Mudada pelo dono'), 0,
  'o dono do projeto, de outro setor, nao edita atividade do Marketing');

select tests.authenticate_as('gis@projinteiro.test');
update public.tasks set title = 'Arte aprovada'
 where project_id = (select id from ids where nome = 'inteiro') and title = 'Arte da embalagem' returning id;
select tests.clear_authentication();
select is((select count(*)::int from public.tasks where title = 'Arte aprovada'), 1,
  'a pessoa do Marketing que esta no projeto edita a atividade do Marketing');

select ok(not has_function_privilege('anon', 'public.criar_projeto(text, text, date, jsonb, jsonb)', 'execute'),
  'anon nao cria projeto');

select * from finish();
rollback;

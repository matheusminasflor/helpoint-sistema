-- SAIR DO PROJETO (migrations 20270212200000/200100; dono, 2026-11-02; docs/especificacao-projetos.md).
--   1    quem tem atividade aberta no projeto não sai
--   2    quem criou o projeto não sai
--   3-5  concluída a atividade, sai: deixa a equipe, quem criou é avisado com o motivo, e ela não vê mais o projeto
--   6    quem não comanda o projeto não resolve a saída
--   7-8  quem criou escolhe quem assume: entra na equipe e herda a referência do setor; a saída fica resolvida
begin;
\ir _helpers.psql

select plan(8);

create temporary table f on commit drop as select tests.create_tenant('pgtap-sair-proj', 'Sair Proj') as a;
create temporary table u on commit drop as
select tests.create_user('dono@sairproj.test', (select a from f)) as dono,
       tests.create_user('gis@sairproj.test',  (select a from f)) as gis,
       tests.create_user('meri@sairproj.test', (select a from f)) as meri,
       tests.create_user('outro@sairproj.test', (select a from f)) as outro;
update public.profiles set department = 'marketing' where id in ((select gis from u), (select meri from u));
grant select on f, u to authenticated;

create temporary table s on commit drop as select gen_random_uuid() as projeto, gen_random_uuid() as tarefa;
grant select on s to authenticated;
create temporary table r (saida uuid);
grant select, insert on r to authenticated;

-- O dono cria; a Gislene é a referência do Marketing (entra na equipe) e tem uma atividade aberta; o outro também está.
insert into public.projects (id, tenant_id, name, owner_id, created_by)
select projeto, (select a from f), 'Lançamento do 1 L', (select dono from u), (select dono from u) from s;
insert into public.project_setores (tenant_id, project_id, setor, referencia_id)
select (select a from f), projeto, 'marketing', (select gis from u) from s;
insert into public.project_members (tenant_id, project_id, user_id)
select (select a from f), projeto, (select outro from u) from s;
insert into public.tasks (id, tenant_id, project_id, setor, title, status, user_id)
select tarefa, (select a from f), projeto, 'marketing', 'Arte da embalagem', 'in_progress', (select gis from u) from s;

-- ═══ 1-2 ═══
select tests.authenticate_as('gis@sairproj.test');
select throws_ok($$ select public.projeto_sair((select projeto from s), 'Não é comigo, fui marcada por engano') $$,
  '22023', null, 'com atividade aberta no projeto, nao sai');
select tests.clear_authentication();
select tests.authenticate_as('dono@sairproj.test');
select throws_ok($$ select public.projeto_sair((select projeto from s), 'Quero sair do meu projeto') $$,
  '22023', null, 'quem criou o projeto nao sai');
select tests.clear_authentication();

-- ═══ 3-5. Concluída a atividade, a Gislene sai ═══
update public.tasks set status = 'completed', percentual = 100 where id = (select tarefa from s);
select tests.authenticate_as('gis@sairproj.test');
insert into r select public.projeto_sair((select projeto from s), 'Não participo dessa frente');
select tests.clear_authentication();
select is((select count(*)::int from public.project_members where project_id = (select projeto from s) and user_id = (select gis from u)), 0,
  'concluida a atividade, sai da equipe');
select is((select count(*)::int from public.notifications where type = 'projeto_saida' and user_id = (select dono from u)
            and message like 'Motivo: Não participo dessa frente%'), 1, 'quem criou e avisado com o motivo');
select tests.authenticate_as('gis@sairproj.test');
select is((select count(*)::int from public.projects where id = (select projeto from s)), 0, 'quem saiu nao ve mais o projeto');
select tests.clear_authentication();

-- ═══ 6. O outro membro não resolve ═══
select tests.authenticate_as('outro@sairproj.test');
select throws_ok($$ select public.projeto_resolver_saida((select saida from r), 'voltou') $$,
  '42501', null, 'quem nao comanda o projeto nao resolve a saida');
select tests.clear_authentication();

-- ═══ 7-8. O dono escolhe a Merilyn ═══
select tests.authenticate_as('dono@sairproj.test');
select public.projeto_resolver_saida((select saida from r), 'substituido', (select meri from u));
select tests.clear_authentication();
select is((select format('%s %s',
             (select count(*) from public.project_members where project_id = (select projeto from s) and user_id = (select meri from u)),
             (select referencia_id = (select meri from u) from public.project_setores where project_id = (select projeto from s)))),
  '1 t', 'quem assume entra na equipe e herda a referencia do setor');
select is((select resolucao from public.project_saidas where id = (select saida from r)), 'substituido', 'a saida fica resolvida');

select * from finish();
rollback;

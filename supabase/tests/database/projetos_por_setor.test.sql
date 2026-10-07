-- Projetos por setor (migrations 20261215010000/020000/030000; docs/plano-projetos.md).
-- Prova, pelo caminho que a pessoa percorre (insert com RETURNING, papel authenticated — lições 8 e 11):
--   - o dono cria o projeto e marca setores; a referência entra na equipe e é avisada
--   - o gestor do setor envolvido vê o projeto sem estar na equipe e planeja o setor
--   - a pessoa do setor que está na equipe cria atividade do SEU setor, não de outro
--   - quem recebe atividade entra na equipe e é avisado; o responsável muda % e farol, não o resto
--   - 100% finaliza; a dependência liberada avisa; o histórico registra
--   - quem não está na equipe não vê projeto, atividade nem comentário; Diretoria vê; outra empresa não
--   - modelo: salvar e criar a partir dele; aviso de prazo uma vez só; anon fora
begin;
\ir _helpers.psql

select plan(27);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-projset-a', 'ProjSet A') as a,
       tests.create_tenant('pgtap-projset-b', 'ProjSet B') as b;
create temporary table u on commit drop as
select tests.create_user('dono@projset.test',   (select a from f)) as dono,
       tests.create_user('gis@projset.test',    (select a from f)) as gis,
       tests.create_user('meri@projset.test',   (select a from f)) as meri,
       tests.create_user('ger@projset.test',    (select a from f)) as ger,
       tests.create_user('vini@projset.test',   (select a from f)) as vini,
       tests.create_user('dir@projset.test',    (select a from f)) as dir,
       tests.create_user('fora@projset.test',   (select a from f)) as fora,
       tests.create_user('outra@projset.test',  (select b from f)) as outra;
-- A Gislene é do Marketing. A Merilyn aqui NÃO é de setor nenhum: é só a responsável, que muda % e farol
-- (pessoa do setor que está na equipe planeja o setor inteiro, e aí não provaria a guarda do responsável).
update public.profiles set department = 'marketing' where id = (select gis from u);
update public.profiles set department = 'qualidade' where id = (select vini from u);
select tests.grant_profile((select ger from u), (select a from f), 'marketing', 'Gestor');
select tests.grant_module((select dir from u), (select a from f), 'diretoria');
grant select on f, u to authenticated, anon;

create temporary table s on commit drop as select gen_random_uuid() as projeto;
grant select on s to authenticated;
create temporary table ids (nome text primary key, id uuid);
grant select, insert on ids to authenticated;

-- ─── O dono cria o projeto e chama Marketing (referência Gislene) e Qualidade ────────────────
select tests.authenticate_as('dono@projset.test');
with criado as (
  insert into public.projects (id, tenant_id, name, description, owner_id, created_by, due_date)
  select projeto, (select a from f), 'Nutribalance 1 Litro', 'Lançar o 1 L', auth.uid(), auth.uid(), date '2026-12-15' from s
  returning id
) insert into ids select 'projeto', id from criado;
insert into public.project_setores (tenant_id, project_id, setor, referencia_id)
select (select a from f), projeto, 'marketing', (select gis from u) from s returning id;
insert into public.project_setores (tenant_id, project_id, setor)
select (select a from f), projeto, 'qualidade' from s returning id;
with fa as (
  insert into public.project_fases (tenant_id, project_id, nome, ordem)
  select (select a from f), projeto, 'Embalagem e Arte', 3 from s returning id
) insert into ids select 'fase', id from fa;
select tests.clear_authentication();

select is((select count(*)::int from public.project_members
            where project_id = (select projeto from s) and user_id = (select gis from u)), 1,
  'a referencia do setor entra na equipe sozinha');
select is((select count(*)::int from public.notifications
            where type = 'projeto_setor_chamado' and user_id in ((select gis from u), (select ger from u))), 2,
  'referencia e gestor do setor sao avisados que o setor foi chamado');

-- ─── O gestor do Marketing vê sem estar na equipe ─────────────────────────────────────────────
select tests.authenticate_as('ger@projset.test');
select is((select count(*)::int from public.projects where id = (select projeto from s)), 1,
  'o gestor de setor envolvido ve o projeto sem estar na equipe');
select tests.clear_authentication();

-- ─── A Gislene planeja o Marketing ────────────────────────────────────────────────────────────
select tests.authenticate_as('gis@projset.test');
with t as (
  insert into public.tasks (tenant_id, project_id, fase_id, setor, title, status, inicio, termino)
  select (select a from f), projeto, (select id from ids where nome = 'fase'), 'marketing',
         'Volumetria e Frasco', 'pending', date '2026-10-13', date '2026-10-24' from s
  returning id
) insert into ids select 'volumetria', id from t;
select is((select count(*)::int from ids where nome = 'volumetria'), 1,
  'a pessoa do setor na equipe cria atividade do seu setor (com RETURNING)');
select throws_ok(
  format($$ insert into public.tasks (tenant_id, project_id, setor, title, status)
            values (%L::uuid, %L::uuid, 'qualidade', 'Invadir', 'pending') returning id $$,
         (select a from f), (select projeto from s)),
  '42501', null, 'mas nao cria atividade de outro setor');
-- A arte depende da volumetria e fica com a própria Gislene (termino no passado: vai atrasar).
with t as (
  insert into public.tasks (tenant_id, project_id, fase_id, setor, title, status, user_id, depende_de, termino)
  select (select a from f), projeto, (select id from ids where nome = 'fase'), 'marketing', 'Arte da Embalagem',
         'pending', (select gis from u), (select id from ids where nome = 'volumetria'), date '2026-01-10' from s
  returning id
) insert into ids select 'arte', id from t;
-- A volumetria vai para a Merilyn, que ainda não está na equipe.
update public.tasks set user_id = (select meri from u) where id = (select id from ids where nome = 'volumetria') returning id;
select tests.clear_authentication();

select is((select count(*)::int from public.project_members
            where project_id = (select projeto from s) and user_id = (select meri from u)), 1,
  'quem recebe atividade entra na equipe');
select ok((select count(*) from public.notifications where type = 'projeto_atividade' and user_id = (select meri from u)) >= 1,
  'e e avisado da atividade');
select is((select due_date from public.tasks where id = (select id from ids where nome = 'volumetria')),
  ('2026-10-24 18:00'::timestamp at time zone 'America/Sao_Paulo'),
  'o termino vira o prazo da Home (18h de Brasilia)');

-- ─── A Merilyn é responsável: muda % e farol, não o resto ─────────────────────────────────────
select tests.authenticate_as('meri@projset.test');
update public.tasks set percentual = 40 where id = (select id from ids where nome = 'volumetria') returning id;
select is((select status from public.tasks where id = (select id from ids where nome = 'volumetria')), 'in_progress',
  'o responsavel informa 40% e o farol vai para Em andamento');
select throws_ok(
  format($$ update public.tasks set title = 'Outra coisa' where id = %L::uuid $$, (select id from ids where nome = 'volumetria')),
  '42501', null, 'mas nao muda o titulo — o resto da atividade e do setor');
update public.tasks set percentual = 100 where id = (select id from ids where nome = 'volumetria') returning id;
select is((select status || '|' || (completed_at is not null)::text from public.tasks where id = (select id from ids where nome = 'volumetria')),
  'completed|true', '100% finaliza e marca a conclusao');
insert into public.task_comentarios (tenant_id, task_id, texto)
select (select a from f), (select id from ids where nome = 'volumetria'), '@Gislene frasco aprovado' returning id;
select tests.clear_authentication();

select ok((select count(*) from public.notifications where type = 'projeto_dependencia' and user_id = (select gis from u)) >= 1,
  'a dependencia liberada avisa o responsavel da atividade que esperava');
select ok((select count(*) from public.task_comentarios where task_id = (select id from ids where nome = 'volumetria') and sistema) >= 2,
  'o historico registra as mudancas de % e farol');

-- ─── Quem não está na equipe ──────────────────────────────────────────────────────────────────
select tests.authenticate_as('vini@projset.test');
select is((select count(*)::int from public.projects where id = (select projeto from s)), 0,
  'pessoa do setor envolvido que nao esta na equipe nem e gestora nao ve o projeto');
select throws_ok(
  format($$ insert into public.tasks (tenant_id, project_id, setor, title, status)
            values (%L::uuid, %L::uuid, 'qualidade', 'Tentar', 'pending') returning id $$,
         (select a from f), (select projeto from s)),
  '42501', null, 'e nao planeja o setor sem estar na equipe');
select tests.clear_authentication();

select tests.authenticate_as('fora@projset.test');
select is((select count(*)::int from public.tasks where project_id = (select projeto from s))
        + (select count(*)::int from public.task_comentarios where task_id = (select id from ids where nome = 'volumetria')), 0,
  'quem esta fora nao ve atividade nem comentario');
select tests.clear_authentication();

select tests.authenticate_as('dir@projset.test');
select is((select count(*)::int from public.projects where id = (select projeto from s)), 1,
  'quem tem o modulo Diretoria ve o projeto');
select tests.clear_authentication();

select tests.authenticate_as('outra@projset.test');
select is((select count(*)::int from public.projects where tenant_id = (select a from f))
        + (select count(*)::int from public.project_setores where tenant_id = (select a from f))
        + (select count(*)::int from public.project_fases where tenant_id = (select a from f)), 0,
  'a outra empresa nao ve projeto, setor nem fase');
select tests.clear_authentication();

-- ─── Modelos ──────────────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('dono@projset.test');
insert into ids select 'modelo', public.salvar_como_modelo((select projeto from s), 'Lançamento de produto (teste)');
select tests.clear_authentication();
select is((select count(*)::int from public.tasks where project_id = (select id from ids where nome = 'modelo')
             and user_id is null and termino is null and percentual = 0), 2,
  'salvar como modelo copia as atividades sem pessoa, datas e %');
select is((select count(*)::int from public.tasks a join public.tasks d on d.id = a.depende_de
            where a.project_id = (select id from ids where nome = 'modelo') and d.project_id = (select id from ids where nome = 'modelo')), 1,
  'e a dependencia aponta para a copia, nao para o projeto original');

select tests.authenticate_as('fora@projset.test');
select is((select count(*)::int from public.projects where id = (select id from ids where nome = 'modelo')), 1,
  'qualquer pessoa da empresa ve o modelo');
insert into ids select 'do_modelo', public.criar_projeto_do_modelo((select id from ids where nome = 'modelo'),
  'Outro lançamento', 'Objetivo', date '2027-03-01', array['compras']);
select is((select count(*)::int from public.tasks where project_id = (select id from ids where nome = 'do_modelo'))
        || '|' || (select string_agg(setor, ',' order by setor) from public.project_setores where project_id = (select id from ids where nome = 'do_modelo')),
  '2|compras,marketing,qualidade', 'criar a partir do modelo traz as atividades e soma os setores marcados');
select is((select owner_id from public.projects where id = (select id from ids where nome = 'do_modelo')), (select fora from u),
  'e quem criou e o dono do projeto novo');
select tests.clear_authentication();

-- ─── Aviso de prazo: atrasada avisa uma vez só ────────────────────────────────────────────────
select ok(public.avisar_prazos_de_projeto() >= 1, 'a atividade atrasada da Gislene gera aviso');
select is(public.avisar_prazos_de_projeto(), 0, 'e no dia seguinte nao repete');

-- ─── Portas ───────────────────────────────────────────────────────────────────────────────────
select ok(not has_function_privilege('anon', 'public.pode_planejar_setor(uuid, text)', 'execute')
      and not has_function_privilege('anon', 'public.criar_projeto_do_modelo(uuid, text, text, date, text[])', 'execute')
      and not has_function_privilege('anon', 'public.salvar_como_modelo(uuid, text)', 'execute'),
  'anon nao chama as funcoes de projeto');
select ok(not has_function_privilege('authenticated', 'public.avisar_prazos_de_projeto()', 'execute')
      and not has_function_privilege('authenticated', 'public.projeto_copiar_estrutura(uuid, uuid)', 'execute'),
  'nem quem esta logado chama o cron e a copia por dentro');

select * from finish();
rollback;

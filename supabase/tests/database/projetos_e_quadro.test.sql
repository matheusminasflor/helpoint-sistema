-- OKR-2: Projetos e o quadro (migrations 20260930010000 e 20260930020000).
-- Prova:
--   - só quem participa vê o projeto; dono/admin da empresa vê todos; gestor
--     comum, não — foi pedido fechado
--   - a tarefa pessoal continua **estritamente pessoal**: a mudança de RLS não
--     abriu para o projeto o que era de cada um
--   - a tarefa do projeto é de quem participa dele: vê, arrasta e conclui
--   - tarefa de projeto pode esperar por um dono; tarefa pessoal, não
--   - apagar o projeto não trava nem larga órfão
--   - outra empresa não enxerga nem encosta
begin;
\ir _helpers.psql

select plan(24);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-proj-a', 'Proj A') as a,
       tests.create_tenant('pgtap-proj-b', 'Proj B') as b;

create temporary table u on commit drop as
select tests.create_user('ana@proj.test',     (select a from f)) as ana,
       tests.create_user('bruno@proj.test',   (select a from f)) as bruno,
       tests.create_user('gestor@proj.test',  (select a from f)) as gestor,
       tests.create_user('dona@proj.test',    (select a from f)) as dona,
       tests.create_user('carlosb@proj.test', (select b from f)) as carlos_b;
select tests.grant_role((select gestor from u), 'manager');
select tests.grant_role((select dona from u),   'owner');
grant select on f, u to authenticated, anon;

create temporary table s on commit drop as
select gen_random_uuid() as projeto,
       gen_random_uuid() as t_sem_dono,
       gen_random_uuid() as t_da_ana,
       gen_random_uuid() as pessoal_da_ana,
       gen_random_uuid() as projeto_b;
grant select on s to authenticated, anon;

-- ───────────────────────────────────────────────────────────────────────────
-- A Ana abre um projeto e chama o Bruno
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('ana@proj.test');
-- `returning` de propósito, e é a diferença entre passar e reprovar: é assim
-- que o PostgREST insere (a regra 2 das cinco manda toda escrita provar que
-- gravou), e com RETURNING o PostgreSQL aplica a **policy de SELECT já no
-- insert**, antes de qualquer trigger AFTER. Enquanto a visibilidade dependia
-- só do trigger que põe o autor em `project_members`, um funcionário comum
-- levava 42501 e não criava projeto nenhum. Sem o `returning` aqui, o teste
-- passaria verde com o sistema quebrado para todo mundo que não é dono.
create temporary table novo on commit drop as
with criado as (
  insert into public.projects (id, tenant_id, name, owner_id, created_by)
  select projeto, (select a from f), 'Trocar o ERP', auth.uid(), auth.uid() from s
  returning id
)
select id from criado;
grant select on novo to authenticated;

select is((select count(*)::int from novo), 1, 'a Ana cria o projeto e o banco devolve a linha');
select is(
  (select count(*)::int from public.project_members where project_id = (select projeto from s)),
  1,
  'quem abre o projeto ja entra nele, sem precisar se convidar'
);

insert into public.project_members (tenant_id, project_id, user_id)
select (select a from f), projeto, (select bruno from u) from s;

-- Duas tarefas no quadro: uma que ninguém pegou, outra da Ana.
insert into public.tasks (id, tenant_id, project_id, title, status, position)
select t_sem_dono, (select a from f), projeto, 'Levantar requisitos', 'pending', 1 from s;
insert into public.tasks (id, tenant_id, project_id, user_id, title, status, position)
select t_da_ana, (select a from f), projeto, auth.uid(), 'Falar com o fornecedor', 'in_progress', 2 from s;
-- E uma tarefa pessoal dela, que projeto nenhum pode alcançar.
insert into public.tasks (id, tenant_id, user_id, title, status)
select pessoal_da_ana, (select a from f), auth.uid(), 'Comprar cafe', 'pending' from s;

select is(
  (select count(*)::int from public.tasks where project_id = (select projeto from s)),
  2,
  'o quadro tem as duas tarefas, inclusive a que ninguem pegou'
);
-- A regra que segura o quadro: tarefa de projeto espera por um dono, tarefa
-- pessoal não — sem dono ela não apareceria na lista de ninguém.
--
-- O código é 42501 e não o 23514 do CHECK: a policy pergunta `user_id =
-- auth.uid()`, que com `user_id` nulo dá **nulo** — e nulo não é "verdadeiro".
-- A RLS barra antes de o CHECK ser consultado. O CHECK fica como cinto de
-- segurança para quem escreve por fora da RLS (trigger, `service_role`).
select throws_ok(
  format($$ insert into public.tasks (tenant_id, title, status) values (%L::uuid, 'Orfa', 'pending') $$,
         (select a from f)),
  '42501', null,
  'tarefa sem projeto e sem dono nao entra'
);
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- O Bruno participa: vê o quadro, arrasta o cartão, mas não invade o pessoal
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('bruno@proj.test');
select is(
  (select count(*)::int from public.projects where id = (select projeto from s)),
  1,
  'quem participa ve o projeto'
);
select is(
  (select count(*)::int from public.tasks where project_id = (select projeto from s)),
  2,
  'e ve as tarefas do quadro, inclusive a que e da Ana'
);
-- Arrastar um cartão é mudar o status: é o que o quadro faz, e quem participa
-- pode fazer mesmo no cartão que não é dele.
update public.tasks set status = 'completed'
 where id = (select t_da_ana from s);
select is(
  (select status from public.tasks where id = (select t_da_ana from s)),
  'completed',
  'quem participa arrasta o cartao do colega'
);
-- A tarefa pessoal da Ana continua sendo dela e de mais ninguém. É a prova de
-- que trocar a RLS de `tasks` não abriu o que era privado.
select is(
  (select count(*)::int from public.tasks where id = (select pessoal_da_ana from s)),
  0,
  'mas nao ve a tarefa pessoal da Ana'
);
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- Quem não participa
-- ───────────────────────────────────────────────────────────────────────────
-- O gestor comum não vê: o dono pediu projeto fechado, e isto é o que segura.
select tests.authenticate_as('gestor@proj.test');
select is(
  (select count(*)::int from public.projects where id = (select projeto from s)),
  0,
  'gestor que nao participa nao ve o projeto'
);
select is(
  (select count(*)::int from public.tasks where project_id = (select projeto from s)),
  0,
  'nem as tarefas dele'
);
-- Mas continua vendo a tarefa **pessoal** de quem ele chefia, como antes desta
-- leva: aqui nada mudou, e o teste existe para acusar se mudar.
select is(
  (select count(*)::int from public.tasks where id = (select pessoal_da_ana from s)),
  1,
  'e continua vendo a tarefa pessoal de quem chefia, como antes'
);
select throws_ok(
  format($$ insert into public.tasks (tenant_id, project_id, title, status)
            values (%L::uuid, %L::uuid, 'De fora', 'pending') $$,
         (select a from f), (select projeto from s)),
  '42501', null,
  'e nao consegue jogar tarefa dentro de projeto alheio'
);
select tests.clear_authentication();

-- A dona da empresa vê tudo: sem isso quem responde pela empresa ficaria sem
-- enxergar nada, e teria de se convidar projeto a projeto.
select tests.authenticate_as('dona@proj.test');
select is(
  (select count(*)::int from public.projects where id = (select projeto from s)),
  1,
  'a dona da empresa ve o projeto sem participar dele'
);
select is(
  (select count(*)::int from public.tasks where project_id = (select projeto from s)),
  2,
  'e ve o quadro inteiro'
);
-- Ver e não poder mexer seria uma exceção pela metade: a dona abriria o quadro,
-- arrastaria um cartão e levaria "não afetou nenhuma linha". Quem vê, mexe.
update public.tasks set status = 'in_progress', position = 9
 where id = (select t_sem_dono from s);
select is(
  (select status from public.tasks where id = (select t_sem_dono from s)),
  'in_progress',
  'e arrasta cartao no quadro que nao e dela'
);
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- A outra empresa
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('carlosb@proj.test');
select is(
  (select count(*)::int from public.projects where tenant_id = (select a from f)),
  0,
  'a empresa B nao ve projeto da A'
);
select is(
  (select count(*)::int from public.tasks where project_id = (select projeto from s)),
  0,
  'nem o quadro da A'
);
select is(
  (select count(*)::int from public.project_members where project_id = (select projeto from s)),
  0,
  'nem quem participa dele'
);
select tests.clear_authentication();

set local role anon;
select is(
  has_table_privilege('anon', 'public.projects', 'select')::text
  || has_table_privilege('anon', 'public.project_members', 'select')::text,
  'falsefalse',
  'visitante de fora nao tem porta para projeto nenhum'
);
reset role;

-- ───────────────────────────────────────────────────────────────────────────
-- Apagar o projeto
-- ───────────────────────────────────────────────────────────────────────────
-- O que ninguém pegou some com o projeto; o que alguém estava tocando volta a
-- ser tarefa pessoal dessa pessoa. Sem o trigger que faz isso, a chave
-- estrangeira soltava a tarefa sem dono e o CHECK a recusava: projeto com
-- qualquer item não atribuído era **impossível** de apagar.
select tests.authenticate_as('ana@proj.test');
select lives_ok(
  format($$ delete from public.projects where id = %L::uuid $$, (select projeto from s)),
  'o dono do projeto consegue apagar, mesmo com tarefa que ninguem pegou'
);
select is(
  (select count(*)::int from public.tasks where id = (select t_sem_dono from s)),
  0,
  'a tarefa que ninguem pegou some junto'
);
select is(
  (select project_id is null and user_id = (select ana from u) from public.tasks where id = (select t_da_ana from s)),
  true,
  'e a que era da Ana volta a ser tarefa pessoal dela'
);
select is(
  (select count(*)::int from public.project_members where project_id = (select projeto from s)),
  0,
  'e ninguem fica participando de projeto que nao existe'
);
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- Passar o projeto para outra pessoa
-- ───────────────────────────────────────────────────────────────────────────
-- Sem isto o novo dono não entrava em `project_members`: não via o quadro pelo
-- caminho de participante, não conseguia nem se convidar (a policy do convite
-- precisa enxergar a linha do projeto), e o antigo perdia editar e apagar no
-- mesmo instante. Projeto sem ninguém que mande nele.
select tests.authenticate_as('ana@proj.test');
create temporary table p2 on commit drop as
with criado as (
  insert into public.projects (id, tenant_id, name, owner_id, created_by)
  select gen_random_uuid(), (select a from f), 'Projeto que troca de mao', auth.uid(), auth.uid() from s
  returning id
)
select id from criado;
grant select on p2 to authenticated;

update public.projects set owner_id = (select bruno from u) where id = (select id from p2);
select is(
  (select count(*)::int from public.project_members
    where project_id = (select id from p2) and user_id = (select bruno from u)),
  1,
  'passar o projeto adiante poe o novo dono dentro dele'
);
select tests.clear_authentication();

select * from finish();
rollback;

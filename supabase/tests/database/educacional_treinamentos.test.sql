-- L3b: Educacional — treinamentos, turmas e participantes (migration 20261006010000).
--
-- As quatro decisões do dono que este arquivo existe para prender:
-- o aluno externo é o **cliente do SAC**; treinamento tem **turma com data**;
-- **só a equipe lança**; concluir **registra**, sem certificado.
--
-- Prova:
--   - a turma não estoura a vaga, e cancelar devolve a que foi liberada
--   - quem cancelou **não** volta se a turma encheu nesse meio-tempo — vaga é
--     promessa feita a quem está dentro, não a quem saiu
--   - concluir carimba a data sozinho, e voltar atrás apaga o carimbo
--   - participante é funcionário **ou** cliente, nunca os dois nem nenhum
--   - a mesma pessoa não entra duas vezes na mesma turma
--   - quem cancelou volta pela função, na mesma linha; quem concluiu não é
--     rebaixado por um clique distraído
--   - turma de outra empresa não aceita inscrição
--   - ver é de quem tem o Educacional; montar treinamento é de gestor;
--     inscrever e marcar presença é de quem está na sala
--   - marcar presença não ocupa lugar novo, e reduzir as vagas abaixo de quem
--     já está dentro é barrado onde o erro é legível
--   - "para quem é" é regra do banco, não só da tela
--   - apagar participante é de gestor; cancelar é a operação do dia
--   - a função de inscrever é exercitada **como quem está logado**, que é a
--     única situação em que `security invoker` quer dizer alguma coisa
--   - outra empresa não vê nada disto, e anônimo não vê nem lista
begin;
\ir _helpers.psql

select plan(38);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-edu-a', 'Educacional A') as a,
       tests.create_tenant('pgtap-edu-b', 'Educacional B') as b;

create temporary table u on commit drop as
select tests.create_user('gestor@edu.test',    (select a from f)) as gestor,
       tests.create_user('operador@edu.test',  (select a from f)) as operador,
       tests.create_user('semacesso@edu.test', (select a from f)) as sem_acesso,
       tests.create_user('aluno@edu.test',     (select a from f)) as aluno,
       tests.create_user('gestorb@edu.test',   (select b from f)) as gestor_b;
select tests.grant_module((select gestor from u),   (select a from f), 'educacional');
select tests.grant_module((select operador from u), (select a from f), 'educacional');
select tests.grant_module((select gestor_b from u), (select b from f), 'educacional');
select tests.grant_role((select gestor from u),   'manager');
select tests.grant_role((select gestor_b from u), 'manager');
grant select on f, u to authenticated, anon;

-- O aluno externo é o cliente do SAC: quem já tem cadastro e login no portal.
create temporary table c on commit drop as
select tests.create_customer('salao@cliente.test', (select a from f)) as user_id,
       tests.create_customer('outro@cliente.test', (select b from f)) as user_id_b;
create temporary table cli on commit drop as
select (select id from public.customer_profiles where user_id = (select user_id from c)) as id,
       (select id from public.customer_profiles where user_id = (select user_id_b from c)) as id_b;
grant select on c, cli to authenticated, anon;

create temporary table tr on commit drop as
with ins as (
  insert into public.trainings (tenant_id, title, audience, hours)
  select a, 'Aplicação de coloração', 'ambos', 4 from f
  returning id
) select id from ins;
grant select on tr to authenticated, anon;

-- Duas turmas de propósito: uma com **duas** vagas, onde a conta da vaga é
-- curta o suficiente para caber numa prova; e outra sem limite, onde se
-- exercita o resto sem a vaga atrapalhar a leitura do que falhou.
create temporary table turma on commit drop as
with ins as (
  insert into public.training_sessions
    (tenant_id, training_id, starts_at, modality, location, capacity)
  select a, (select id from tr), now() + interval '7 days', 'presencial', 'Sala 2', 2 from f
  returning id
) select id from ins;
create temporary table turma2 on commit drop as
with ins as (
  insert into public.training_sessions
    (tenant_id, training_id, starts_at, modality, location)
  select a, (select id from tr), now() + interval '30 days', 'online', 'https://sala.exemplo' from f
  returning id
) select id from ins;
grant select on turma, turma2 to authenticated, anon;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. A vaga é promessa: o banco conta, não a tela
-- ───────────────────────────────────────────────────────────────────────────
create temporary table p1 on commit drop as
with ins as (
  insert into public.training_enrollments (tenant_id, session_id, profile_id)
  select a, (select id from turma), (select gestor from u) from f
  returning id
) select id from ins;
grant select on p1 to authenticated, anon;

select lives_ok(
  $$ insert into public.training_enrollments (tenant_id, session_id, customer_profile_id)
     select a, (select id from turma), (select id from cli) from f $$,
  'funcionario e cliente cabem na mesma turma'
);
select throws_ok(
  $$ insert into public.training_enrollments (tenant_id, session_id, profile_id)
     select a, (select id from turma), (select operador from u) from f $$,
  '23514',
  null,
  'a terceira inscricao nao passa das duas vagas'
);

-- Cancelar devolve a vaga: quem cancelou não ocupa lugar de ninguém.
update public.training_enrollments set status = 'cancelado' where id = (select id from p1);
select lives_ok(
  $$ insert into public.training_enrollments (tenant_id, session_id, profile_id)
     select a, (select id from turma), (select operador from u) from f $$,
  'cancelar devolve a vaga, e outra pessoa entra'
);

-- E a volta não fura a fila. Achado ao exercitar o caminho: a turma encheu
-- depois que a pessoa saiu, então voltar tem de ser recusado — senão o lugar
-- que já foi prometido a quem está dentro vira lugar de quem saiu.
select throws_ok(
  $$ select public.training_inscrever((select id from turma), (select gestor from u), null) $$,
  '23514',
  null,
  'quem cancelou nao volta se a turma encheu nesse meio-tempo'
);

-- Mas marcar presença **não** ocupa lugar novo, e não podia estar sob a mesma
-- conferência. Estava: achado da auditoria. Com a turma no limite, o operador
-- que só queria marcar "Faltou" recebia "a turma já está com as N vagas
-- preenchidas" — e, não sendo gestor, não conseguia nem editar a turma.
select lives_ok(
  $$ update public.training_enrollments set status = 'presente'
      where session_id = (select id from turma) and status = 'inscrito' $$,
  'marcar presenca na turma no limite continua funcionando'
);

-- E reduzir as vagas abaixo de quem já está dentro é barrado onde o erro é
-- legível: na hora de reduzir, com o número na frase.
select throws_ok(
  $$ update public.training_sessions set capacity = 1 where id = (select id from turma) $$,
  '23514',
  null,
  'nao da para deixar menos vagas do que gente ja inscrita'
);
select lives_ok(
  $$ update public.training_sessions set capacity = 5 where id = (select id from turma) $$,
  'aumentar as vagas sempre pode'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Voltar para a turma quando há lugar
-- ───────────────────────────────────────────────────────────────────────────
-- Uma pessoa tem **uma linha por turma**, e cancelar é um estado dela. Sem a
-- função, inscrever de novo batia no índice único e mostrava um erro cru do
-- Postgres para quem só queria clicar.
update public.training_enrollments
   set status = 'cancelado'
 where session_id = (select id from turma) and profile_id = (select operador from u);

create temporary table volta on commit drop as
select public.training_inscrever((select id from turma), (select gestor from u), null) as id;
grant select on volta to authenticated, anon;

select is(
  (select id from volta),
  (select id from p1),
  'quem cancelou volta na MESMA linha, e o historico nao se perde'
);
select is(
  (select status from public.training_enrollments where id = (select id from p1)),
  'inscrito',
  'e volta como inscrito'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Concluir carimba a data sozinho
-- ───────────────────────────────────────────────────────────────────────────
-- Quem marca "concluiu" está numa lista, clicando rápido em dez pessoas: pedir
-- a data junto é pedir para ela ficar errada.
update public.training_enrollments set status = 'concluido' where id = (select id from p1);
select isnt(
  (select completed_at from public.training_enrollments where id = (select id from p1)),
  null,
  'concluir carimba a data sem ninguem digitar'
);
update public.training_enrollments set status = 'inscrito' where id = (select id from p1);
select is(
  (select completed_at from public.training_enrollments where id = (select id from p1)),
  null,
  'e voltar atras apaga o carimbo, em vez de deixar um fato que nao aconteceu'
);
-- Carimbar é para quem **não** informou a data. Quem lança uma turma antiga
-- informa o dia em que ela aconteceu, e o trigger não pode passar por cima —
-- senão o histórico inteiro de um lançamento retroativo vira "hoje".
update public.training_enrollments
   set status = 'concluido', completed_at = timestamptz '2026-03-10 14:00-03'
 where id = (select id from p1);
select is(
  (select completed_at from public.training_enrollments where id = (select id from p1)),
  timestamptz '2026-03-10 14:00-03',
  'a data informada na mao e respeitada, em vez de virar hoje'
);
update public.training_enrollments set status = 'inscrito' where id = (select id from p1);

-- Quem já concluiu não é rebaixado por um clique distraído.
update public.training_enrollments set status = 'concluido' where id = (select id from p1);
select public.training_inscrever((select id from turma), (select gestor from u), null);
select is(
  (select status from public.training_enrollments where id = (select id from p1)),
  'concluido',
  'inscrever de novo quem ja concluiu nao apaga o que aconteceu'
);
select throws_ok(
  $$ select public.training_inscrever((select id from turma), (select gestor from u), (select id from cli)) $$,
  '23514',
  null,
  'a funcao tambem recusa funcionario e cliente juntos'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Participante é funcionário **ou** cliente — na turma sem limite de vaga
-- ───────────────────────────────────────────────────────────────────────────
insert into public.training_enrollments (tenant_id, session_id, profile_id)
select a, (select id from turma2), (select gestor from u) from f;

select throws_ok(
  $$ insert into public.training_enrollments
       (tenant_id, session_id, profile_id, customer_profile_id)
     select a, (select id from turma2), (select operador from u), (select id from cli) from f $$,
  '23514',
  null,
  'ninguem e funcionario e cliente ao mesmo tempo'
);
select throws_ok(
  $$ insert into public.training_enrollments (tenant_id, session_id)
     select a, (select id from turma2) from f $$,
  '23514',
  null,
  'e inscricao sem pessoa nenhuma nao existe'
);
select throws_ok(
  $$ insert into public.training_enrollments (tenant_id, session_id, profile_id)
     select a, (select id from turma2), (select gestor from u) from f $$,
  '23505',
  null,
  'a mesma pessoa nao entra duas vezes na mesma turma'
);
-- Turma de outra empresa: a chave composta `(id, tenant_id)` é quem barra.
select throws_ok(
  $$ insert into public.training_enrollments (tenant_id, session_id, profile_id)
     select b, (select id from turma2), (select gestor_b from u) from f $$,
  '23503',
  null,
  'turma de outra empresa nao aceita inscricao'
);
-- E o cliente de outra empresa, pela chave composta que esta leva acrescentou em
-- `customer_profiles` — a razão de ela existir.
select throws_ok(
  $$ insert into public.training_enrollments (tenant_id, session_id, customer_profile_id)
     select a, (select id from turma2), (select id_b from cli) from f $$,
  '23503',
  null,
  'cliente de outra empresa nao entra na turma desta'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 4b. "Para quem é" é regra do banco, não só da tela
-- ───────────────────────────────────────────────────────────────────────────
-- Achado da auditoria: `audience` filtrava a lista na tela e o banco aceitava
-- qualquer um. É a mesma família do defeito da CRM-4c — regra que vive em um
-- lugar só é regra que some.
create temporary table tr_interno on commit drop as
with ins as (
  insert into public.trainings (tenant_id, title, audience)
  select a, 'Segurança do trabalho', 'interno' from f
  returning id
) select id from ins;
create temporary table turma_interna on commit drop as
with ins as (
  insert into public.training_sessions (tenant_id, training_id, starts_at)
  select a, (select id from tr_interno), now() + interval '10 days' from f
  returning id
) select id from ins;
grant select on tr_interno, turma_interna to authenticated, anon;

select throws_ok(
  $$ insert into public.training_enrollments (tenant_id, session_id, customer_profile_id)
     select a, (select id from turma_interna), (select id from cli) from f $$,
  '23514',
  null,
  'cliente nao entra em treinamento so para funcionarios'
);
select lives_ok(
  $$ insert into public.training_enrollments (tenant_id, session_id, profile_id)
     select a, (select id from turma_interna), (select aluno from u) from f $$,
  'e o funcionario entra'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Quem vê e quem mexe
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('operador@edu.test');

select is(
  (select count(*)::int from public.trainings),
  2,
  'quem tem o Educacional ve os treinamentos da propria empresa'
);
-- Montar treinamento e abrir turma é de gestor, como criar categoria ou funil.
select throws_ok(
  $$ insert into public.trainings (tenant_id, title, audience)
     select a, 'Treinamento que o operador nao cria', 'interno' from f $$,
  '42501',
  null,
  'operador comum nao monta treinamento'
);
select throws_ok(
  $$ insert into public.training_sessions (tenant_id, training_id, starts_at)
     select a, (select id from tr), now() from f $$,
  '42501',
  null,
  'nem abre turma'
);
-- Mas inscrever e marcar presença **é** dele: é a operação do dia, feita por
-- quem está na sala. `returning` porque é assim que a tela escreve, e com ele a
-- policy de SELECT vale já no insert (regra 11 do CLAUDE.md).
select lives_ok(
  $$ insert into public.training_enrollments (tenant_id, session_id, profile_id)
     select a, (select id from turma2), (select sem_acesso from u) from f returning id $$,
  'quem tem o Educacional inscreve gente na turma'
);
select is(
  (select count(*)::int from public.training_enrollments
    where session_id = (select id from turma2) and profile_id = (select sem_acesso from u)),
  1,
  'e a inscricao fica gravada mesmo'
);

-- O caminho que a tela usa de verdade é a função, e ela é `security invoker`:
-- a propriedade que importa só aparece com a RLS ligada. Todas as chamadas
-- anteriores acontecem antes do primeiro `authenticate_as` — achado da
-- auditoria, e sem esta asserção `security definer` passaria despercebido.
select isnt(
  public.training_inscrever((select id from turma2), (select aluno from u), null),
  null,
  'o operador inscreve pela funcao, que e o caminho da tela'
);
-- Apagar participante não é dele: cancelar é o estado, apagar some com o
-- histórico. `DELETE` barrado por policy **não levanta erro** — a linha é
-- filtrada e o comando afeta zero linhas (regra 12 do CLAUDE.md). Então o
-- comando corre solto e quem responde é a contagem depois dele.
delete from public.training_enrollments
 where session_id = (select id from turma2) and profile_id = (select aluno from u);
select is(
  (select count(*)::int from public.training_enrollments
    where session_id = (select id from turma2) and profile_id = (select aluno from u)),
  1,
  'operador nao apaga participante: some o historico de quem entrou e saiu'
);

select tests.clear_authentication();
select tests.authenticate_as('semacesso@edu.test');

select is(
  (select count(*)::int from public.trainings),
  0,
  'quem nao tem o Educacional nao ve treinamento nenhum'
);
select is(
  (select count(*)::int from public.training_enrollments),
  0,
  'nem a lista de quem participou'
);

select tests.clear_authentication();
select tests.authenticate_as('gestor@edu.test');

-- Gestor apaga, porque engano de digitação precisa de saída — e quem apaga
-- assume o que some.
delete from public.training_enrollments
 where session_id = (select id from turma2) and profile_id = (select aluno from u);
select is(
  (select count(*)::int from public.training_enrollments
    where session_id = (select id from turma2) and profile_id = (select aluno from u)),
  0,
  'o gestor apaga a inscricao lancada por engano'
);

select tests.clear_authentication();
select tests.authenticate_as('gestorb@edu.test');

select is(
  (select count(*)::int from public.trainings) +
  (select count(*)::int from public.training_sessions) +
  (select count(*)::int from public.training_enrollments),
  0,
  'a outra empresa nao ve treinamento, turma nem participante'
);
-- A função é `security invoker`: o `tenant_id` sai da turma, e a RLS é quem
-- impede alcançá-la. Quem não enxerga a turma recebe "não encontrada" — mesma
-- porta do id que não existe, para não virar oráculo.
select throws_ok(
  $$ select public.training_inscrever((select id from turma2), (select gestor_b from u), null) $$,
  'P0002',
  'turma não encontrada',
  'ninguem inscreve gente na turma de outra empresa'
);
select lives_ok(
  $$ insert into public.trainings (tenant_id, title, audience)
     select b, 'Treinamento da empresa B', 'interno' from f returning id $$,
  'e monta o treinamento dela, sem esbarrar no desta'
);

select tests.clear_authentication();

-- O Educacional não tem porta pública nesta leva: só a equipe lança.
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon'
      and table_name in ('trainings', 'training_sessions', 'training_enrollments')),
  0,
  'anonimo nao tem privilegio nenhum nas tres tabelas'
);
select is(
  (select count(*)::int from pg_class
    where relname in ('trainings', 'training_sessions', 'training_enrollments')
      and relrowsecurity),
  3,
  'e as tres estao com a RLS ligada'
);

-- A carga horária é do treinamento e aparece no histórico de quem fez.
select is(
  (select t.hours from public.trainings t where t.id = (select id from tr)),
  4::numeric,
  'a carga horaria fica no treinamento'
);
select is(
  (select count(*)::int from public.training_sessions s
    where s.training_id = (select id from tr) and s.tenant_id = (select a from f)),
  2,
  'e as turmas penduram no treinamento certo'
);

select * from finish();
rollback;

-- TURMA CANCELADA (migration 20270212560000; auditoria 2026-11-06).
--   1  a pessoa vê a turma como cancelada
--   2  o inscrito recebe o aviso
--   3  quem cancelou a inscrição não recebe
--   4  cancelar de novo não repete o aviso
--   5  a função não abre para anon
begin;
\ir _helpers.psql

select plan(5);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-turma', 'Turma', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@turma.test', (select a from f)) as ana,
       tests.create_user('bia@turma.test', (select a from f)) as bia;
grant select on f, u to authenticated;

create temporary table c on commit drop as
with t as (
  insert into public.trainings (tenant_id, title) select a, 'Boas práticas' from f returning id, tenant_id
), s as (
  insert into public.training_sessions (tenant_id, training_id, starts_at, modality)
  select tenant_id, id, now() + interval '3 days', 'presencial' from t returning id, tenant_id
), e as (
  insert into public.training_enrollments (tenant_id, session_id, profile_id, status)
  select s.tenant_id, s.id, x.pessoa, x.situacao
    from s, (values ((select ana from u), 'inscrito'), ((select bia from u), 'cancelado')) x(pessoa, situacao)
  returning id
) select id from s;

update public.training_sessions set status = 'cancelada' where id = (select id from c);

select is((select count(*)::int from public.notifications
            where user_id = (select ana from u) and reference_id = (select id from c)), 1, 'o inscrito recebe o aviso');
select is((select count(*)::int from public.notifications
            where user_id = (select bia from u) and reference_id = (select id from c)), 0, 'quem cancelou não recebe');

update public.training_sessions set status = 'cancelada' where id = (select id from c);
select is((select count(*)::int from public.notifications
            where user_id = (select ana from u) and reference_id = (select id from c)), 1, 'cancelar de novo não repete');

select ok(not has_function_privilege('anon', 'public.meus_treinamentos()', 'execute'), 'a função não abre para anon');

select tests.authenticate_as('ana@turma.test');
select is((select turma_situacao from public.meus_treinamentos()), 'cancelada', 'a pessoa vê a turma cancelada');
select tests.clear_authentication();

select * from finish();
rollback;

-- FÉRIAS DO MEU SETOR NA AGENDA (migration 20270131010000, decisão do dono de 2026-10-25).
begin;
\ir _helpers.psql

select plan(5);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-agenda', 'Agenda', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@agenda.test', (select a from f)) as ana,
       tests.create_user('bia@agenda.test', (select a from f)) as bia,
       tests.create_user('caio@agenda.test', (select a from f)) as caio,
       tests.create_user('dir@agenda.test', (select a from f)) as dir;
grant select on f, u to authenticated;

-- Ana e Bia no Marketing; Caio na TI; a diretora só com a Diretoria (e o Marketing não).
select tests.grant_module((select ana from u), (select a from f), 'marketing');
select tests.grant_module((select bia from u), (select a from f), 'marketing');
select tests.grant_module((select caio from u), (select a from f), 'ti');
select tests.grant_module((select dir from u), (select a from f), 'diretoria');
select tests.grant_module((select bia from u), (select a from f), 'diretoria');
-- As férias são do colaborador do RH (R4).
select tests.create_colaborador(x) from (select bia x from u union all select caio from u) s;

insert into public.rh_vacation_requests (tenant_id, user_id, start_date, end_date, days_requested, type, status, notes)
select a, (select bia from u), date '2026-11-03', date '2026-11-12', 10, 'ferias', 'aprovada', 'motivo particular' from f
union all
select a, (select bia from u), date '2026-12-01', date '2026-12-05', 5, 'ferias', 'pendente', null from f
union all
select a, (select caio from u), date '2026-11-05', date '2026-11-06', 2, 'ferias', 'aprovada', null from f;

select tests.authenticate_as('ana@agenda.test');
select is((select count(*)::int from public.ferias_do_meu_setor('2026-11-01', '2026-12-31')), 1,
  'quem é do mesmo setor vê só as férias APROVADAS da colega (a pendente e a do outro setor não)');
select is((select nome from public.ferias_do_meu_setor('2026-11-01', '2026-11-30')), 'bia@agenda.test',
  'vem o nome e as datas');
select is((select count(*)::int from public.ferias_do_meu_setor('2026-11-13', '2026-11-30')), 0,
  'fora do intervalo não aparece');
select is((select count(*)::int from public.rh_vacation_requests where user_id = (select bia from u)), 0,
  'a tabela continua fechada: o motivo e o saldo não saem por ela');
select tests.clear_authentication();

select tests.authenticate_as('dir@agenda.test');
select is((select count(*)::int from public.ferias_do_meu_setor('2026-11-01', '2026-12-31')), 0,
  'ter a Diretoria não faz ninguém colega de setor de todo mundo');
select tests.clear_authentication();

select * from finish();
rollback;

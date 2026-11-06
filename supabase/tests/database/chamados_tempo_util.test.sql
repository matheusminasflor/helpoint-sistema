-- O PRAZO EM HORAS DE EXPEDIENTE (migration 20270212520000; dono, 2026-11-06, caso real do #337).
--   1    o prazo cheio são os 240 minutos de expediente, sem a noite
--   2    o tempo usado conta só o expediente
--   3    depois do vencimento, o atraso vem negativo
--   4    outra empresa não lê
--   5    a função não abre para anon
begin;
\ir _helpers.psql

select plan(5);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-tempo-util', 'Tempo Util', false) as a, tests.create_tenant('pgtap-tempo-outro', 'Outro', false) as b;
create temporary table u on commit drop as
select tests.create_user('ana@tempoutil.test', (select a from f)) as ana, tests.create_user('bia@tempoutil.test', (select b from f)) as bia;
grant select on f, u to authenticated;

create temporary table c on commit drop as
with t as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, created_by, priority, status, created_at, sla_due_at, resolved_at)
  select a, 'tickets', 'caso 337', 'x', (select ana from u), (select ana from u), 'critical', 'in_progress',
         timestamptz '2026-11-05 14:59:00-03', timestamptz '2026-11-06 08:59:00-03', timestamptz '2026-11-05 15:59:00-03'
    from f
  returning id
) select id from t;
grant select on c to authenticated;

select tests.authenticate_as('ana@tempoutil.test');
select is((select total from public.chamados_tempo_util(array(select id from c))), 240, 'quatro horas de expediente, sem contar a noite');
select is((select usados from public.chamados_tempo_util(array(select id from c))), 60, 'o tempo usado conta so o expediente');
select ok((select restantes < 0 from public.chamados_tempo_util(array(select id from c))), 'vencido vem negativo');
select tests.clear_authentication();

select tests.authenticate_as('bia@tempoutil.test');
select is((select count(*)::int from public.chamados_tempo_util(array(select id from c))), 0, 'outra empresa nao le');
select tests.clear_authentication();

select ok(not has_function_privilege('anon', 'public.chamados_tempo_util(uuid[])', 'execute'), 'a funcao nao abre para anon');

select * from finish();
rollback;

-- AGENDAR CONTA COMO A 1ª RESPOSTA (migration 20261216010000; dono, 2026-10-07).
-- O #34 da produção ficou com "1ª resposta com atraso" depois de agendado, e parecia que o
-- agendamento não pausava nada.
--   1  agendar (como o PostgREST, com RETURNING, pelo Gestor) grava a 1ª resposta;
--   2  chamado que já tinha 1ª resposta não tem o horário trocado;
--   3  a função do gatilho não é chamável por quem está logado.
begin;
\ir _helpers.psql

select plan(3);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-agenda-resp', 'Agenda resposta') as tenant;
create temporary table u on commit drop as
select tests.create_user('gestor@agenda-resp.test', (select tenant from f)) as gestor,
       tests.create_user('pede@agenda-resp.test',   (select tenant from f)) as pede;
select tests.grant_module((select gestor from u), (select tenant from f), 'marketing');
select tests.grant_profile((select gestor from u), (select tenant from f), 'marketing', 'Gestor');
grant select on f, u to authenticated;

create temporary table ch on commit drop as
with t as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, priority, status, assigned_to, first_response_at)
  values ((select tenant from f), 'marketing', 'sem resposta', 'x', (select pede from u), 'high', 'in_progress', (select gestor from u), null),
         ((select tenant from f), 'marketing', 'respondido',   'x', (select pede from u), 'high', 'in_progress', (select gestor from u), '2026-10-01 10:00-03')
  returning id, title
) select id, title from t;
grant select on ch to authenticated;

select tests.authenticate_as('gestor@agenda-resp.test');
create temporary table r on commit drop as
with a as (
  update public.tickets set status = 'scheduled', agendado_para = now() + interval '2 days', agendado_motivo = 'fila cheia'
   where id in (select id from ch) returning id
) select id from a;
select tests.clear_authentication();

select ok((select first_response_at is not null from public.tickets where id = (select id from ch where title = 'sem resposta')),
  'agendar grava a 1a resposta (o solicitante foi avisado de quando sera atendido)');
select is((select first_response_at from public.tickets where id = (select id from ch where title = 'respondido')),
  '2026-10-01 10:00-03'::timestamptz, 'quem ja tinha 1a resposta nao tem o horario trocado');
select ok(not has_function_privilege('authenticated', 'public.agendar_registra_primeira_resposta()', 'execute'),
  'a funcao do gatilho nao e chamavel por quem esta logado');

select * from finish();
rollback;

-- AGENDAR É CAIXINHA PRÓPRIA (migration 20270110010000; dono, 2026-10-14).
--   1  o perfil Operador nasce com "Agendar"
--   2  o Operador agenda o chamado
--   3  ... mas continua sem mudar a urgência (isso é "Mudar prioridade e prazo")
begin;
\ir _helpers.psql

select plan(3);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-agendar2', 'Agendar 2') as tenant;
create temporary table u on commit drop as
select tests.create_user('oper@agendar2.test', (select tenant from f)) as oper,
       tests.create_user('pede@agendar2.test', (select tenant from f)) as pede;
select tests.grant_module((select oper from u), (select tenant from f), 'marketing');
select tests.grant_profile((select oper from u), (select tenant from f), 'marketing', 'Operador');
grant select on f, u to authenticated;

select ok((select (permissions -> 'tickets' ->> 'schedule')::boolean from public.access_profiles
            where tenant_id = (select tenant from f) and department = 'marketing' and name = 'Operador'),
  'o perfil Operador nasce com Agendar');

create temporary table ch on commit drop as
with x as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, created_by, priority, status, assigned_to)
  select tenant, 'marketing', 'Arte', 'x', (select pede from u), (select pede from u), 'medium', 'in_progress', (select oper from u)
    from f returning id
) select id from x;
grant select on ch to authenticated;

select tests.authenticate_as('oper@agendar2.test');
update public.tickets set status = 'scheduled', agendado_para = now() + interval '3 days', agendado_motivo = 'Fornecedor'
 where id = (select id from ch) returning id;
select is((select status::text from public.tickets where id = (select id from ch)), 'scheduled', 'o Operador agenda o chamado');
select throws_ok($$ update public.tickets set priority = 'high' where id = (select id from ch) returning id $$,
  '42501', null, 'o Operador continua sem mudar a urgencia');
select tests.clear_authentication();

select * from finish();
rollback;

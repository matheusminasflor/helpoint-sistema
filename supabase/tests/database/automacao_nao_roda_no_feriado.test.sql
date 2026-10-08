-- AUTOMAÇÃO AGENDADA NÃO RODA NO FERIADO (migration 20261219010000; dono, 2026-10-08).
--   1  a agendada que cai num feriado da empresa não roda;
--   2  a de um dia normal roda no mesmo tick — mesmo sendo feriado daquele dia em OUTRA empresa;
--   3  a do feriado já ganhou a próxima data (espera a próxima, não fica presa).
begin;
\ir _helpers.psql

select plan(3);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-autoferiado', 'Auto Feriado') as a,
       tests.create_tenant('pgtap-autoferiado-b', 'Auto Feriado B') as b;
create temporary table u on commit drop as
select tests.create_user('gerente@autoferiado.test', (select a from f)) as gerente,
       tests.create_user('tecnico@autoferiado.test', (select a from f)) as tecnico;
select tests.grant_module((select tecnico from u), (select a from f), 'ti');

insert into public.automation_workflows (tenant_id, module, name, status, trigger, steps, created_by)
select a, 'tickets', nome, 'active',
       '{"kind":"schedule","every":"day","time":"00:01","next":["s1"]}'::jsonb,
       jsonb_build_array(jsonb_build_object('id', 's1', 'kind', 'notify',
         'config', jsonb_build_object('team_module', 'ti', 'message', nome), 'next', '[]'::jsonb)),
       gerente
  from f, u, (values ('No feriado'), ('Dia normal')) v(nome);

-- "No feriado" venceu hoje, feriado desta empresa. "Dia normal" venceu ontem, feriado só da OUTRA empresa.
update public.automation_workflows set next_run_at = now() - interval '1 minute' where name = 'No feriado';
update public.automation_workflows set next_run_at = now() - interval '1 day' where name = 'Dia normal';
insert into public.feriados_da_empresa (tenant_id, data, nome)
select a, (now() at time zone 'America/Sao_Paulo')::date, 'Feriado de teste' from f
union all
select b, ((now() - interval '1 day') at time zone 'America/Sao_Paulo')::date, 'Feriado da outra' from f;

select public.automation_tick();

select is((select count(*)::int from public.notifications where type = 'automation' and message = 'No feriado'), 0,
  'a automacao que cai no feriado da empresa nao roda');
select is((select count(*)::int from public.notifications where type = 'automation' and message = 'Dia normal'), 1,
  'a de um dia normal roda; o feriado de outra empresa nao a segura');
select is((select next_run_at > now() from public.automation_workflows where name = 'No feriado'), true,
  'a do feriado ja tem a proxima data marcada');

select * from finish();
rollback;

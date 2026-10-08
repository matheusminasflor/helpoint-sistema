-- AUTOMAÇÃO AGENDADA NÃO RODA NO FERIADO (migration 20261219010000; dono, 2026-10-08).
-- Datas fixas no passado (o tick pega tudo que venceu), para o teste não depender do dia em que roda:
--   1  a que caiu num feriado nacional (07/09/2026) não roda;
--   2  a que caiu num feriado cadastrado pelo RH desta empresa (10/03/2026) não roda;
--   3  a de um dia normal (11/03/2026) roda no mesmo tick — mesmo sendo feriado da OUTRA empresa;
--   4  a do feriado já ganhou a próxima data (espera a próxima, não fica presa).
begin;
\ir _helpers.psql

select plan(4);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-autoferiado', 'Auto Feriado') as a,
       tests.create_tenant('pgtap-autoferiado-b', 'Auto Feriado B') as b;
create temporary table u on commit drop as
select tests.create_user('gerente@autoferiado.test', (select a from f)) as gerente,
       tests.create_user('tecnico@autoferiado.test', (select a from f)) as tecnico;
select tests.grant_module((select tecnico from u), (select a from f), 'ti');

insert into public.automation_workflows (tenant_id, module, name, status, trigger, steps, created_by)
select a, 'tickets', nome, 'active',
       '{"kind":"schedule","every":"day","time":"09:00","next":["s1"]}'::jsonb,
       jsonb_build_array(jsonb_build_object('id', 's1', 'kind', 'notify',
         'config', jsonb_build_object('team_module', 'ti', 'message', nome), 'next', '[]'::jsonb)),
       gerente
  from f, u, (values ('Feriado nacional'), ('Feriado do RH'), ('Dia normal')) v(nome);

update public.automation_workflows set next_run_at = case name
    when 'Feriado nacional' then timestamptz '2026-09-07 09:00-03'
    when 'Feriado do RH'    then timestamptz '2026-03-10 09:00-03'
    else                         timestamptz '2026-03-11 09:00-03' end
 where tenant_id = (select a from f);
insert into public.feriados_da_empresa (tenant_id, data, nome)
select a, date '2026-03-10', 'Aniversário da cidade' from f
union all
select b, date '2026-03-11', 'Feriado só da outra empresa' from f;

select public.automation_tick();

select is((select count(*)::int from public.notifications where type = 'automation' and message = 'Feriado nacional'), 0,
  'a automacao que cai num feriado nacional nao roda');
select is((select count(*)::int from public.notifications where type = 'automation' and message = 'Feriado do RH'), 0,
  'a automacao que cai num feriado cadastrado pelo RH nao roda');
select is((select count(*)::int from public.notifications where type = 'automation' and message = 'Dia normal'), 1,
  'a de um dia normal roda; o feriado de outra empresa nao a segura');
select is((select next_run_at > now() from public.automation_workflows where name = 'Feriado nacional'), true,
  'a do feriado ja tem a proxima data marcada');

select * from finish();
rollback;

-- LIMITE DE AGENDAMENTO (migration 20270115010000; dono, 2026-10-15). Marketing com o relógio corrido (fim de semana
-- conta) e o limite padrão de 3 dias úteis.
--   1  o Operador não agenda além do limite
--   2  dentro do limite, agenda
--   3  reagenda uma vez
--   4  a terceira data é só do Gestor
--   5  o Gestor agenda a terceira, e além do limite
--   6  agendar com o prazo vencido marca o chamado
--   7  ... e sair do Agendado não empurra o prazo (o atraso fica)
--   8  ... e o gestor do setor é avisado
--   9  as funções novas não abrem para anon
begin;
\ir _helpers.psql

select plan(9);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-limite-agenda', 'Limite Agenda') as tenant;
create temporary table u on commit drop as
select tests.create_user('oper@limite.test', (select tenant from f)) as oper,
       tests.create_user('ger@limite.test',  (select tenant from f)) as ger,
       tests.create_user('pede@limite.test', (select tenant from f)) as pede;
select tests.grant_module((select oper from u), (select tenant from f), 'marketing');
select tests.grant_profile((select oper from u), (select tenant from f), 'marketing', 'Operador');
select tests.grant_module((select ger from u), (select tenant from f), 'marketing');
select tests.grant_profile((select ger from u), (select tenant from f), 'marketing', 'Gestor');
insert into public.sla_regras_do_setor (tenant_id, module, pausa_fim_de_semana) select tenant, 'marketing', false from f;
grant select on f, u to authenticated;

create temporary table ch on commit drop as
with x as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, created_by, priority, status, assigned_to)
  select tenant, 'marketing', t, 'x', (select pede from u), (select pede from u), 'medium', 'in_progress', (select oper from u)
    from f, unnest(array['arte', 'vencido']) t
  returning id, title
) select * from x;
grant select on ch to authenticated;
update public.tickets set sla_due_at = now() - interval '1 day' where id = (select id from ch where title = 'vencido');

create or replace function pg_temp.agenda(p_titulo text, p_dias int) returns text language plpgsql as $$
begin
  update public.tickets set status = 'scheduled', agendado_para = now() + make_interval(days => p_dias), agendado_motivo = 'teste'
   where id = (select id from ch where title = p_titulo);
  return 'agendado';
end;
$$;
create or replace function pg_temp.reagenda(p_titulo text, p_dias int) returns text language plpgsql as $$
begin
  update public.tickets set agendado_para = now() + make_interval(days => p_dias) where id = (select id from ch where title = p_titulo);
  return 'reagendado';
end;
$$;

select tests.authenticate_as('oper@limite.test');
select throws_ok($$ select pg_temp.agenda('arte', 10) $$, '42501', null, 'o Operador nao agenda alem do limite');
select pg_temp.agenda('arte', 2);
select is((select status::text from public.tickets where id = (select id from ch where title = 'arte')), 'scheduled', 'dentro do limite, agenda');
select pg_temp.reagenda('arte', 3);
select is((select agendamentos::int from public.tickets where id = (select id from ch where title = 'arte')), 2, 'reagenda uma vez');
select throws_ok($$ select pg_temp.reagenda('arte', 1) $$, '42501', null, 'a terceira data e so do Gestor');
select tests.clear_authentication();

select tests.authenticate_as('ger@limite.test');
select pg_temp.reagenda('arte', 9);
select tests.clear_authentication();
select is((select agendamentos::int from public.tickets where id = (select id from ch where title = 'arte')), 3,
  'o Gestor agenda a terceira, e alem do limite');

create temporary table antes on commit drop as select sla_due_at from public.tickets where id = (select id from ch where title = 'vencido');
select tests.authenticate_as('oper@limite.test');
select pg_temp.agenda('vencido', 1);
select tests.clear_authentication();
select ok((select agendou_vencido from public.tickets where id = (select id from ch where title = 'vencido')),
  'agendar com o prazo vencido marca o chamado');
-- Sai do Agendado uma hora depois (a pausa conta como se tivesse passado tempo).
update public.tickets set pendente_desde = now() - interval '5 hours' where id = (select id from ch where title = 'vencido');
update public.tickets set status = 'in_progress' where id = (select id from ch where title = 'vencido');
select is((select sla_due_at from public.tickets where id = (select id from ch where title = 'vencido')), (select sla_due_at from antes),
  'sair do Agendado nao empurra o prazo de quem foi agendado vencido');
select is((select count(*)::int from public.notifications where user_id = (select ger from u) and title like 'Agendado com o prazo vencido%'), 1,
  'o gestor do setor e avisado');

select ok(not has_function_privilege('anon', 'public.dias_uteis_ate(uuid,text,uuid,timestamptz)', 'execute')
      and not has_function_privilege('anon', 'public.limite_de_agendamento(uuid,text)', 'execute'), 'as funcoes novas nao abrem para anon');

select * from finish();
rollback;

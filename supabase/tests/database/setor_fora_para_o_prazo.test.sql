-- SETOR FORA PARA O PRAZO DE TODOS OS CHAMADOS DO SETOR (migration 20270212030000; dono, 2026-10-27: a TI em evento
-- em 26 e 27/10, chamados vencendo sem ninguém no setor). O Educacional fica fora de hoje até depois de amanhã.
--   1    o gestor do setor registra (pela função da tela) e o recálculo pega o chamado já aberto
--   2    quem não tem a caixinha não registra
--   3-4  o chamado JÁ ABERTO tem a solução e a 1ª resposta empurradas para depois do período
--   5    o chamado com prazo posto à mão não muda
--   6    o chamado aberto durante o período conta a partir da volta
--   7    quem abre chamado durante o período recebe a volta para o aviso
--   8    período sobreposto é recusado
--   9    tirar o período devolve o prazo de antes
--   10   anon não chama
begin;
\ir _helpers.psql

select plan(10);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-setor-fora', 'SetorFora') as a;
create temporary table u on commit drop as
select tests.create_user('gestor@fora.test', (select a from f)) as gestor,
       tests.create_user('ana@fora.test', (select a from f)) as ana,
       tests.create_user('pede@fora.test', (select a from f)) as pede;
select tests.grant_profile((select gestor from u), (select a from f), 'educacional', 'Gestor');
select tests.grant_module((select ana from u), (select a from f), 'educacional');
grant select on f, u to authenticated;
create temporary table ch (nome text primary key, id uuid);
grant select, insert on ch to authenticated;
-- Hoje e o último dia do período, no dia do Brasil (lição 10).
create temporary table d on commit drop as
select (now() at time zone 'America/Sao_Paulo')::date as hoje,
       (now() at time zone 'America/Sao_Paulo')::date + 2 as ate;
grant select on d to authenticated;

-- Dois chamados já abertos: um no prazo padrão, outro com o prazo posto à mão.
select tests.authenticate_as('pede@fora.test');
with c as (
  insert into public.tickets (tenant_id, module, title, description, priority, status, requester_id, created_by, assigned_to)
  select a, 'educacional', 'Ja aberto', 'x', 'medium', 'open', pede, pede, ana from f, u returning id
) insert into ch select 'aberto', id from c;
with c as (
  insert into public.tickets (tenant_id, module, title, description, priority, status, requester_id, created_by, assigned_to)
  select a, 'educacional', 'Prazo a mao', 'x', 'medium', 'open', pede, pede, ana from f, u returning id
) insert into ch select 'a_mao', id from c;
select tests.clear_authentication();
update public.tickets set sla_due_at = now() + interval '3 hours' where id = (select id from ch where nome = 'a_mao');
create temporary table antes on commit drop as
select t.id, t.sla_due_at, t.first_response_due_at from public.tickets t where t.id in (select id from ch);

-- ═══ 1-2. Quem registra ═══
select tests.authenticate_as('gestor@fora.test');
select ok(public.registrar_setor_fora('educacional', (select hoje from d), (select ate from d), 'apoio no evento') >= 1,
  'o gestor do setor registra o setor fora e o recalculo pega o chamado ja aberto');
select tests.clear_authentication();

select tests.authenticate_as('pede@fora.test');
select throws_ok($$ select public.registrar_setor_fora('educacional', (select hoje + 10 from d), (select hoje + 11 from d), 'x') $$,
  '42501', null, 'quem nao tem a caixinha de registrar viagem nao registra o setor fora');
select tests.clear_authentication();

-- ═══ 3-5. Os já abertos ═══
select ok((select sla_due_at >= ((select ate + 1 from d)::timestamp at time zone 'America/Sao_Paulo')
             from public.tickets where id = (select id from ch where nome = 'aberto')),
  'o chamado ja aberto: a solucao passa para depois do periodo');
select ok((select first_response_due_at >= ((select ate + 1 from d)::timestamp at time zone 'America/Sao_Paulo')
             from public.tickets where id = (select id from ch where nome = 'aberto')),
  'e a 1a resposta tambem');
select is((select sla_due_at from public.tickets where id = (select id from ch where nome = 'a_mao')),
          (select sla_due_at from antes where id = (select id from ch where nome = 'a_mao')),
  'o prazo posto a mao nao muda');

-- ═══ 6-7. Chamado aberto durante o período ═══
select tests.authenticate_as('pede@fora.test');
with c as (
  insert into public.tickets (tenant_id, module, title, description, priority, status, requester_id, created_by)
  select a, 'educacional', 'Durante', 'x', 'medium', 'open', pede, pede from f, u returning id
) insert into ch select 'durante', id from c;
select is(public.aviso_de_viagem('educacional', null), (select ate + 1 from d)::timestamp at time zone 'America/Sao_Paulo',
  'quem abre durante o periodo recebe a volta para o aviso');
select tests.clear_authentication();
select ok((select sla_due_at >= ((select ate + 1 from d)::timestamp at time zone 'America/Sao_Paulo')
             from public.tickets where id = (select id from ch where nome = 'durante')),
  'o chamado aberto durante o periodo conta a partir da volta');

-- ═══ 8-9. Sobreposto e tirar ═══
select tests.authenticate_as('gestor@fora.test');
select throws_ok($$ select public.registrar_setor_fora('educacional', (select ate from d), (select ate + 1 from d), 'outro') $$,
  '23505', null, 'periodo que cruza outro e recusado');
select public.tirar_setor_fora((select id from public.setor_fora where tenant_id = (select a from f)));
select tests.clear_authentication();
select is((select sla_due_at from public.tickets where id = (select id from ch where nome = 'aberto')),
          (select sla_due_at from antes where id = (select id from ch where nome = 'aberto')),
  'tirar o periodo devolve o prazo de antes');

select ok(not has_function_privilege('anon', 'public.registrar_setor_fora(text, date, date, text)', 'execute')
      and not has_function_privilege('anon', 'public.tirar_setor_fora(uuid)', 'execute')
      and not has_function_privilege('authenticated', 'public.setor_fora_recalcula(uuid, text, date, date, jsonb)', 'execute'),
  'anon nao chama; o recalculo so por dentro das funcoes');

select * from finish();
rollback;

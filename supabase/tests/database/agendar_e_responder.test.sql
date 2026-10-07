-- AGENDAR, OS DOIS BOTÕES DE RESPOSTA E A AJUDA A OUTROS SETORES
-- (migrations 20261214010000 e 20261214020000; decisões do dono, 2026-10-07).
--
--   gestor   Marketing, perfil Gestor (tem "Mudar prioridade e prazo")
--   oper     Marketing, perfil Operador (NÃO tem "Mudar prioridade e prazo")
--   pede     solicitante
--   ti       Setor TI (só o campo do perfil), atende um chamado do Marketing → ajuda
--
--   1     "Responder" (mantem_status) num chamado PENDENTE volta para Em andamento — era a falha
--         da caixinha "Continuo trabalhando nele": ela só "não mudava", e o Pendente ficava;
--   2     "Responder e aguardar retorno" põe Pendente;
--   3     o Operador, sem "Mudar prioridade e prazo", não agenda (42501);
--   4-6   o Gestor agenda (como o PostgREST, com RETURNING): status Agendado, prazo pausado
--         (pendente_desde marcado) e o solicitante avisado "agendado para dd/mm às HH:MM";
--   7     agendado não vence;
--   8-10  na hora marcada o job volta para Em andamento, empurra o prazo pelo tempo útil parado,
--         soma em minutos_agendados e apaga a agenda;
--   11    "Responder" num chamado Agendado volta para Em andamento e encerra a agenda;
--   12-13 ajuda a outros setores: o chamado do Marketing atendido por alguém da TI aparece para a
--         TI e não aparece para o Marketing;
--   14-16 as portas (lição 14).
begin;
\ir _helpers.psql

select plan(16);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-agendar', 'Agendar') as tenant;
create temporary table u on commit drop as
select tests.create_user('gestor@agendar.test', (select tenant from f)) as gestor,
       tests.create_user('oper@agendar.test',   (select tenant from f)) as oper,
       tests.create_user('pede@agendar.test',   (select tenant from f)) as pede,
       tests.create_user('ti@agendar.test',     (select tenant from f)) as ti;
select tests.grant_module((select gestor from u), (select tenant from f), 'marketing');
select tests.grant_profile((select gestor from u), (select tenant from f), 'marketing', 'Gestor');
select tests.grant_module((select oper from u), (select tenant from f), 'marketing');
select tests.grant_profile((select oper from u), (select tenant from f), 'marketing', 'Operador');
update public.profiles set department = 'ti' where id = (select ti from u);
update public.profiles set department = 'marketing' where id in ((select gestor from u), (select oper from u));
grant select on f, u to authenticated;

insert into public.sla_policies (tenant_id, module, name, priority, first_response_time, resolution_time)
values ((select tenant from f), 'marketing', 'MKT alto', 'high', 120, 480);

create temporary table ch on commit drop as
with t as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, priority, status, created_at, assigned_to)
  values ((select tenant from f), 'marketing', 'pendente', 'x', (select pede from u), 'high', 'in_progress', '2026-10-13 09:00-03', (select gestor from u)),
         ((select tenant from f), 'marketing', 'agenda',   'x', (select pede from u), 'high', 'in_progress', '2026-10-13 09:00-03', (select gestor from u)),
         ((select tenant from f), 'marketing', 'ajuda',    'x', (select pede from u), 'high', 'resolved',    now(),                  (select ti from u))
  returning id, title
) select id, title from t;
grant select on ch to authenticated;

create function pg_temp.chamado(p_titulo text) returns public.tickets language sql as $$
  select * from public.tickets where id = (select id from ch where title = p_titulo)
$$;
create function pg_temp.responde(p_titulo text, p_mantem boolean) returns void language sql as $$
  with c as (
    insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal, mantem_status)
    values ((select tenant from f), (select id from ch where title = p_titulo), auth.uid(), 'resposta', false, p_mantem)
    returning id
  ) select null::void from c;
$$;

-- ═══ 1-2. Os dois botões. ═══
update public.tickets set status = 'waiting_user' where id = (select id from ch where title = 'pendente');
select tests.authenticate_as('gestor@agendar.test');
select pg_temp.responde('pendente', true);
select tests.clear_authentication();
select is((pg_temp.chamado('pendente')).status::text, 'in_progress',
  '"Responder" num chamado Pendente volta para Em andamento (a caixinha antiga deixava Pendente)');

select tests.authenticate_as('gestor@agendar.test');
select pg_temp.responde('pendente', false);
select tests.clear_authentication();
select is((pg_temp.chamado('pendente')).status::text, 'waiting_user',
  '"Responder e aguardar retorno" poe Pendente');

-- ═══ 3. O Operador não agenda. ═══
select tests.authenticate_as('oper@agendar.test');
select throws_ok(
  $$update public.tickets set status = 'scheduled', agendado_para = '2026-10-20 14:00-03', agendado_motivo = 'fila cheia'
     where id = (select id from ch where title = 'agenda') returning id$$,
  '42501', null, 'sem "Mudar prioridade e prazo" nao agenda');
select tests.clear_authentication();

-- ═══ 4-6. O Gestor agenda. ═══
select tests.authenticate_as('gestor@agendar.test');
create temporary table ag on commit drop as
with t as (
  update public.tickets set status = 'scheduled', agendado_para = '2026-10-20 14:00-03', agendado_motivo = 'fila cheia'
   where id = (select id from ch where title = 'agenda') returning id
) select id from t;
select tests.clear_authentication();
select is((select count(*)::int from ag), 1, 'o Gestor agenda (com RETURNING, como o PostgREST)');
select ok((pg_temp.chamado('agenda')).pendente_desde is not null, 'agendado pausa o prazo: o trecho parado comeca');
select is((select title from public.notifications
            where reference_id = (select id from ch where title = 'agenda') and type = 'ticket_scheduled'
              and user_id = (select pede from u)),
  'Chamado #' || (pg_temp.chamado('agenda')).ticket_number || ' foi agendado para 20/10 às 14:00.',
  'o solicitante e avisado da data');

-- ═══ 7. Agendado não vence. ═══
update public.tickets set sla_due_at = '2020-01-06 09:00-03' where id = (select id from ch where title = 'agenda');
select is(public.avisar_prazo_vencido((select id from ch where title = 'agenda')), 0,
  'chamado Agendado com prazo vencido nao gera aviso de vencido');

-- ═══ 8-10. Na hora marcada, volta sozinho. ═══
-- O relógio da pausa é o de verdade (now()): começo da pausa num passado com horas úteis
-- garantidas, e a mesma conta do gatilho para o esperado (como em pendente_pausa_o_prazo).
update public.tickets set pendente_desde = now() - interval '30 days', sla_due_at = '2026-10-13 17:00-03',
                          agendado_para = now() - interval '1 minute'
 where id = (select id from ch where title = 'agenda');
create temporary table esperado on commit drop as
select public.minutos_uteis_do_chamado((select tenant from f), 'marketing', now() - interval '30 days', now(),
                                       (select gestor from u)) as minutos;
select ok(public.chamados_agendados_voltam() >= 1, 'o job encontra o agendado vencido');
select is((pg_temp.chamado('agenda')).sla_due_at,
  public.prazo_do_chamado((select tenant from f), 'marketing', '2026-10-13 17:00-03',
                          (select minutos from esperado), (select gestor from u)),
  'voltou: o vencimento anda o tempo util que ficou agendado');
select is((pg_temp.chamado('agenda')).status::text || '|' || (pg_temp.chamado('agenda')).minutos_agendados
          || '|' || ((pg_temp.chamado('agenda')).agendado_para is null)::text,
  'in_progress|' || (select minutos from esperado) || '|true',
  'Em andamento, minutos_agendados somados e a agenda apagada');

-- ═══ 11. Responder num agendado encerra a agenda. ═══
update public.tickets set status = 'scheduled', agendado_para = '2026-10-21 10:00-03' where id = (select id from ch where title = 'agenda');
select tests.authenticate_as('gestor@agendar.test');
select pg_temp.responde('agenda', true);
select tests.clear_authentication();
select is((pg_temp.chamado('agenda')).status::text || '|' || ((pg_temp.chamado('agenda')).agendado_para is null)::text,
  'in_progress|true', '"Responder" num agendado volta para Em andamento e encerra a agenda');

-- ═══ 12-13. Ajuda a outros setores. ═══
select tests.authenticate_as('ti@agendar.test');
select is((select count(*)::int from public.ajuda_a_outros_setores('tickets', now() - interval '1 day', now() + interval '1 day')),
  1, 'a TI ve o chamado do Marketing que alguem da TI atendeu');
select tests.clear_authentication();
select tests.authenticate_as('gestor@agendar.test');
select is((select count(*)::int from public.ajuda_a_outros_setores('marketing', now() - interval '1 day', now() + interval '1 day')),
  0, 'para o Marketing nao e ajuda: o chamado e dele');
select tests.clear_authentication();

-- ═══ 14-16. As portas. ═══
select ok(not has_function_privilege('authenticated', 'public.chamados_agendados_voltam()', 'execute'),
  'ninguem logado roda o job direto');
select ok(not has_function_privilege('anon', 'public.ajuda_a_outros_setores(text, timestamptz, timestamptz)', 'execute'),
  'anon nao chama a ajuda a outros setores');
select ok(not has_function_privilege('anon', 'public.meus_setores_de_chamado()', 'execute'),
  'anon nao chama meus_setores_de_chamado');

select * from finish();
rollback;

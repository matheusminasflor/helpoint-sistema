-- ATENDER JUNTO (migration 20261230010000; dono, 2026-10-13 — o #27 era da TI e da Mel juntos).
--   ti1   TI, atende o chamado
--   mel   só Marketing — é chamada para atender junto um chamado da TI
--   ana   pediu o chamado
--   zeca  ninguém no chamado, sem perfil
--   1     quem não atende nem é gestor não chama ninguém
--   2-3   o atendente chama a Mel; ela é avisada (com e-mail) e passa a ver o chamado
--   4     quando quem pediu responde, a Mel recebe o aviso como o atendente
--   5     a Mel resolve, mesmo sem perfil na TI
--   6-7   a avaliação vale para os dois, e a Mel não lê a própria nota
--   8     quem atende junto pode sair sozinha
--   9     as funções novas não abrem para anon
begin;
\ir _helpers.psql

select plan(9);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-junto', 'Junto', false) as a;
create temporary table u on commit drop as
select tests.create_user('ti1@junto.test',  (select a from f)) as ti1,
       tests.create_user('mel@junto.test',  (select a from f)) as mel,
       tests.create_user('ana@junto.test',  (select a from f)) as ana,
       tests.create_user('zeca@junto.test', (select a from f)) as zeca;
select tests.grant_module((select ti1 from u), (select a from f), 'ti');
select tests.grant_module((select mel from u), (select a from f), 'marketing');
grant select on f, u to authenticated;

create temporary table c on commit drop as
with t as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, created_by, priority, status, assigned_to)
  select a, 'tickets', 'QR Code no sistema', 'x', (select ana from u), (select ana from u), 'medium', 'in_progress', (select ti1 from u) from f
  returning id
) select id from t;
grant select on c to authenticated;

-- ═══ 1. Quem não atende não chama. ═══
select tests.authenticate_as('zeca@junto.test');
select throws_ok(format($$ select public.convidar_para_atender_junto(%L::uuid, %L::uuid) $$, (select id from c), (select zeca from u)),
  '42501', null, 'quem nao atende nem e gestor nao chama ninguem');
select tests.clear_authentication();

-- ═══ 2-3. O atendente chama a Mel. ═══
select tests.authenticate_as('ti1@junto.test');
select public.convidar_para_atender_junto((select id from c), (select mel from u));
select tests.clear_authentication();
-- Desde 20270113010000 o convite espera o aceite: a Mel aceita.
select tests.authenticate_as('mel@junto.test');
select public.responder_convite_atender_junto((select id from c), true);
select tests.clear_authentication();
select is((select count(*)::int from public.notifications
            where user_id = (select mel from u) and reference_id = (select id from c) and not email_sent
              and title like 'Convite para atender junto o chamado #%'), 1,
  'a Mel e avisada, com e-mail');
select tests.authenticate_as('mel@junto.test');
select is((select count(*)::int from public.tickets where id = (select id from c)), 1,
  'e passa a ver o chamado, mesmo sendo so do Marketing');
select tests.clear_authentication();

-- ═══ 4. Quem pediu responde: a Mel é avisada como o atendente. ═══
select tests.authenticate_as('ana@junto.test');
insert into public.ticket_comments (tenant_id, ticket_id, author_id, content)
select a, (select id from c), (select ana from u), 'Segue o arquivo' from f returning id;
select tests.clear_authentication();
select is((select count(*)::int from public.notifications
            where user_id = (select mel from u) and reference_id = (select id from c) and type = 'ticket_reply'), 1,
  'a resposta de quem pediu chega para a Mel tambem');

-- ═══ 5. A Mel resolve. ═══
select tests.authenticate_as('mel@junto.test');
update public.tickets set status = 'resolved', resolved_at = now() where id = (select id from c) returning id;
select tests.clear_authentication();
select is((select status::text from public.tickets where id = (select id from c)), 'resolved',
  'quem atende junto resolve, mesmo sem perfil no setor do chamado');

-- ═══ 6-7. Avaliação. ═══
select tests.authenticate_as('ana@junto.test');
select public.avaliar_atendimento((select id from c), 5, 'Rapidos');
select tests.clear_authentication();
select is((select (select mel from u) = any (tambem_atenderam) from public.avaliacoes_do_atendimento where ticket_id = (select id from c)),
  true, 'a avaliacao vale tambem para quem atendeu junto');
select tests.authenticate_as('mel@junto.test');
select is((select count(*)::int from public.avaliacoes_do_atendimento where ticket_id = (select id from c)), 0,
  'e segue sigilosa: a Mel nao le a propria nota');
select tests.clear_authentication();

-- ═══ 8. Sair sozinha. ═══
select tests.authenticate_as('mel@junto.test');
select public.tirar_de_atender_junto((select id from c), (select mel from u));
select tests.clear_authentication();
select is((select count(*)::int from public.ticket_participantes where ticket_id = (select id from c)), 0,
  'quem atende junto pode sair sozinha');

-- ═══ 9. Portas. ═══
select ok(not has_function_privilege('anon', 'public.convidar_para_atender_junto(uuid,uuid)', 'execute')
      and not has_function_privilege('anon', 'public.atende_junto(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.tirar_de_atender_junto(uuid,uuid)', 'execute'),
  'as funcoes novas nao abrem para anon');

select * from finish();
rollback;

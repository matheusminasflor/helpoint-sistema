-- Avisos das movimentações do chamado (migration 20261121020000_avisos_do_chamado.sql).
--
-- O dono (2026-10-02): avisar os envolvidos em criado, atribuído, respondido, transferido,
-- alterado, aguardando retorno, resolvido e encerrado — respeitando permissões, sem duplicar, e
-- por e-mail só no que pede ação.
--
--   sol     solicitante, sem módulo
--   tec     TI, perfil Operador (vê a fila)
--   colega  TI só com o módulo, sem perfil — NÃO vê a fila, não pode ser avisado
--   mkt     Marketing, perfil Operador
--
-- Quem age é simulado por `request.jwt.claims` (é de lá que `auth.uid()` lê o autor, que não
-- recebe o próprio aviso), sem trocar de papel: as travas de perfil do chamado já têm teste
-- próprio, e aqui a pergunta é só quem é avisado. Dentro da transação `now()` é constante (lição
-- 9): a janela de 2 minutos da deduplicação vale para o teste inteiro, e isso é usado de propósito.
begin;
\ir _helpers.psql

select plan(20);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-avisos-chamado', 'Avisos do chamado') as tenant;
create temporary table u on commit drop as
select tests.create_user('sol@avisos.test',    (select tenant from f)) as sol,
       tests.create_user('tec@avisos.test',    (select tenant from f)) as tec,
       tests.create_user('colega@avisos.test', (select tenant from f)) as colega,
       tests.create_user('mkt@avisos.test',    (select tenant from f)) as mkt;
select tests.grant_module((select tec from u), (select tenant from f), 'ti');
select tests.grant_profile((select tec from u), (select tenant from f), 'ti', 'Operador');
select tests.grant_module((select colega from u), (select tenant from f), 'ti');
select tests.grant_module((select mkt from u), (select tenant from f), 'marketing');
select tests.grant_profile((select mkt from u), (select tenant from f), 'marketing', 'Operador');

create temporary table s on commit drop as select gen_random_uuid() as ticket;

create function tests.como(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user)::text, true);
$$;
-- quem recebeu um tipo de aviso deste chamado
create function tests.avisados(p_type public.notification_type) returns text language sql as $$
  select coalesce(string_agg(distinct au.email, ',' order by au.email), 'ninguem')
    from public.notifications n join auth.users au on au.id = n.user_id
   where n.reference_id = (select ticket from s) and n.type = p_type;
$$;

-- ═══ 1. Criado sem atendente → a equipe que VÊ a fila (o colega só com módulo, não). ═══
select tests.como((select sol from u));
insert into public.tickets (id, tenant_id, module, title, description, priority, status, created_by, requester_id)
select ticket, tenant, 'tickets', 'Impressora parou', 'x', 'medium', 'open', sol, sol from s, f, u;
select is(tests.avisados('ticket_created'), 'tec@avisos.test',
  'criado: avisa a equipe que ve a fila — nem o solicitante, nem o colega sem perfil');

-- ═══ 2. Assumir (atendente + status no mesmo UPDATE) → UM aviso, ao solicitante. ═══
select tests.como((select tec from u));
update public.tickets set assigned_to = (select tec from u), status = 'in_progress' where id = (select ticket from s);
select is(tests.avisados('ticket_assigned'), 'sol@avisos.test',
  'assumir avisa o solicitante; quem assumiu nao recebe o proprio aviso');
select is(tests.avisados('ticket_updated'), 'ninguem',
  'atendente e status no mesmo clique viram um aviso so, nao dois');

-- ═══ 3. Respondido (público) → solicitante, com e-mail; nota interna → ninguém. ═══
-- "Continuo trabalhando nele" (20261210010000): sem isso a resposta já poria o chamado em Pendente,
-- e o passo 4 abaixo prova o "Aguardando retorno" posto À MÃO.
insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, mantem_status)
select tenant, ticket, tec, 'resposta publica', true from s, f, u;
insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
select tenant, ticket, tec, 'nota interna', true from s, f, u;
select is((select count(*)::int || '|' || bool_and(message like '%resposta publica') || '|' || max(au.email)
             from public.notifications n join auth.users au on au.id = n.user_id
            where n.reference_id = (select ticket from s) and n.type = 'ticket_reply'),
  '1|true|sol@avisos.test',
  'respondido avisa o solicitante uma vez, e a nota interna nao chega a ele');

-- ═══ 4. Aguardando retorno → solicitante. ═══
update public.tickets set status = 'waiting_user' where id = (select ticket from s);
select is((select title from public.notifications where reference_id = (select ticket from s) and type = 'ticket_waiting'),
  'Chamado #' || (select ticket_number from public.tickets where id = (select ticket from s)) || ' aguarda seu retorno.',
  'aguardando retorno: "Chamado #N aguarda seu retorno."');

-- ═══ 5. Alterado (prioridade) → solicitante, sem e-mail; repetir não duplica. ═══
update public.tickets set priority = 'high' where id = (select ticket from s);
update public.tickets set priority = 'critical' where id = (select ticket from s);
select is((select count(*)::int || '|' || max(message) from public.notifications
            where reference_id = (select ticket from s) and type = 'ticket_updated'),
  '1|prioridade: Crítica',
  'duas alteracoes seguidas: um aviso so, com o texto da ultima');

-- ═══ 6. Transferido de setor sem atendente → solicitante + equipe do novo setor. ═══
select tests.como((select tec from u));
update public.tickets set module = 'marketing', assigned_to = null where id = (select ticket from s);
select is(tests.avisados('ticket_transferred'), 'mkt@avisos.test,sol@avisos.test',
  'transferido para o Marketing sem atendente: solicitante e a equipe do Marketing');
select alike((select title from public.notifications where reference_id = (select ticket from s)
               and type = 'ticket_transferred' limit 1),
  '% foi transferido para Marketing.', 'o texto diz para qual setor');

-- ═══ 7. Atribuído a outra pessoa → ela (com e-mail) e o solicitante (sem). ═══
select tests.como((select tec from u));
update public.tickets set assigned_to = (select mkt from u) where id = (select ticket from s);
select is((select email_sent from public.notifications where reference_id = (select ticket from s)
            and type = 'ticket_assigned' and user_id = (select mkt from u)),
  false, 'atribuido a voce pede e-mail');
select is((select count(*)::int from public.notifications where reference_id = (select ticket from s)
            and type = 'ticket_assigned' and user_id = (select sol from u)),
  1, 'o solicitante e avisado da troca sem ganhar um segundo aviso igual');

-- ═══ 8 e 9. Resolvido e encerrado → solicitante e atendente. ═══
select tests.como((select mkt from u));
update public.tickets set status = 'resolved', resolution_notes = 'toner trocado' where id = (select ticket from s);
select is(tests.avisados('ticket_resolved'), 'sol@avisos.test',
  'resolvido avisa o solicitante; o atendente que resolveu nao recebe o proprio aviso');
select tests.como((select sol from u));
update public.tickets set status = 'closed' where id = (select ticket from s);
select is(tests.avisados('ticket_closed'), 'mkt@avisos.test',
  'encerrado pelo solicitante avisa o atendente');

-- ═══ 10. Só os 5 tipos que pedem ação ficam na fila de e-mail. ═══
select is(
  (select array_agg(distinct type::text order by type::text) from public.notifications
    where reference_id = (select ticket from s) and email_sent = false),
  array['ticket_assigned', 'ticket_closed', 'ticket_reply', 'ticket_resolved', 'ticket_waiting'],
  'e-mail so em atribuido, respondido, aguardando, resolvido e encerrado');

-- ═══ 11-13. A fila agrupa por pessoa + chamado; quem desliga sai da fila. ═══
select set_config('request.jwt.claims', '', true);
select is(
  (select cardinality(ids) from public.chamado_emails_pendentes(50, '0 seconds')
    where user_id = (select sol from u) and ticket_id = (select ticket from s)),
  3, 'o solicitante recebe UM e-mail com respondido, aguardando e resolvido');
select is(
  (select cardinality(ids) from public.chamado_emails_pendentes(50, '0 seconds')
    where user_id = (select mkt from u) and ticket_id = (select ticket from s)),
  2, 'o atendente recebe UM e-mail com atribuido e encerrado');
update public.profiles set receber_email_chamados = false where id = (select sol from u);
select is(
  (select count(*)::int from public.chamado_emails_pendentes(50, '0 seconds') where user_id = (select sol from u)),
  0, 'quem desligou o e-mail no perfil sai da fila (o sino continua)');

-- ═══ 14. Enviados saem da fila. ═══
select public.chamado_emails_enviados((select ids from public.chamado_emails_pendentes(50, '0 seconds')
                                        where user_id = (select mkt from u) limit 1));
select is((select count(*)::int from public.notifications where user_id = (select mkt from u) and email_sent = false),
  0, 'marcados como enviados, nao voltam');

-- ═══ 15-17. As portas novas não abrem para o navegador. ═══
select ok(not has_function_privilege('anon', 'public.notify_ticket(uuid, public.notification_type, uuid[], text, text, boolean, uuid)', 'execute'),
  'anon nao chama notify_ticket');
select ok(not has_function_privilege('authenticated', 'public.notify_ticket(uuid, public.notification_type, uuid[], text, text, boolean, uuid)', 'execute'),
  'ninguem logado fabrica aviso de chamado');
select ok(not has_function_privilege('authenticated', 'public.chamado_emails_pendentes(int, interval)', 'execute'),
  'a fila de e-mail (com e-mails das pessoas) so abre para o service_role');

select * from finish();
rollback;

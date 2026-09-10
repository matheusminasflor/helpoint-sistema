-- Leva E5-A1 (ADR-007): motor de fluxos (migration 20260912010000).
-- Substitui automacoes_regras_simples.test.sql: prova o que o motor antigo
-- provava (quem edita, gatilhos de chamado, ações, cadeia cortada, agenda,
-- prazo, inativo) e o que é novo: validação do grafo, dois passos numa
-- execução, gatilho de negócio, espera retomada pelo tick, isolamento.
-- O caminho exercitado é o do usuário: inserir e atualizar o chamado e o
-- negócio, não chamar o executor direto.
--
-- Rode com:  npx supabase test db --linked   ou   scripts/pgtap-local/run.sh

begin;
\ir _helpers.psql

select plan(30);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-fluxo', 'Fluxo') as tenant,
       tests.create_tenant('pgtap-fluxo-b', 'Fluxo B') as tenant_b;

create temporary table u on commit drop as
select tests.create_user('gerente@fluxo.test',     (select tenant from f)) as gerente,
       tests.create_user('tecnico@fluxo.test',     (select tenant from f)) as tecnico,
       tests.create_user('solicitante@fluxo.test', (select tenant from f)) as solicitante,
       tests.create_user('comum@fluxo.test',       (select tenant from f)) as comum,
       tests.create_user('vendedor@fluxo.test',    (select tenant from f)) as vendedor,
       tests.create_user('fora@fluxo.test',        (select tenant_b from f)) as fora;

select tests.grant_role((select gerente from u), 'manager');
select tests.grant_module((select tecnico from u),  (select tenant from f), 'ti');
select tests.grant_module((select vendedor from u), (select tenant from f), 'comercial');

create temporary table s on commit drop as
select gen_random_uuid() as cat_impressora, gen_random_uuid() as t1, gen_random_uuid() as t2, gen_random_uuid() as t3,
       gen_random_uuid() as contact_id, gen_random_uuid() as deal_id,
       (select id from public.crm_pipeline_stages where tenant_id = (select tenant from f) and name = 'Novo') as novo,
       (select id from public.crm_pipeline_stages where tenant_id = (select tenant from f) and name = 'Negociação') as negociacao;

insert into public.ti_categories (id, tenant_id, module, name)
select cat_impressora, tenant, 'tickets', 'Impressora' from s, f;

grant select on f, u, s to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- Quem escreve e o que o banco recusa
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('comum@fluxo.test');
select throws_ok(
  $$ insert into public.automation_workflows (tenant_id, module, name, status, trigger, steps)
     select tenant, 'tickets', 'nao pode', 'active',
            '{"kind":"record_created","entity":"ticket","next":["s1"]}'::jsonb,
            '[{"id":"s1","kind":"notify","config":{"team_module":"ti"},"next":[]}]'::jsonb from f $$,
  '42501', null,
  'usuario comum nao cria fluxo'
);
select tests.clear_authentication();

select tests.authenticate_as('gerente@fluxo.test');
insert into public.automation_workflows (tenant_id, module, name, status, trigger, steps, created_by)
select tenant, 'tickets', 'Impressora vai para o tecnico', 'active',
       jsonb_build_object('kind', 'record_created', 'entity', 'ticket', 'next', jsonb_build_array('s1'),
         'filter', jsonb_build_object('op', 'and', 'rules', jsonb_build_array(jsonb_build_object('path', 'trigger.after.category_id', 'cmp', 'eq', 'value', cat_impressora)))),
       jsonb_build_array(jsonb_build_object('id', 's1', 'kind', 'assign', 'config', jsonb_build_object('user_id', tecnico), 'next', '[]'::jsonb)),
       gerente
  from f, s, u;
select is(
  (select count(*)::int from public.automation_workflows where name = 'Impressora vai para o tecnico'),
  1,
  'gerente cria fluxo'
);

select throws_ok(
  $$ insert into public.automation_workflows (tenant_id, module, name, trigger, steps)
     select tenant, 'tickets', 'quebrado', '{"kind":"record_created","entity":"ticket","next":["nao_existe"]}'::jsonb, '[]'::jsonb from f $$,
  'P0001', null,
  'gatilho apontando para passo inexistente e recusado'
);
select throws_ok(
  $$ insert into public.automation_workflows (tenant_id, module, name, trigger, steps)
     select tenant, 'tickets', 'ciclo', '{"kind":"manual","entity":"ticket","next":["a"]}'::jsonb,
            '[{"id":"a","kind":"stop","next":["b"]},{"id":"b","kind":"stop","next":["a"]}]'::jsonb from f $$,
  'P0001', null,
  'ciclo entre passos e recusado'
);
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- Fixtures: os fluxos que o runner cria (não é o que se prova)
-- ───────────────────────────────────────────────────────────────────────────
insert into public.automation_workflows (tenant_id, module, name, status, trigger, steps, created_by)
select tenant, 'tickets', 'Critico avisa o gerente', 'active',
       jsonb_build_object('kind', 'record_created', 'entity', 'ticket', 'next', jsonb_build_array('s1'),
         'filter', '{"op":"and","rules":[{"path":"trigger.after.priority","cmp":"eq","value":"critical"}]}'::jsonb),
       jsonb_build_array(jsonb_build_object('id', 's1', 'kind', 'notify', 'next', '[]'::jsonb,
         'config', jsonb_build_object('user_id', gerente, 'title', 'Critico #{{trigger.after.ticket_number}}', 'message', '{{trigger.after.title}}'))),
       gerente from f, u
union all
select tenant, 'tickets', 'Resolvido cria tarefa', 'active',
       '{"kind":"record_updated","entity":"ticket","fields":["status"],"next":["s1"],"filter":{"op":"and","rules":[{"path":"trigger.after.status","cmp":"eq","value":"resolved"}]}}'::jsonb,
       '[{"id":"s1","kind":"create_task","config":{"target":"assignee","title":"Conferir #{{trigger.after.ticket_number}}","due_in_days":2},"next":[]}]'::jsonb,
       gerente from f, u
union all
select tenant, 'tickets', 'Aguardando peca sobe prioridade', 'active',
       '{"kind":"record_updated","entity":"ticket","fields":["status"],"next":["s1"],"filter":{"op":"and","rules":[{"path":"trigger.after.status","cmp":"eq","value":"waiting_parts"}]}}'::jsonb,
       '[{"id":"s1","kind":"set_priority","config":{"priority":"high"},"next":[]}]'::jsonb,
       gerente from f, u
union all
select tenant, 'tickets', 'TI aberto abre RH', 'active',
       '{"kind":"record_created","entity":"ticket","next":["s1"]}'::jsonb,
       '[{"id":"s1","kind":"create_ticket","config":{"module":"rh","title":"Espelho de {{trigger.after.title}}"},"next":[]}]'::jsonb,
       gerente from f, u
union all
select tenant, 'rh', 'RH aberto abre TI', 'active',
       '{"kind":"record_created","entity":"ticket","next":["s1"]}'::jsonb,
       '[{"id":"s1","kind":"create_ticket","config":{"module":"tickets","title":"Volta de {{trigger.after.title}}"},"next":[]}]'::jsonb,
       gerente from f, u
union all
select tenant, 'tickets', 'Fluxo mal configurado', 'active',
       '{"kind":"record_created","entity":"ticket","next":["s1"]}'::jsonb,
       '[{"id":"s1","kind":"notify","config":{},"next":[]}]'::jsonb,
       gerente from f, u
union all
select tenant, 'tickets', 'Critico atribui e anota', 'active',
       '{"kind":"record_created","entity":"ticket","next":["a"],"filter":{"op":"and","rules":[{"path":"trigger.after.priority","cmp":"eq","value":"critical"}]}}'::jsonb,
       jsonb_build_array(
         jsonb_build_object('id', 'a', 'kind', 'condition', 'config', '{"filter":{"op":"and","rules":[{"path":"trigger.after.title","cmp":"contains","value":"travou"}]}}'::jsonb, 'next', jsonb_build_array('b')),
         jsonb_build_object('id', 'b', 'kind', 'add_note', 'config', '{"content":"Fluxo viu: {{trigger.after.title}}"}'::jsonb, 'next', '[]'::jsonb)),
       gerente from f, u
union all
select tenant, 'tickets', 'Bom dia', 'active',
       '{"kind":"schedule","every":"day","time":"00:01","next":["s1"]}'::jsonb,
       '[{"id":"s1","kind":"notify","config":{"team_module":"ti","message":"Bom dia, equipe"},"next":[]}]'::jsonb,
       gerente from f, u
union all
select tenant, 'tickets', 'Prazo estourado avisa gerente', 'active',
       '{"kind":"deadline_expired","entity":"ticket","next":["s1"]}'::jsonb,
       jsonb_build_array(jsonb_build_object('id', 's1', 'kind', 'notify', 'next', '[]'::jsonb,
         'config', jsonb_build_object('user_id', gerente, 'message', 'Estourou #{{trigger.after.ticket_number}}'))),
       gerente from f, u
union all
select tenant, 'comercial', 'Negociacao avisa o dono', 'active',
       jsonb_build_object('kind', 'record_updated', 'entity', 'crm_deal', 'fields', jsonb_build_array('stage_id'), 'next', jsonb_build_array('s1'),
         'filter', jsonb_build_object('op', 'and', 'rules', jsonb_build_array(jsonb_build_object('path', 'trigger.after.stage_id', 'cmp', 'eq', 'value', negociacao)))),
       '[{"id":"s1","kind":"notify","config":{"target":"owner","title":"Em negociacao","message":"{{trigger.after.title}} entrou em negociacao"},"next":[]}]'::jsonb,
       gerente from f, u, s
union all
select tenant, 'comercial', 'Negocio novo espera e avisa', 'active',
       '{"kind":"record_created","entity":"crm_deal","next":["w"]}'::jsonb,
       '[{"id":"w","kind":"delay","config":{"minutes":1},"next":["n"]},{"id":"n","kind":"notify","config":{"target":"owner","message":"Passou um minuto: {{trigger.after.title}}"},"next":[]}]'::jsonb,
       gerente from f, u;

-- ───────────────────────────────────────────────────────────────────────────
-- Chamado aberto: atribui por categoria, avisa por prioridade, abre espelho,
-- corta a cadeia, anota em dois passos, e o mal configurado falha sem travar
-- ───────────────────────────────────────────────────────────────────────────
insert into public.tickets (id, tenant_id, module, title, description, priority, status, created_by, requester_id, category_id)
select t1, tenant, 'tickets', 'Impressora travou', 'x', 'critical', 'open', solicitante, solicitante, cat_impressora from s, f, u;

select is(
  (select assigned_to from public.tickets where id = (select t1 from s)),
  (select tecnico from u),
  'chamado da categoria Impressora foi atribuido ao tecnico'
);
select is(
  (select count(*)::int from public.notifications
    where type = 'ticket_assigned' and reference_id = (select t1 from s) and user_id = (select tecnico from u)),
  1,
  'e o tecnico foi avisado da atribuicao'
);
select is(
  (select title || ' | ' || message from public.notifications
    where type = 'automation' and reference_id = (select t1 from s) and user_id = (select gerente from u)),
  'Critico #' || (select ticket_number from public.tickets where id = (select t1 from s)) || ' | Impressora travou',
  'critico avisou o gerente, com {{trigger.after.ticket_number}} e {{trigger.after.title}} trocados'
);
select is(
  (select array_agg(module || ':' || title order by module) from public.tickets
    where tenant_id = (select tenant from f) and id <> (select t1 from s)),
  array['rh:Espelho de Impressora travou'],
  'abriu o espelho no RH — e o espelho nao abriu outro na TI (cadeia cortada)'
);
select is(
  (select last_error from public.automation_workflows where name = 'Fluxo mal configurado'),
  'a acao "avisar" precisa de uma pessoa ou de uma equipe',
  'fluxo mal configurado registra o erro em portugues e nao trava o chamado'
);
select is(
  (select r.status || '|' || (r.context #>> '{steps,s1,status}') from public.automation_runs r
     join public.automation_workflows w on w.id = r.workflow_id where w.name = 'Fluxo mal configurado'),
  'failed|failed',
  'e a execucao fica como falha, com o passo marcado'
);
select is(
  (select content from public.ticket_comments where ticket_id = (select t1 from s) and content like 'Fluxo viu:%'),
  'Fluxo viu: Impressora travou',
  'dois passos (condicao + anotar) rodaram na mesma transacao do INSERT'
);
select is(
  (select r.status || '|' || r.executed_steps from public.automation_runs r
     join public.automation_workflows w on w.id = r.workflow_id where w.name = 'Critico atribui e anota'),
  'completed|2',
  'a execucao terminou com os dois passos contados'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Mudança de status: prioridade e tarefa; repetir o status não repete
-- ───────────────────────────────────────────────────────────────────────────
update public.tickets set status = 'waiting_parts' where id = (select t1 from s);
select is(
  (select priority::text from public.tickets where id = (select t1 from s)),
  'high',
  'aguardando peca subiu a prioridade para alta'
);

update public.tickets set status = 'resolved' where id = (select t1 from s);
select is(
  (select user_id from public.tasks where source_type = 'automation'
     and title = 'Conferir #' || (select ticket_number from public.tickets where id = (select t1 from s))),
  (select tecnico from u),
  'resolvido criou a tarefa para quem estava atendendo'
);

update public.tickets set status = 'resolved' where id = (select t1 from s);
select is(
  (select run_count from public.automation_workflows where name = 'Resolvido cria tarefa'),
  1,
  'gravar o mesmo status de novo nao dispara de novo'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Negócio: gatilho de campo observado e espera retomada pelo tick
-- ───────────────────────────────────────────────────────────────────────────
insert into public.crm_contacts (id, tenant_id, name) select contact_id, (select tenant from f), 'Cliente' from s;
insert into public.crm_deals (id, tenant_id, contact_id, stage_id, title, owner_id)
select deal_id, (select tenant from f), contact_id, novo, 'Venda grande', (select vendedor from u) from s;

select is(
  (select r.status || '|' || (r.resume_at > now())::text from public.automation_runs r
     join public.automation_workflows w on w.id = r.workflow_id where w.name = 'Negocio novo espera e avisa'),
  'waiting|true',
  'negocio novo: o fluxo com espera fica aguardando, com hora de retomar'
);

update public.crm_deals set title = 'Venda grande mesmo' where id = (select deal_id from s);
select is(
  (select count(*)::int from public.notifications where user_id = (select vendedor from u) and title = 'Em negociacao'),
  0,
  'mudar so o titulo nao dispara o fluxo que observa a etapa'
);

update public.crm_deals set stage_id = (select negociacao from s) where id = (select deal_id from s);
select is(
  (select message from public.notifications where user_id = (select vendedor from u) and title = 'Em negociacao'),
  'Venda grande mesmo entrou em negociacao',
  'mudar a etapa para Negociacao avisou o dono do negocio'
);

-- ───────────────────────────────────────────────────────────────────────────
-- O tick: agendado vencido, prazo estourado, espera vencida — cada um uma vez
-- ───────────────────────────────────────────────────────────────────────────
update public.automation_workflows set next_run_at = now() - interval '1 minute' where name = 'Bom dia';
update public.automation_runs set resume_at = now() - interval '1 second' where status = 'waiting';
insert into public.tickets (id, tenant_id, module, title, description, priority, status, created_by, requester_id, due_date)
select t2, tenant, 'tickets', 'Atrasado', 'x', 'low', 'open', solicitante, solicitante, now() - interval '1 hour' from s, f, u;

select is(
  (select (r->>'scheduled') || '/' || (r->>'deadline') || '/' || (r->>'resumed') from public.automation_tick() as r),
  '1/1/1',
  'primeiro tick: agendado, prazo estourado e a espera do negocio'
);
select is(
  (select array_agg(distinct user_id) from public.notifications where type = 'automation' and message = 'Bom dia, equipe'),
  (select array[tecnico] from u),
  'bom dia foi para quem tem o modulo TI'
);
select is(
  (select message from public.notifications where type = 'automation' and reference_id = (select t2 from s)),
  'Estourou #' || (select ticket_number from public.tickets where id = (select t2 from s)),
  'prazo estourado avisou o gerente'
);
select is(
  (select message from public.notifications where user_id = (select vendedor from u) and message like 'Passou um minuto%'),
  'Passou um minuto: Venda grande',
  'a espera retomada avisou com o contexto congelado na hora do gatilho'
);
select is(
  (select next_run_at > now() from public.automation_workflows where name = 'Bom dia'),
  true,
  'o agendado ja tem o proximo disparo marcado'
);
select is(
  (select (r->>'scheduled') || '/' || (r->>'deadline') || '/' || (r->>'resumed') from public.automation_tick() as r),
  '0/0/0',
  'segundo tick: nada roda de novo'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Fluxo pausado não dispara; isolamento das execuções
-- ───────────────────────────────────────────────────────────────────────────
update public.automation_workflows set status = 'paused' where name = 'Critico avisa o gerente';
insert into public.tickets (id, tenant_id, module, title, description, priority, status, created_by, requester_id)
select t3, tenant, 'tickets', 'Outro critico', 'x', 'critical', 'open', solicitante, solicitante from s, f, u;
select is(
  (select count(*)::int from public.notifications where type = 'automation' and reference_id = (select t3 from s) and user_id = (select gerente from u)),
  0,
  'fluxo pausado nao dispara'
);

-- Auditoria 2026-09-10: a execução guarda a cópia inteira do registro que a
-- disparou (contato, negócio, chamado). Ler é de gerente para cima.
select tests.clear_authentication();
select tests.authenticate_as('comum@fluxo.test');
select is(
  (select count(*)::int from public.automation_runs),
  0,
  'usuario comum nao le execucao nenhuma (o run carrega a copia do registro)'
);
select tests.clear_authentication();
select tests.authenticate_as('vendedor@fluxo.test');
select is(
  (select count(*)::int from public.automation_runs),
  0,
  'quem tem o modulo mas nao e gerente tambem nao le'
);
select tests.clear_authentication();
select tests.authenticate_as('gerente@fluxo.test');
select cmp_ok(
  (select count(*)::int from public.automation_runs),
  '>', 0,
  'gerente le as execucoes da propria empresa'
);

select tests.authenticate_as('fora@fluxo.test');
select is(
  (select count(*)::int from public.automation_runs),
  0,
  'outra empresa nao ve execucao nenhuma'
);
select throws_ok(
  $$ insert into public.automation_runs (tenant_id, workflow_id, trigger_kind, flow) select tenant, (select id from public.automation_workflows limit 1), 'manual', '{}'::jsonb from f $$,
  '42501', null,
  'cliente nao insere execucao na mao'
);
select tests.clear_authentication();

select * from finish();
rollback;

-- Leva E5-A2 (ADR-007): worker externo, webhook e manual (migration 20260912020000).
--
-- Prova: um passo externo deixa o run esperando; o claim entrega a
-- configuração já renderizada e marca rodando; a conclusão segue para o
-- passo seguinte (e a falha derruba o run); o segredo do webhook é de
-- gerente e vale uma vez; disparo com segredo errado é recusado e com o
-- certo abre o run com o corpo; o disparo manual roda com o registro no
-- contexto; só o próprio tenant.
--
-- Rode com:  npx supabase test db --linked   ou   scripts/pgtap-local/run.sh

begin;
\ir _helpers.psql

select plan(15);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-worker', 'Worker') as tenant,
       tests.create_tenant('pgtap-worker-b', 'Worker B') as tenant_b;

create temporary table u on commit drop as
select tests.create_user('gerente@worker.test',  (select tenant from f)) as gerente,
       tests.create_user('vendedor@worker.test', (select tenant from f)) as vendedor,
       tests.create_user('fora@worker.test',     (select tenant_b from f)) as fora;

select tests.grant_role((select gerente from u), 'manager');
select tests.grant_module((select vendedor from u), (select tenant from f), 'comercial');
select tests.grant_module((select gerente from u),  (select tenant from f), 'comercial');

create temporary table s on commit drop as
select gen_random_uuid() as contact_id, gen_random_uuid() as deal_id,
       gen_random_uuid() as wf_email, gen_random_uuid() as wf_hook, gen_random_uuid() as wf_manual,
       (select id from public.crm_pipeline_stages where tenant_id = (select tenant from f) and name = 'Novo') as novo;
grant select on f, u, s to authenticated;

insert into public.crm_contacts (id, tenant_id, name, email) select contact_id, (select tenant from f), 'Cliente', 'cliente@x.com' from s;

-- Fluxo com passo externo: negócio criado → e-mail ao contato → aviso ao dono
insert into public.automation_workflows (id, tenant_id, module, name, status, trigger, steps, created_by)
select wf_email, (select tenant from f), 'comercial', 'Boas-vindas', 'active',
       '{"kind":"record_created","entity":"crm_deal","next":["m"]}'::jsonb,
       '[{"id":"m","kind":"send_email","config":{"to":"cliente@x.com","subject":"Sobre {{trigger.after.title}}","body":"Oi"},"next":["n"]},
         {"id":"n","kind":"notify","config":{"target":"owner","message":"E-mail enviado sobre {{trigger.after.title}}"},"next":[]}]'::jsonb,
       (select gerente from u) from s
union all
select wf_hook, (select tenant from f), 'comercial', 'Chegou pelo site', 'active',
       '{"kind":"webhook","next":["s1"]}'::jsonb,
       '[{"id":"s1","kind":"notify","config":{"team_module":"comercial","message":"Webhook: {{trigger.body.nome}}"},"next":[]}]'::jsonb,
       (select gerente from u) from s
union all
select wf_manual, (select tenant from f), 'comercial', 'Reaquecer negocio', 'active',
       '{"kind":"manual","entity":"crm_deal","next":["s1"]}'::jsonb,
       '[{"id":"s1","kind":"add_note","config":{"content":"Reaquecido a pedido: {{trigger.after.title}}"},"next":[]}]'::jsonb,
       (select gerente from u) from s;

-- ───────────────────────────────────────────────────────────────────────────
-- Passo externo: espera → claim → conclusão
-- ───────────────────────────────────────────────────────────────────────────
insert into public.crm_deals (id, tenant_id, contact_id, stage_id, title, owner_id)
select deal_id, (select tenant from f), contact_id, novo, 'Venda X', (select vendedor from u) from s;

select is(
  (select r.status || '|' || r.pending_kind || '|' || r.pending_step_id from public.automation_runs r where r.workflow_id = (select wf_email from s)),
  'waiting|send_email|m',
  'passo de e-mail deixa o run esperando o worker'
);

create temporary table c on commit drop as select * from public.automation_claim_external(10);
select is(
  (select kind || '|' || (config->>'subject') || '|' || (config->>'to') from c where run_id = (select r.id from public.automation_runs r where r.workflow_id = (select wf_email from s))),
  'send_email|Sobre Venda X|cliente@x.com',
  'o claim entrega o passo com a configuracao renderizada'
);
select is(
  (select r.status from public.automation_runs r where r.workflow_id = (select wf_email from s)),
  'running',
  'e marca o run como rodando'
);
select is(
  (select count(*)::int from public.automation_claim_external(10)),
  0,
  'segundo claim nao entrega o mesmo passo'
);

select public.automation_complete_external(
  (select r.id from public.automation_runs r where r.workflow_id = (select wf_email from s)), 'm', '{"id":"msg_1"}'::jsonb, null);
select is(
  (select r.status || '|' || (r.context #>> '{steps,m,result,id}') from public.automation_runs r where r.workflow_id = (select wf_email from s)),
  'completed|msg_1',
  'concluir o passo externo grava o resultado e termina o fluxo'
);
select is(
  (select message from public.notifications where user_id = (select vendedor from u) and message like 'E-mail enviado%'),
  'E-mail enviado sobre Venda X',
  'o passo seguinte (avisar o dono) rodou depois do e-mail'
);

-- Falha no passo externo derruba o run
insert into public.crm_deals (tenant_id, contact_id, stage_id, title, owner_id)
select (select tenant from f), contact_id, novo, 'Venda Y', (select vendedor from u) from s;
create temporary table c2 on commit drop as select * from public.automation_claim_external(10);
select public.automation_complete_external((select run_id from c2 limit 1), 'm', null, 'Resend: 502');
select is(
  (select r.status || '|' || r.error from public.automation_runs r where r.id = (select run_id from c2 limit 1)),
  'failed|send_email: Resend: 502',
  'erro do worker vira run falho com a mensagem'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Webhook: segredo de gerente, hash no banco, disparo
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('vendedor@worker.test');
select throws_ok(
  $$ select public.automation_webhook_secret((select wf_hook from s)) $$,
  'P0001', null,
  'vendedor nao gera o segredo do webhook'
);
select tests.clear_authentication();

select tests.authenticate_as('gerente@worker.test');
create temporary table k on commit drop as select public.automation_webhook_secret((select wf_hook from s)) as secret;
grant select on k to authenticated;
select is(
  (select length(secret) from k),
  48,
  'gerente gera o segredo (24 bytes em hex)'
);
select is(
  (select (trigger->>'secret_hash') = encode(extensions.digest((select secret from k), 'sha256'), 'hex') from public.automation_workflows where id = (select wf_hook from s)),
  true,
  'o banco guarda so o hash do segredo'
);
select tests.clear_authentication();

select throws_ok(
  $$ select public.automation_webhook_fire((select wf_hook from s), 'errado', '{}'::jsonb) $$,
  'P0003', null,
  'segredo errado e recusado'
);
select lives_ok(
  $$ select public.automation_webhook_fire((select wf_hook from s), (select secret from k), '{"nome":"Maria"}'::jsonb) $$,
  'segredo certo dispara'
);
select is(
  (select array_agg(distinct message) from public.notifications where message like 'Webhook:%'),
  array['Webhook: Maria'],
  'o corpo do webhook fica em trigger.body e a equipe Comercial e avisada'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Manual: o botão no negócio
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('vendedor@worker.test');
select public.automation_run_manual((select wf_manual from s), (select deal_id from s));
select is(
  (select content from public.crm_deal_activities where deal_id = (select deal_id from s) and content like 'Reaquecido%'),
  'Reaquecido a pedido: Venda X',
  'o disparo manual roda com o registro no contexto'
);
select tests.clear_authentication();

select tests.authenticate_as('fora@worker.test');
select throws_ok(
  $$ select public.automation_run_manual((select wf_manual from s), (select deal_id from s)) $$,
  'P0001', null,
  'outra empresa nao aciona o fluxo'
);
select tests.clear_authentication();

select * from finish();
rollback;

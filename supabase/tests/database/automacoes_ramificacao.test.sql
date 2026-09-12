-- Leva E5-A3 (ADR-007): ramificação e reexecução (migration 20260912030000).
--
-- Prova: o passo branch escolhe o ramo pelo filtro, só ele roda, a cabeça
-- do outro ramo fica `skipped`, e a junção depois dos ramos roda uma vez;
-- o "senão" pega o que não casou; reexecutar um run que falhou volta pelo
-- passo que falhou com o mesmo contexto; só run falho e só o próprio tenant.
--
-- Rode com:  npx supabase test db --linked   ou   scripts/pgtap-local/run.sh

begin;
\ir _helpers.psql

select plan(11);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-ramo', 'Ramo') as tenant,
       tests.create_tenant('pgtap-ramo-b', 'Ramo B') as tenant_b;

create temporary table u on commit drop as
select tests.create_user('gerente@ramo.test',  (select tenant from f)) as gerente,
       tests.create_user('vendedor@ramo.test', (select tenant from f)) as vendedor,
       tests.create_user('fora@ramo.test',     (select tenant_b from f)) as fora;

select tests.grant_role((select gerente from u), 'manager');
select tests.grant_module((select vendedor from u), (select tenant from f), 'crm');

create temporary table s on commit drop as
select gen_random_uuid() as contact_id, gen_random_uuid() as wf_branch, gen_random_uuid() as wf_http,
       (select id from public.crm_pipeline_stages where tenant_id = (select tenant from f) and name = 'Novo') as novo;
grant select on f, u, s to authenticated;

insert into public.crm_contacts (id, tenant_id, name) select contact_id, (select tenant from f), 'Cliente' from s;

-- Negócio criado → ramo "grande" (valor > 1000) avisa o gerente; senão avisa o dono; depois dos dois, anota.
insert into public.automation_workflows (id, tenant_id, module, name, status, trigger, steps, created_by)
select wf_branch, (select tenant from f), 'crm', 'Grande ou pequeno', 'active',
       '{"kind":"record_created","entity":"crm_deal","next":["b"]}'::jsonb,
       jsonb_build_array(
         jsonb_build_object('id', 'b', 'kind', 'branch', 'next', '[]'::jsonb, 'config', jsonb_build_object(
           'branches', jsonb_build_array(jsonb_build_object('name', 'grande', 'next', jsonb_build_array('g'),
             'filter', '{"op":"and","rules":[{"path":"trigger.after.value","cmp":"gt","value":1000}]}'::jsonb)),
           'else_next', jsonb_build_array('p'))),
         jsonb_build_object('id', 'g', 'kind', 'notify', 'next', jsonb_build_array('j'), 'config', jsonb_build_object('user_id', gerente, 'message', 'Grande: {{trigger.after.title}}')),
         jsonb_build_object('id', 'p', 'kind', 'notify', 'next', jsonb_build_array('j'), 'config', '{"target":"owner","message":"Pequeno: {{trigger.after.title}}"}'::jsonb),
         jsonb_build_object('id', 'j', 'kind', 'add_note', 'next', '[]'::jsonb, 'config', '{"content":"Classificado"}'::jsonb)),
       gerente from s, u
union all
select wf_http, (select tenant from f), 'crm', 'Avisa outro sistema', 'active',
       '{"kind":"record_created","entity":"crm_deal","next":["h"]}'::jsonb,
       '[{"id":"h","kind":"http_request","config":{"url":"https://exemplo.com/x","method":"POST"},"next":["n"]},{"id":"n","kind":"notify","config":{"target":"owner","message":"Avisado"},"next":[]}]'::jsonb,
       gerente from s, u;

-- ───────────────────────────────────────────────────────────────────────────
-- Ramificação
-- ───────────────────────────────────────────────────────────────────────────
insert into public.crm_deals (tenant_id, contact_id, stage_id, title, value, owner_id)
select (select tenant from f), contact_id, novo, 'Venda grande', 5000, (select vendedor from u) from s;

select is(
  (select array_agg(message order by message) from public.notifications where message like 'Grande:%' or message like 'Pequeno:%'),
  array['Grande: Venda grande'],
  'valor > 1000 segue pelo ramo grande e nao pelo pequeno'
);
select is(
  (select (r.context #>> '{steps,p,status}') || '|' || (r.context #>> '{steps,g,status}') || '|' || (r.context #>> '{steps,j,status}')
     from public.automation_runs r join public.crm_deals d on d.id = r.subject_id
    where r.workflow_id = (select wf_branch from s) and d.title = 'Venda grande'),
  'skipped|success|success',
  'a cabeca do ramo perdedor fica pulada e a juncao rodou'
);
select is(
  (select count(*)::int from public.crm_deal_activities a join public.crm_deals d on d.id = a.deal_id where d.title = 'Venda grande' and a.content = 'Classificado'),
  1,
  'a juncao rodou uma vez so'
);

insert into public.crm_deals (tenant_id, contact_id, stage_id, title, value, owner_id)
select (select tenant from f), contact_id, novo, 'Venda pequena', 200, (select vendedor from u) from s;
select is(
  (select message from public.notifications where message like 'Pequeno:%'),
  'Pequeno: Venda pequena',
  'valor <= 1000 cai no senao'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Reexecução: o passo externo falha, o run volta por ele
-- ───────────────────────────────────────────────────────────────────────────
create temporary table c on commit drop as
select * from public.automation_claim_external(10) where kind = 'http_request';
grant select on c to authenticated;
select public.automation_complete_external((select run_id from c limit 1), 'h', null, 'HTTP 503');
select is(
  (select r.status || '|' || r.error from public.automation_runs r where r.id = (select run_id from c limit 1)),
  'failed|http_request: HTTP 503',
  'o passo HTTP falhou e o run ficou falho'
);

select tests.authenticate_as('fora@ramo.test');
select throws_ok(
  $$ select public.automation_retry_run((select run_id from c limit 1)) $$,
  'P0001', null,
  'outra empresa nao reexecuta'
);
select tests.clear_authentication();

select tests.authenticate_as('vendedor@ramo.test');
select throws_ok(
  $$ select public.automation_retry_run((select run_id from c limit 1)) $$,
  'P0001', null,
  'vendedor nao reexecuta — reexecutar e de gerente para cima (auditoria 2026-09-10)'
);
select tests.clear_authentication();

select tests.authenticate_as('gerente@ramo.test');
select throws_ok(
  $$ select public.automation_retry_run((select r.id from public.automation_runs r where r.workflow_id = (select wf_branch from s) limit 1)) $$,
  'P0001', null,
  'run concluido nao se reexecuta'
);
select lives_ok(
  $$ select public.automation_retry_run((select run_id from c limit 1)) $$,
  'run falho volta para a fila'
);
select is(
  (select r.status || '|' || r.pending_kind || '|' || coalesce(r.error, '-') from public.automation_runs r where r.id = (select run_id from c limit 1)),
  'waiting|http_request|-',
  'reexecutar recomeca pelo passo que falhou: o HTTP volta a esperar o worker'
);
select tests.clear_authentication();

select is(
  (select count(*)::int from public.automation_claim_external(10) where kind = 'http_request'),
  1,
  'e o worker o pega de novo'
);

select * from finish();
rollback;

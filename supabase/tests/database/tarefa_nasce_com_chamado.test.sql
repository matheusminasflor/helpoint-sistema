-- "Tarefa de fluxo nasce com chamado" (migration 20260923010000). Decisão do
-- dono: trabalho que nasce de um fluxo tem que virar chamado, no módulo que o
-- fluxo manda, já atribuído ao atendente — senão não entra em relatório nenhum.
-- Prova:
--   - o passo cria o chamado e a tarefa, ligados, no módulo do passo
--   - o chamado sai atribuído à mesma pessoa da tarefa
--   - sem módulo escolhido, fluxo do CRM cai no Comercial (o CRM não tem fila)
--   - a prioridade da tarefa vira a prioridade do chamado
--   - salvar passo de tarefa com módulo 'crm' é recusado na hora
--   - a tarefa não aponta para o chamado de outra empresa
begin;
\ir _helpers.psql

select plan(11);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-tar-a', 'Tar A') as a,
       tests.create_tenant('pgtap-tar-b', 'Tar B') as b;

create temporary table u on commit drop as
select tests.create_user('gerente@tar.test',  (select a from f)) as gerente,
       tests.create_user('atendente@tar.test', (select a from f)) as atendente;
select tests.grant_role((select gerente from u), 'manager');
select tests.grant_module((select gerente from u),   (select a from f), 'crm');
select tests.grant_module((select atendente from u), (select a from f), 'comercial');
grant select on f, u to authenticated;

select has_column('public', 'tasks', 'ticket_id',
  'a tarefa aponta para o chamado que a representa na fila do modulo');

-- ───────────────────────────────────────────────────────────────────────────
-- O passo executa: nascem os dois, ligados
-- ───────────────────────────────────────────────────────────────────────────
create temporary table s on commit drop as
select gen_random_uuid() as wf, gen_random_uuid() as contato,
       (select id from public.crm_pipeline_stages where tenant_id = (select a from f) and name = 'Novo' limit 1) as novo;

insert into public.crm_contacts (id, tenant_id, name) select contato, (select a from f), 'Lead' from s;

insert into public.automation_workflows (id, tenant_id, module, name, status, trigger, steps, created_by)
select wf, (select a from f), 'crm', 'Negocio novo → tarefa', 'active',
       '{"kind":"record_created","entity":"crm_deal","next":["s1"]}'::jsonb,
       format('[{"id":"s1","kind":"create_task","config":{"title":"Cobrar %s","user_id":"%s","priority":2,"due_in_days":2,"module":"comercial"},"next":[]}]',
              'Venda Z', (select atendente from u))::jsonb,
       (select gerente from u) from s;

insert into public.crm_deals (tenant_id, contact_id, stage_id, title, owner_id)
select (select a from f), contato, novo, 'Venda Z', (select gerente from u) from s;

select is(
  (select count(*)::int from public.tasks t
     join public.tickets k on k.id = t.ticket_id
    where t.tenant_id = (select a from f) and t.title = 'Cobrar Venda Z'),
  1,
  'o passo cria a tarefa e o chamado dela, ligados'
);
select is(
  (select k.module || '|' || (k.assigned_to = (select atendente from u))::text || '|' || k.priority::text || '|' || k.status
     from public.tasks t join public.tickets k on k.id = t.ticket_id
    where t.tenant_id = (select a from f) and t.title = 'Cobrar Venda Z'),
  'comercial|true|high|open',
  'o chamado nasce no modulo do passo, atribuido ao atendente, com a prioridade da tarefa, aberto'
);

-- Sem módulo escrito no passo, fluxo do CRM cai no Comercial (o CRM não tem fila).
create temporary table sem_modulo on commit drop as
select public.automation_run_step(r, format('{"id":"s9","kind":"create_task","config":{"title":"Sem modulo","user_id":"%s"}}', (select atendente from u))::jsonb) as res
  from public.automation_runs r where r.workflow_id = (select wf from s) limit 1;
select is(
  (select k.module from public.tasks t join public.tickets k on k.id = t.ticket_id
    where t.tenant_id = (select a from f) and t.title = 'Sem modulo'),
  'comercial',
  'passo de tarefa sem modulo num fluxo do CRM abre o chamado no Comercial'
);
select is(
  (select (res #>> '{result,ticket_id}') is not null from sem_modulo),
  true,
  'o passo devolve o id do chamado, nao so o da tarefa'
);

-- ───────────────────────────────────────────────────────────────────────────
-- O que o banco recusa
-- ───────────────────────────────────────────────────────────────────────────
select throws_ok(
  $$ insert into public.automation_workflows (tenant_id, module, name, status, trigger, steps, created_by)
     select a, 'crm', 'Tarefa no CRM (invalido)', 'active',
            '{"kind":"record_created","entity":"crm_deal","next":["s1"]}'::jsonb,
            '[{"id":"s1","kind":"create_task","config":{"module":"crm","title":"X"},"next":[]}]'::jsonb,
            (select gerente from u) from f $$,
  'o CRM nao tem fila de chamados: escolha o modulo onde o chamado nasce',
  'salvar passo "criar tarefa" com modulo crm e recusado na hora'
);

-- Chamado da empresa B, tarefa da empresa A: a chave composta recusa.
create temporary table cruzado on commit drop as select gen_random_uuid() as chamado_b;
insert into public.tickets (id, tenant_id, module, title, description, priority, status, requester_id)
select chamado_b, (select b from f), 'tickets', 'Chamado da B', 'x', 'medium', 'open', (select gerente from u) from cruzado;

select throws_ok(
  format($$ insert into public.tasks (tenant_id, user_id, title, ticket_id)
            values (%L::uuid, %L::uuid, 'Tarefa cruzada', %L::uuid) $$,
         (select a from f), (select atendente from u), (select chamado_b from cruzado)),
  '23503', null,
  'a tarefa de uma empresa nao aponta para o chamado de outra'
);

select lives_ok(
  format($$ insert into public.tasks (tenant_id, user_id, title, ticket_id) values (%L::uuid, %L::uuid, 'Tarefa solta', null) $$,
         (select a from f), (select atendente from u)),
  'tarefa pessoal, sem fluxo, continua podendo existir sem chamado'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Os dois andam juntos: fechar um fecha o outro (migration 20260923020000)
-- ───────────────────────────────────────────────────────────────────────────
-- Sem isto, concluir a tarefa deixava o chamado aberto para sempre (fila e SLA
-- do módulo inflados), e resolver o chamado fazia a tarefa VOLTAR ao painel.
select is(
  (select k.due_date::text from public.tasks t join public.tickets k on k.id = t.ticket_id
    where t.tenant_id = (select a from f) and t.title = 'Cobrar Venda Z'),
  (current_date + 2)::text,
  'o prazo que o fluxo pediu (due_in_days) vai para o chamado, nao so para a tarefa'
);

update public.tasks set status = 'completed'
 where tenant_id = (select a from f) and title = 'Cobrar Venda Z';
select is(
  (select k.status::text from public.tasks t join public.tickets k on k.id = t.ticket_id
    where t.tenant_id = (select a from f) and t.title = 'Cobrar Venda Z'),
  'resolved',
  'concluir a tarefa resolve o chamado dela'
);

update public.tickets set status = 'resolved'
 where id = (select t.ticket_id from public.tasks t where t.tenant_id = (select a from f) and t.title = 'Sem modulo');
select is(
  (select t.status from public.tasks t where t.tenant_id = (select a from f) and t.title = 'Sem modulo'),
  'completed',
  'resolver o chamado conclui a tarefa dele — a tarefa nao volta ao painel'
);

select * from finish();
rollback;

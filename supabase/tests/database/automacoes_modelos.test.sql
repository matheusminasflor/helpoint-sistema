-- CRM-1d: modelos de fluxo (migration 20260915010000). Prova os dois modelos
-- do Comercial como o front os monta (src/lib/automation-templates.ts):
--   - proposta aceita → chamado de cadastro com a ficha do cliente e os itens,
--     conta a receber, aviso ao vendedor
--   - chamado de cadastro resolvido → aviso ao vendedor + tarefa de cobrança
--   - sem resposta: espera → olha o negócio de novo → tarefa → espera → perdido;
--     negócio que andou nesse meio-tempo não recebe tarefa (refresh)
begin;
\ir _helpers.psql

select plan(12);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-modelos', 'Modelos') as tenant;

create temporary table u on commit drop as
select tests.create_user('gerente@modelos.test',  (select tenant from f)) as gerente,
       tests.create_user('vendedor@modelos.test', (select tenant from f)) as vendedor,
       tests.create_user('ti@modelos.test',       (select tenant from f)) as ti,
       tests.create_user('fin@modelos.test',      (select tenant from f)) as fin;
select tests.grant_role((select gerente from u), 'manager');
select tests.grant_module((select gerente from u),  (select tenant from f), 'comercial');
select tests.grant_module((select vendedor from u), (select tenant from f), 'comercial');
select tests.grant_module((select ti from u),       (select tenant from f), 'ti');
select tests.grant_module((select fin from u),      (select tenant from f), 'financeiro');

create temporary table s on commit drop as
select gen_random_uuid() as cat_cadastro, gen_random_uuid() as contact_id, gen_random_uuid() as deal1, gen_random_uuid() as deal2, gen_random_uuid() as order_id,
       (select id from public.crm_pipeline_stages where tenant_id = (select tenant from f) and name = 'Novo') as novo,
       (select id from public.crm_pipeline_stages where tenant_id = (select tenant from f) and kind = 'lost') as perdido;

insert into public.ti_categories (id, tenant_id, module, name) select cat_cadastro, tenant, 'tickets', 'Cadastro de cliente' from s, f;
grant select on f, u, s to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- Os três fluxos, como o front os monta (mesma configuração de automation-templates.ts)
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('gerente@modelos.test');

insert into public.automation_workflows (tenant_id, module, name, status, trigger, steps, created_by)
select tenant, 'comercial', 'Proposta aceita → cadastro do cliente', 'active',
  jsonb_build_object('kind', 'record_updated', 'entity', 'crm_order', 'fields', jsonb_build_array('status'), 'next', jsonb_build_array('s1'),
    'filter', jsonb_build_object('op', 'and', 'rules', jsonb_build_array(jsonb_build_object('path', 'trigger.after.status', 'cmp', 'eq', 'value', 'accepted')))),
  jsonb_build_array(
    jsonb_build_object('id', 's1', 'kind', 'create_ticket', 'next', jsonb_build_array('s2'), 'config', jsonb_build_object(
      'module', 'tickets', 'category_id', cat_cadastro, 'priority', 'medium', 'requester_target', 'created_by',
      'title', 'Cadastrar cliente {{trigger.contact.name}} — pedido #{{trigger.after.number}}',
      'description', 'CPF/CNPJ: {{trigger.contact.document}}' || E'\n' || 'Pedido #{{trigger.after.number}} — total R$ {{trigger.total_text}}' || E'\n' || '{{trigger.items_text}}')),
    jsonb_build_object('id', 's2', 'kind', 'create_receivable', 'next', jsonb_build_array('s3'), 'config', jsonb_build_object('due_in_days', 7)),
    jsonb_build_object('id', 's3', 'kind', 'notify', 'next', '[]'::jsonb, 'config', jsonb_build_object('target', 'created_by', 'title', 'Cadastro do cliente pedido à TI', 'message', 'Pedido #{{trigger.after.number}} de {{trigger.contact.name}}'))),
  gerente
  from f, s, u;

insert into public.automation_workflows (tenant_id, module, name, status, trigger, steps, created_by)
select tenant, 'comercial', 'Cadastro concluído → cobrar', 'active',
  jsonb_build_object('kind', 'record_updated', 'entity', 'ticket', 'ticket_module', 'tickets', 'fields', jsonb_build_array('status'), 'next', jsonb_build_array('s1'),
    'filter', jsonb_build_object('op', 'and', 'rules', jsonb_build_array(
      jsonb_build_object('path', 'trigger.after.status', 'cmp', 'in', 'value', jsonb_build_array('resolved', 'closed')),
      jsonb_build_object('path', 'trigger.after.category_id', 'cmp', 'eq', 'value', cat_cadastro)))),
  jsonb_build_array(
    jsonb_build_object('id', 's1', 'kind', 'notify', 'next', jsonb_build_array('s2'), 'config', jsonb_build_object('target', 'requester', 'title', 'Cliente cadastrado', 'message', '{{trigger.after.title}}')),
    jsonb_build_object('id', 's2', 'kind', 'create_task', 'next', '[]'::jsonb, 'config', jsonb_build_object('user_id', fin, 'title', 'Cobrar: {{trigger.after.title}}', 'due_in_days', 2, 'priority', 2))),
  gerente
  from f, s, u;

insert into public.automation_workflows (tenant_id, module, name, status, trigger, steps, created_by)
select tenant, 'comercial', 'Sem resposta → follow-up e perdido', 'active',
  jsonb_build_object('kind', 'record_created', 'entity', 'crm_deal', 'next', jsonb_build_array('s1'),
    'filter', jsonb_build_object('op', 'and', 'rules', jsonb_build_array(
      jsonb_build_object('path', 'trigger.after.stage_id', 'cmp', 'eq', 'value', novo),
      jsonb_build_object('path', 'trigger.after.source', 'cmp', 'neq', 'value', 'importacao')))),
  jsonb_build_array(
    jsonb_build_object('id', 's1', 'kind', 'delay', 'next', jsonb_build_array('s2'), 'config', jsonb_build_object('hours', 24)),
    jsonb_build_object('id', 's2', 'kind', 'condition', 'next', jsonb_build_array('s3'), 'config', jsonb_build_object('refresh', true,
      'filter', jsonb_build_object('op', 'and', 'rules', jsonb_build_array(jsonb_build_object('path', 'trigger.after.stage_id', 'cmp', 'eq', 'value', novo))))),
    jsonb_build_object('id', 's3', 'kind', 'create_task', 'next', jsonb_build_array('s4'), 'config', jsonb_build_object('target', 'owner', 'title', 'Follow-up: {{trigger.after.title}}', 'due_in_days', 1)),
    jsonb_build_object('id', 's4', 'kind', 'delay', 'next', jsonb_build_array('s5'), 'config', jsonb_build_object('hours', 48)),
    jsonb_build_object('id', 's5', 'kind', 'condition', 'next', jsonb_build_array('s6'), 'config', jsonb_build_object('refresh', true,
      'filter', jsonb_build_object('op', 'and', 'rules', jsonb_build_array(jsonb_build_object('path', 'trigger.after.stage_id', 'cmp', 'eq', 'value', novo))))),
    jsonb_build_object('id', 's6', 'kind', 'set_stage', 'next', '[]'::jsonb, 'config', jsonb_build_object('stage_id', perdido, 'lost_reason', 'Sem resposta'))),
  gerente
  from f, s, u;
select is((select count(*)::int from public.automation_workflows where tenant_id = (select tenant from f)), 3, 'os tres fluxos dos modelos passam na validacao do banco');
select throws_ok(
  $$ select public.automation_subject_row('crm_contact', gen_random_uuid()) $$,
  '42501', null,
  'a leitura de registro do motor nao se chama por RPC (auditoria: definer aberta lia contato de outra empresa)'
);
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- Dados: contato, dois negócios em "Novo" (os dois fluxos "sem resposta" ficam esperando), pedido
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('vendedor@modelos.test');
insert into public.crm_contacts (id, tenant_id, name, company, document, whatsapp, city, state)
select contact_id, (select tenant from f), 'Distribuidora Sul', 'Sul Ltda', '12345678000199', '31999990000', 'Belo Horizonte', 'MG' from s;
insert into public.crm_deals (id, tenant_id, contact_id, stage_id, title, value, owner_id)
select deal1, (select tenant from f), contact_id, novo, 'Primeiro pedido', 0, (select vendedor from u) from s
union all
select deal2, (select tenant from f), contact_id, novo, 'Segundo lead', 0, (select vendedor from u) from s;

insert into public.crm_orders (id, tenant_id, deal_id, contact_id, created_by) select order_id, (select tenant from f), deal1, contact_id, (select vendedor from u) from s;
insert into public.crm_order_items (tenant_id, order_id, description, quantity, unit_price)
select (select tenant from f), order_id, 'Creme 1 kg', 2, 100 from s;

-- ───────────────────────────────────────────────────────────────────────────
-- Proposta aceita → chamado com a ficha, conta a receber, aviso
-- ───────────────────────────────────────────────────────────────────────────
update public.crm_orders set status = 'proposal_sent' where id = (select order_id from s);
update public.crm_orders set status = 'accepted' where id = (select order_id from s);
-- Daqui em diante as asserções leem como sistema: o vendedor não enxerga `fin_entries` (RLS do Financeiro).
select tests.clear_authentication();

select is(
  (select t.module || '|' || (t.category_id = (select cat_cadastro from s))::text || '|' || (t.requester_id = (select vendedor from u))::text || '|' || t.title
     from public.tickets t where t.tenant_id = (select tenant from f) and t.title like 'Cadastrar cliente%'),
  'tickets|true|true|Cadastrar cliente Distribuidora Sul — pedido #1',
  'o chamado de cadastro nasce na TI, na categoria certa, aberto pelo vendedor, com o nome do cliente'
);
select is(
  (select (description like '%12345678000199%')::text || '|' || (description like '%2 × Creme 1 kg — R$ 200,00%')::text || '|' || (description like '%total R$ 200,00%')::text
     from public.tickets where tenant_id = (select tenant from f) and title like 'Cadastrar cliente%'),
  'true|true|true',
  'a ficha vai pronta: CNPJ, itens e total do pedido'
);
select is(
  (select e.kind::text || '|' || e.amount || '|' || e.counterparty || '|' || e.document_number || '|' || (e.due_date = current_date + 7)::text || '|' || e.status::text
     from public.fin_entries e where e.tenant_id = (select tenant from f)),
  'receivable|200.00|Distribuidora Sul|1|true|pending',
  'a conta a receber nasce no Financeiro com o valor, o cliente, o numero do pedido e o vencimento'
);
select is(
  (select reference_type || '|' || (reference_id = (select deal1 from s))::text from public.notifications where user_id = (select vendedor from u) and type = 'automation' and title = 'Cadastro do cliente pedido à TI'),
  'crm_deal|true',
  'o vendedor e avisado que o cadastro foi pedido — e o aviso abre o negocio do pedido'
);

-- ───────────────────────────────────────────────────────────────────────────
-- TI resolve o chamado → vendedor avisado, tarefa de cobrança para o financeiro
-- ───────────────────────────────────────────────────────────────────────────
-- (a TI resolve; aqui a escrita é do sistema — o que se prova é o fluxo que ela dispara)
update public.tickets set status = 'resolved' where tenant_id = (select tenant from f) and title like 'Cadastrar cliente%';

select is(
  (select count(*)::int from public.notifications where user_id = (select vendedor from u) and type = 'automation' and title = 'Cliente cadastrado'),
  1,
  'chamado resolvido: o vendedor que abriu e avisado'
);
select is(
  (select user_id::text || '|' || title from public.tasks where tenant_id = (select tenant from f) and title like 'Cobrar:%'),
  (select fin::text from u) || '|Cobrar: Cadastrar cliente Distribuidora Sul — pedido #1',
  'e o financeiro recebe a tarefa de cobranca'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Sem resposta: o refresh olha o negócio de novo
-- ───────────────────────────────────────────────────────────────────────────
-- Negócio que veio de planilha não entra no "sem resposta" (o modelo filtra a origem).
insert into public.crm_deals (tenant_id, contact_id, stage_id, title, value, owner_id, source)
select (select tenant from f), contact_id, novo, 'Lead antigo importado', 0, (select vendedor from u), 'importacao' from s;
select is(
  (select count(*)::int from public.automation_runs r join public.automation_workflows w on w.id = r.workflow_id
    where w.name like 'Sem resposta%' and r.status = 'waiting'),
  2,
  'os dois negocios novos ficaram esperando as 24 h; o importado nao entrou'
);

-- Vence a espera. O negocio 1 ja foi para Ganho (proposta aceita); o 2 continua em Novo.
update public.automation_runs set resume_at = now() - interval '1 second' where status = 'waiting';
select public.automation_tick();

select is(
  (select array_agg(title order by title) from public.tasks where tenant_id = (select tenant from f) and title like 'Follow-up:%'),
  array['Follow-up: Segundo lead'],
  'so o negocio que continua parado ganha a tarefa de follow-up (o refresh viu que o outro ja e Ganho)'
);

-- Vence a segunda espera: continua parado → perdido, com o motivo.
update public.automation_runs set resume_at = now() - interval '1 second' where status = 'waiting';
select public.automation_tick();

select is(
  (select st.kind || '|' || coalesce(d.lost_reason, '-') from public.crm_deals d join public.crm_pipeline_stages st on st.id = d.stage_id where d.id = (select deal2 from s)),
  'lost|Sem resposta',
  'segunda espera vencida e nada mudou: negocio vai para Perdido com o motivo'
);
select is(
  (select st.kind from public.crm_deals d join public.crm_pipeline_stages st on st.id = d.stage_id where d.id = (select deal1 from s)),
  'won',
  'o negocio ganho nao e tocado'
);

select * from finish();
rollback;

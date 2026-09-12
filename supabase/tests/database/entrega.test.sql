-- CRM-2c: entrega (migration 20260918010000). Prova a corrente inteira, não a coluna:
--   - a transportadora do cliente chega ao fluxo como {{trigger.contact.carrier}}
--   - o modelo "pedido pago → separar e despachar" vira uma tarefa para a expedição com
--     transportadora e itens no texto
begin;
\ir _helpers.psql

select plan(3);

create temporary table f on commit drop as select tests.create_tenant('pgtap-entrega', 'Entrega') as a;
create temporary table u on commit drop as
select tests.create_user('gerente@entrega.test',   (select a from f)) as gerente,
       tests.create_user('expedicao@entrega.test', (select a from f)) as expedicao;
select tests.grant_role((select gerente from u), 'manager');
select tests.grant_module((select gerente from u), (select a from f), 'comercial');
grant select on f, u to authenticated;

create temporary table s on commit drop as
select gen_random_uuid() as contact_id, gen_random_uuid() as order_id, gen_random_uuid() as wf;
grant select on s to authenticated;

insert into public.crm_contacts (id, tenant_id, name, city, state, carrier)
select contact_id, (select a from f), 'Distribuidora Norte', 'Belém', 'PA', 'Transportes Amazônia (retira na fábrica às terças)' from s;

-- O mesmo fluxo que o modelo "Pedido pago → separar e despachar" cria pela tela.
insert into public.automation_workflows (id, tenant_id, module, name, status, trigger, steps, created_by)
select wf, (select a from f), 'comercial', 'Pedido pago → separar e despachar', 'active',
  '{"kind":"record_updated","entity":"crm_order","fields":["status"],"filter":{"op":"and","rules":[{"path":"trigger.after.status","cmp":"eq","value":"paid"}]},"next":["s1"]}'::jsonb,
  jsonb_build_array(jsonb_build_object(
    'id', 's1', 'kind', 'create_task', 'next', '[]'::jsonb,
    'config', jsonb_build_object(
      'user_id', (select expedicao from u)::text,
      'title', 'Separar e despachar pedido #{{trigger.after.number}} — {{trigger.contact.name}}',
      'description', E'Transportadora: {{trigger.contact.carrier}}\nDestino: {{trigger.contact.city}}/{{trigger.contact.state}}\n{{trigger.items_text}}',
      'due_in_days', 2, 'priority', 2))),
  (select gerente from u) from s;

insert into public.crm_orders (id, tenant_id, contact_id, status, created_by)
select order_id, (select a from f), contact_id, 'draft', (select gerente from u) from s;
insert into public.crm_order_items (tenant_id, order_id, description, quantity, unit_price, position)
select (select a from f), order_id, 'Creme 1 kg', 12, 85, 0 from s;

update public.crm_orders set status = 'paid' where id = (select order_id from s);

select is(
  (select r.context #>> '{trigger,contact,carrier}' from public.automation_runs r where r.workflow_id = (select wf from s)),
  'Transportes Amazônia (retira na fábrica às terças)',
  'a transportadora do cliente chega ao contexto do fluxo'
);
select is(
  (select t.title from public.tasks t where t.user_id = (select expedicao from u) and t.source_type = 'automation'),
  'Separar e despachar pedido #1 — Distribuidora Norte',
  'pedido pago vira tarefa para a expedicao'
);
select ok(
  (select t.description like '%Transportes Amazônia%' and t.description like '%Belém/PA%' and t.description like '%Creme 1 kg%'
     from public.tasks t where t.user_id = (select expedicao from u) and t.source_type = 'automation'),
  'a tarefa leva transportadora, destino e itens'
);

select * from finish();
rollback;

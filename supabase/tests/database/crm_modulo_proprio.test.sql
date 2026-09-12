-- ADR-009: CRM é módulo próprio (migration 20260919010000). Prova:
--   - quem tem só o Comercial (chamados) não vê o CRM; quem tem `crm` vê
--   - registro do CRM dispara fluxo do módulo `crm`, não do `comercial`
--   - "abrir chamado" sem módulo num fluxo do CRM cai no Comercial (o CRM não tem chamados)
begin;
\ir _helpers.psql

select plan(5);

create temporary table f on commit drop as select tests.create_tenant('pgtap-crm-mod', 'CRM Mod') as a;
create temporary table u on commit drop as
select tests.create_user('chamados@crmmod.test', (select a from f)) as so_comercial,
       tests.create_user('vendas@crmmod.test',    (select a from f)) as vendas,
       tests.create_user('gerente@crmmod.test',   (select a from f)) as gerente;
select tests.grant_module((select so_comercial from u), (select a from f), 'comercial');
select tests.grant_module((select vendas from u),       (select a from f), 'crm');
select tests.grant_role((select gerente from u), 'manager');
select tests.grant_module((select gerente from u),      (select a from f), 'crm');
grant select on f, u to authenticated;

insert into public.crm_contacts (tenant_id, name) values ((select a from f), 'Cliente do CRM');

-- ───────────────────────────────────────────────────────────────────────────
-- Acesso: `crm` é concessão própria
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('chamados@crmmod.test');
select is((select count(*)::int from public.crm_contacts), 0, 'quem tem so o Comercial (chamados) nao ve contatos do CRM');
select tests.clear_authentication();

select tests.authenticate_as('vendas@crmmod.test');
select is((select count(*)::int from public.crm_contacts), 1, 'quem tem o modulo crm ve os contatos');
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- Fluxos: registro do CRM dispara o módulo `crm`
-- ───────────────────────────────────────────────────────────────────────────
create temporary table s on commit drop as
select gen_random_uuid() as wf_crm, gen_random_uuid() as wf_com, gen_random_uuid() as contact_id,
       (select id from public.crm_pipeline_stages where tenant_id = (select a from f) and name = 'Novo' limit 1) as novo;
grant select on s to authenticated;
insert into public.crm_contacts (id, tenant_id, name) select contact_id, (select a from f), 'Lead' from s;

insert into public.automation_workflows (id, tenant_id, module, name, status, trigger, steps, created_by)
select wf_crm, (select a from f), 'crm', 'Negocio novo → chamado', 'active',
       '{"kind":"record_created","entity":"crm_deal","next":["s1"]}'::jsonb,
       '[{"id":"s1","kind":"create_ticket","config":{"title":"Atender {{trigger.after.title}}"},"next":[]}]'::jsonb,
       (select gerente from u) from s
union all
select wf_com, (select a from f), 'comercial', 'Negocio novo (no modulo errado)', 'active',
       '{"kind":"record_created","entity":"crm_deal","next":["s1"]}'::jsonb,
       '[{"id":"s1","kind":"notify","config":{"target":"owner","message":"nao deveria"},"next":[]}]'::jsonb,
       (select gerente from u) from s;

insert into public.crm_deals (tenant_id, contact_id, stage_id, title, owner_id)
select (select a from f), contact_id, novo, 'Venda Y', (select gerente from u) from s;

select is((select count(*)::int from public.automation_runs where workflow_id = (select wf_crm from s)), 1, 'negocio criado dispara o fluxo do modulo crm');
select is((select count(*)::int from public.automation_runs where workflow_id = (select wf_com from s)), 0, 'e nao dispara o fluxo do Comercial (chamados) com o mesmo gatilho');
select is(
  (select t.module from public.tickets t where t.tenant_id = (select a from f) and t.title = 'Atender Venda Y'),
  'comercial',
  'abrir chamado sem modulo num fluxo do CRM cai no Comercial'
);

select * from finish();
rollback;

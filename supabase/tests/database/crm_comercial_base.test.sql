-- Leva CRM-1: base do CRM do Comercial (migration 20260910010000).
--
-- Prova o que o dono decidiu (ADR-006): etapas padrão por empresa, acesso só
-- de quem tem o módulo Comercial, totais do pedido somados pelo banco, mudança
-- de etapa na linha do tempo, pedido pago → negócio ganho + vendedor avisado,
-- e isolamento entre empresas.
--
-- Rode com:  npx supabase test db --linked   (precisa do Docker Desktop de pé)

begin;
\ir _helpers.psql

select plan(14);

-- ───────────────────────────────────────────────────────────────────────────
-- Fixtures: duas empresas; na A um vendedor (módulo comercial), um usuário
-- sem módulo e um gerente; na B um vendedor.
-- ───────────────────────────────────────────────────────────────────────────
create temporary table f on commit drop as
select tests.create_tenant('pgtap-crm-a', 'CRM A') as a,
       tests.create_tenant('pgtap-crm-b', 'CRM B') as b;

create temporary table u on commit drop as
select tests.create_user('vendedor@pgtap.test',  (select a from f)) as vendedor,
       tests.create_user('comum@pgtap.test',     (select a from f)) as comum,
       tests.create_user('gerente@pgtap.test',   (select a from f)) as gerente,
       tests.create_user('vendedorb@pgtap.test', (select b from f)) as vendedor_b;

select tests.grant_module((select vendedor from u),   (select a from f), 'crm');
select tests.grant_module((select vendedor_b from u), (select b from f), 'crm');
select tests.grant_role((select gerente from u), 'manager');

create temporary table s on commit drop as
select gen_random_uuid() as contact_id, gen_random_uuid() as deal_id, gen_random_uuid() as order_id;

grant select on f, u, s to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- Etapas padrão nascem com a empresa
-- ───────────────────────────────────────────────────────────────────────────
select is(
  (select array_agg(name || ':' || kind order by position) from public.crm_pipeline_stages where tenant_id = (select a from f)),
  array['Novo:open', 'Em contato:open', 'Orçamento enviado:open', 'Negociação:open', 'Ganho:won', 'Perdido:lost'],
  'empresa nova nasce com as seis etapas padrao'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Acesso: sem o módulo não entra; vendedor entra
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('comum@pgtap.test');
select throws_ok(
  $$ insert into public.crm_contacts (tenant_id, name) select a, 'Nao pode' from f $$,
  '42501', null,
  'usuario sem o modulo Comercial nao cria contato'
);
select is(
  (select count(*)::int from public.crm_pipeline_stages),
  0,
  'e nao ve as etapas'
);
select tests.clear_authentication();

select tests.authenticate_as('vendedor@pgtap.test');
insert into public.crm_contacts (id, tenant_id, name, email, owner_id, source)
select contact_id, a, 'Flores & Cia', 'compras@flores.test', vendedor, 'site' from s, f, u;

insert into public.crm_deals (id, tenant_id, contact_id, stage_id, title, value, owner_id)
select deal_id, a, contact_id,
       (select id from public.crm_pipeline_stages where tenant_id = a and position = 1),
       '200 buques para evento', 4800, vendedor
  from s, f, u;

select is(
  (select count(*)::int from public.crm_deals where id = (select deal_id from s)),
  1,
  'vendedor cria contato e negocio'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Mudar de etapa → linha do tempo; etapa "ganho" marca won_at
-- ───────────────────────────────────────────────────────────────────────────
update public.crm_deals
   set stage_id = (select id from public.crm_pipeline_stages where tenant_id = (select a from f) and position = 3)
 where id = (select deal_id from s);

select is(
  (select content from public.crm_deal_activities where deal_id = (select deal_id from s) and kind = 'stage_change'),
  'De "Novo" para "Orçamento enviado"',
  'mudanca de etapa vira linha do tempo'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Pedido: número por empresa, totais pelo banco, desconto
-- ───────────────────────────────────────────────────────────────────────────
insert into public.crm_orders (id, tenant_id, deal_id, contact_id, created_by)
select order_id, a, deal_id, contact_id, vendedor from s, f, u;

select is(
  (select number from public.crm_orders where id = (select order_id from s)),
  1,
  'primeiro pedido da empresa e o numero 1'
);

insert into public.crm_order_items (tenant_id, order_id, description, quantity, unit_price, position)
select a, order_id, 'Buque medio', 200, 24, 1 from s, f;
insert into public.crm_order_items (tenant_id, order_id, description, quantity, unit_price, position)
select a, order_id, 'Frete', 1, 150, 2 from s, f;

select is(
  (select subtotal || '|' || total from public.crm_orders where id = (select order_id from s)),
  '4950.00|4950.00',
  'itens somam subtotal e total pelo banco'
);

update public.crm_orders set discount = 150 where id = (select order_id from s);
select is(
  (select total from public.crm_orders where id = (select order_id from s)),
  4800.00,
  'desconto abate o total'
);

delete from public.crm_order_items where order_id = (select order_id from s) and description = 'Frete';
select is(
  (select subtotal || '|' || total from public.crm_orders where id = (select order_id from s)),
  '4800.00|4650.00',
  'tirar um item recalcula'
);

select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- Pedido pago (o webhook escreve como sistema) → negócio ganho + aviso
-- ───────────────────────────────────────────────────────────────────────────
update public.crm_orders set status = 'paid' where id = (select order_id from s);

select is(
  (select kind from public.crm_pipeline_stages where id = (select stage_id from public.crm_deals where id = (select deal_id from s))),
  'won',
  'pedido pago leva o negocio para a etapa ganho'
);

select isnt(
  (select won_at from public.crm_deals where id = (select deal_id from s)),
  null,
  'e marca won_at'
);

select is(
  (select array_agg(kind order by kind) from public.crm_deal_activities where deal_id = (select deal_id from s)),
  array['payment', 'stage_change', 'stage_change'],
  'linha do tempo tem o pagamento e as duas mudancas de etapa'
);

select is(
  (select user_id from public.notifications where type = 'order_paid' and reference_id = (select deal_id from s)),
  (select vendedor from u),
  'o vendedor dono do negocio e avisado do pagamento'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Isolamento: vendedor da empresa B não vê nada da A
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('vendedorb@pgtap.test');
select is(
  (select count(*)::int from public.crm_deals) + (select count(*)::int from public.crm_orders) + (select count(*)::int from public.crm_contacts),
  0,
  'vendedor de outra empresa nao ve contatos, negocios nem pedidos'
);
select tests.clear_authentication();

select * from finish();
rollback;

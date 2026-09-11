-- CRM-1c: pedido ao vivo e proposta (migration 20260914010000). Prova:
--   - frete entra no total; desconto continua valendo
--   - todo pedido nasce com um link público único
--   - proposta enviada: linha do tempo e data; pública só depois de enviada
--   - anon lê a proposta pela função e não lê a tabela
--   - aceita: negócio no Ganho, linha do tempo e aviso ao vendedor
--   - cancelada some da página pública
begin;
\ir _helpers.psql

select plan(12);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-prop-a', 'Proposta A') as a;

create temporary table u on commit drop as
select tests.create_user('vendedor@prop.test', (select a from f)) as vendedor;
select tests.grant_module((select vendedor from u), (select a from f), 'comercial');

create temporary table s on commit drop as
select gen_random_uuid() as contact_id, gen_random_uuid() as deal_id, gen_random_uuid() as order_id, gen_random_uuid() as order2_id;

grant select on f, u, s to authenticated, anon;

insert into public.crm_contacts (id, tenant_id, name, company) select contact_id, (select a from f), 'Distribuidora Sul', 'Sul Ltda' from s;
insert into public.crm_deals (id, tenant_id, contact_id, stage_id, title, value, owner_id)
select deal_id, (select a from f), contact_id,
       (select id from public.crm_pipeline_stages where tenant_id = (select a from f) and name = 'Novo'),
       'Primeiro pedido', 0, (select vendedor from u)
  from s;

-- ───────────────────────────────────────────────────────────────────────────
-- Frete e link público
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('vendedor@prop.test');

insert into public.crm_orders (id, tenant_id, deal_id, contact_id, shipping, created_by)
select order_id, (select a from f), deal_id, contact_id, 30, (select vendedor from u) from s;
insert into public.crm_order_items (tenant_id, order_id, description, quantity, unit_price)
select (select a from f), order_id, 'Creme 1 kg', 2, 100 from s;

select is(
  (select subtotal || '|' || total from public.crm_orders where id = (select order_id from s)),
  '200.00|230.00',
  'frete entra no total: 200 de itens + 30 de frete'
);
update public.crm_orders set discount = 50 where id = (select order_id from s);
select is(
  (select total from public.crm_orders where id = (select order_id from s)),
  180.00::numeric,
  'desconto sai, frete fica: 200 - 50 + 30'
);

insert into public.crm_orders (id, tenant_id, contact_id) select order2_id, (select a from f), contact_id from s;
select is(
  (select count(distinct public_token)::int || '|' || min(length(public_token))::text from public.crm_orders where tenant_id = (select a from f)),
  '2|24',
  'todo pedido nasce com um link publico proprio'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Enviar a proposta
-- ───────────────────────────────────────────────────────────────────────────
select is(
  public.crm_public_proposal((select public_token from public.crm_orders where id = (select order_id from s))),
  null,
  'rascunho nao aparece na pagina publica'
);

update public.crm_orders set status = 'proposal_sent', proposal_valid_until = current_date + 7 where id = (select order_id from s);
select is(
  (select (proposal_sent_at is not null)::text || '|' || (select count(*) from public.crm_deal_activities where deal_id = (select deal_id from s) and kind = 'order' and content like 'Proposta #% enviada%')::text
     from public.crm_orders where id = (select order_id from s)),
  'true|1',
  'enviar grava a data e a linha do tempo do negocio'
);
select tests.clear_authentication();

-- O token vai para uma tabela temporária: anon não lê crm_orders (é o que a asserção seguinte prova).
create temporary table tk on commit drop as select public_token from public.crm_orders where id = (select order_id from s);
grant select on tk to anon;

-- O cliente (anon) abre o link
set local role anon;
select is(
  (select p->>'total' || '|' || jsonb_array_length(p->'items')::text || '|' || (p->'contact'->>'name') || '|' || (p->'company'->>'name')
     from public.crm_public_proposal((select public_token from tk)) p),
  '180.00|1|Distribuidora Sul|Proposta A',
  'anon ve a proposta enviada pela funcao: total, itens, contato e empresa'
);
select is(
  (select count(*)::int from public.crm_orders),
  0,
  'anon nao le a tabela de pedidos'
);
select is(
  public.crm_public_proposal('token-que-nao-existe'),
  null,
  'token desconhecido devolve nada'
);
reset role;

-- ───────────────────────────────────────────────────────────────────────────
-- Aceita → Ganho
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('vendedor@prop.test');
update public.crm_orders set status = 'accepted' where id = (select order_id from s);
select is(
  (select st.kind || '|' || (d.won_at is not null)::text from public.crm_deals d join public.crm_pipeline_stages st on st.id = d.stage_id where d.id = (select deal_id from s)),
  'won|true',
  'proposta aceita leva o negocio ao Ganho'
);
select is(
  (select count(*)::int from public.crm_deal_activities where deal_id = (select deal_id from s) and content like 'Proposta #% aceita%'),
  1,
  'e fica na linha do tempo'
);
select is(
  (select count(*)::int from public.notifications where user_id = (select vendedor from u) and type = 'order_accepted' and reference_id = (select deal_id from s)),
  1,
  'o vendedor e avisado'
);

update public.crm_orders set status = 'cancelled' where id = (select order_id from s);
select is(
  public.crm_public_proposal((select public_token from tk)),
  null,
  'pedido cancelado some da pagina publica'
);
select tests.clear_authentication();

select * from finish();
rollback;

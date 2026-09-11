-- CRM-1b: segmentos por empresa, assistente (crm_setup), tabelas de preço e
-- portões por etapa (migration 20260913010000). Prova:
--   - tenant novo nasce SEM funil; o assistente cria um funil por segmento
--   - só gerente roda o assistente; rodar duas vezes é recusado
--   - preço da tabela: base × (1 + %), exceção por produto ganha
--   - tabela do pedido: contato > segmento > padrão da empresa
--   - portão: recusa com a lista do que falta; passa depois de preencher;
--     escrita do sistema (pedido pago → ganho) passa
--   - isolamento entre empresas
begin;
\ir _helpers.psql

select plan(18);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-seg-a', 'Seg A', false) as a,
       tests.create_tenant('pgtap-seg-b', 'Seg B') as b;

create temporary table u on commit drop as
select tests.create_user('gerente@seg.test',  (select a from f)) as gerente,
       tests.create_user('vendedor@seg.test', (select a from f)) as vendedor,
       tests.create_user('gerenteb@seg.test', (select b from f)) as gerente_b;

select tests.grant_module((select gerente from u),   (select a from f), 'comercial');
select tests.grant_module((select vendedor from u),  (select a from f), 'comercial');
select tests.grant_module((select gerente_b from u), (select b from f), 'comercial');
select tests.grant_role((select gerente from u), 'manager');
select tests.grant_role((select gerente_b from u), 'manager');

create temporary table s on commit drop as
select gen_random_uuid() as product_id, gen_random_uuid() as contact_id, gen_random_uuid() as deal_id, gen_random_uuid() as order_id;

grant select on f, u, s to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- Tenant novo sem funil; o assistente monta
-- ───────────────────────────────────────────────────────────────────────────
select is(
  (select count(*)::int from public.crm_pipelines where tenant_id = (select a from f)),
  0,
  'empresa nova nasce sem funil — quem monta e o assistente'
);

select tests.authenticate_as('vendedor@seg.test');
select throws_ok(
  $$ select public.crm_setup('[{"name":"Salão"}]'::jsonb, '[]'::jsonb) $$,
  'P0001', null,
  'vendedor nao roda o assistente'
);
select tests.clear_authentication();

select tests.authenticate_as('gerente@seg.test');
select is(
  public.crm_setup(
    '[{"name":"Consumidor","price_table":"Consumidor"},{"name":"Salão","price_table":"Salão","requires_document":true}]'::jsonb,
    '[{"name":"Consumidor","percent":0},{"name":"Salão","percent":-15}]'::jsonb
  ),
  '{"pipelines": 2, "segments": 2, "price_tables": 2}'::jsonb,
  'assistente cria 2 tabelas, 2 segmentos e um funil por segmento'
);
select is(
  (select array_agg(p.name || ':' || p.is_default::text || ':' || (select count(*) from public.crm_pipeline_stages st where st.pipeline_id = p.id)::text order by p.position)
     from public.crm_pipelines p where p.tenant_id = (select a from f)),
  array['Consumidor:true:6', 'Salão:false:6'],
  'cada funil tem as 6 etapas do modelo; o primeiro e o padrao'
);
select is(
  (select array_agg(st.name order by st.position) from public.crm_pipeline_stages st
     join public.crm_pipelines p on p.id = st.pipeline_id
    where p.tenant_id = (select a from f) and p.name = 'Salão' and st.required_fields = array['contact.document']),
  array['Em contato', 'Orçamento enviado', 'Negociação', 'Ganho', 'Perdido'],
  'segmento que exige CNPJ ganha o portao em toda etapa menos a primeira'
);
select is(
  (select name from public.crm_price_tables where tenant_id = (select a from f) and is_default),
  'Consumidor',
  'sem tabela marcada como padrao, a primeira e a padrao'
);
select throws_ok(
  $$ select public.crm_setup('[]'::jsonb, '[]'::jsonb) $$,
  'P0001', 'o Comercial desta empresa já está configurado — use as Configurações',
  'rodar o assistente de novo e recusado'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Preço por tabela
-- ───────────────────────────────────────────────────────────────────────────
insert into public.crm_products (id, tenant_id, name, price) select product_id, (select a from f), 'Creme 1 kg', 100 from s;

select is(
  public.crm_product_price((select product_id from s), (select id from public.crm_price_tables where tenant_id = (select a from f) and name = 'Salão')),
  85.00::numeric,
  'tabela com -15% sobre a base 100 da 85'
);

insert into public.crm_price_table_items (tenant_id, price_table_id, product_id, price)
select (select a from f), (select id from public.crm_price_tables where tenant_id = (select a from f) and name = 'Salão'), product_id, 70 from s;
select is(
  public.crm_product_price((select product_id from s), (select id from public.crm_price_tables where tenant_id = (select a from f) and name = 'Salão')),
  70.00::numeric,
  'excecao por produto ganha da porcentagem'
);
select is(
  (select price from public.crm_products_with_price(null) where id = (select product_id from s)),
  100.00::numeric,
  'sem tabela, o catalogo mostra o preco base'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Tabela do pedido: contato > segmento > padrão
-- ───────────────────────────────────────────────────────────────────────────
insert into public.crm_contacts (id, tenant_id, name, segment_id)
select contact_id, (select a from f), 'Salão da Ana', (select id from public.crm_segments where tenant_id = (select a from f) and name = 'Salão') from s;

insert into public.crm_orders (id, tenant_id, contact_id) select order_id, (select a from f), contact_id from s;
select is(
  (select t.name from public.crm_orders o join public.crm_price_tables t on t.id = o.price_table_id where o.id = (select order_id from s)),
  'Salão',
  'pedido nasce com a tabela do segmento do contato'
);

update public.crm_contacts set price_table_id = (select id from public.crm_price_tables where tenant_id = (select a from f) and name = 'Consumidor')
 where id = (select contact_id from s);
select is(
  (select t.name from public.crm_price_tables t where t.id = public.crm_resolve_price_table((select contact_id from s))),
  'Consumidor',
  'a tabela do proprio contato ganha da tabela do segmento'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Portão por etapa
-- ───────────────────────────────────────────────────────────────────────────
insert into public.crm_deals (id, tenant_id, contact_id, stage_id, title, value)
select deal_id, (select a from f), contact_id,
       (select st.id from public.crm_pipeline_stages st join public.crm_pipelines p on p.id = st.pipeline_id where p.tenant_id = (select a from f) and p.name = 'Salão' and st.name = 'Novo'),
       'Primeira compra', 300
  from s;

select throws_ok(
  $$ update public.crm_deals set stage_id = (select st.id from public.crm_pipeline_stages st join public.crm_pipelines p on p.id = st.pipeline_id where p.tenant_id = (select a from f) and p.name = 'Salão' and st.name = 'Em contato')
      where id = (select deal_id from s) $$,
  'P0001', 'para entrar em "Em contato" falta preencher: CPF/CNPJ',
  'portao recusa e diz o que falta, em portugues'
);

update public.crm_contacts set document = '12345678000199' where id = (select contact_id from s);
select lives_ok(
  $$ update public.crm_deals set stage_id = (select st.id from public.crm_pipeline_stages st join public.crm_pipelines p on p.id = st.pipeline_id where p.tenant_id = (select a from f) and p.name = 'Salão' and st.name = 'Em contato')
      where id = (select deal_id from s) $$,
  'com o CNPJ preenchido, passa'
);

-- Portão com valor do negócio: o pedido pago leva ao "Ganho" mesmo com portão lá (escrita do sistema).
update public.crm_pipeline_stages set required_fields = array['deal.value', 'deal.expected_close_date']
 where id = (select st.id from public.crm_pipeline_stages st join public.crm_pipelines p on p.id = st.pipeline_id where p.tenant_id = (select a from f) and p.name = 'Salão' and st.kind = 'won');
update public.crm_orders set deal_id = (select deal_id from s) where id = (select order_id from s);
update public.crm_orders set status = 'paid' where id = (select order_id from s);
select is(
  (select st.kind from public.crm_deals d join public.crm_pipeline_stages st on st.id = d.stage_id where d.id = (select deal_id from s)),
  'won',
  'pedido pago leva ao ganho mesmo com portao na etapa (escrita do sistema passa)'
);

select throws_ok(
  $$ update public.crm_pipeline_stages set required_fields = array['contact.senha'] where tenant_id = (select a from f) and name = 'Novo' $$,
  '23514', null,
  'chave de portao fora da lista e recusada'
);
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- Isolamento
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('gerenteb@seg.test');
select is(
  (select count(*)::int from public.crm_segments) + (select count(*)::int from public.crm_price_tables),
  0,
  'empresa B nao ve segmentos nem tabelas da empresa A'
);
select tests.clear_authentication();

select throws_ok(
  $$ insert into public.crm_segments (tenant_id, name, pipeline_id)
     select b, 'Invasor', (select id from public.crm_pipelines where tenant_id = (select a from f) and name = 'Salão') from f $$,
  'P0001', 'segmento e funil de empresas diferentes',
  'segmento nao aponta para funil de outra empresa, nem escrito pelo sistema'
);

select * from finish();
rollback;

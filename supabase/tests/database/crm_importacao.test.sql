-- Leva E3 (ADR-007): importação de planilha (migration 20260911030000).
--
-- Prova: a regra de contato reaproveita por e-mail e por telefone (mesma
-- função para o site e para a planilha); o lote grava contato + negócio com
-- import_id e linha do tempo; erro por linha não derruba o lote; desfazer
-- apaga só o que o import criou (contato reaproveitado fica; contato novo
-- com negócio de outra origem fica); só a última importação se desfaz;
-- isolamento entre empresas.
--
-- Rode com:  npx supabase test db --linked   ou   scripts/pgtap-local/run.sh

begin;
\ir _helpers.psql

select plan(13);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-import-a', 'Import A') as a,
       tests.create_tenant('pgtap-import-b', 'Import B') as b;

create temporary table u on commit drop as
select tests.create_user('vendedor@import.test',  (select a from f)) as vendedor,
       tests.create_user('vendedorb@import.test', (select b from f)) as vendedor_b;

select tests.grant_module((select vendedor from u),   (select a from f), 'comercial');
select tests.grant_module((select vendedor_b from u), (select b from f), 'comercial');

create temporary table s on commit drop as
select gen_random_uuid() as existing_contact, gen_random_uuid() as import1, gen_random_uuid() as import2,
       (select id from public.crm_pipeline_stages where tenant_id = (select a from f) and position = 1) as stage_novo;
grant select on f, u, s to authenticated;

-- Um contato que já existe, com e-mail e telefone formatados "à mão"
insert into public.crm_contacts (id, tenant_id, name, email, phone)
select existing_contact, (select a from f), 'Já Existe', 'Existe@Empresa.com', '(31) 99999-0001' from s;

select tests.authenticate_as('vendedor@import.test');

-- ───────────────────────────────────────────────────────────────────────────
-- A regra de contato
-- ───────────────────────────────────────────────────────────────────────────
select is(
  (select contact_id || ':' || created from public.crm_find_or_create_contact((select a from f), 'Outro Nome', 'existe@empresa.com')),
  (select existing_contact || ':false' from s),
  'e-mail casa sem diferenciar maiusculas e reaproveita'
);
select is(
  (select contact_id || ':' || created from public.crm_find_or_create_contact((select a from f), 'Outro Nome', null, '31999990001')),
  (select existing_contact || ':false' from s),
  'telefone casa so pelos digitos e reaproveita'
);
select is(
  (select created from public.crm_find_or_create_contact((select a from f), 'Novo Mesmo', 'novo@empresa.com', null, 'ACME', 'site')),
  true,
  'sem e-mail nem telefone conhecidos, cria'
);
select is(
  (select source || '|' || company from public.crm_contacts where email = 'novo@empresa.com'),
  'site|ACME',
  'o contato criado leva origem e empresa'
);

-- ───────────────────────────────────────────────────────────────────────────
-- O lote
-- ───────────────────────────────────────────────────────────────────────────
insert into public.crm_imports (id, tenant_id, file_name) select import1, (select a from f), 'kommo.xlsx' from s;

create temporary table r on commit drop as
select public.crm_import_rows((select import1 from s), jsonb_build_array(
  jsonb_build_object('line', 2, 'name', 'Já Existe', 'email', 'existe@empresa.com', 'deal_title', 'Reposição', 'value', 1500, 'stage_id', (select stage_novo from s)),
  jsonb_build_object('line', 3, 'name', 'Maria Nova', 'phone', '31 98888-0002', 'company', 'Flores Ltda', 'deal_title', 'Primeiro pedido', 'value', '250.50', 'stage_id', (select stage_novo from s)),
  jsonb_build_object('line', 4, 'name', '', 'email', 'semnome@x.com', 'stage_id', (select stage_novo from s)),
  jsonb_build_object('line', 5, 'name', 'Só Contato', 'email', 'so@contato.com')
)) as result;
grant select on r to authenticated;

select is(
  (select (result->>'contacts_created')::int || '/' || (result->>'contacts_reused')::int || '/' || (result->>'deals_created')::int from r),
  '2/1/2',
  'lote: 2 contatos novos, 1 reaproveitado, 2 negocios'
);
select is(
  (select jsonb_array_length(result->'errors') || ':' || (result->'errors'->0->>'line') from r),
  '1:4',
  'a linha sem nome vira erro e nao derruba o lote'
);
select is(
  (select count(*)::int from public.crm_deals where import_id = (select import1 from s)),
  2,
  'os negocios levam o import_id'
);
select is(
  (select content from public.crm_deal_activities a join public.crm_deals d on d.id = a.deal_id
    where d.import_id = (select import1 from s) and d.title = 'Reposição' and a.kind = 'system'),
  'Importado da planilha "kommo.xlsx"',
  'e a linha do tempo diz de onde veio'
);
select is(
  (select import_id from public.crm_contacts where id = (select existing_contact from s)),
  null,
  'o contato reaproveitado nao e marcado como criado pelo import'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Desfazer
-- ───────────────────────────────────────────────────────────────────────────
-- "Só Contato" ganha um negócio à mão: o desfazer não pode levá-lo.
insert into public.crm_deals (tenant_id, contact_id, stage_id, title)
select (select a from f), id, (select stage_novo from s), 'Feito à mão' from public.crm_contacts where email = 'so@contato.com';

-- Uma importação mais nova (hora explícita: dentro da transação now() empata — lição 9).
insert into public.crm_imports (id, tenant_id, file_name, status, created_at) select import2, (select a from f), 'segunda.xlsx', 'done', now() + interval '1 minute' from s;
select throws_ok(
  $$ select public.crm_undo_import((select import1 from s)) $$,
  'P0001', null,
  'so a ultima importacao se desfaz'
);
update public.crm_imports set status = 'undone' where id = (select import2 from s);

select is(
  (select (result->>'deals_deleted')::int || '/' || (result->>'contacts_deleted')::int from public.crm_undo_import((select import1 from s)) as result),
  '2/1',
  'desfazer apaga os 2 negocios e so o contato novo sem outro negocio'
);
select is(
  (select array_agg(name order by name) from public.crm_contacts where tenant_id = (select a from f) and name in ('Já Existe', 'Maria Nova', 'Só Contato')),
  array['Já Existe', 'Só Contato'],
  'ficam o contato que ja existia e o que ganhou negocio a mao'
);
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- Isolamento
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('vendedorb@import.test');
select throws_ok(
  $$ select public.crm_import_rows((select import1 from s), '[]'::jsonb) $$,
  'P0001', null,
  'empresa B nao enxerga a importacao da empresa A'
);
select tests.clear_authentication();

select * from finish();
rollback;

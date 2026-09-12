-- Leva E2 (ADR-007): campos personalizados (migration 20260911020000).
--
-- Prova: só gerente define campo; o valor gravado é validado contra o
-- catálogo (chave desconhecida, opção fora da lista, tipo errado, data
-- inválida); null limpa; a chave não muda; isolamento entre empresas.
-- O caminho exercitado é o do usuário: inserir e atualizar o contato,
-- não chamar a função de validação direto.
--
-- Rode com:  npx supabase test db --linked   ou   scripts/pgtap-local/run.sh

begin;
\ir _helpers.psql

select plan(13);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-campos-a', 'Campos A') as a,
       tests.create_tenant('pgtap-campos-b', 'Campos B') as b;

create temporary table u on commit drop as
select tests.create_user('vendedor@campos.test',  (select a from f)) as vendedor,
       tests.create_user('gerente@campos.test',   (select a from f)) as gerente,
       tests.create_user('vendedorb@campos.test', (select b from f)) as vendedor_b;

select tests.grant_module((select vendedor from u),   (select a from f), 'crm');
select tests.grant_module((select gerente from u),    (select a from f), 'crm');
select tests.grant_module((select vendedor_b from u), (select b from f), 'crm');
select tests.grant_role((select gerente from u), 'manager');

create temporary table s on commit drop as
select gen_random_uuid() as contact_id, gen_random_uuid() as field_id;
grant select on f, u, s to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- Definir campo é de gerente
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('vendedor@campos.test');
select throws_ok(
  $$ insert into public.crm_custom_fields (tenant_id, entity, key, label, type) select a, 'contact', 'segmento', 'Segmento', 'text' from f $$,
  '42501', null,
  'vendedor nao define campo personalizado'
);
select tests.clear_authentication();

select tests.authenticate_as('gerente@campos.test');
insert into public.crm_custom_fields (id, tenant_id, entity, key, label, type, options)
select field_id, (select a from f), 'contact', 'segmento', 'Segmento', 'select',
       '[{"value":"varejo","label":"Varejo"},{"value":"atacado","label":"Atacado"}]'::jsonb
  from s;
insert into public.crm_custom_fields (tenant_id, entity, key, label, type) values
  ((select a from f), 'contact', 'funcionarios', 'Funcionários', 'number'),
  ((select a from f), 'contact', 'desde',        'Cliente desde', 'date'),
  ((select a from f), 'contact', 'vip',          'VIP', 'boolean'),
  ((select a from f), 'deal',    'garantia',     'Garantia (meses)', 'number');

select throws_ok(
  $$ insert into public.crm_custom_fields (tenant_id, entity, key, label, type) select a, 'contact', 'segmento', 'Outro', 'text' from f $$,
  '23505', null,
  'chave repetida no mesmo cadastro e recusada'
);

select throws_ok(
  $$ update public.crm_custom_fields set key = 'setor' where id = (select field_id from s) $$,
  'P0001', null,
  'a chave nao muda'
);

select lives_ok(
  $$ update public.crm_custom_fields set label = 'Setor' where id = (select field_id from s) $$,
  'o rotulo muda'
);
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- O valor, pelo caminho do usuário
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('vendedor@campos.test');

select lives_ok(
  $$ insert into public.crm_contacts (id, tenant_id, name, custom)
     select contact_id, (select a from f), 'Loja', '{"segmento":"varejo","funcionarios":12,"desde":"2024-03-01","vip":true}'::jsonb from s $$,
  'valores validos gravam'
);

select throws_ok(
  $$ update public.crm_contacts set custom = '{"inexistente":"x"}'::jsonb where id = (select contact_id from s) $$,
  'P0001', null,
  'chave fora do catalogo e recusada'
);

select throws_ok(
  $$ update public.crm_contacts set custom = '{"segmento":"industria"}'::jsonb where id = (select contact_id from s) $$,
  'P0001', null,
  'opcao fora da lista e recusada'
);

select throws_ok(
  $$ update public.crm_contacts set custom = '{"funcionarios":"doze"}'::jsonb where id = (select contact_id from s) $$,
  'P0001', null,
  'numero com texto e recusado'
);

select throws_ok(
  $$ update public.crm_contacts set custom = '{"desde":"2024-13-45"}'::jsonb where id = (select contact_id from s) $$,
  'P0001', null,
  'data invalida e recusada'
);

select throws_ok(
  $$ update public.crm_contacts set custom = '{"vip":"sim"}'::jsonb where id = (select contact_id from s) $$,
  'P0001', null,
  'sim/nao com texto e recusado'
);

update public.crm_contacts set custom = '{"segmento":"atacado","vip":null}'::jsonb where id = (select contact_id from s);
select is(
  (select custom from public.crm_contacts where id = (select contact_id from s)),
  '{"segmento":"atacado"}'::jsonb,
  'null limpa o campo e o resto fica'
);

select throws_ok(
  $$ insert into public.crm_deals (tenant_id, contact_id, stage_id, title, custom)
     select (select a from f), contact_id,
            (select id from public.crm_pipeline_stages where tenant_id = (select a from f) and kind = 'open' order by position limit 1),
            'Negocio', '{"segmento":"varejo"}'::jsonb from s $$,
  'P0001', null,
  'campo de contato nao vale para negocio'
);
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- Isolamento
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('vendedorb@campos.test');
select is(
  (select count(*)::int from public.crm_custom_fields),
  0,
  'empresa B nao ve os campos da empresa A'
);
select tests.clear_authentication();

select * from finish();
rollback;

-- CRM-3a: o formulário do site (migration 20260927010000). Prova o que vive no
-- banco:
--   - a página pública lê sem login, e **não** vê funil, segmento nem dono
--   - formulário desligado some da página pública
--   - anon não lê a tabela, só a função
--   - quem tem o CRM lê; quem não tem, não; a empresa B não vê a A
--   - vendedor não cria nem apaga formulário (é de gerente para cima)
--   - o negócio não aponta para formulário de outra empresa, nem o formulário
--     para vendedor de outra
--   - o endereço é único por empresa e recusa caractere fora do padrão
begin;
\ir _helpers.psql

select plan(18);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-form-a', 'Form A') as a,
       tests.create_tenant('pgtap-form-b', 'Form B') as b;

create temporary table u on commit drop as
select tests.create_user('vendedor@form.test',  (select a from f)) as vendedor,
       tests.create_user('gerente@form.test',   (select a from f)) as gerente,
       tests.create_user('rh@form.test',        (select a from f)) as rh,
       tests.create_user('vendedorb@form.test', (select b from f)) as vendedor_b;
select tests.grant_module((select vendedor from u),   (select a from f), 'crm');
select tests.grant_module((select gerente from u),    (select a from f), 'crm');
select tests.grant_role((select gerente from u), 'manager');
select tests.grant_module((select rh from u),         (select a from f), 'rh');
select tests.grant_module((select vendedor_b from u), (select b from f), 'crm');
grant select on f, u to authenticated;

create temporary table s on commit drop as
select gen_random_uuid() as form_a, gen_random_uuid() as form_off,
       (select id from public.crm_pipelines where tenant_id = (select a from f) limit 1) as funil;
grant select on s to authenticated;

insert into public.crm_forms (id, tenant_id, name, slug, pipeline_id, owner_id, headline, fields)
select form_a, (select a from f), 'Fale conosco', 'fale-conosco', funil, (select vendedor from u),
       'Fale com a gente',
       '[{"key":"name","label":"Nome","type":"text","required":true},
         {"key":"email","label":"E-mail","type":"email","required":true}]'::jsonb
  from s;
insert into public.crm_forms (id, tenant_id, name, slug, is_active, fields)
select form_off, (select a from f), 'Campanha velha', 'campanha-velha', false, '[]'::jsonb from s;

-- ───────────────────────────────────────────────────────────────────────────
-- A página pública: sem login, e sem o que é de dentro
-- ───────────────────────────────────────────────────────────────────────────
set local role anon;
select is(
  (select name || '|' || headline || '|' || jsonb_array_length(fields)::text || '|' || empresa
     from public.crm_form_publico('pgtap-form-a', 'fale-conosco')),
  'Fale conosco|Fale com a gente|2|Form A',
  'a pagina publica ve o formulario, o titulo, os campos e o nome da empresa'
);
-- O `is()` acima passaria mesmo se a função devolvesse o dono junto. Estas duas
-- provam que o destino do lead não sai: 42703 = coluna ausente.
select throws_ok(
  $$ select owner_id from public.crm_form_publico('pgtap-form-a', 'fale-conosco') $$,
  '42703', null,
  'a pagina publica nao tem coluna de dono do lead'
);
select throws_ok(
  $$ select pipeline_id from public.crm_form_publico('pgtap-form-a', 'fale-conosco') $$,
  '42703', null,
  'nem de funil'
);
select is(
  (select count(*)::int from public.crm_form_publico('pgtap-form-a', 'campanha-velha')),
  0,
  'formulario desligado some da pagina publica'
);
select is(
  (select count(*)::int from public.crm_form_publico('pgtap-form-b', 'fale-conosco')),
  0,
  'o endereco de uma empresa nao abre o formulario de outra'
);
-- O REVOKE é explícito (defeito nº 6: toda tabela nova nasce com ALL para
-- anon/authenticated). Sem ele, quem barrava `anon` era só a policy chamar uma
-- função que ele não executa — trava por acidente, no lugar errado.
select is(
  has_table_privilege('anon', 'public.crm_forms', 'select'),
  false,
  'anon nao tem privilegio de leitura na tabela de formularios'
);
select throws_ok(
  $$ select * from public.crm_forms $$,
  '42501', null,
  'e por isso a leitura sem login para na tabela'
);
reset role;

-- ───────────────────────────────────────────────────────────────────────────
-- Dentro: quem lê e quem edita
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('vendedor@form.test');
select is((select count(*)::int from public.crm_forms), 2, 'quem tem o CRM ve os formularios da empresa');
select throws_ok(
  format($$ insert into public.crm_forms (tenant_id, name, slug, fields)
            values (%L::uuid, 'Do vendedor', 'do-vendedor', '[]'::jsonb) $$, (select a from f)),
  '42501', null,
  'vendedor nao cria formulario — e de gerente para cima'
);
-- DELETE que a policy recusa não estoura: afeta zero linhas, em silêncio.
-- Por isso a prova é contar o que sobrou, não esperar exceção.
select lives_ok(
  format($$ delete from public.crm_forms where id = %L::uuid $$, (select form_a from s)),
  'o DELETE do vendedor nao estoura...'
);
select is(
  (select count(*)::int from public.crm_forms where id = (select form_a from s)),
  1,
  '...mas tambem nao apaga nada: o formulario continua la'
);
select tests.clear_authentication();

select tests.authenticate_as('rh@form.test');
select is((select count(*)::int from public.crm_forms), 0, 'quem nao tem o CRM nao ve formulario nenhum');
select tests.clear_authentication();

select tests.authenticate_as('vendedorb@form.test');
select is((select count(*)::int from public.crm_forms), 0, 'a empresa B nao ve os formularios da A');
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- O que o banco recusa
-- ───────────────────────────────────────────────────────────────────────────
select throws_ok(
  format($$ insert into public.crm_forms (tenant_id, name, slug, fields)
            values (%L::uuid, 'Repetido', 'fale-conosco', '[]'::jsonb) $$, (select a from f)),
  '23505', null,
  'duas vezes o mesmo endereco na mesma empresa, nao'
);
select throws_ok(
  format($$ insert into public.crm_forms (tenant_id, name, slug, fields)
            values (%L::uuid, 'Com espaco', 'Fale Conosco!', '[]'::jsonb) $$, (select a from f)),
  '23514', null,
  'endereco com maiuscula ou simbolo nao entra'
);
-- Para onde a pagina publica manda o visitante depois de enviar.
select throws_ok(
  format($$ insert into public.crm_forms (tenant_id, name, slug, fields, redirect_url)
            values (%L::uuid, 'Redirect torto', 'redirect-torto', '[]'::jsonb, 'javascript:alert(1)') $$, (select a from f)),
  '23514', null,
  'so https no endereco de destino — nada de javascript:'
);

-- ───────────────────────────────────────────────────────────────────────────
-- O que liga formulário, negócio e vendedor não atravessa empresa
-- ───────────────────────────────────────────────────────────────────────────
create temporary table x on commit drop as
select gen_random_uuid() as contato_b, gen_random_uuid() as negocio_b;

insert into public.crm_contacts (id, tenant_id, name) select contato_b, (select b from f), 'Cliente da B' from x;

select throws_ok(
  format($$ insert into public.crm_deals (tenant_id, contact_id, stage_id, title, form_id)
            select %L::uuid, %L::uuid, id, 'Negocio cruzado', %L::uuid
              from public.crm_pipeline_stages where tenant_id = %L::uuid limit 1 $$,
         (select b from f), (select contato_b from x), (select form_a from s), (select b from f)),
  '23503', null,
  'negocio de uma empresa nao aponta para formulario de outra'
);
select throws_ok(
  format($$ update public.crm_forms set owner_id = %L::uuid where id = %L::uuid $$,
         (select vendedor_b from u), (select form_a from s)),
  '23503', null,
  'o vendedor do formulario tem que ser da propria empresa'
);

select * from finish();
rollback;

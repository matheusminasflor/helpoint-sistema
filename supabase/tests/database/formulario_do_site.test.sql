-- CRM-3a: o formulário do site (migration 20260927010000). Prova o que vive no
-- banco:
--   - a página pública lê sem login, e **não** vê funil, segmento nem dono
--   - formulário desligado some da página pública
--   - anon não lê a tabela, só a função
--   - quem tem o CRM lê; quem não tem, não; a empresa B não vê a A
--   - vendedor não cria nem apaga formulário (é de gerente para cima)
--   - o endereço é único por empresa e recusa caractere fora do padrão
--   - o negócio não aponta para formulário de outra empresa
begin;
\ir _helpers.psql

select plan(12);

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
select throws_ok(
  $$ select * from public.crm_forms $$,
  '42501', null,
  'sem login a tabela nao e lida — so a funcao da pagina'
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

select * from finish();
rollback;

-- ENC-1: o encaixe "etiquetar" (migration 20260921010000). Prova o que vive no
-- banco — de onde vem a etiqueta é escolha da empresa, e a credencial dos
-- Correios não sai daqui:
--   - o contrato dos Correios não é lido por ninguém logado (GRANT revogado)
--   - a tela vê o conector escolhido, o cartão mascarado e o remetente, nunca o código de acesso
--   - quem não tem a Expedição não vê nada, e a empresa B não vê a A
--   - o pedido guarda de onde veio a etiqueta, e só dos três conectores
begin;
\ir _helpers.psql

select plan(8);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-etq-a', 'Etq A') as a,
       tests.create_tenant('pgtap-etq-b', 'Etq B') as b;

create temporary table u on commit drop as
select tests.create_user('expedicao@etq.test',  (select a from f)) as expedicao,
       tests.create_user('rh@etq.test',         (select a from f)) as rh,
       tests.create_user('expedicaob@etq.test', (select b from f)) as expedicao_b;
select tests.grant_module((select expedicao from u),   (select a from f), 'expedicao');
select tests.grant_module((select rh from u),          (select a from f), 'rh');
select tests.grant_module((select expedicao_b from u), (select b from f), 'expedicao');
grant select on f, u to authenticated;

-- Gravado pelo servidor (a edge function `shipping-label` faz isso com service_role).
insert into public.tenant_correios_credentials (tenant_id, usuario, codigo_acesso, cartao_postagem, contrato, codigo_servico, remetente)
select a, 'usuario-cws', 'SEGREDO-CORREIOS', '0067599079', '9912345678', '03220',
       '{"nome": "Minasflor", "cidade": "Belo Horizonte", "uf": "MG"}'::jsonb from f;
update public.tenants
   set settings = coalesce(settings, '{}'::jsonb) || '{"expedicao":{"label_provider":"correios"}}'::jsonb
 where id = (select a from f);

-- ───────────────────────────────────────────────────────────────────────────
-- O código de acesso não sai
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('expedicao@etq.test');
select throws_ok(
  $$ select codigo_acesso from public.tenant_correios_credentials $$,
  '42501', null,
  'usuario logado nao le o contrato dos Correios (GRANT revogado)'
);
select is(
  (select provider || '|' || correios_ligado::text || '|' || cartao_last4 || '|' || codigo_servico
     from public.crm_shipping_status()),
  'correios|true|9079|03220',
  'a tela ve o conector, se esta ligado, os 4 ultimos do cartao e o servico'
);
select is(
  (select remetente->>'nome' from public.crm_shipping_status()),
  'Minasflor',
  'e o remetente que vai na etiqueta'
);
select tests.clear_authentication();

select tests.authenticate_as('rh@etq.test');
select is((select count(*)::int from public.crm_shipping_status()), 0, 'quem nao tem a Expedicao nao ve nada');
select tests.clear_authentication();

select tests.authenticate_as('expedicaob@etq.test');
select is(
  (select provider || '|' || correios_ligado::text from public.crm_shipping_status()),
  'nenhum|false',
  'a empresa B nao ve o contrato da A, e o padrao dela e "nenhum"'
);
select tests.clear_authentication();

set local role anon;
select throws_ok(
  $$ select * from public.crm_shipping_status() $$,
  '42501', null,
  'sem login nem a funcao da tela e chamada'
);
reset role;

-- ───────────────────────────────────────────────────────────────────────────
-- O rastro da etiqueta no pedido
-- ───────────────────────────────────────────────────────────────────────────
create temporary table s on commit drop as
select gen_random_uuid() as contato, gen_random_uuid() as pedido;
grant select on s to authenticated;

insert into public.crm_contacts (id, tenant_id, name) select contato, (select a from f), 'Cliente' from s;
insert into public.crm_orders (id, tenant_id, number, contact_id, status)
select pedido, (select a from f), 1, contato, 'paid' from s;

select lives_ok(
  format($$ insert into public.exp_shipments (tenant_id, order_id, status, label_provider, label_url)
            values (%L::uuid, %L::uuid, 'picking', 'bling', 'https://exemplo/etiqueta.pdf') $$,
         (select a from f), (select pedido from s)),
  'a separacao guarda de onde veio a etiqueta'
);
select throws_ok(
  format($$ update public.exp_shipments set label_provider = 'melhor_envio' where order_id = %L::uuid $$, (select pedido from s)),
  '23514', null,
  'so os tres conectores do ADR-009 entram'
);

select * from finish();
rollback;

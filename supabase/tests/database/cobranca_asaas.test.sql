-- ENC-2: o encaixe "cobrar" com o Asaas (migration 20260922010000). Prova o que
-- vive no banco:
--   - a chave do Asaas não é lida por ninguém logado (a tabela de segredo já
--     tinha o GRANT revogado na CRM-2a; aqui se prova que continua)
--   - a tela vê provedor, padrão e os 4 últimos da chave, nunca a chave
--   - 'asaas' entra nas duas listas fechadas, e lixo continua fora
--   - a empresa B não vê o provedor da A
--   - o contato guarda o cliente do Asaas, e o pedido guarda como e para quando
begin;
\ir _helpers.psql

select plan(10);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-asa-a', 'Asa A') as a,
       tests.create_tenant('pgtap-asa-b', 'Asa B') as b;

create temporary table u on commit drop as
select tests.create_user('vendedor@asa.test',  (select a from f)) as vendedor,
       tests.create_user('rh@asa.test',        (select a from f)) as rh,
       tests.create_user('vendedorb@asa.test', (select b from f)) as vendedor_b;
select tests.grant_module((select vendedor from u),   (select a from f), 'crm');
select tests.grant_module((select rh from u),         (select a from f), 'rh');
select tests.grant_module((select vendedor_b from u), (select b from f), 'crm');
grant select on f, u to authenticated;

-- Gravado pelo servidor (a edge function `payment-credentials` faz isso com service_role).
insert into public.tenant_payment_credentials (tenant_id, provider, is_default, key_last4, secret_key, webhook_secret)
select a, 'asaas', true, 'zZ9x', '$aact_prod_SEGREDO_DO_ASAAS_zZ9x', 'token-do-webhook-com-32-caracteres-ok' from f;

-- ───────────────────────────────────────────────────────────────────────────
-- A chave não sai
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('vendedor@asa.test');
select throws_ok(
  $$ select secret_key from public.tenant_payment_credentials $$,
  '42501', null,
  'usuario logado nao le a chave do Asaas (GRANT revogado)'
);
select is(
  (select provider || '|' || is_default::text || '|' || key_last4
     from public.crm_payment_providers() where provider = 'asaas'),
  'asaas|true|zZ9x',
  'a tela ve o provedor, se e o padrao e os 4 ultimos da chave'
);
select tests.clear_authentication();

select tests.authenticate_as('rh@asa.test');
select is((select count(*)::int from public.crm_payment_providers()), 0, 'quem nao tem o CRM nao ve provedor nenhum');
select tests.clear_authentication();

select tests.authenticate_as('vendedorb@asa.test');
select is((select count(*)::int from public.crm_payment_providers()), 0, 'a empresa B nao ve o provedor da A');
select tests.clear_authentication();

set local role anon;
select throws_ok(
  $$ select * from public.crm_payment_providers() $$,
  '42501', null,
  'sem login nem a funcao da tela e chamada'
);
reset role;

-- ───────────────────────────────────────────────────────────────────────────
-- As listas fechadas aceitam o Asaas e continuam recusando lixo
-- ───────────────────────────────────────────────────────────────────────────
select throws_ok(
  format($$ insert into public.tenant_payment_credentials (tenant_id, provider, secret_key)
            values (%L::uuid, 'mercadopago', 'x') $$, (select b from f)),
  '23514', null,
  'provedor fora da lista nao entra'
);

create temporary table s on commit drop as
select gen_random_uuid() as contato, gen_random_uuid() as pedido;
grant select on s to authenticated;

insert into public.crm_contacts (id, tenant_id, name, document, asaas_customer_id)
select contato, (select a from f), 'Cliente', '12345678909', 'cus_000123' from s;
insert into public.crm_orders (id, tenant_id, number, contact_id, status, payment_provider, payment_method, payment_due_date, provider_order_id)
select pedido, (select a from f), 1, contato, 'sent', 'asaas', 'pix', date '2027-12-31', 'pay_000999' from s;

select is(
  (select asaas_customer_id from public.crm_contacts where id = (select contato from s)),
  'cus_000123',
  'o contato guarda o cliente do Asaas, para a segunda cobranca nao criar outro'
);
select is(
  (select payment_provider || '|' || payment_method || '|' || payment_due_date::text || '|' || provider_order_id
     from public.crm_orders where id = (select pedido from s)),
  'asaas|pix|2027-12-31|pay_000999',
  'o pedido guarda por onde cobrou, como, para quando e o id da cobranca'
);
select throws_ok(
  format($$ update public.crm_orders set payment_method = 'cheque' where id = %L::uuid $$, (select pedido from s)),
  '23514', null,
  'forma de pagamento fora da lista nao entra'
);
select lives_ok(
  format($$ update public.crm_orders set payment_provider = 'asaas' where id = %L::uuid $$, (select pedido from s)),
  'o Asaas e provedor valido no pedido'
);

select * from finish();
rollback;

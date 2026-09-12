-- CRM-2a: pagamento por empresa (migration 20260916010000). Prova:
--   - a chave do provedor não é lida por ninguém logado (nem por SELECT direto)
--   - a tela só vê provedor, padrão, alias e últimos 4 dígitos, da própria empresa
--   - quem não tem o Comercial não vê provedor nenhum
--   - uma credencial padrão por empresa
--   - avisos de pagamento processados também são só do servidor
begin;
\ir _helpers.psql

select plan(8);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-pag-a', 'Pag A') as a,
       tests.create_tenant('pgtap-pag-b', 'Pag B') as b;

create temporary table u on commit drop as
select tests.create_user('vendedor@pag.test', (select a from f)) as vendedor,
       tests.create_user('rh@pag.test',       (select a from f)) as rh,
       tests.create_user('vendedorb@pag.test', (select b from f)) as vendedor_b;
select tests.grant_module((select vendedor from u),   (select a from f), 'comercial');
select tests.grant_module((select rh from u),         (select a from f), 'rh');
select tests.grant_module((select vendedor_b from u), (select b from f), 'comercial');
grant select on f, u to authenticated;

-- Credenciais gravadas pelo servidor (a edge function `payment-credentials` faz isso com service_role).
insert into public.tenant_payment_credentials (tenant_id, provider, is_default, alias, key_last4, secret_key, secret_key_2, webhook_secret)
values ((select a from f), 'yampi', true, 'minha-loja', 'abcd', 'SEGREDO-YAMPI', 'TOKEN-YAMPI', 'HMAC-YAMPI'),
       ((select a from f), 'stripe', false, null, 'wxyz', 'sk_test_SEGREDO', null, 'whsec_SEGREDO');

-- ───────────────────────────────────────────────────────────────────────────
-- A chave nunca sai
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('vendedor@pag.test');
select throws_ok(
  $$ select secret_key from public.tenant_payment_credentials $$,
  '42501', null,
  'usuario logado nao le a tabela de chaves (sem GRANT)'
);
select throws_ok(
  $$ select * from public.crm_payment_events $$,
  '42501', null,
  'nem os avisos de pagamento processados'
);
select is(
  (select array_agg(provider || ':' || is_default::text || ':' || coalesce(alias, '-') || ':' || key_last4 || ':' || webhook_ok::text order by provider) from public.crm_payment_providers()),
  array['stripe:false:-:wxyz:true', 'yampi:true:minha-loja:abcd:true'],
  'a tela ve provedor, padrao, alias, ultimos 4 e se o webhook esta pronto'
);
select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'tenant_payment_credentials' and column_name in ('secret_key', 'secret_key_2', 'webhook_secret')),
  3,
  'os tres segredos vivem na tabela fechada (e nao na funcao da tela)'
);
select tests.clear_authentication();

select tests.authenticate_as('rh@pag.test');
select is(
  (select count(*)::int from public.crm_payment_providers()),
  0,
  'quem nao tem o Comercial nao ve provedor nenhum'
);
select tests.clear_authentication();

select tests.authenticate_as('vendedorb@pag.test');
select is(
  (select count(*)::int from public.crm_payment_providers()),
  0,
  'a empresa B nao ve os provedores da A'
);
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- Um padrão só; o pedido registra o provedor
-- ───────────────────────────────────────────────────────────────────────────
update public.tenant_payment_credentials set is_default = true where tenant_id = (select a from f) and provider = 'stripe';
select is(
  (select array_agg(provider order by provider) from public.tenant_payment_credentials where tenant_id = (select a from f) and is_default),
  array['stripe'],
  'marcar outro provedor como padrao desmarca o anterior'
);

select throws_ok(
  $$ insert into public.crm_orders (tenant_id, contact_id, payment_provider)
     select a, gen_random_uuid(), 'pix' from f $$,
  '23514', null,
  'o pedido so aceita provedor conhecido (stripe, yampi, manual)'
);

select * from finish();
rollback;

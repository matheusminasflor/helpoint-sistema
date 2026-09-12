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
select tests.grant_module((select vendedor from u),   (select a from f), 'crm');
select tests.grant_module((select rh from u),         (select a from f), 'rh');
select tests.grant_module((select vendedor_b from u), (select b from f), 'crm');
grant select on f, u to authenticated;

-- Credenciais gravadas pelo servidor (a edge function `payment-credentials` faz isso com service_role).
insert into public.tenant_payment_credentials (tenant_id, provider, is_default, alias, key_last4, secret_key, secret_key_2, webhook_secret)
values ((select a from f), 'yampi', true, 'minha-loja', 'abcd', 'SEGREDO-YAMPI', 'TOKEN-YAMPI', 'HMAC-YAMPI'),
       ((select a from f), 'stripe', false, null, 'wxyz', 'sk_test_SEGREDO', null, 'whsec_SEGREDO');

-- ───────────────────────────────────────────────────────────────────────────
-- A chave nunca sai
-- ───────────────────────────────────────────────────────────────────────────
-- Neste banco toda tabela nova nasce com ALL para authenticated (default
-- privileges): sem o REVOKE da migration, este SELECT devolveria zero linhas
-- sem erro (RLS sem policy) e o teste passaria em falso. 42501 = "permission
-- denied": o grant foi mesmo retirado.
select tests.authenticate_as('vendedor@pag.test');
select throws_ok(
  $$ select secret_key from public.tenant_payment_credentials $$,
  '42501', null,
  'usuario logado nao le a tabela de chaves (GRANT revogado, nao so RLS)'
);
select throws_ok(
  $$ select * from public.crm_payment_events $$,
  '42501', null,
  'nem os avisos de pagamento processados'
);
select is(
  (select array_agg(provider || ':' || is_default::text || ':' || coalesce(alias, '-') || ':' || key_last4 order by provider) from public.crm_payment_providers()),
  array['stripe:false:-:wxyz', 'yampi:true:minha-loja:abcd'],
  'a tela ve provedor, padrao, alias e ultimos 4'
);
select tests.clear_authentication();

-- Sem login (anon) a função da tela nem pode ser chamada.
set local role anon;
select throws_ok(
  $$ select * from public.crm_payment_providers() $$,
  '42501', null,
  'anon nao chama a funcao da tela'
);
reset role;

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

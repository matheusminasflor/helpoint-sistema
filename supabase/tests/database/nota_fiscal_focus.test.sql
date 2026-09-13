-- ENC-3: o encaixe "emitir nota" com a Focus NFe (migrations 20260925010000 e
-- 20260925020000). Prova o que vive no banco:
--   - o token da Focus não é lido por ninguém logado, e a tela nem tem coluna dele
--   - a tela vê provedor, ambiente, CNPJ e os 4 últimos do token
--   - quem não tem o CRM não vê nada, e a empresa B não vê a A
--   - `crm_set_config` só aceita dono/administrador, chave conhecida, e não
--     apaga a chave vizinha
--   - o pedido guarda o rastro da nota, e a referência é única por empresa
--   - o passo de fluxo "emitir nota" existe e exige um pedido
begin;
\ir _helpers.psql

select plan(15);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-nfe-a', 'NFe A') as a,
       tests.create_tenant('pgtap-nfe-b', 'NFe B') as b;

create temporary table u on commit drop as
select tests.create_user('vendedor@nfe.test',  (select a from f)) as vendedor,
       tests.create_user('rh@nfe.test',        (select a from f)) as rh,
       tests.create_user('admin@nfe.test',     (select a from f)) as admin,
       tests.create_user('vendedorb@nfe.test', (select b from f)) as vendedor_b;
select tests.grant_module((select vendedor from u),   (select a from f), 'crm');
select tests.grant_module((select rh from u),         (select a from f), 'rh');
select tests.grant_module((select admin from u),      (select a from f), 'crm');
select tests.grant_role((select admin from u), 'admin');
select tests.grant_module((select vendedor_b from u), (select b from f), 'crm');
grant select on f, u to authenticated;

-- Gravado pelo servidor (a edge function `nfe-focus` faz isso com service_role).
insert into public.tenant_focusnfe_connections (tenant_id, token, ambiente, cnpj_emitente, serie, hook_id, hook_secret)
select a, 'TOKEN-SECRETO-DA-FOCUS-9x7K', 'producao', '12345678000199', 2, 'Vj5rmkBq', 'SEGREDO-DO-AVISO-DA-FOCUS' from f;
update public.tenants
   set settings = coalesce(settings, '{}'::jsonb) || '{"crm":{"nfe_provider":"focusnfe","outra":"fica"}}'::jsonb
 where id = (select a from f);

-- ───────────────────────────────────────────────────────────────────────────
-- O token não sai
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('vendedor@nfe.test');
select throws_ok(
  $$ select token from public.tenant_focusnfe_connections $$,
  '42501', null,
  'usuario logado nao le o token da Focus (GRANT revogado)'
);
select is(
  (select provider || '|' || focus_ligado::text || '|' || token_last4 || '|' || ambiente || '|' || cnpj_emitente || '|' || serie::text
     from public.crm_nfe_status()),
  'focusnfe|true|9x7K|producao|12345678000199|2',
  'a tela ve o conector, se esta ligado, os 4 ultimos do token, o ambiente, o CNPJ e a serie'
);
-- O `is()` acima passaria mesmo se a funcao devolvesse o token numa coluna a
-- mais. Esta asercao prova que ela nao existe: 42703 = coluna ausente.
select throws_ok(
  $$ select token from public.crm_nfe_status() $$,
  '42703', null,
  'a funcao da tela nao tem coluna de token'
);
-- O segredo do aviso (ENC-3b) mora na mesma tabela e tem o mesmo cuidado.
select throws_ok(
  $$ select hook_secret from public.crm_nfe_status() $$,
  '42703', null,
  'nem coluna do segredo do aviso'
);
select tests.clear_authentication();

select tests.authenticate_as('rh@nfe.test');
select is((select count(*)::int from public.crm_nfe_status()), 0, 'quem nao tem o CRM nao ve nada');
select tests.clear_authentication();

select tests.authenticate_as('vendedorb@nfe.test');
select is(
  (select provider || '|' || focus_ligado::text from public.crm_nfe_status()),
  'nenhum|false',
  'a empresa B nao ve a conexao da A, e o padrao dela e "nenhum"'
);
select tests.clear_authentication();

set local role anon;
select throws_ok(
  $$ select * from public.crm_nfe_status() $$,
  '42501', null,
  'sem login nem a funcao da tela e chamada'
);
reset role;

-- ───────────────────────────────────────────────────────────────────────────
-- Trocar o conector: só quem manda, e sem derrubar a chave vizinha
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('vendedor@nfe.test');
select throws_ok(
  $$ select public.crm_set_config('nfe_provider', '"bling"'::jsonb) $$,
  '42501', null,
  'quem nao e dono nem administrador nao troca o conector da nota'
);
select tests.clear_authentication();

select tests.authenticate_as('admin@nfe.test');
select throws_ok(
  $$ select public.crm_set_config('qualquer_coisa', '"x"'::jsonb) $$,
  '22023', null,
  'chave de configuracao desconhecida e recusada'
);
select lives_ok(
  $$ select public.crm_set_config('nfe_provider', '"bling"'::jsonb) $$,
  'o administrador troca o conector da nota'
);
select tests.clear_authentication();

select is(
  (select (settings #>> '{crm,nfe_provider}') || '|' || (settings #>> '{crm,outra}')
     from public.tenants where id = (select a from f)),
  'bling|fica',
  'gravar o conector nao apaga o que ja estava em settings.crm'
);

-- ───────────────────────────────────────────────────────────────────────────
-- O rastro da nota no pedido
-- ───────────────────────────────────────────────────────────────────────────
create temporary table s on commit drop as
select gen_random_uuid() as contato, gen_random_uuid() as pedido, gen_random_uuid() as pedido2;

insert into public.crm_contacts (id, tenant_id, name, document, state_registration)
select contato, (select a from f), 'Cliente', '12345678909', '1234567' from s;
insert into public.crm_orders (id, tenant_id, number, contact_id, status, nfe_provider, nfe_status, nfe_ref, nfe_number)
select pedido, (select a from f), 1, contato, 'paid', 'focusnfe', 'authorized', 'ref-unica', '77' from s;

select is(
  (select nfe_provider || '|' || nfe_status || '|' || nfe_ref || '|' || nfe_number
     from public.crm_orders where id = (select pedido from s)),
  'focusnfe|authorized|ref-unica|77',
  'o pedido guarda por onde emitiu, a situacao, a referencia e o numero da nota'
);
-- 'inventado' já era recusado pela constraint antiga; o que a lista nova
-- acrescenta são os estados da Focus, e o insert acima já grava 'authorized'.
-- O CHECK que nasceu nesta leva é o do provedor.
select throws_ok(
  format($$ update public.crm_orders set nfe_provider = 'sistema_qualquer' where id = %L::uuid $$, (select pedido from s)),
  '23514', null,
  'provedor de nota fora da lista nao entra'
);
-- A referência é o id do pedido, então esta é a rede de baixo: se algum dia o
-- código deixar de derivar a referência do pedido, dois pedidos não podem
-- dividir a mesma — seria a mesma nota contada duas vezes.
insert into public.crm_orders (id, tenant_id, number, contact_id, status)
select pedido2, (select a from f), 2, contato, 'paid' from s;
select throws_ok(
  format($$ update public.crm_orders set nfe_ref = 'ref-unica' where id = %L::uuid $$, (select pedido2 from s)),
  '23505', null,
  'dois pedidos da mesma empresa nao dividem a referencia da nota'
);

-- ───────────────────────────────────────────────────────────────────────────
-- O passo de fluxo "emitir nota"
-- ───────────────────────────────────────────────────────────────────────────
select lives_ok(
  $$ insert into public.automation_workflows (tenant_id, module, name, status, trigger, steps, created_by)
     select a, 'crm', 'Pedido pago → nota', 'active',
            '{"kind":"record_updated","entity":"crm_order","fields":["status"],"next":["s1"]}'::jsonb,
            '[{"id":"s1","kind":"emitir_nfe","config":{},"next":[]}]'::jsonb,
            (select admin from u) from f $$,
  'o passo "emitir nota fiscal" e aceito num fluxo de pedido'
);

select * from finish();
rollback;

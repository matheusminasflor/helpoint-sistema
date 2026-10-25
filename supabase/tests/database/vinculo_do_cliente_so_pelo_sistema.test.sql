-- O vínculo do cadastro de cliente só muda pelo sistema (migration 20270203010000).
--
-- A brecha: o cliente logado gravava `vinculo_confirmado = true` no próprio cadastro, apontando para qualquer
-- cliente do Comercial da empresa. O Portal do Distribuidor (etapa 6) mostra notas, estoque e preço pelo vínculo:
-- sem esta trava, bastava escolher um código. A corrente que precisa continuar de pé é a da função
-- `sac_vincular_ao_cliente`, que escreve no mesmo cadastro em nome do cliente — por isso ela é exercida aqui.
begin;
\ir _helpers.psql

select plan(7);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-vinc', 'Vinculo', false) as a;

insert into public.com_clientes (tenant_id, codigo, razao_social, documento, email, ativo, origem)
values ((select a from f), 'C-9', 'DISTRIBUIDOR ALHEIO LTDA', '08319138000160', 'dono@alheio.test', true, 'cadastro'),
       ((select a from f), 'C-8', 'O MEU LTDA', '11222333000181', 'eu@meu.test', true, 'cadastro');

create temporary table u on commit drop as
select tests.create_customer('intruso@pgtap.test', (select a from f)) as intruso;
grant select on f, u to authenticated;

select tests.authenticate_as('intruso@pgtap.test');

select throws_ok(
  $$ update public.customer_profiles set com_cliente_codigo = 'C-9', vinculo_confirmado = true $$,
  '42501', null,
  'o cliente NAO se declara ligado a outro cliente do Comercial'
);

select throws_ok(
  $$ update public.customer_profiles set com_cliente_codigo = 'C-9' $$,
  '42501', null,
  'nem aponta o codigo sem confirmar'
);

select lives_ok(
  $$ update public.customer_profiles set phone = '31 98888-0000' $$,
  'mas continua editando o proprio telefone'
);

-- O cadastro novo, como o PostgREST manda (com returning — regra 11): o vínculo pedido some.
select tests.clear_authentication();
create temporary table u2 on commit drop as
select gen_random_uuid() as novo;
-- Só o login (como o GoTrue cria): o cadastro é o que o teste insere. Tokens '' e nunca NULL (regra 2).
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at)
select novo, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'novo@meu.test', '', now(),
  '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"customer":true}'::jsonb, now(), now()
from u2;
grant select on u2 to authenticated;
select tests.authenticate_as('novo@meu.test');

select lives_ok(
  $$ insert into public.customer_profiles (user_id, tenant_id, full_name, email, cnpj, com_cliente_codigo, vinculo_confirmado)
     select novo, (select a from f), 'Novo', 'eu@meu.test', '11222333000181', 'C-9', true from u2
     returning id $$,
  'o cliente se cadastra mesmo mandando o vinculo junto'
);

select is(
  (select row(com_cliente_codigo, vinculo_confirmado)::text from public.customer_profiles),
  '(,f)',
  'e o cadastro nasce sem vinculo nenhum'
);

-- A corrente: a função liga pelo e-mail confirmado que constava no cliente C-8.
select is(
  public.sac_vincular_ao_cliente() ->> 'situacao',
  'ligado',
  'sac_vincular_ao_cliente continua ligando o cadastro'
);

select is(
  (select row(com_cliente_codigo, vinculo_confirmado)::text from public.customer_profiles),
  '(C-8,t)',
  'e o vinculo gravou o cliente certo'
);

select * from finish();
rollback;

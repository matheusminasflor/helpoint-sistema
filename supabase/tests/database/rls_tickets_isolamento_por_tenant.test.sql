-- O isolamento entre tenants é a espinha de segurança deste sistema: o
-- navegador fala direto com o Postgres, então quem separa uma empresa da outra
-- é o RLS, e nada mais. Este arquivo prova que ele separa — em leitura e em
-- escrita — para `tickets`, a tabela mais movimentada do sistema.
--
-- Rode com:  npx supabase test db --linked

begin;
\ir _helpers.psql

select plan(7);

-- ───────────────────────────────────────────────────────────────────────────
-- Fixtures: duas empresas, um usuário em cada, um chamado em cada.
-- Criadas com o papel do runner, antes de qualquer autenticação.
-- ───────────────────────────────────────────────────────────────────────────
create temporary table fixt on commit drop as
select tests.create_tenant('pgtap-alfa', 'Alfa pgTAP')  as tenant_alfa,
       tests.create_tenant('pgtap-beta', 'Beta pgTAP')  as tenant_beta;

create temporary table usr on commit drop as
select tests.create_user('alfa@pgtap.test', (select tenant_alfa from fixt)) as uid_alfa,
       tests.create_user('beta@pgtap.test', (select tenant_beta from fixt)) as uid_beta;

insert into public.tickets (tenant_id, title, description, requester_id)
select tenant_alfa, 'Chamado da Alfa', 'descricao', uid_alfa from fixt, usr;

insert into public.tickets (tenant_id, title, description, requester_id)
select tenant_beta, 'Chamado da Beta', 'descricao', uid_beta from fixt, usr;

-- ───────────────────────────────────────────────────────────────────────────
-- Como a Alfa
-- ───────────────────────────────────────────────────────────────────────────
select is(
  tests.authenticate_as('alfa@pgtap.test'),
  (select uid_alfa from usr),
  'authenticate_as devolve o usuario que passou a valer'
);

select is(
  auth.uid(),
  (select uid_alfa from usr),
  'auth.uid() enxerga a identidade simulada'
);

select is(
  public.get_user_tenant_id(),
  (select tenant_alfa from fixt),
  'get_user_tenant_id() resolve o tenant pelo profile'
);

select is(
  (select count(*) from public.tickets)::int,
  1,
  'a Alfa ve um chamado, o seu — e nao o da Beta'
);

select is(
  (select title from public.tickets),
  'Chamado da Alfa',
  'e o que ela ve e mesmo o dela'
);

-- Escrita cruzada. Há duas trancas na porta, e a ordem importa para quem lê o
-- erro: o trigger `validate_tenant_insert` dispara ANTES do `WITH CHECK` da
-- policy de INSERT (`tenant_id = get_user_tenant_id() and requester_id =
-- auth.uid()`), então o que chega ao cliente é P0001, não o 42501 do RLS.
-- Fixamos o P0001 de propósito: se um dia ele virar 42501, a tranca de fora
-- caiu e vale saber disso, mesmo com o RLS ainda segurando atrás.
select throws_ok(
  format(
    $q$insert into public.tickets (tenant_id, title, description, requester_id)
       values (%L, 'Invasao', 'descricao', %L)$q$,
    (select tenant_beta from fixt),
    (select uid_alfa from usr)
  ),
  'P0001',
  'tenant_id mismatch: cannot insert data for another tenant',
  'a Alfa nao consegue criar chamado dentro da Beta'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Como a Beta: a simetria importa. Um teste que passa porque ninguem ve nada
-- passaria igual com o banco vazio.
-- ───────────────────────────────────────────────────────────────────────────
select tests.clear_authentication();
select tests.authenticate_as('beta@pgtap.test');

select is(
  (select title from public.tickets),
  'Chamado da Beta',
  'a Beta ve o proprio chamado, e so ele'
);

select * from finish();
rollback;

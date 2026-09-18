-- ADR-010: o Helpoint deixou de ser multi-empresa por venda — só a Minasflor
-- cria conta hoje, e só o service_role cria empresa, no seed da implantação.
-- Este arquivo prova que a trava é do banco, não só da tela: a função que
-- criava empresa foi removida e o INSERT em `tenants` foi revogado de quem
-- está logado. Não usa índice único (reprovaria a suíte de isolamento, que
-- cria duas empresas de propósito) — a trava é o DROP FUNCTION + REVOKE da
-- migration 20261010010000_helpoint_uma_empresa.sql.
--
-- O que esta trava NÃO fecha: conta nova. Ela fecha o nascimento de EMPRESA
-- nova, não de CONTA nova. Se o cadastro por e-mail estiver ligado no painel
-- do Supabase, `supabase.auth.signUp` ainda atende chamada vinda do
-- navegador — a conta nasceria sem `profiles` e sem `tenant_id`, caindo em
-- `/conta-sem-empresa`, sem enxergar dado nenhum (é o mesmo caminho de quem
-- é convidado antes de aceitar o convite). Desligar o cadastro por e-mail é
-- ajuste do painel do Supabase, não deste banco — ação do dono, fora do
-- alcance de uma migration. Registrado para quem ler este teste não achar
-- que a porta está fechada dos dois lados.
--
-- Rode com:  npx supabase test db --linked

begin;
\ir _helpers.psql

select plan(5);

-- ───────────────────────────────────────────────────────────────────────────
-- Fixtures: duas empresas, um usuário em cada. Criadas com o papel do
-- runner, antes de qualquer autenticação.
-- ───────────────────────────────────────────────────────────────────────────
create temporary table fixt on commit drop as
select tests.create_tenant('pgtap-so-alfa', 'Alfa Uma Empresa') as tenant_alfa,
       tests.create_tenant('pgtap-so-beta', 'Beta Uma Empresa') as tenant_beta;

create temporary table usr on commit drop as
select tests.create_user('alfa@pgtap-uma-empresa.test', (select tenant_alfa from fixt)) as uid_alfa,
       tests.create_user('beta@pgtap-uma-empresa.test', (select tenant_beta from fixt)) as uid_beta;

grant select on fixt, usr to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. A porta de nascer empresa não existe mais no banco
-- ───────────────────────────────────────────────────────────────────────────
select hasnt_function(
  'public', 'claim_new_tenant',
  'claim_new_tenant foi removida (ADR-010): não nasce empresa pelo sistema'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Quem está logado não consegue inserir uma segunda empresa
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('alfa@pgtap-uma-empresa.test');

select throws_ok(
  $$insert into public.tenants (name, slug) values ('Empresa Pirata', 'pirata')$$,
  '42501', null,
  'authenticated nao consegue criar uma segunda empresa'
);

-- Sem nenhuma policy de INSERT em `tenants`, o `throws_ok` acima já reprovaria
-- o INSERT mesmo que o REVOKE desta migration nunca tivesse rodado — ele
-- prova a ausência de policy, que já era verdade antes da 20261010010000, não
-- a trava que ela acrescentou. Esta asserção pinça o REVOKE em si.
select is(
  has_table_privilege('authenticated', 'public.tenants', 'insert'),
  false,
  'authenticated nao tem mais o privilegio de INSERT em tenants (ADR-010)'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Nem sequestrar a de outra empresa por UPDATE cruzado.
-- Regra 12 do pgTAP: UPDATE barrado por policy não levanta erro, filtra a
-- linha — por isso se confere o valor, do lado de quem foi "atacada".
-- ───────────────────────────────────────────────────────────────────────────
update public.tenants set name = 'Sequestrada' where id = (select tenant_beta from fixt);

select tests.clear_authentication();
select tests.authenticate_as('beta@pgtap-uma-empresa.test');

select is(
  (select name from public.tenants where id = (select tenant_beta from fixt)),
  'Beta Uma Empresa',
  'a Beta mantem o proprio nome: a Alfa nao conseguiu sequestrar via UPDATE'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Cada empresa continua enxergando só a si mesma em `tenants`
-- ───────────────────────────────────────────────────────────────────────────
select tests.clear_authentication();
select tests.authenticate_as('alfa@pgtap-uma-empresa.test');

select is(
  (select count(*) from public.tenants),
  1::bigint,
  'a empresa enxerga so a si mesma'
);

select * from finish();
rollback;

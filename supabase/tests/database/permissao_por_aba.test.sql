-- PERMISSÃO POR ABA (migration 20261116020000, LEVA P parte 7)
--
-- O dono escolheu o "Jeito 1" (2026-09-29): no perfil de acesso, cada aba da configuração de um
-- setor tem ABRIR e ALTERAR. O banco confere "Alterar" da aba em todas as tabelas que ela grava.
--
--   1 — empresa nova: a chave única `settings` do perfil Gestor vira uma chave por aba;
--   2 e 3 — um perfil que só altera "Empresas" do RH cria empresa e NÃO mexe na folha;
--   4 — o Gestor do RH altera a folha;
--   5 — o Operador do RH não cria departamento;
--   6 e 7 — produto do SAC: era aberto a qualquer pessoa da empresa; agora só quem altera a aba;
--   8 e 9 — os alertas da TI (que moram nas configurações da empresa) seguem a aba Alertas;
--   10 — a lista de vendedores do Comercial deixou de ser alterável por qualquer um do Comercial.
begin;
\ir _helpers.psql

select plan(10);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-por-aba', 'Por Aba', false) as a;

create temporary table u on commit drop as
select tests.create_user('empresas@aba.test', (select a from f)) as so_empresas,
       tests.create_user('gestor-rh@aba.test', (select a from f)) as gestor_rh,
       tests.create_user('op-rh@aba.test', (select a from f)) as op_rh,
       tests.create_user('gestor-q@aba.test', (select a from f)) as gestor_q,
       tests.create_user('gestor-ti@aba.test', (select a from f)) as gestor_ti,
       tests.create_user('comum@aba.test', (select a from f)) as comum;

-- Um perfil feito à mão, como o dono faria na tela: só "Empresas" do RH, abrir e alterar.
insert into public.access_profiles (tenant_id, department, name, is_default, permissions)
values ((select a from f), 'rh', 'Só empresas', false, '{"config_empresas": {"view": true, "edit": true}}'::jsonb);

select tests.grant_profile((select so_empresas from u), (select a from f), 'rh', 'Só empresas');
select tests.grant_profile((select gestor_rh from u), (select a from f), 'rh', 'Gestor');
select tests.grant_profile((select op_rh from u), (select a from f), 'rh', 'Operador');
select tests.grant_profile((select gestor_q from u), (select a from f), 'qualidade', 'Gestor');
select tests.grant_profile((select gestor_ti from u), (select a from f), 'ti', 'Gestor');
select tests.grant_module((select comum from u), (select a from f), 'comercial');
grant select on f, u to authenticated;

-- 1. A semente escreveu `settings`; o trigger converteu.
select is(
  (select array[(permissions -> 'config_folha' ->> 'edit'), (permissions ? 'settings')::text]
     from public.access_profiles where tenant_id = (select a from f) and department = 'rh' and name = 'Gestor'),
  array['true', 'false'],
  'empresa nova: o Gestor nasce com uma chave por aba, e sem a chave unica antiga'
);

select tests.authenticate_as('empresas@aba.test');
select lives_ok(
  format($$ insert into public.rh_companies (tenant_id, code, name) values (%L, 'MF', 'Minasflor') returning id $$, (select a from f)),
  'quem altera a aba Empresas cria empresa');
select throws_ok(
  format($$ insert into public.rh_payroll_settings (tenant_id) values (%L) returning id $$, (select a from f)),
  '42501', null, 'e nao mexe nos parametros da folha');
select tests.clear_authentication();

select tests.authenticate_as('gestor-rh@aba.test');
select lives_ok(
  format($$ insert into public.rh_payroll_settings (tenant_id) values (%L) returning id $$, (select a from f)),
  'o Gestor do RH altera os parametros da folha');
select tests.clear_authentication();

select tests.authenticate_as('op-rh@aba.test');
select throws_ok(
  format($$ insert into public.rh_departments_catalog (tenant_id, name) values (%L, 'Expedição') returning id $$, (select a from f)),
  '42501', null, 'o Operador do RH nao cria departamento');
select tests.clear_authentication();

select tests.authenticate_as('comum@aba.test');
select throws_ok(
  format($$ insert into public.sac_products (tenant_id, name) values (%L, 'Xampu') returning id $$, (select a from f)),
  '42501', null, 'qualquer pessoa da empresa ja nao cria produto do SAC');
select throws_ok(
  $$ select public.salvar_configuracao_da_aba('alerts', '{"licenseAlertDays": 7}'::jsonb) $$,
  '42501', null, 'quem nao altera a aba Alertas nao muda os alertas da TI');
select throws_ok(
  format($$ insert into public.com_vendedores (tenant_id, codigo, nome) values (%L, '99', 'Fulana') returning id $$, (select a from f)),
  '42501', null, 'quem so tem o Comercial nao muda a lista de vendedores');
select tests.clear_authentication();

select tests.authenticate_as('gestor-q@aba.test');
select lives_ok(
  format($$ insert into public.sac_products (tenant_id, name) values (%L, 'Xampu') returning id $$, (select a from f)),
  'o Gestor da Qualidade cria produto do SAC');
select tests.clear_authentication();

select tests.authenticate_as('gestor-ti@aba.test');
select public.salvar_configuracao_da_aba('alerts', '{"licenseAlertDays": 7}'::jsonb);
select tests.clear_authentication();
select is(
  (select (settings -> 'alerts' ->> 'licenseAlertDays') from public.tenants where id = (select a from f)),
  '7',
  'o Gestor da TI muda os alertas, e so a parte dos alertas'
);

select * from finish();
rollback;

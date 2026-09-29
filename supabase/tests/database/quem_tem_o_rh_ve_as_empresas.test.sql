-- QUEM TEM O MÓDULO RH VÊ AS EMPRESAS (migration 20261108010000)
--
-- Decisão do dono em 2026-09-27, e o defeito que ela fecha: `rh_companies` exigia
-- cargo de supervisor para LER, enquanto `rh_employee_profiles` — tabela vizinha do
-- mesmo módulo — aceita `has_rh_access()`. Quem recebia o módulo RH lia a ficha do
-- colaborador e não lia a lista de empresas: seletor vazio, cartão "Empresas" em 0,
-- e cadastrar colaborador impossível, porque cadastrar exige escolher a empresa.
--
-- A ASSERÇÃO QUE IMPORTA É A 2: as duas tabelas do mesmo módulo respondendo à mesma
-- pessoa. Testar só `rh_companies` provaria que a policy nova funciona, não que a
-- incoerência acabou — e era a incoerência que quebrava a tela.
--
-- E a metade que NÃO abriu tem quatro asserções (5 a 8), porque abrir leitura sem
-- provar que a escrita continuou fechada é como não ter mexido em nada. Regra 12 do
-- pgTAP: UPDATE e DELETE barrados por policy não levantam erro — a linha é filtrada
-- e o comando afeta zero linhas. Só o INSERT levanta (42501, do WITH CHECK).
begin;
\ir _helpers.psql

select plan(9);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-rhemp', 'RH Empresas', false) as a,
       tests.create_tenant('pgtap-rhout', 'RH Outra', false)    as b;

create temporary table u on commit drop as
select tests.create_user('domodulo@rhemp.test', (select a from f)) as do_modulo,
       tests.create_user('nada@rhemp.test',     (select a from f)) as nada,
       tests.create_user('chefe@rhemp.test',    (select a from f)) as chefe;

-- `do_modulo` tem o módulo e NENHUM cargo: cargo de gestor entraria por
-- `is_supervisor_or_higher` dentro de `has_rh_access` e o teste mediria a porta
-- antiga, não a nova.
select tests.grant_module((select do_modulo from u), (select a from f), 'rh');
select tests.grant_role((select chefe from u), 'manager');
-- Desde a LEVA P, parte 7, alterar empresas é a aba "Empresas" do perfil do RH, não o cargo.
select tests.grant_profile((select chefe from u), (select a from f), 'rh', 'Gestor');

insert into public.rh_companies (tenant_id, code, name)
values ((select a from f), 'MF', 'Minasflor Teste'),
       ((select b from f), 'XX', 'Empresa de Outra');

-- Um colaborador na empresa de teste, para a asserção 2 comparar as duas tabelas.
insert into public.rh_employee_profiles (tenant_id, user_id, full_name, status)
values ((select a from f), (select nada from u), 'Colaborador Teste', 'ativo');

-- ── Abriu ────────────────────────────────────────────────────────────────────
select tests.authenticate_as('domodulo@rhemp.test');

select is(
  (select count(*)::int from public.rh_companies),
  1,
  'quem tem o modulo RH le a lista de empresas'
);

select is(
  (select count(*)::int from public.rh_employee_profiles) > 0
    and (select count(*)::int from public.rh_companies) > 0,
  true,
  'a mesma pessoa le as DUAS tabelas do modulo: era a incoerencia que quebrava a tela'
);

-- ── Não quebrou: a escrita continua de supervisor ────────────────────────────
-- INSERT levanta porque o WITH CHECK reprova (regra 12).
select throws_ok(
  $$ insert into public.rh_companies (tenant_id, code, name)
     values (public.get_user_tenant_id(), 'NV', 'Nao Deveria Nascer')
     returning id $$,
  '42501',
  null,
  'modulo RH NAO cria empresa'
);

-- UPDATE e DELETE não levantam: contam zero (regra 12).
with t as (
  update public.rh_companies set name = 'Renomeada Indevidamente'
   where code = 'MF' returning 1
)
select is((select count(*)::int from t), 0, 'modulo RH NAO renomeia empresa');

with t as (
  delete from public.rh_companies where code = 'MF' returning 1
)
select is((select count(*)::int from t), 0, 'modulo RH NAO apaga empresa');

select is(
  (select name from public.rh_companies where code = 'MF'),
  'Minasflor Teste',
  'o nome continua o mesmo depois das duas tentativas'
);

select tests.clear_authentication();

-- ── Quem não tem nada continua sem ver ───────────────────────────────────────
select tests.authenticate_as('nada@rhemp.test');
select is(
  (select count(*)::int from public.rh_companies),
  0,
  'sem o modulo e sem cargo, nenhuma empresa aparece'
);
select tests.clear_authentication();

-- ── O gerente com o perfil Gestor do RH: le e escreve ──────────────────────────
select tests.authenticate_as('chefe@rhemp.test');

with t as (
  update public.rh_companies set name = 'Minasflor Renomeada'
   where code = 'MF' returning 1
)
select is((select count(*)::int from t), 1, 'o Gestor do RH renomeia empresa');

select is(
  (select count(*)::int from public.rh_companies),
  1,
  'e nao ve a empresa da outra empresa: o isolamento continua'
);

select tests.clear_authentication();

select * from finish();
rollback;

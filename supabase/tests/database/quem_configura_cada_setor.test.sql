-- QUEM CONFIGURA CADA SETOR (migration 20261116010000, LEVA P parte 6)
--
-- O dono, 2026-09-29: "ter em permissões de acesso a opção de marcar quem tem acesso a todas as
-- configurações de cada setor", e "quem tiver acesso apenas de um setor, só aquele".
-- Antes: quem mudava a configuração era decidido pelo cargo, de uma vez para todos os setores.
--
--   1 e 2 — Gestor do RH (sem cargo) cria categoria do RH, e NÃO a da TI;
--   3 — e cria campo no formulário de uma categoria do RH;
--   4 e 5 — dá prazo próprio ao RH, e não mexe no padrão da empresa;
--   6 — Operador do RH (sem a chave) não cria categoria do RH;
--   7 e 8 — gerente de cargo SEM o perfil do setor não configura mais — é a mudança;
--   9 — admin configura qualquer setor.
-- As escritas levam RETURNING, como o PostgREST manda (regra 11).
begin;
\ir _helpers.psql

select plan(13);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-config-setor', 'Config Setor', false) as a;

create temporary table u on commit drop as
select tests.create_user('gestor-rh@cfg.test', (select a from f)) as gestor_rh,
       tests.create_user('op-rh@cfg.test',     (select a from f)) as op_rh,
       tests.create_user('gerente@cfg.test',   (select a from f)) as gerente,
       tests.create_user('admin@cfg.test',     (select a from f)) as admin;

select tests.grant_profile((select gestor_rh from u), (select a from f), 'rh', 'Gestor');
select tests.grant_profile((select op_rh from u),     (select a from f), 'rh', 'Operador');
select tests.grant_role((select gerente from u), 'manager');
select tests.grant_role((select admin from u), 'admin');
grant select on f, u to authenticated;

-- Uma categoria do RH, para os formulários (gravada antes de autenticar, como fixture).
insert into public.ti_categories (tenant_id, module, name) values ((select a from f), 'rh', 'Férias');
create temporary table c on commit drop as
select id as rh from public.ti_categories where tenant_id = (select a from f) and module = 'rh' and name = 'Férias';
grant select on c to authenticated;

select tests.authenticate_as('gestor-rh@cfg.test');
select lives_ok(
  format($$ insert into public.ti_categories (tenant_id, module, name) values (%L, 'rh', 'Atestado') returning id $$, (select a from f)),
  'Gestor do RH cria categoria do RH');
select throws_ok(
  format($$ insert into public.ti_categories (tenant_id, module, name) values (%L, 'tickets', 'Impressora') returning id $$, (select a from f)),
  '42501', null, 'Gestor do RH nao cria categoria da TI');
select lives_ok(
  format($$ insert into public.ticket_form_fields (tenant_id, category_id, label, field_type) values (%L, %L, 'Período', 'text') returning id $$,
         (select a from f), (select rh from c)),
  'Gestor do RH cria campo no formulario de categoria do RH');
select lives_ok(
  format($$ insert into public.sla_policies (tenant_id, module, name, priority, first_response_time, resolution_time)
            values (%L, 'rh', 'RH média', 'medium', 30, 60) returning id $$, (select a from f)),
  'Gestor do RH da prazo proprio ao RH');
-- UPDATE e DELETE barrados não levantam erro: conta as linhas de cada caso (regra 12).
create temporary table alteradas (caso text, n bigint) on commit drop;
grant insert, select on alteradas to authenticated;
with t as (
  update public.sla_policies set resolution_time = 1
   where tenant_id = (select a from f) and module is null and priority = 'medium'
  returning id
) insert into alteradas select 'padrao', count(*) from t;
select is((select n from alteradas where caso = 'padrao'), 0::bigint, 'Gestor do RH nao mexe no prazo padrao da empresa');

-- A corrente inteira da aba Chamados, não só o INSERT (lição 8): renomear e apagar categoria do
-- setor, e "Voltar ao padrão" (apagar o prazo do setor). Apagar categoria era de `is_diretor`.
with t as (
  update public.ti_categories set name = 'Férias e folgas' where id = (select rh from c) returning id
) insert into alteradas select 'renomeia', count(*) from t;
select is((select n from alteradas where caso = 'renomeia'), 1::bigint, 'Gestor do RH renomeia categoria do RH');
with t as (
  delete from public.ti_categories
   where tenant_id = (select a from f) and module = 'rh' and name = 'Atestado' returning id
) insert into alteradas select 'apaga', count(*) from t;
select is((select n from alteradas where caso = 'apaga'), 1::bigint, 'Gestor do RH apaga categoria do RH');
with t as (
  delete from public.sla_policies
   where tenant_id = (select a from f) and module = 'rh' and priority = 'medium' returning id
) insert into alteradas select 'volta', count(*) from t;
select is((select n from alteradas where caso = 'volta'), 1::bigint, 'Gestor do RH volta o prazo do RH ao padrao');
select tests.clear_authentication();

select tests.authenticate_as('op-rh@cfg.test');
select throws_ok(
  format($$ insert into public.ti_categories (tenant_id, module, name) values (%L, 'rh', 'Outra') returning id $$, (select a from f)),
  '42501', null, 'Operador do RH, sem a chave de configuracao, nao cria categoria');
select tests.clear_authentication();

select tests.authenticate_as('gerente@cfg.test');
select throws_ok(
  format($$ insert into public.ti_categories (tenant_id, module, name) values (%L, 'rh', 'Do gerente') returning id $$, (select a from f)),
  '42501', null, 'gerente de cargo sem o perfil do setor nao configura o setor');
select throws_ok(
  format($$ insert into public.ticket_form_fields (tenant_id, category_id, label, field_type) values (%L, %L, 'Campo', 'text') returning id $$,
         (select a from f), (select rh from c)),
  '42501', null, 'nem o formulario de uma categoria do setor');
with t as (
  delete from public.ti_categories where id = (select rh from c) returning id
) insert into alteradas select 'gerente apaga', count(*) from t;
select is((select n from alteradas where caso = 'gerente apaga'), 0::bigint,
  'nem apaga categoria do setor (a policy filtra: zero linhas, sem erro)');
select tests.clear_authentication();

select tests.authenticate_as('admin@cfg.test');
select lives_ok(
  format($$ insert into public.ti_categories (tenant_id, module, name) values (%L, 'tickets', 'Categoria do admin') returning id $$, (select a from f)),
  'admin configura qualquer setor');
select tests.clear_authentication();

select * from finish();
rollback;

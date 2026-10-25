-- AS PERMISSÕES QUE FALTAVAM (migration 20270130030000; proposta "Helpoint no dia a dia", etapa 0b).
begin;
\ir _helpers.psql

select plan(9);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-faltavam', 'Faltavam', false) as a;
create temporary table u on commit drop as
select tests.create_user('escreve@faltavam.test', (select a from f)) as escreve,
       tests.create_user('assina@faltavam.test', (select a from f)) as assina,
       tests.create_user('sem@faltavam.test', (select a from f)) as sem;
insert into public.access_profiles (tenant_id, department, name, permissions)
select a, 'qualidade', 'Escreve laudo', '{"sacs": {"view": true}, "technical_reports": {"view": true, "edit": true}}'::jsonb from f
union all
select a, 'qualidade', 'Sem SAC', '{"pops": {"view": true}}'::jsonb from f;
select tests.grant_module((select escreve from u), (select a from f), 'qualidade');
select tests.grant_profile((select escreve from u), (select a from f), 'qualidade', 'Escreve laudo');
select tests.grant_module((select assina from u), (select a from f), 'qualidade');
select tests.grant_profile((select assina from u), (select a from f), 'qualidade', 'Gestor');
select tests.grant_module((select sem from u), (select a from f), 'qualidade');
select tests.grant_profile((select sem from u), (select a from f), 'qualidade', 'Sem SAC');

create temporary table s on commit drop as
with t as (
  insert into public.sac_tickets (tenant_id, customer_name, customer_email, subject, description, status)
  select a, 'Cliente', 'c@faltavam.test', 'Vazou', 'Chegou aberto', 'open' from f returning id
), r as (
  insert into public.sac_technical_reports (tenant_id, ticket_id, report_number)
  select (select a from f), id, 'LT-1' from t returning id
) select (select id from t) as sac, (select id from r) as laudo;
grant select on f, u, s to authenticated;

-- ═══ Os perfis padrão da empresa nova ═══
select is((select (permissions -> 'sacs' ->> 'view') || (permissions -> 'technical_reports' ->> 'sign') || (permissions ? 'products')::text
             from public.access_profiles where tenant_id = (select a from f) and department = 'qualidade' and name = 'Operador'),
  'truetruefalse', 'o Operador da Qualidade nasce com SACs e Laudos, e sem a "Produtos & Lotes" que nada lia');
select is((select (permissions -> 'treinamentos' ->> 'view') || coalesce(permissions -> 'treinamentos' ->> 'edit', 'false')
             from public.access_profiles where tenant_id = (select a from f) and department = 'educacional' and name = 'Operador'),
  'truefalse', 'o Operador do Educacional vê e inscreve, e não monta treinamento');
select is((select permissions -> 'reembolsos' ->> 'edit' from public.access_profiles
            where tenant_id = (select a from f) and department = 'rh' and name = 'Gestor'),
  'true', 'o Gestor do RH nasce com Reembolsos');

-- ═══ SACs: ver todos é a caixinha ═══
select tests.authenticate_as('sem@faltavam.test');
select is((select count(*)::int from public.sac_tickets where id = (select sac from s)), 0, 'sem "SACs de clientes" não vê o SAC');
select tests.clear_authentication();

-- ═══ Laudo: escrever não é assinar ═══
select tests.authenticate_as('escreve@faltavam.test');
select is((select count(*)::int from public.sac_technical_reports where id = (select laudo from s)), 1, 'quem vê o SAC lê o laudo');
select lives_ok($$ update public.sac_technical_reports set conclusion = 'Lote ok' where id = (select laudo from s) $$,
  'com "Escrever o laudo" escreve');
select throws_ok($$ update public.sac_technical_reports set status = 'completed' where id = (select laudo from s) $$,
  '42501', null, 'sem "Assinar/Finalizar" não finaliza');
select tests.clear_authentication();

select tests.authenticate_as('assina@faltavam.test');
select lives_ok($$ update public.sac_technical_reports set status = 'completed' where id = (select laudo from s) $$,
  'com "Assinar/Finalizar" finaliza');
select tests.clear_authentication();

select is((select status from public.sac_technical_reports where id = (select laudo from s)), 'completed', 'o laudo ficou finalizado');

select * from finish();
rollback;

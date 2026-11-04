-- TIPOS DE HOLERITE CADASTRÁVEIS (migration 20270212310000).
--   1  a empresa nova nasce com a lista aprovada (6 ativos + PLR desativado)
--   2  quem configura o RH cria tipo; o Operador não; o funcionário lê os nomes
--   3  holerite só entra com tipo da lista; tipo usado não se apaga; renomear não mexe no holerite; código fixo
--   4  o Gestor do RH herda a aba Holerites de "Parâmetros da folha"
begin;
\ir _helpers.psql

select plan(11);

create temporary table f on commit drop as select tests.create_tenant('pgtap-hol', 'Holerites', false) as a;
create temporary table u on commit drop as
select tests.create_user('dono@hol.test', (select a from f)) as dono,
       tests.create_user('op@hol.test', (select a from f)) as op,
       tests.create_user('func@hol.test', (select a from f)) as func;
select tests.grant_role((select dono from u), 'owner');
select tests.grant_role((select op from u), 'member');
select tests.grant_role((select func from u), 'member');
select tests.grant_module((select op from u), (select a from f), 'rh');
select tests.grant_profile((select op from u), (select a from f), 'rh', 'Operador');
insert into public.rh_employee_profiles (tenant_id, user_id, full_name, status, base_salary)
values ((select a from f), (select func from u), 'Funcionario Teste', 'ativo', 3000);
insert into public.rh_payslips (tenant_id, user_id, reference_month, file_path)
values ((select a from f), (select func from u), '2026-10-01', 'holerites/x.pdf');
grant select on f, u to authenticated;

-- 1 ──────────────────────────────────────────────────────────────────────────
select is((select string_agg(nome, ' | ' order by ordem) from public.rh_tipos_holerite where tenant_id = (select a from f) and ativo),
          'Mensal | Adiantamento salarial | 13º salário · 1ª parcela | 13º salário · 2ª parcela | Férias | Rescisão',
          'empresa nova nasce com a lista aprovada');
select is((select ativo from public.rh_tipos_holerite where tenant_id = (select a from f) and codigo = 'plr'), false,
          'PLR nasce desativado');

-- 2 ──────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('dono@hol.test');
select lives_ok($$ insert into public.rh_tipos_holerite (tenant_id, nome, ordem)
                   values ((select a from f), 'Vale-transporte', 8) returning id $$, 'quem configura o RH cria tipo');
select tests.clear_authentication();

select tests.authenticate_as('op@hol.test');
select throws_ok($$ insert into public.rh_tipos_holerite (tenant_id, nome) values ((select a from f), 'Bônus') returning id $$,
                 '42501', null, 'o Operador do RH não cria tipo');
select tests.clear_authentication();

select tests.authenticate_as('func@hol.test');
select is((select count(*)::int from public.rh_tipos_holerite), 8, 'o funcionário lê os nomes (para o Meu RH)');
select tests.clear_authentication();

-- 3 ──────────────────────────────────────────────────────────────────────────
select lives_ok($$ insert into public.rh_payslips (tenant_id, user_id, reference_month, type, file_path)
                   values ((select a from f), (select func from u), '2026-10-01', 'adiantamento', 'holerites/a.pdf') $$,
                'holerite de Adiantamento salarial entra (a trava dos 4 tipos saiu)');
select throws_ok($$ insert into public.rh_payslips (tenant_id, user_id, reference_month, type, file_path)
                    values ((select a from f), (select func from u), '2026-10-01', 'inventado', 'holerites/y.pdf') $$,
                 '23503', null, 'holerite só entra com tipo da lista');
select throws_ok($$ delete from public.rh_tipos_holerite where tenant_id = (select a from f) and codigo = 'mensal' $$,
                 '23503', null, 'tipo que já tem holerite não se apaga');
update public.rh_tipos_holerite set nome = 'Salário do mês' where tenant_id = (select a from f) and codigo = 'mensal';
select is((select t.nome from public.rh_payslips p join public.rh_tipos_holerite t on t.tenant_id = p.tenant_id and t.codigo = p.type
            where p.tenant_id = (select a from f) and p.type = 'mensal'), 'Salário do mês', 'renomear o tipo não mexe no holerite');
select throws_ok($$ update public.rh_tipos_holerite set codigo = 'outro' where tenant_id = (select a from f) and codigo = 'ferias' $$,
                 '23514', null, 'o código do tipo não muda');

-- 4 ──────────────────────────────────────────────────────────────────────────
select is((select permissions -> 'config_holerites' -> 'edit' from public.access_profiles
            where tenant_id = (select a from f) and department = 'rh' and name = 'Gestor'),
          (select permissions -> 'config_folha' -> 'edit' from public.access_profiles
            where tenant_id = (select a from f) and department = 'rh' and name = 'Gestor'),
          'o Gestor do RH altera Holerites como altera os Parâmetros da folha');

select * from finish();
rollback;

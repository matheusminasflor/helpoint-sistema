-- RH › FOLHA (migration 20270129180000; proposta "Helpoint no dia a dia", defeito 3): editar recalcula o líquido;
-- gerar de novo não apaga a correção feita à mão; o lançamento vem com a empresa do colaborador.
begin;
\ir _helpers.psql

select plan(6);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-folha', 'Folha', false) as a;
create temporary table u on commit drop as
select tests.create_user('rh@folha.test', (select a from f)) as rh;
select tests.grant_role((select rh from u), 'member');
select tests.grant_module((select rh from u), (select a from f), 'rh');
select tests.grant_profile((select rh from u), (select a from f), 'rh', 'Gestor');
insert into public.rh_employee_profiles (tenant_id, full_name, status, base_salary)
select a, 'Ana Folha', 'ativo', 3000 from f;
create temporary table mes on commit drop as select date_trunc('month', current_date)::date as m;
grant select on f, u, mes to authenticated;

select tests.authenticate_as('rh@folha.test');
select public.rh_generate_payroll((select a from f), null, (select m from mes));

-- ═══ A conta da geração é a do gatilho ═══
select is((select net_salary from public.rh_payroll_entries where tenant_id = (select a from f)),
          (select gross_salary + family_allowance - (advance + health_plan + health_coparticipation + payroll_loan + inss + irpf + other_deductions)
             from public.rh_payroll_entries where tenant_id = (select a from f)),
  'o líquido gerado é bruto + salário-família − descontos');

-- ═══ Editar uma célula recalcula ═══
update public.rh_payroll_entries set advance = 0, inss = 100, irpf = 0, ajustado_a_mao = true
 where tenant_id = (select a from f) returning id;
select is((select total_deductions from public.rh_payroll_entries where tenant_id = (select a from f)),
          (select 100 + health_plan + health_coparticipation + payroll_loan + other_deductions from public.rh_payroll_entries where tenant_id = (select a from f)),
  'editar o INSS recalcula o total de descontos');
select is((select net_salary from public.rh_payroll_entries where tenant_id = (select a from f)),
          (select gross_salary + family_allowance - total_deductions from public.rh_payroll_entries where tenant_id = (select a from f)),
  'e o líquido');

-- ═══ Gerar de novo não apaga a correção ═══
select public.rh_generate_payroll((select a from f), null, (select m from mes));
select is((select inss from public.rh_payroll_entries where tenant_id = (select a from f)), 100::numeric,
  'gerar de novo mantém o INSS corrigido à mão');

-- ═══ Desmarcar e gerar volta ao calculado ═══
update public.rh_payroll_entries set ajustado_a_mao = false where tenant_id = (select a from f) returning id;
select public.rh_generate_payroll((select a from f), null, (select m from mes));
select isnt((select inss from public.rh_payroll_entries where tenant_id = (select a from f)), 100::numeric,
  'desmarcado, a geração recalcula a linha');
select tests.clear_authentication();

select is((select count(*)::int from public.rh_payroll_entries where tenant_id = (select a from f)), 1,
  'continua um lançamento por colaborador e mês');

select * from finish();
rollback;

-- O RH obedece o perfil de acesso (migration 20261119020000_rh_obedece_o_perfil.sql)
--
-- Antes, ter o módulo RH abria Colaboradores, Férias, Atestados, Holerites e Documentos inteiros, e
-- nenhuma caixinha do perfil era lida. Agora cada seção pergunta ao perfil — e o "Meu RH" de cada
-- funcionário (o próprio holerite, as próprias férias) continua igual.
--
-- O ELENCO (todos `member`, para o cargo não ser motivo de nada):
--   chefe   owner                       — pode tudo;
--   op      módulo RH + perfil Operador — vê e edita; NÃO exclui, NÃO aprova, NÃO roda folha;
--   leitor  módulo RH + Somente leitura — só vê;
--   func    sem módulo                  — o funcionário: vê só o que é dele.
begin;
\ir _helpers.psql

select plan(13);

create temporary table f on commit drop as
select tests.create_tenant('rh-perfil', 'RH pelo Perfil', false) as tenant;

create temporary table u on commit drop as
select tests.create_user('chefe@rh-perfil.test',  (select tenant from f)) as chefe,
       tests.create_user('op@rh-perfil.test',     (select tenant from f)) as op,
       tests.create_user('leitor@rh-perfil.test', (select tenant from f)) as leitor,
       tests.create_user('func@rh-perfil.test',   (select tenant from f)) as func;

select tests.grant_role((select chefe from u), 'owner');
select tests.grant_role((select op from u), 'member');
select tests.grant_role((select leitor from u), 'member');
select tests.grant_role((select func from u), 'member');
select tests.grant_module((select op from u), (select tenant from f), 'rh');
select tests.grant_module((select leitor from u), (select tenant from f), 'rh');
select tests.grant_profile((select op from u), (select tenant from f), 'rh', 'Operador');
select tests.grant_profile((select leitor from u), (select tenant from f), 'rh', 'Somente leitura');

-- Fixtures do runner: duas fichas (a do funcionário e uma outra), um pedido de férias e um holerite.
insert into public.rh_employee_profiles (tenant_id, user_id, full_name, status, base_salary) values
  ((select tenant from f), (select func from u), 'Funcionario Teste', 'ativo', 3000),
  ((select tenant from f), null,                 'Outra Pessoa',      'ativo', 9000);
insert into public.rh_vacation_requests (tenant_id, user_id, start_date, end_date, days_requested, status)
values ((select tenant from f), (select func from u), current_date + 30, current_date + 39, 10, 'pendente');
insert into public.rh_payslips (tenant_id, user_id, reference_month, file_path)
values ((select tenant from f), (select func from u), date_trunc('month', current_date)::date, 'holerites/x.pdf');

grant select on f, u to authenticated;

-- ═══ 1. A semente da empresa nova vira o padrão novo. ═══
select is(
  (select permissions -> 'employees' from public.access_profiles
    where tenant_id = (select tenant from f) and department = 'rh' and name = 'Operador'),
  '{"view":true,"edit":true,"delete":false,"view_salary":false}'::jsonb,
  'o Operador do RH nasce vendo e editando colaboradores, sem excluir nem ver salário'
);

-- ═══ 2 a 7. O Operador. ═══
select tests.authenticate_as('op@rh-perfil.test');

select is((select count(*)::int from public.rh_employee_profiles), 2,
  'Operador vê os colaboradores');

update public.rh_employee_profiles set full_name = 'Outra Pessoa Editada' where full_name = 'Outra Pessoa';
select is((select count(*)::int from public.rh_employee_profiles where full_name = 'Outra Pessoa Editada'), 1,
  'Operador edita colaborador');

delete from public.rh_employee_profiles where full_name = 'Outra Pessoa Editada';
update public.rh_vacation_requests set status = 'aprovada';

select lives_ok(
  $$insert into public.rh_absences (tenant_id, employee_id, date)
    select (select tenant from f), id, current_date from public.rh_employee_profiles
     where full_name = 'Funcionario Teste' returning id$$,
  'Operador lança falta'
);

select throws_ok(
  $$select public.rh_generate_payroll((select tenant from f), null, date_trunc('month', current_date)::date)$$,
  '42501', null,
  'Operador não roda a folha'
);
select tests.clear_authentication();

-- O que o Operador tentou e a policy filtrou (zero linhas, sem erro — lição 12): conta-se o que ficou.
select is((select count(*)::int from public.rh_employee_profiles where tenant_id = (select tenant from f)), 2,
  'Operador não exclui colaborador — a ficha continua lá');
select is((select status from public.rh_vacation_requests where tenant_id = (select tenant from f)), 'pendente',
  'Operador não aprova férias — continua pendente');

-- ═══ 8. Somente leitura não lança nada. ═══
select tests.authenticate_as('leitor@rh-perfil.test');
select throws_ok(
  $$insert into public.rh_absences (tenant_id, employee_id, date)
    select (select tenant from f), id, current_date from public.rh_employee_profiles
     where full_name = 'Funcionario Teste' returning id$$,
  '42501', null,
  'Somente leitura não lança falta'
);
select tests.clear_authentication();

-- ═══ 9 a 11. O "Meu RH" do funcionário continua igual. ═══
select tests.authenticate_as('func@rh-perfil.test');
select is((select count(*)::int from public.rh_employee_profiles), 1,
  'o funcionário vê só a própria ficha (não a da outra pessoa)');
select is((select count(*)::int from public.rh_payslips), 1,
  'e o próprio holerite');
update public.rh_vacation_requests set status = 'cancelada';
select tests.clear_authentication();
select is((select status from public.rh_vacation_requests where tenant_id = (select tenant from f)), 'cancelada',
  'e ainda cancela as próprias férias pendentes');

-- ═══ 12. Rodar a folha confere a empresa (antes, um gestor gerava a de qualquer empresa). ═══
select tests.authenticate_as('chefe@rh-perfil.test');
select throws_ok(
  $$select public.rh_generate_payroll(gen_random_uuid(), null, date_trunc('month', current_date)::date)$$,
  '42501', null,
  'nem o dono roda a folha de outra empresa'
);
select tests.clear_authentication();

-- ═══ 13. A conta não abre para quem não está logado (lição 14). ═══
select is(has_function_privilege('anon', 'public.pode_no_rh(text, text)', 'execute'), false,
  'anon não chama pode_no_rh');

select * from finish();
rollback;

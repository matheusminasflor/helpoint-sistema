-- O salário e os arquivos do RH obedecem o perfil (migration 20261119030000_rh_salario_e_arquivos.sql)
--
-- Antes, "Ver salário" só escondia a coluna na tela: quem lia Colaboradores lia o salário pelo
-- banco. E os PDFs (holerite, documento) abriam para quem tinha o módulo, com ou sem a caixinha.
--
--   gestor  RH Gestor            — vê o salário de todos;
--   op      RH Operador          — vê os colaboradores, NÃO o salário; envia holerite;
--   leitor  RH Somente leitura   — não envia arquivo nenhum;
--   func    sem módulo           — vê o próprio salário (o "Meu RH").
begin;
\ir _helpers.psql

select plan(10);

create temporary table f on commit drop as
select tests.create_tenant('rh-salario', 'RH Salario', false) as tenant;

create temporary table u on commit drop as
select tests.create_user('gestor@rh-salario.test', (select tenant from f)) as gestor,
       tests.create_user('op@rh-salario.test',     (select tenant from f)) as op,
       tests.create_user('leitor@rh-salario.test', (select tenant from f)) as leitor,
       tests.create_user('func@rh-salario.test',   (select tenant from f)) as func;

select tests.grant_role((select gestor from u), 'member');
select tests.grant_role((select op from u), 'member');
select tests.grant_role((select leitor from u), 'member');
select tests.grant_role((select func from u), 'member');
select tests.grant_profile((select gestor from u), (select tenant from f), 'rh', 'Gestor');
select tests.grant_profile((select op from u), (select tenant from f), 'rh', 'Operador');
select tests.grant_profile((select leitor from u), (select tenant from f), 'rh', 'Somente leitura');

insert into public.rh_employee_profiles (tenant_id, user_id, full_name, status, base_salary) values
  ((select tenant from f), (select func from u), 'Funcionario', 'ativo', 3000),
  ((select tenant from f), null,                 'Outra Pessoa', 'ativo', 9000);

grant select on f, u to authenticated;

-- ═══ 1 a 4. O Operador vê a ficha, não o salário — nem por fora da tela. ═══
select tests.authenticate_as('op@rh-salario.test');

select throws_ok(
  $$select base_salary from public.rh_employee_profiles$$,
  '42501', null,
  'ler a coluna do salário direto é recusado (antes a caixinha só escondia na tela)'
);
select is((select count(*)::int from public.rh_salarios()), 0,
  'e pela função ele não recebe salário de ninguém');
select throws_ok(
  $$update public.rh_employee_profiles set base_salary = 0 where full_name = 'Outra Pessoa' returning id$$,
  '42501', null,
  'quem não vê o salário também não o grava — senão a tela zeraria o que não mostra'
);
select lives_ok(
  $$update public.rh_employee_profiles set job_title = 'Analista' where full_name = 'Outra Pessoa' returning id$$,
  'mas edita o resto da ficha normalmente'
);

-- 5. Envia holerite: o arquivo na pasta holerites passa.
select lives_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('rh-documents', (select tenant from f)::text || '/' || (select func from u)::text || '/2026/holerites/h.pdf')$$,
  'Operador envia o PDF do holerite'
);
select tests.clear_authentication();

-- ═══ 6. Somente leitura não envia arquivo. ═══
select tests.authenticate_as('leitor@rh-salario.test');
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('rh-documents', (select tenant from f)::text || '/' || (select func from u)::text || '/2026/holerites/h2.pdf')$$,
  '42501', null,
  'Somente leitura não envia holerite'
);
select tests.clear_authentication();

-- ═══ 7 e 8. O Gestor vê o salário de todos. ═══
select tests.authenticate_as('gestor@rh-salario.test');
select is((select count(*)::int from public.rh_salarios()), 2,
  'o Gestor do RH recebe o salário dos dois');
select is((select base_salary from public.rh_salarios() s
             join public.rh_employee_profiles e on e.id = s.employee_id where e.full_name = 'Outra Pessoa'),
  9000::numeric, 'e o valor é o gravado');
select tests.clear_authentication();

-- ═══ 9. O funcionário vê o próprio salário, e só ele. ═══
select tests.authenticate_as('func@rh-salario.test');
select is((select count(*)::int from public.rh_salarios()), 1,
  'o funcionário recebe só o próprio salário');
select tests.clear_authentication();

-- ═══ 10. Limite de tamanho no balde. ═══
select is((select file_size_limit from storage.buckets where id = 'rh-documents'), 5242880::bigint,
  'o balde do RH recusa arquivo acima de 5 MB');

select * from finish();
rollback;

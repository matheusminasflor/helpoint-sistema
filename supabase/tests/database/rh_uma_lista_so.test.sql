-- RH: UMA LISTA SÓ DE PESSOAS (migration 20270207010000; rodada 2, R4, decisões do dono de 2026-10-25).
--
-- O colaborador do RH manda: holerite, documento, benefício, férias e atestado são dele, com ou sem login. O `user_id`
-- dessas tabelas é o espelho do login do colaborador, mantido por gatilho. A planilha identifica pelo CPF (e, sem CPF
-- igual, pelo e-mail); empresa desconhecida é criada pelo nome; "férias vencendo" acende 60 dias antes do prazo.
--
--   dono    owner — RH inteiro (admin passa em `pode_no_rh`)
--   op      RH, Operador — edita colaboradores, NÃO vê salário
--   leitor  RH, Somente leitura — não edita
--   ana     colaboradora com login, na lista do RH
--   bia     tem login e NÃO está na lista do RH
--   carla   colaboradora SEM login (o login nasce no meio do teste, pelo e-mail)
begin;
\ir _helpers.psql

select plan(26);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-rh-lista', 'RH Lista', false) as a;
create temporary table u on commit drop as
select tests.create_user('dono@rhlista.test',   (select a from f)) as dono,
       tests.create_user('op@rhlista.test',     (select a from f)) as op,
       tests.create_user('leitor@rhlista.test', (select a from f)) as leitor,
       tests.create_user('ana@rhlista.test',    (select a from f)) as ana,
       tests.create_user('bia@rhlista.test',    (select a from f)) as bia;
select tests.grant_role((select dono from u), 'owner');
select tests.grant_role(x, 'member') from (select op x from u union all select leitor from u
                                          union all select ana from u union all select bia from u) s;
select tests.grant_module((select op from u), (select a from f), 'rh');
select tests.grant_module((select leitor from u), (select a from f), 'rh');
select tests.grant_profile((select op from u), (select a from f), 'rh', 'Operador');
select tests.grant_profile((select leitor from u), (select a from f), 'rh', 'Somente leitura');
select tests.create_colaborador((select ana from u), 'Ana');

create temporary table hoje on commit drop as select (now() at time zone 'America/Sao_Paulo')::date as d;
create temporary table c (nome text, id uuid) on commit drop;
create temporary table r (k text, v jsonb) on commit drop;
create temporary table h (id uuid, user_id uuid) on commit drop;
create temporary table fer (id uuid, employee_id uuid) on commit drop;
grant select on f, u, hoje to authenticated;
grant select, insert, delete on c, r, h, fer to authenticated;

-- ═══ 1-4. Holerite de quem não tem login; o login chega depois e o holerite acompanha. ═══
select tests.authenticate_as('dono@rhlista.test');
with n as (insert into public.rh_employee_profiles (tenant_id, full_name, access_email, status)
           select a, 'Carla', 'carla@rhlista.test', 'ativo' from f returning id)
insert into c select 'carla', id from n;
with n as (insert into public.rh_payslips (tenant_id, employee_id, reference_month, file_path)
           select a, (select id from c where nome = 'carla'), date_trunc('month', (select d from hoje))::date, 'holerites/carla.pdf'
             from f returning id, user_id)
insert into h select id, user_id from n;
select is((select user_id from h), null::uuid, 'o RH manda holerite a quem nao tem login: fica do colaborador, sem login');
select tests.clear_authentication();

-- O login nasce com o e-mail do colaborador (`rh_auto_link_on_profile`): o espelho dos holerites acompanha.
select lives_ok($$ select tests.create_user('carla@rhlista.test', (select a from f)) $$,
  'criar o login de quem ja tem holerite liga o colaborador sem erro');
select is((select p.user_id from public.rh_payslips p where p.id = (select id from h)),
          (select id from auth.users where email = 'carla@rhlista.test'),
  'o holerite ganha o login da Carla');
select tests.authenticate_as('carla@rhlista.test');
select is((select count(*)::int from public.rh_payslips), 1, 'e a Carla ve o holerite no Meu RH');
select tests.clear_authentication();

-- ═══ 5-7. Férias pelo Meu RH: só o login; o colaborador é achado; sem cadastro, a frase; o de outra pessoa, não. ═══
select tests.authenticate_as('ana@rhlista.test');
with n as (insert into public.rh_vacation_requests (tenant_id, user_id, start_date, end_date, days_requested, type)
           select a, (select ana from u), (select d from hoje) + 40, (select d from hoje) + 49, 10, 'ferias' from f
           returning id, employee_id)
insert into fer select id, employee_id from n;
select throws_ok($$ insert into public.rh_vacation_requests (tenant_id, employee_id, start_date, end_date, days_requested, type)
  select a, (select id from c where nome = 'carla'), (select d from hoje) + 40, (select d from hoje) + 41, 2, 'ferias' from f
  returning id $$,
  '42501', null, 'mandar o colaborador de outra pessoa nao passa (o login vira o dela e a policy recusa)');
select tests.clear_authentication();
select is((select employee_id from fer), (select id from public.rh_employee_profiles where user_id = (select ana from u)),
  'o pedido feito so com o login ganha o colaborador da Ana');
select tests.authenticate_as('bia@rhlista.test');
select throws_ok($$ insert into public.rh_vacation_requests (tenant_id, user_id, start_date, end_date, days_requested, type)
  select a, (select bia from u), (select d from hoje) + 40, (select d from hoje) + 41, 2, 'ferias' from f returning id $$,
  '23514', 'O RH ainda não cadastrou você na lista de colaboradores. Fale com o RH.',
  'quem nao esta na lista do RH recebe a frase de o que fazer');
select tests.clear_authentication();

-- ═══ 8-10. Férias aprovadas marcam o último período, com e sem login. ═══
select tests.authenticate_as('dono@rhlista.test');
update public.rh_vacation_requests set status = 'aprovada' where id = (select id from fer);
with n as (insert into public.rh_employee_profiles (tenant_id, full_name, status)
           select a, 'Davi', 'ativo' from f returning id)
insert into c select 'davi', id from n;
select lives_ok($$ insert into public.rh_vacation_requests (tenant_id, employee_id, start_date, end_date, days_requested, type, status)
  select a, (select id from c where nome = 'davi'), (select d from hoje) - 20, (select d from hoje) - 11, 10, 'ferias', 'aprovada'
    from f returning id $$,
  'o RH registra ferias ja aprovadas de quem nao tem login');
select tests.clear_authentication();
select is((select last_vacation_end from public.rh_employee_profiles where user_id = (select ana from u)),
          (select d from hoje) + 49, 'aprovar as ferias da Ana marca o fim do ultimo periodo');
select is((select last_vacation_end from public.rh_employee_profiles where id = (select id from c where nome = 'davi')),
          (select d from hoje) - 11, 'e as registradas do Davi, sem login, tambem');

-- ═══ 11-18. A planilha. ═══
-- O Edu já está na lista, sem CPF (como as pessoas copiadas do login): a planilha o acha pelo e-mail.
insert into public.rh_employee_profiles (tenant_id, full_name, access_email, status)
select a, 'Edu', 'edu@rhlista.test', 'ativo' from f;
create temporary table planilha on commit drop as select jsonb_build_array(
  jsonb_build_object('linha', 2, 'nome', 'Fabi', 'cpf', '529.982.247-25', 'admissao', '2024-03-01',
                     'empresa', 'Nova Empresa SA', 'setor', 'Produção', 'cargo', 'Operadora'),
  jsonb_build_object('linha', 3, 'nome', 'Edu Lima', 'cpf', '111.444.777-35', 'admissao', '2023-05-10',
                     'empresa', 'Nova Empresa SA', 'setor', 'Expedição', 'cargo', 'Conferente', 'email', 'EDU@rhlista.test'),
  jsonb_build_object('linha', 4, 'nome', 'Sem CPF', 'cpf', '123', 'admissao', '2024-01-01',
                     'empresa', 'Nova Empresa SA', 'setor', 'Produção', 'cargo', 'Operador'),
  jsonb_build_object('linha', 5, 'nome', '', 'cpf', '98765432100', 'admissao', '2024-01-01',
                     'empresa', 'Nova Empresa SA', 'setor', 'Produção', 'cargo', 'Operador'),
  jsonb_build_object('linha', 6, 'nome', 'Sem admissao', 'cpf', '39053344705',
                     'empresa', 'Nova Empresa SA', 'setor', 'Produção', 'cargo', 'Operador')
) as l;
grant select on planilha to authenticated;

select tests.authenticate_as('dono@rhlista.test');
insert into r select 'previa', public.rh_importar_colaboradores((select l from planilha), false);
select tests.clear_authentication();
select is((select jsonb_build_object('criar', v -> 'criar', 'atualizar', v -> 'atualizar') from r where k = 'previa'),
  '{"criar": 1, "atualizar": 1}'::jsonb, 'a previa conta: a Fabi e nova, o Edu (achado pelo e-mail) atualiza');
select is((select count(*)::int from public.rh_employee_profiles where full_name = 'Fabi')
        + (select count(*)::int from public.rh_companies where tenant_id = (select a from f) and name = 'Nova Empresa SA'), 0,
  'a previa nao grava nada');
select is((select v -> 'empresas_novas' from r where k = 'previa'), '["Nova Empresa SA"]'::jsonb,
  'a previa diz qual empresa vai ser criada');
select is((select array_agg(x ->> 'motivo' order by (x ->> 'linha')::int)
             from r, jsonb_array_elements(v -> 'recusadas') x where k = 'previa'),
  array['CPF precisa de 11 dígitos', 'falta o nome', 'falta a data de admissão'],
  'as linhas sem CPF valido, sem nome e sem admissao sao recusadas com o motivo');

select tests.authenticate_as('dono@rhlista.test');
insert into r select 'grava', public.rh_importar_colaboradores((select l from planilha), true);
select tests.clear_authentication();
select is((select c2.name from public.rh_employee_profiles e join public.rh_companies c2 on c2.id = e.company_id
            where e.full_name = 'Fabi'), 'Nova Empresa SA', 'confirmar cria a Fabi, com a empresa nova');
select is((select regexp_replace(cpf, '\D', '', 'g') || ' ' || full_name from public.rh_employee_profiles
            where access_email = 'edu@rhlista.test'), '11144477735 Edu Lima',
  'o Edu, achado pelo e-mail, ganha o CPF e o nome da planilha (sem duplicar)');

-- Importar de novo, com o CPF escrito de outro jeito: atualiza, não duplica.
select tests.authenticate_as('dono@rhlista.test');
insert into r select 'de-novo', public.rh_importar_colaboradores(jsonb_build_array(
  jsonb_build_object('linha', 2, 'nome', 'Fabi', 'cpf', '52998224725', 'admissao', '2024-03-01',
                     'empresa', 'nova empresa sa', 'setor', 'Produção', 'cargo', 'Supervisora')), true);
select tests.clear_authentication();
select is((select count(*)::int || ' ' || max(job_title) from public.rh_employee_profiles
            where regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = '52998224725'), '1 Supervisora',
  'reimportar o mesmo CPF atualiza o cargo em vez de criar outra Fabi');

select tests.authenticate_as('op@rhlista.test');
insert into r select 'op', public.rh_importar_colaboradores(jsonb_build_array(
  jsonb_build_object('linha', 2, 'nome', 'Gui', 'cpf', '15350946056', 'admissao', '2024-03-01', 'salario', '3000',
                     'empresa', 'Nova Empresa SA', 'setor', 'Produção', 'cargo', 'Operador')), false);
select is((select (v ->> 'salario_ignorado')::boolean from r where k = 'op'), true,
  'quem nao ve salario importa, e o salario da planilha e ignorado (a previa avisa)');
select tests.clear_authentication();

-- ═══ 19. Quem não edita colaboradores não importa. ═══
select tests.authenticate_as('leitor@rhlista.test');
select throws_ok($$ select public.rh_importar_colaboradores((select l from planilha), false) $$, '42501', null,
  'Somente leitura no RH nao importa');
select tests.clear_authentication();

-- ═══ 20-22. Quem tem login e não está na lista. ═══
select tests.authenticate_as('dono@rhlista.test');
select ok((select bool_or(user_id = (select bia from u)) and not bool_or(user_id = (select ana from u))
             from public.rh_logins_fora_da_lista()),
  'a Bia (login sem cadastro no RH) aparece; a Ana (na lista) nao');
select isnt(public.rh_incluir_login_na_lista((select bia from u)), null::uuid, 'incluir a Bia na lista com um toque');
select throws_ok($$ select public.rh_incluir_login_na_lista((select bia from u)) $$, '23505', null,
  'incluir de novo e recusado: ja esta na lista');
select tests.clear_authentication();

-- ═══ 23-26. Os indicadores. ═══
-- Gil: o último ano completo vence em 30 dias (vencendo). Hugo: vence em ~355 dias (nada). Ivo: o período anterior
-- passou sem férias, e ele tem histórico ("últimas férias" antigas) — vencida. Juca entrou há 5 dias; Lia saiu há 3.
insert into public.rh_employee_profiles (tenant_id, full_name, admission_date, last_vacation_end, termination_date, status)
select a, 'Gil',  ((select d from hoje) - interval '2 years')::date + 30, null, null, 'ativo' from f
union all select a, 'Hugo', ((select d from hoje) - interval '1 year')::date - 10, null, null, 'ativo' from f
union all select a, 'Ivo',  ((select d from hoje) - interval '3 years')::date - 100,
                 (((select d from hoje) - interval '3 years')::date - 100 + interval '1 year')::date + 30, null, 'ativo' from f
union all select a, 'Juca', (select d from hoje) - 5, null, null, 'ativo' from f
union all select a, 'Lia',  date '2020-01-15', null, (select d from hoje) - 3, 'desligado' from f;

select tests.authenticate_as('dono@rhlista.test');
insert into r select 'ind', public.rh_indicadores((select d from hoje) - 10, (select d from hoje));
select tests.clear_authentication();
select is((select jsonb_build_object('entradas', v -> 'entradas', 'saidas', v -> 'saidas') from r where k = 'ind'),
  '{"entradas": 1, "saidas": 1}'::jsonb, 'entradas e saidas do periodo');
select is((select x ->> 'situacao' || ' ' || (x ->> 'vence_em')
             from r, jsonb_array_elements(v -> 'ferias') x where k = 'ind' and x ->> 'nome' = 'Gil'),
  'vencendo ' || ((((select d from hoje) - interval '2 years')::date + 30) + interval '2 years')::date::text,
  'Gil: o prazo de tirar as ferias vence dentro de 60 dias');
select is((select array_agg(x ->> 'nome' || ':' || (x ->> 'situacao') order by x ->> 'nome')
             from r, jsonb_array_elements(v -> 'ferias') x where k = 'ind' and x ->> 'nome' in ('Hugo', 'Ivo')),
  array['Ivo:vencida'], 'Hugo (longe do prazo) nao aparece; Ivo (periodo anterior sem ferias, com historico) venceu');

select tests.authenticate_as('ana@rhlista.test');
select throws_ok($$ select public.rh_indicadores((select d from hoje) - 10, (select d from hoje)) $$, '42501', null,
  'sem Indicadores no perfil do RH, os numeros nao saem');
select tests.clear_authentication();

select * from finish();
rollback;

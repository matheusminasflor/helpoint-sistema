-- TI › TERMOS DE RESPONSABILIDADE (migration 20270129030000; dono, 2026-10-20). tec tem o Inventário da TI; col recebe
-- o equipamento; zeca não tem nada com a TI.
--   1  gerar cria o termo com os itens
--   2  o equipamento que não estava no Inventário é cadastrado, no nome da pessoa
--   3  o que já estava no Inventário passa para o nome da pessoa
--   4  o RH ganha o CPF que estava em branco
--   5  quem não tem o Inventário não gera termo
--   6  ... nem vê os termos
--   7  "assinado" sem o arquivo é recusado
--   8  devolver fecha o termo
--   9  ... e devolve o equipamento ao estoque
--  10  as funções não abrem para anon, e o balde é privado
begin;
\ir _helpers.psql

select plan(11);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-termos', 'Termos', false) as a;
create temporary table u on commit drop as
select tests.create_user('tec@termos.test',  (select a from f)) as tec,
       tests.create_user('col@termos.test',  (select a from f)) as col,
       tests.create_user('zeca@termos.test', (select a from f)) as zeca;
insert into public.access_profiles (tenant_id, department, name, permissions)
select a, 'ti', 'Inventario', '{"inventory": {"view": true, "create": true, "edit": true}}'::jsonb from f;
select tests.grant_module((select tec from u), (select a from f), 'ti');
select tests.grant_profile((select tec from u), (select a from f), 'ti', 'Inventario');
insert into public.rh_employee_profiles (tenant_id, user_id, full_name)
select a, (select col from u), 'Colaboradora Teste' from f;

create temporary table ativo on commit drop as
with x as (
  insert into public.assets (tenant_id, name, asset_tag, category, status)
  select a, 'Notebook', 'NB-1', 'hardware', 'in_stock' from f returning id
) select id from x;
create temporary table termo (id uuid) on commit drop;
grant select on f, u, ativo to authenticated;
grant select, insert on termo to authenticated;

select tests.authenticate_as('tec@termos.test');
insert into termo
select public.ti_gerar_termo(
  jsonb_build_object('colaborador_id', (select col from u), 'colaborador_nome', 'Colaboradora Teste', 'cpf', '000.000.000-00',
                     'empresa', 'Empresa Teste LTDA', 'responsavel_nome', 'Tecnico'),
  jsonb_build_array(
    jsonb_build_object('asset_id', (select id from ativo), 'descricao', 'Notebook', 'estado', 'Novo'),
    jsonb_build_object('descricao', 'Headset', 'marca_modelo', 'Poly / 3210', 'patrimonio', '0280', 'estado', 'Novo'),
    jsonb_build_object('descricao', 'Mouse', 'estado', 'Novo')));
select tests.clear_authentication();

select is((select count(*)::int from public.ti_termo_itens where termo_id = (select id from termo)), 3,
  'gerar cria o termo com os itens');
select is((select assigned_to from public.assets where name = 'Headset' and tenant_id = (select a from f)), (select col from u),
  'o equipamento que nao estava no Inventario e cadastrado, no nome da pessoa');
select ok((select asset_tag like 'SEM-PAT-%' from public.assets where name = 'Mouse' and tenant_id = (select a from f)),
  'sem n de patrimonio, o Inventario recebe uma etiqueta provisoria (CI #413)');
select is((select assigned_to from public.assets where id = (select id from ativo)), (select col from u),
  'o que ja estava no Inventario passa para o nome da pessoa');
select is((select cpf from public.rh_employee_profiles where user_id = (select col from u)), '000.000.000-00',
  'o RH ganha o CPF que estava em branco');

select tests.authenticate_as('zeca@termos.test');
select throws_ok($$ select public.ti_gerar_termo('{"colaborador_nome":"x","empresa":"y"}'::jsonb, '[{"descricao":"z"}]'::jsonb) $$,
  '42501', null, 'quem nao tem o Inventario nao gera termo');
select is((select count(*)::int from public.ti_termos), 0, '... nem ve os termos');
select tests.clear_authentication();

select tests.authenticate_as('tec@termos.test');
select throws_ok($$ update public.ti_termos set status = 'assinado' where id = (select id from termo) $$,
  '23514', null, '"assinado" sem o arquivo e recusado');
select public.ti_devolver_termo((select id from termo), (now() at time zone 'America/Sao_Paulo')::date, 'Voltou inteiro');
select tests.clear_authentication();

select is((select status from public.ti_termos where id = (select id from termo)), 'devolvido', 'devolver fecha o termo');
select is((select count(*)::int from public.assets
            where tenant_id = (select a from f) and assigned_to is null and status = 'in_stock'), 3,
  '... e devolve o equipamento ao estoque');

select ok(not has_function_privilege('anon', 'public.ti_gerar_termo(jsonb, jsonb)', 'execute')
          and not has_function_privilege('anon', 'public.ti_devolver_termo(uuid, date, text)', 'execute')
          and not has_function_privilege('anon', 'public.ti_dados_para_termo(uuid)', 'execute')
          and (select not public from storage.buckets where id = 'ti-termos'),
  'as funcoes nao abrem para anon, e o balde e privado');

select * from finish();
rollback;

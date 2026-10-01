-- Cadastrar cliente novo só com permissão (migration 20261119050000_cadastrar_cliente_com_permissao.sql)
--
-- Antes, qualquer pessoa com o módulo Comercial criava cliente. Decisão do dono (2026-10-01): criar
-- só com `comercial.clientes.cadastrar` (em Configurações › Cadastro de clientes); a vendedora
-- continua COMPLETANDO os dados; cliente novo se pede por chamado.
--
--   gestor     Comercial Gestor — cria;
--   vendedora  Comercial Operador — não cria; completa o que vê;
--   importa    só `vendas.importar` (Operador + a caixinha) — cria pela importação, que precisa disso.
-- Escrita com RETURNING (lição 11).
begin;
\ir _helpers.psql

select plan(6);

create temporary table f on commit drop as
select tests.create_tenant('cad-cliente', 'Cadastro Cliente', false) as a;

create temporary table u on commit drop as
select tests.create_user('gestor@cadcli.test',    (select a from f)) as gestor,
       tests.create_user('vendedora@cadcli.test', (select a from f)) as vendedora;
select tests.grant_module((select gestor from u), (select a from f), 'comercial');
select tests.grant_module((select vendedora from u), (select a from f), 'comercial');
select tests.grant_profile((select gestor from u), (select a from f), 'comercial', 'Gestor');
select tests.grant_profile((select vendedora from u), (select a from f), 'comercial', 'Operador');

-- O Gestor que a semente criou agora (depois da migration) não tem a chave: a migration só marcou
-- os que já existiam. Marca aqui, como o dono marcaria no perfil.
update public.access_profiles
   set permissions = jsonb_set(permissions, '{clientes}', '{"cadastrar": true}'::jsonb)
 where tenant_id = (select a from f) and department = 'comercial' and name = 'Gestor';

insert into public.com_clientes (tenant_id, codigo, razao_social, origem)
values ((select a from f), '10', 'CLIENTE DEZ', 'cadastro');

grant select on f, u to authenticated;

-- ═══ 1 e 2. A vendedora não cria, mas completa. ═══
select tests.authenticate_as('vendedora@cadcli.test');
select throws_ok(
  $$insert into public.com_clientes (tenant_id, codigo, razao_social, origem)
    values ((select a from f), '20', 'CLIENTE VINTE', 'cadastro') returning id$$,
  '42501', null,
  'a vendedora não cria cliente — cliente novo se pede por chamado'
);
select lives_ok(
  $$update public.com_clientes set telefone = '31999990000' where codigo = '10' returning id$$,
  'mas completa os dados de um cliente que ela vê'
);
select tests.clear_authentication();

-- ═══ 3. O Gestor cria. ═══
select tests.authenticate_as('gestor@cadcli.test');
select lives_ok(
  $$insert into public.com_clientes (tenant_id, codigo, razao_social, origem)
    values ((select a from f), '30', 'CLIENTE TRINTA', 'cadastro') returning id$$,
  'quem tem "Cadastrar cliente novo" cria'
);
select tests.clear_authentication();

-- ═══ 4. Quem importa ainda cria pela importação (o ramo que ela precisa). ═══
update public.access_profiles
   set permissions = jsonb_set(permissions, '{vendas,importar}', 'true'::jsonb)
 where tenant_id = (select a from f) and department = 'comercial' and name = 'Operador';
select tests.authenticate_as('vendedora@cadcli.test');
select lives_ok(
  $$select public.com_importar_modelo_de_clientes('m.xlsx',
      '[{"codigo":"40","razao_social":"CLIENTE QUARENTA"}]'::jsonb, '[]'::jsonb, true)$$,
  'com "importar" a importação cria cliente'
);
select tests.clear_authentication();

select is((select count(*)::int from public.com_clientes where tenant_id = (select a from f)), 3,
  'ficaram o 10, o 30 e o 40 — o 20 da vendedora não entrou');
select is((select telefone from public.com_clientes where tenant_id = (select a from f) and codigo = '10'),
  '31999990000', 'e o telefone que ela completou ficou');

select * from finish();
rollback;

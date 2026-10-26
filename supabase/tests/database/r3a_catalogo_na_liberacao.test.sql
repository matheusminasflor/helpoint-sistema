-- Rodada 3, R3a (migration 20270211010000): o link do catálogo colado na liberação. Só quem libera cola; o link
-- precisa ser https; o distribuidor passa a ver o colado; a conta sem link colado continua lendo o do Conecta.
begin;
\ir _helpers.psql

select plan(6);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-r3a', 'Distribuidora R3a', false) as a;

insert into public.com_clientes (tenant_id, codigo, razao_social, documento, ativo, origem, tabela_preco)
values ((select a from f), 'D-9', 'DISTRIBUIDORA R3A LTDA', '08319138000160', true, 'cadastro', 'DIST 9 CONDICAO');

create temporary table u on commit drop as
select tests.create_customer('dono@r3a.test', (select a from f)) as dono,
       tests.create_user('gestor@r3a.test', (select a from f))   as gestor,
       tests.create_user('operador@r3a.test', (select a from f)) as operador;
select tests.grant_profile((select gestor from u), (select a from f), 'ti', 'Gestor');
select tests.grant_profile((select operador from u), (select a from f), 'ti', 'Operador');

create temporary table d on commit drop as
with novo as (
  insert into public.dist_distribuidores (tenant_id, razao_social, cnpj, status, com_cliente_codigo, pedido_por)
  select a, 'Distribuidora R3a', '08319138000160', 'liberado', 'D-9', (select dono from u) from f returning id
) select id from novo;
insert into public.dist_membros (tenant_id, distribuidor_id, user_id, email, papel)
select (select a from f), (select id from d), dono, 'dono@r3a.test', 'dono' from u;
grant select on f, u, d to authenticated;

-- O Conecta leu um catálogo INBRAS da tabela dele (sem o "CONDICAO").
insert into public.conecta_catalogos (tenant_id, conta, identificacao, descricao, tabela_preco, link)
values ((select a from f), 'INBRAS', 'cat-1', 'INBRAS DIST 9', 'DIST 9', 'https://conecta.test/inbras');

select tests.authenticate_as('operador@r3a.test');
select throws_ok($$ select public.dist_guardar_catalogos((select id from d), 'https://conecta.test/mf', null) $$,
  '42501', null, 'quem nao libera nao cola o link');

select tests.clear_authentication();
select tests.authenticate_as('gestor@r3a.test');
select throws_ok($$ select public.dist_guardar_catalogos((select id from d), 'http://conecta.test/mf', null) $$,
  '23514', null, 'o link precisa ser https');
select lives_ok($$ select public.dist_guardar_catalogos((select id from d), ' https://conecta.test/mf ', '') $$,
  'quem libera cola o link da MF');

select tests.clear_authentication();
select tests.authenticate_as('dono@r3a.test');
select is((select link from public.dist_catalogos() where conta = 'MF'), 'https://conecta.test/mf',
  'o distribuidor ve o link colado da MF');
select is((select link from public.dist_catalogos() where conta = 'INBRAS'), 'https://conecta.test/inbras',
  'e a conta sem link colado continua com o do Conecta');

select tests.clear_authentication();
select tests.authenticate_as('gestor@r3a.test');
select public.dist_guardar_catalogos((select id from d), 'https://conecta.test/mf', 'https://colado.test/inbras');
select tests.clear_authentication();
select tests.authenticate_as('dono@r3a.test');
select is((select link from public.dist_catalogos() where conta = 'INBRAS'), 'https://colado.test/inbras',
  'o colado vence o lido do Conecta');

select * from finish();
rollback;

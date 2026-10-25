-- Portal do Distribuidor, parte 1 (migration 20270204010000): pedir o cadastro, a TI liberar, os termos e a equipe.
--
-- O que justifica a suíte: quem LIBERA é só o Gestor da TI ou quem tem "Liberar distribuidor" (decisão 4 do dono),
-- o distribuidor de fora nunca vê outro distribuidor, e o vendedor só entra pelo convite do e-mail dele.
begin;
\ir _helpers.psql

select plan(22);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-dist', 'Distribuidora Teste', false) as a;

insert into public.com_clientes (tenant_id, codigo, razao_social, documento, ativo, origem)
values ((select a from f), 'D-1', 'DISTRIBUIDORA DO TESTE LTDA', '08319138000160', true, 'cadastro');

create temporary table u on commit drop as
select tests.create_customer('dono@dist.test', (select a from f))     as dono,
       tests.create_customer('vendedor@dist.test', (select a from f)) as vendedor,
       tests.create_customer('outro@dist.test', (select a from f))    as outro,
       tests.create_user('gestor@ti.test', (select a from f))         as gestor,
       tests.create_user('operador@ti.test', (select a from f))       as operador;
grant select on f, u to authenticated;

select tests.grant_profile((select gestor from u), (select a from f), 'ti', 'Gestor');
select tests.grant_profile((select operador from u), (select a from f), 'ti', 'Operador');

-- ── A permissão nasceu como o dono decidiu ──────────────────────────────────────────────────────────────────────
select is(
  (select string_agg(name || '=' || (permissions -> 'distribuidores' ->> 'liberar'), ',' order by name)
     from public.access_profiles where tenant_id = (select a from f) and department = 'ti'),
  'Gestor=true,Operador=false,Somente leitura=false',
  'Liberar distribuidor nasce ligada so no Gestor da TI'
);

-- ── 1. O pedido ─────────────────────────────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('dono@dist.test');

select is(public.dist_situacao('v1') ->> 'situacao', 'sem_pedido', 'cadastrado no SAC e sem pedido: pode pedir');

create temporary table p on commit drop as
select public.dist_pedir_cadastro('Distribuidora do Teste', '08.319.138/0001-60', 'Belo Horizonte', 'mg', '31 3333-0000') as id;
grant select on p to authenticated;

select is(public.dist_situacao('v1') ->> 'situacao', 'pendente', 'o pedido fica esperando a Minasflor');

select throws_ok($$ select public.dist_pedir_cadastro('De novo', '08319138000160', null, null, null) $$,
  '23505', null, 'nao pede duas vezes enquanto espera');

select throws_ok($$ select public.dist_decidir((select id from p), 'liberar', 'D-1') $$,
  '42501', null, 'o distribuidor NAO se libera');

select tests.clear_authentication();
select is(
  (select count(*)::int from public.notifications where reference_id = (select id from p) and user_id = (select gestor from u)),
  1, 'o Gestor da TI recebe o aviso do pedido'
);
select is(
  (select count(*)::int from public.notifications where reference_id = (select id from p) and user_id = (select operador from u)),
  0, 'quem nao libera nao recebe'
);

-- ── 2. Quem decide ──────────────────────────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('operador@ti.test');
select is((select count(*)::int from public.dist_distribuidores), 0, 'o Operador da TI nao ve os pedidos');
select throws_ok($$ select public.dist_decidir((select id from p), 'liberar', 'D-1') $$,
  '42501', null, 'nem libera');
select throws_ok($$ select * from public.dist_clientes_para_ligar((select id from p), 'TESTE') $$,
  '42501', null, 'nem busca os clientes do Comercial');

select tests.clear_authentication();
select tests.authenticate_as('gestor@ti.test');
select is((select count(*)::int from public.dist_distribuidores), 1, 'o Gestor da TI ve o pedido');
select is((select codigo from public.dist_clientes_para_ligar((select id from p), '') where mesmo_cnpj), 'D-1',
  'o cliente de mesmo CNPJ aparece para ligar, sem buscar');
select throws_ok($$ select public.dist_decidir((select id from p), 'liberar', 'NAO-EXISTE') $$,
  '23514', null, 'liberar exige o cliente do Forteplus');
select lives_ok($$ select public.dist_decidir((select id from p), 'liberar', 'D-1') $$, 'o Gestor libera');
select is(public.dist_dados_do_email('liberado', (select id from p)) ->> 'para', 'dono@dist.test',
  'e o e-mail de acesso liberado vai para quem pediu');

-- ── 3. Termos e equipe ──────────────────────────────────────────────────────────────────────────────────────────
select tests.clear_authentication();
select tests.authenticate_as('dono@dist.test');
select is(public.dist_situacao('v1') ->> 'termos_ok', 'false', 'liberado, ainda falta aceitar os termos');
select public.dist_aceitar_termos('v1');
select is(public.dist_situacao('v1') ->> 'termos_ok', 'true', 'aceitou, entra');
select public.dist_convidar('Vendedor@Dist.test', 'Vendedor');

select tests.clear_authentication();
select tests.authenticate_as('outro@dist.test');
select is((select count(*)::int from public.dist_distribuidores), 0, 'outra pessoa de fora nao ve o distribuidor');
select throws_ok($$ select public.dist_aceitar_convite((select id from public.dist_membros limit 1)) $$,
  'P0002', null, 'nem aceita convite que nao e do e-mail dela');

select tests.clear_authentication();
select tests.authenticate_as('vendedor@dist.test');
select public.dist_aceitar_convite((public.dist_situacao('v1') ->> 'convite')::uuid);
select is(public.dist_situacao('v1') ->> 'papel', 'vendedor', 'o vendedor entra pelo convite do e-mail dele');
select throws_ok($$ select public.dist_convidar('mais@dist.test', null) $$,
  '42501', null, 'o vendedor nao convida');

select tests.clear_authentication();
select tests.authenticate_as('dono@dist.test');
select public.dist_tirar_da_equipe((select id from public.dist_membros where papel = 'vendedor'));
select tests.clear_authentication();
select tests.authenticate_as('vendedor@dist.test');
select is(public.dist_situacao('v1') ->> 'situacao', 'sem_pedido', 'tirado da equipe, o vendedor perde o portal');

select * from finish();
rollback;

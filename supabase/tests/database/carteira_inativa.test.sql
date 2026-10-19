-- INATIVAR CARTEIRA (migration 20270128020000; dono, 2026-10-19). BERCARIO tem 2 clientes e uma vendedora; MG recebe.
--   1  sem gerir carteiras, inativar é recusado (42501)
--   2  com clientes e sem destino, é recusado
--   3  inativar move os clientes para o destino
--   4  a vendedora sai da carteira
--   5  a carteira some de com_carteiras_conhecidas
--   6  a importação que trouxer o nome antigo cai no destino (memória de renomeações)
--   7  não dá para mandar clientes para uma carteira inativa
--   8  reativar devolve a carteira às listas
--   9  as funções novas não abrem para anon
begin;
\ir _helpers.psql

select plan(9);

create temporary table f on commit drop as
select tests.create_tenant('carteira-inativa', 'Carteira Inativa', false) as tenant;
create temporary table u on commit drop as
select tests.create_user('dono@carteira-inativa.test', (select tenant from f)) as dono,
       tests.create_user('vend@carteira-inativa.test', (select tenant from f)) as vend;
select tests.grant_role((select dono from u), 'owner');
select tests.grant_role((select vend from u), 'member');
select tests.grant_module((select vend from u), (select tenant from f), 'comercial');
grant select on f, u to authenticated;

insert into public.com_clientes (tenant_id, codigo, razao_social, carteira)
select tenant, c, 'Cliente ' || c, k from f, (values ('C1', 'BERCARIO'), ('C2', 'BERCARIO'), ('C3', 'MG')) v(c, k);
insert into public.com_carteira_membros (tenant_id, carteira, user_id)
select tenant, k, (select vend from u) from f, (values ('BERCARIO'), ('MG'), ('ANTIGA')) v(k);
-- A meta passada fica: é ela que manteria BERCARIO na lista se o filtro de inativas não existisse.
insert into public.metas_carteira (tenant_id, ano, mes, carteira, realizado) select tenant, 2025, 1, 'BERCARIO', 100 from f;

select tests.authenticate_as('vend@carteira-inativa.test');
select throws_ok($$ select public.com_inativar_carteira('BERCARIO', 'MG') $$, '42501', null,
  'sem gerir carteiras, inativar e recusado');
select tests.clear_authentication();

select tests.authenticate_as('dono@carteira-inativa.test');
select throws_ok($$ select public.com_inativar_carteira('BERCARIO', null) $$, '22023', null,
  'carteira com clientes sem destino e recusada');
select public.com_inativar_carteira('Berçário', 'mg');
select is((select count(*)::int from public.com_clientes where carteira = 'MG'), 3, 'os clientes vao para o destino');
select is((select count(*)::int from public.com_carteira_membros where carteira = 'BERCARIO'), 0, 'a vendedora sai da carteira');
select ok(not exists (select 1 from public.com_carteiras_conhecidas() where carteira = 'BERCARIO')
          and exists (select 1 from public.com_carteiras_conhecidas() where carteira = 'MG'), 'a carteira some das listas');
select is((select para from public.com_carteira_renomeacoes where de = 'BERCARIO'), 'MG', 'a importacao com o nome antigo cai no destino');
select throws_ok($$ select public.com_inativar_carteira('ANTIGA', 'BERCARIO') $$, '22023', null,
  'nao se manda cliente para carteira inativa');
select public.com_reativar_carteira('BERCARIO');
select ok(not exists (select 1 from public.com_carteiras_inativas where carteira = 'BERCARIO')
          and not exists (select 1 from public.com_carteira_renomeacoes where de = 'BERCARIO'), 'reativar devolve a carteira');
select tests.clear_authentication();

select ok(not has_function_privilege('anon', 'public.com_inativar_carteira(text, text)', 'execute')
      and not has_function_privilege('anon', 'public.com_reativar_carteira(text)', 'execute'), 'as funcoes novas nao abrem para anon');

select * from finish();
rollback;

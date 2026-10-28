-- VENDEDORA DESATIVADA LEVA A CARTEIRA PARA ALGUÉM (migration 20270212070000; dono, 2026-10-28).
-- A vendedora cuida de BERCARIO e MG (responsável nas duas); a destino já está em MG.
--   1  sem gerir carteiras, é recusado (42501)
--   2  com carteira e sem destino, é recusado (22023)
--   3  o destino entra nas carteiras dela, com o mesmo papel de responsável
--   4  ela sai de todas as carteiras
--   5  e deixa de ser vendedora ativa
--   6  sem carteira, não precisa de destino
--   7  a função não abre para anon
begin;
\ir _helpers.psql

select plan(7);

create temporary table f on commit drop as
select tests.create_tenant('vendedora-sai', 'Vendedora Sai', false) as tenant;
create temporary table u on commit drop as
select tests.create_user('dono@vendedora-sai.test', (select tenant from f)) as dono,
       tests.create_user('vend@vendedora-sai.test', (select tenant from f)) as vend,
       tests.create_user('dest@vendedora-sai.test', (select tenant from f)) as dest,
       tests.create_user('solta@vendedora-sai.test', (select tenant from f)) as solta;
select tests.grant_role((select dono from u), 'owner');
select tests.grant_role((select vend from u), 'member');
grant select on f, u to authenticated;

insert into public.com_carteira_membros (tenant_id, carteira, user_id, responsavel)
select tenant, k, p, r from f, (values ('BERCARIO', (select vend from u), true), ('MG', (select vend from u), false),
                                       ('MG', (select dest from u), false)) v(k, p, r);
insert into public.com_vendedores (tenant_id, codigo, nome, user_id, ativo)
select tenant, '2098', 'VENDEDORA', (select vend from u), true from f;

select tests.authenticate_as('vend@vendedora-sai.test');
select throws_ok(format($$ select public.com_vendedora_sai(%L, %L) $$, (select vend from u), (select dest from u)),
  '42501', null, 'sem gerir carteiras, e recusado');
select tests.clear_authentication();

select tests.authenticate_as('dono@vendedora-sai.test');
select throws_ok(format($$ select public.com_vendedora_sai(%L, null) $$, (select vend from u)),
  '22023', null, 'com carteira e sem destino, e recusado');
select public.com_vendedora_sai((select vend from u), (select dest from u));
select tests.clear_authentication();

-- Em MG ela também era responsável: entrou primeiro numa carteira sem responsável (`com_primeiro_membro_e_responsavel`).
select is((select string_agg(carteira || ':' || responsavel, ',' order by carteira) from public.com_carteira_membros
            where user_id = (select dest from u)), 'BERCARIO:true,MG:true',
  'o destino entra nas carteiras dela, com o mesmo papel');
select is((select count(*)::int from public.com_carteira_membros where user_id = (select vend from u)), 0,
  'ela sai de todas as carteiras');
select is((select ativo from public.com_vendedores where user_id = (select vend from u)), false,
  'e deixa de ser vendedora ativa');

select tests.authenticate_as('dono@vendedora-sai.test');
select lives_ok(format($$ select public.com_vendedora_sai(%L, null) $$, (select solta from u)),
  'sem carteira, nao precisa de destino');
select tests.clear_authentication();

select ok(not has_function_privilege('anon', 'public.com_vendedora_sai(uuid, uuid)', 'execute'),
  'a funcao nao abre para anon');

select * from finish();
rollback;

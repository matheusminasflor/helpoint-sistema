-- ABRIR CHAMADO EM NOME DE OUTRA PESSOA (migration 20270116010000; dono, 2026-10-15). O Yuri (TI) abre para a Laura
-- (Financeiro), que ligou no ramal; o Beto não atende setor nenhum.
--   1  o atendente abre em nome de outra pessoa (com RETURNING, como a tela)
--   2  a solicitante vê o chamado
--   3  ... e é avisada de que abriram em nome dela
--   4  quem não atende setor nenhum não abre em nome de outro
--   5  quem abriu continua vendo o chamado, mesmo de um setor que não atende
--   6  administrador sem perfil de atendente também abre em nome de outro (20270117020000)
begin;
\ir _helpers.psql

select plan(6);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-em-nome', 'Em Nome') as tenant;
create temporary table u on commit drop as
select tests.create_user('yuri@emnome.test',  (select tenant from f)) as yuri,
       tests.create_user('laura@emnome.test', (select tenant from f)) as laura,
       tests.create_user('beto@emnome.test',  (select tenant from f)) as beto,
       tests.create_user('adm@emnome.test',   (select tenant from f)) as adm;
select tests.grant_role((select adm from u), 'admin');
select tests.grant_module((select yuri from u), (select tenant from f), 'ti');
select tests.grant_profile((select yuri from u), (select tenant from f), 'ti', 'Operador');
grant select on f, u to authenticated;

select tests.authenticate_as('yuri@emnome.test');
create temporary table ch on commit drop as
with x as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, created_by, priority)
  select tenant, 'tickets', 'Computador nao liga', 'Ligou no ramal', (select laura from u), (select yuri from u), 'high' from f
  returning id
) select id from x;
create temporary table ch_rh on commit drop as
with x as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, created_by, priority)
  select tenant, 'rh', 'Ferias', 'Pediu por telefone', (select laura from u), (select yuri from u), 'low' from f
  returning id
) select id from x;
select tests.clear_authentication();
grant select on ch, ch_rh to authenticated;
select is((select count(*)::int from ch), 1, 'o atendente abre em nome de outra pessoa');

select tests.authenticate_as('laura@emnome.test');
select is((select requester_id from public.tickets where id = (select id from ch)), (select laura from u), 'a solicitante ve o chamado');
select tests.clear_authentication();
select is((select count(*)::int from public.notifications where user_id = (select laura from u) and title like '%aberto em seu nome'), 2,
  'e e avisada de que abriram em nome dela');

select tests.authenticate_as('beto@emnome.test');
select throws_ok(format($$ insert into public.tickets (tenant_id, module, title, description, requester_id, created_by, priority)
                           values (%L::uuid, 'tickets', 'x', 'x', %L::uuid, %L::uuid, 'low') returning id $$,
                        (select tenant from f), (select laura from u), (select beto from u)),
  '42501', null, 'quem nao atende setor nenhum nao abre em nome de outro');
select tests.clear_authentication();

select tests.authenticate_as('yuri@emnome.test');
select is((select count(*)::int from public.tickets where id = (select id from ch_rh)), 1, 'quem abriu continua vendo, mesmo de outro setor');
select tests.clear_authentication();

select tests.authenticate_as('adm@emnome.test');
select lives_ok(format($$ insert into public.tickets (tenant_id, module, title, description, requester_id, created_by, priority)
                         values (%L::uuid, 'tickets', 'x', 'x', %L::uuid, %L::uuid, 'low') returning id $$,
                      (select tenant from f), (select laura from u), (select adm from u)),
  'administrador sem perfil de atendente abre em nome de outro');
select tests.clear_authentication();

select * from finish();
rollback;

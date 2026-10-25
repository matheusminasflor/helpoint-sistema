-- O Meu RH liga num passo (migration 20270205010000): desligado, férias abre chamado como sempre; ligado, não abre e
-- quem decide no RH recebe o aviso. Só quem configura o RH liga. Inserção com `returning` (regra 11).
begin;
\ir _helpers.psql

select plan(6);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-meurh', 'Meu RH', false) as a;

create temporary table u on commit drop as
select tests.create_user('pessoa@meurh.test', (select a from f)) as pessoa,
       tests.create_user('rh@meurh.test', (select a from f))     as rh,
       tests.create_user('dono@meurh.test', (select a from f))   as dono;
grant select on f, u to authenticated;
select tests.grant_profile((select rh from u), (select a from f), 'rh', 'Gestor');
select tests.grant_module((select rh from u), (select a from f), 'rh');
select tests.grant_role((select dono from u), 'owner');

create temporary table r (ticket uuid) on commit drop;
grant select, insert on r to authenticated;

select tests.authenticate_as('pessoa@meurh.test');
insert into r
with n as (insert into public.rh_vacation_requests (tenant_id, user_id, start_date, end_date, days_requested, type)
           select a, (select pessoa from u), '2027-01-10', '2027-01-20', 11, 'ferias' from f returning ticket_id)
select ticket_id from n;
select isnt((select ticket from r), null, 'desligado: o pedido de ferias abre o chamado, como sempre');

select throws_ok($$ select public.rh_ligar_meu_rh(true) $$, '42501', null, 'quem nao configura o RH nao liga');

select tests.clear_authentication();
select tests.authenticate_as('dono@meurh.test');
select is(public.rh_ligar_meu_rh(true), true, 'o dono liga o Meu RH');

select tests.clear_authentication();
select tests.authenticate_as('pessoa@meurh.test');
select is(public.meu_rh_ligado((select a from f)), true, 'e a tela le que esta ligado');
delete from r;
insert into r
with n as (insert into public.rh_vacation_requests (tenant_id, user_id, start_date, end_date, days_requested, type)
           select a, (select pessoa from u), '2027-02-10', '2027-02-12', 3, 'ferias' from f returning ticket_id)
select ticket_id from n;
select is((select ticket from r), null, 'ligado: o pedido nao abre chamado');

select tests.clear_authentication();
select is(
  (select count(*)::int from public.notifications where user_id = (select rh from u) and reference_type = 'rh_aprovacao'),
  1, 'e quem decide no RH recebe o aviso');

select * from finish();
rollback;

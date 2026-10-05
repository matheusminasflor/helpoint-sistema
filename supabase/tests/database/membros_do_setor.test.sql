-- Quem atende cada setor (migration 20261123010000): a lista do filtro de colaborador e do gráfico
-- "por atendente" dos Indicadores. Só quem tem o setor, e só para quem pode ver o setor.
begin;
\ir _helpers.psql

select plan(5);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-membros-setor', 'Membros do setor', false) as a;
create temporary table u on commit drop as
select tests.create_user('ti1@membros.test',  (select a from f)) as ti1,
       tests.create_user('ti2@membros.test',  (select a from f)) as ti2,
       tests.create_user('mkt@membros.test',  (select a from f)) as mkt,
       tests.create_user('dir@membros.test',  (select a from f)) as dir,
       -- 2026-10-04: o dono atende a TI sem ter a concessão (owner vê tudo sem ela).
       tests.create_user('dono@membros.test', (select a from f)) as dono;
select tests.grant_module((select ti1 from u), (select a from f), 'ti');
select tests.grant_module((select ti2 from u), (select a from f), 'ti');
select tests.grant_module((select mkt from u), (select a from f), 'marketing');
select tests.grant_module((select dir from u), (select a from f), 'diretoria');
grant select on f, u to authenticated;

-- O dono é o atendente de um chamado da TI (módulo 'tickets'); o do Marketing, de um do Marketing.
insert into public.tickets (tenant_id, title, description, requester_id, module, priority, assigned_to)
values ((select a from f), 'ti do dono', 'x', (select ti1 from u), 'tickets', 'medium', (select dono from u)),
       ((select a from f), 'mkt', 'x', (select ti1 from u), 'marketing', 'medium', (select mkt from u));

select tests.authenticate_as('ti1@membros.test');
select is((select array_agg(email::text order by email) from public.membros_do_setor('ti')),
  array['dono@membros.test', 'ti1@membros.test', 'ti2@membros.test'],
  'a TI lista quem tem a TI e quem atendeu chamado da TI — o Marketing nao entra');
select tests.clear_authentication();

select tests.authenticate_as('mkt@membros.test');
select is((select array_agg(email::text order by email) from public.membros_do_setor('marketing')),
  array['mkt@membros.test'], 'atender chamado da TI nao poe ninguem no Marketing');
select tests.clear_authentication();

select tests.authenticate_as('mkt@membros.test');
select is((select count(*)::int from public.membros_do_setor('ti')), 0,
  'quem e do Marketing nao lista a equipe da TI');
select tests.clear_authentication();

select tests.authenticate_as('dir@membros.test');
select is((select count(*)::int from public.membros_do_setor('ti')), 3, 'a Diretoria ve a equipe de qualquer setor');
select tests.clear_authentication();

select ok(not has_function_privilege('anon', 'public.membros_do_setor(text)', 'execute'), 'anon nao chama');

select * from finish();
rollback;

-- COMERCIAL: "SÓ OS MEUS × EQUIPE" POR TELA (migration 20270112010000; dono, 2026-10-14). Duas vendedoras com o
-- perfil Operador do jeito novo (nada de equipe); depois a exceção da pessoa libera a equipe numa tela só.
--   1  sem "ver a equipe", a vendedora vê só os lançamentos dela
--   2  ... e o painel de indicadores mostra só ela
--   3  ... e não abre a carteira da colega
--   4  com "Indicadores: ver a equipe" (exceção na pessoa), vê os lançamentos da colega
--   5  ... e o painel mostra as duas
--   6  ... mas a carteira da colega continua fechada (é outra caixinha)
--   7  com "Carteiras: ver a equipe", abre a carteira da colega
--   8  a função nova não abre para anon
begin;
\ir _helpers.psql

select plan(8);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-com-escopo', 'Comercial Escopo', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@comescopo.test', (select a from f)) as ana,
       tests.create_user('bia@comescopo.test', (select a from f)) as bia;
select tests.grant_module((select ana from u), (select a from f), 'comercial');
select tests.grant_module((select bia from u), (select a from f), 'comercial');
select tests.grant_profile((select ana from u), (select a from f), 'comercial', 'Operador');
select tests.grant_profile((select bia from u), (select a from f), 'comercial', 'Operador');
update public.access_profiles
   set permissions = (permissions - 'dashboard') || '{"lancamentos": {"view": true, "equipe": false},
     "carteiras": {"view": true, "equipe": false}, "reports": {"view": true, "view_team_metrics": false},
     "clientes": {"view": true}}'::jsonb
 where tenant_id = (select a from f) and department = 'comercial' and name = 'Operador';
insert into public.com_clientes (tenant_id, codigo, razao_social, carteira, origem)
values ((select a from f), '1203', 'CLIENTE MG', 'MG', 'cadastro'), ((select a from f), '2001', 'CLIENTE SP', 'SP', 'cadastro');
insert into public.com_carteira_membros (tenant_id, user_id, carteira, responsavel)
values ((select a from f), (select ana from u), 'MG', true), ((select a from f), (select bia from u), 'SP', true);
grant select on f, u to authenticated;

select tests.authenticate_as('bia@comescopo.test');
insert into public.com_interacoes (cliente_codigo, data, status) values ('2001', (now() at time zone 'America/Sao_Paulo')::date, 'concluido') returning id;
select tests.clear_authentication();
select tests.authenticate_as('ana@comescopo.test');
insert into public.com_interacoes (cliente_codigo, data, status) values ('1203', (now() at time zone 'America/Sao_Paulo')::date, 'concluido') returning id;

select is((select count(*)::int from public.com_interacoes), 1, 'sem ver a equipe: so os lancamentos dela');
select is((select count(*)::int from public.com_vendedoras_do_painel(date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date)), 1,
  'sem ver a equipe: o painel mostra so ela');
select ok(not public.com_pode_ver_carteira('SP'), 'sem ver a equipe: nao abre a carteira da colega');
select tests.clear_authentication();

update public.user_access_profiles set overrides = '{"reports": {"view_team_metrics": true}}'::jsonb
 where user_id = (select ana from u) and department = 'comercial';
select tests.authenticate_as('ana@comescopo.test');
select is((select count(*)::int from public.com_interacoes), 2, 'com Indicadores: ver a equipe, ve os lancamentos da colega');
select is((select count(*)::int from public.com_vendedoras_do_painel(date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date)), 2,
  'com Indicadores: ver a equipe, o painel mostra as duas');
select ok(not public.com_pode_ver_carteira('SP'), 'a carteira da colega continua fechada (outra caixinha)');
select tests.clear_authentication();

update public.user_access_profiles set overrides = '{"carteiras": {"equipe": true}}'::jsonb
 where user_id = (select ana from u) and department = 'comercial';
select tests.authenticate_as('ana@comescopo.test');
select ok(public.com_pode_ver_carteira('SP'), 'com Carteiras: ver a equipe, abre a carteira da colega');
select tests.clear_authentication();

select ok(not has_function_privilege('anon', 'public.com_tem(text,text)', 'execute'), 'a funcao nova nao abre para anon');

select * from finish();
rollback;

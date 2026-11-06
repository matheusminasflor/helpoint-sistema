-- O histórico da tabela do cliente: a Venda total lê a tabela do dia da venda, e trocar a tabela não mexe no que já passou.
--   1  o cliente novo nasce com a tabela no histórico
--   2  a venda de outubro em condição conta em dobro
--   3  sair da condição grava a troca
--   4  a venda antes da troca segue em dobro
--   5  a venda depois da troca conta o faturado
--   6  voltar para a condição conta de novo dali em diante
--   7  o mês do meio não muda
--   8  entrar na condição não mexe no mês anterior
--   9  a primeira tabela de quem chegou sem tabela vale desde sempre
--  10  salvar o cliente sem trocar a tabela não grava linha
--  11  quem só tem o Comercial troca a tabela e o histórico grava
--  12  quem não corrige lançamento é recusado
--  13  corrigir a data da troca muda a venda daquele dia
--  14  a data não passa da tabela seguinte
--  15  a primeira tabela não tem data
begin;
\ir _helpers.psql

select plan(15);

create temporary table f on commit drop as select tests.create_tenant('pgtap-historico', 'Historico', false) as a;
create temporary table u on commit drop as select tests.create_user('dono@historico.test', (select a from f)) as dono;
select tests.grant_role((select dono from u), 'owner');
grant select on f, u to authenticated;

insert into public.com_clientes (tenant_id, codigo, razao_social, carteira, tabela_preco, ativo, origem)
select a, x.c, x.c, 'X', x.t, true, 'cadastro' from f, (values ('A', 'VIP CONDICAO'), ('B', 'VIP'), ('C', null)) x(c, t);

-- O cliente já existia antes das trocas datadas abaixo.
update public.com_clientes_tabela_historico set vigente_desde = '2026-10-01' where tenant_id = (select a from f);

create temporary table v on commit drop as select tests.create_user('ana@historico.test', (select a from f)) as ana;
select tests.grant_module((select ana from v), (select a from f), 'comercial');

select tests.authenticate_as('dono@historico.test');

select is((select count(*)::int from public.com_clientes_tabela_historico where cliente_codigo = 'A'), 1,
  'o cliente novo nasce com a tabela no histórico');

select is(public.com_parte_do_cliente('A', '2026-10-15'), 1::numeric, 'a venda de outubro em condição conta em dobro');

-- As trocas com data: em produção a data é a do dia em que a tabela mudou.
insert into public.com_clientes_tabela_historico (tenant_id, cliente_codigo, tabela_preco, vigente_desde) select (select a from f), x.c, x.t, date '2026-11-01' from (values ('A', 'VIP'), ('B', 'ATACADISTA CONDIÇÃO')) x(c, t);
update public.com_clientes set tabela_preco = 'VIP' where codigo = 'A';
update public.com_clientes set tabela_preco = 'ATACADISTA CONDIÇÃO' where codigo = 'B';

select is((select count(*)::int from public.com_clientes_tabela_historico where cliente_codigo = 'A'), 2,
  'sair da condição grava a troca, uma vez só');
select is(public.com_parte_do_cliente('A', '2026-10-31'), 1::numeric, 'a venda antes da troca segue em dobro');
select is(public.com_parte_do_cliente('A', '2026-11-01'), 0::numeric, 'a venda depois da troca conta o faturado');

insert into public.com_clientes_tabela_historico (tenant_id, cliente_codigo, tabela_preco, vigente_desde)
select a, 'A', 'VIP MAIS CONDICAO', date '2026-12-01' from f;
select is(public.com_parte_do_cliente('A', '2026-12-01'), 1::numeric, 'voltar para a condição conta de novo dali em diante');
select is(public.com_parte_do_cliente('A', '2026-11-30'), 0::numeric, 'o mês do meio não muda');
select is(public.com_parte_do_cliente('B', '2026-10-31'), 0::numeric, 'entrar na condição não mexe no mês anterior');

update public.com_clientes set tabela_preco = 'VIP CONDICAO' where codigo = 'C';
select is(public.com_parte_do_cliente('C', '2026-10-15'), 1::numeric, 'a primeira tabela de quem chegou sem tabela vale desde sempre');

update public.com_clientes set razao_social = 'Outro nome', tabela_preco = 'VIP CONDICAO' where codigo = 'C';
select is((select count(*)::int from public.com_clientes_tabela_historico where cliente_codigo = 'C'), 1,
  'salvar o cliente sem trocar a tabela não grava linha');

select tests.clear_authentication();
select tests.authenticate_as('ana@historico.test');
update public.com_clientes set tabela_preco = 'VIP' where codigo = 'C';
select tests.clear_authentication();
select is((select count(*)::int from public.com_clientes_tabela_historico where cliente_codigo = 'C'), 2,
  'quem só tem o Comercial troca a tabela e o histórico grava');
select tests.authenticate_as('ana@historico.test');
select throws_ok($$ select public.com_corrigir_data_da_tabela(
  (select id from public.com_clientes_tabela_historico where cliente_codigo = 'B' order by vigente_desde desc limit 1), '2026-10-20') $$,
  '42501', null, 'quem não corrige lançamento é recusado');
select tests.clear_authentication();

select tests.authenticate_as('dono@historico.test');
select public.com_corrigir_data_da_tabela(
  (select id from public.com_clientes_tabela_historico where cliente_codigo = 'B' order by vigente_desde desc limit 1), '2026-10-20');
select is(public.com_parte_do_cliente('B', '2026-10-25'), 1::numeric, 'corrigir a data da troca muda a venda daquele dia');
select throws_ok($$ select public.com_corrigir_data_da_tabela(
  (select id from public.com_clientes_tabela_historico where cliente_codigo = 'A' and vigente_desde = '2026-11-01'), '2026-12-05') $$,
  '22023', null, 'a data não passa da tabela seguinte');
select throws_ok($$ select public.com_corrigir_data_da_tabela(
  (select id from public.com_clientes_tabela_historico where cliente_codigo = 'B' order by vigente_desde limit 1), '2026-10-05') $$,
  '22023', null, 'a primeira tabela não tem data');
select tests.clear_authentication();
select * from finish();
rollback;

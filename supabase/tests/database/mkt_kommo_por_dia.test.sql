-- KOMMO POR DIA E O MÊS DA META (migrations 20270212650000 e 20270212660000).
--   1  a gravação troca as linhas a partir da data, sem tocar nas de antes
--   2  as perdas também
--   3  quem não vê os Indicadores do Marketing não lê os dias do Kommo
--   4  nem o mês da Meta
--   5  a gravação não abre para o navegador
--   6  o navegador não grava direto na tabela
--   7  as vendas com nome também ficam fechadas a quem não vê os Indicadores
--   8  e a gravação delas não abre para o navegador
begin;
\ir _helpers.psql

select plan(8);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-kommo-dia', 'Kommo dia', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@kommodia.test', (select a from f)) as ana;
grant select on f, u to authenticated;

insert into public.mkt_kommo_dia (tenant_id, dia, funil, chegaram) values ((select a from f), '2026-10-31', 'salao', 3);
select public.mkt_kommo_gravar((select a from f), '2026-11-01',
  '[{"dia":"2026-11-01","funil":"salao","chegaram":5,"ganhas":1,"perdidas":2,"valor_ganho":100},{"dia":"2026-10-30","funil":"salao","chegaram":9,"ganhas":0,"perdidas":0,"valor_ganho":0}]'::jsonb,
  '[{"dia":"2026-11-01","funil":"salao","motivo":null,"quantos":2}]'::jsonb);
select public.mkt_kommo_gravar((select a from f), '2026-11-01',
  '[{"dia":"2026-11-01","funil":"salao","chegaram":6,"ganhas":1,"perdidas":2,"valor_ganho":100}]'::jsonb,
  '[{"dia":"2026-11-01","funil":"salao","motivo":"Preço","quantos":2}]'::jsonb);
select is((select string_agg(dia || ':' || chegaram, ',' order by dia) from public.mkt_kommo_dia where tenant_id = (select a from f)),
  '2026-10-31:3,2026-11-01:6', 'troca a partir da data e guarda o que veio antes');
select is((select string_agg(coalesce(motivo, '-') || ':' || quantos, ',') from public.mkt_kommo_perdas where tenant_id = (select a from f)),
  'Preço:2', 'as perdas também são trocadas');

insert into public.mkt_redes_mes (tenant_id, mes, conta, visitas_perfil) values ((select a from f), '2026-10-01', '@minasflor', 10);
select public.mkt_kommo_gravar_vendas((select a from f), '2026-11-01',
  '[{"lead_id":1,"nome":"Priscila","funil":"distribuidor","situacao":"ganha","valor":5096,"fechou":"2026-11-02","motivo":null,"link":"x"}]'::jsonb);
select tests.authenticate_as('ana@kommodia.test');
select is((select count(*)::int from public.mkt_kommo_dia), 0, 'sem acesso aos Indicadores, não lê o Kommo');
select is((select count(*)::int from public.mkt_redes_mes), 0, 'nem o mês da Meta');
select is((select count(*)::int from public.mkt_kommo_vendas), 0, 'nem as vendas com nome');
select tests.clear_authentication();

select ok(not has_function_privilege('authenticated', 'public.mkt_kommo_gravar(uuid, date, jsonb, jsonb)', 'execute'), 'a gravação não abre para o navegador');
select ok(not has_table_privilege('authenticated', 'public.mkt_kommo_dia', 'insert'), 'o navegador não grava direto');
select ok(not has_function_privilege('authenticated', 'public.mkt_kommo_gravar_vendas(uuid, date, jsonb)', 'execute'), 'a gravação das vendas não abre para o navegador');

select * from finish();
rollback;

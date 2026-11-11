-- BUSCA DE CLIENTE SEM ACENTO E COM VÍRGULA (20270212721400; revisão do Comercial, 2026-11-12).
--   1  "salao" acha "SALÃO" (ignora acento e maiúscula)
--   2  um termo com vírgula não quebra e acha o nome com vírgula
--   3  procura também no nome fantasia
--   4  procura pelo código
--   5  menos de 2 letras não devolve nada
begin;
\ir _helpers.psql

select plan(5);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-com-busca', 'Busca de clientes', false) as a;

insert into public.com_clientes (tenant_id, codigo, razao_social, fantasia) values
  ((select a from f), '9001', 'SALÃO BELA VISTA, LTDA', null),
  ((select a from f), '9002', 'DISTRIBUIDORA NORTE', 'Cabelos & Cia'),
  ((select a from f), '9003', 'MARIA JOSÉ CONCEIÇÃO', null);

create function pg_temp.busca(t text) returns text language sql as $$
  select coalesce(string_agg(codigo, ',' order by codigo), '') from public.com_buscar_clientes(t) where tenant_id = (select a from f)
$$;

select is(pg_temp.busca('salao'), '9001', '"salao" acha "SALÃO"');
select is(pg_temp.busca('bela vista, ltda'), '9001', 'o termo com vírgula não quebra');
select is(pg_temp.busca('cabelos'), '9002', 'procura no nome fantasia');
select is(pg_temp.busca('9003'), '9003', 'procura pelo código');
select is(pg_temp.busca('m'), '', 'com 1 letra não devolve nada');

select * from finish();
rollback;

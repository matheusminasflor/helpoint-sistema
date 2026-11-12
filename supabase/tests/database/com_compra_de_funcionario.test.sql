-- COMPRA DE FUNCIONÁRIO FORA DA META (20270212721950): cliente interno não é de carteira nenhuma.
--   1  cadastrar um interno numa carteira: a carteira não fica
--   2  marcar um cliente da carteira como interno: ele sai da carteira
--   3  cliente comum continua na carteira dele
begin;
\ir _helpers.psql

select plan(3);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-funcionario', 'Funcionário', false) as a;

insert into public.com_clientes (tenant_id, codigo, razao_social, carteira, origem, interno)
values ((select a from f), '1', 'VENDEDORA QUE COMPRA', 'MG', 'cadastro', true),
       ((select a from f), '2', 'FUNCIONARIO NOVO', 'MG', 'cadastro', false),
       ((select a from f), '3', 'SALAO DE VERDADE', 'MG', 'cadastro', false);
update public.com_clientes set interno = true where tenant_id = (select a from f) and codigo = '2';

select is((select carteira from public.com_clientes where tenant_id = (select a from f) and codigo = '1'), null,
  'cadastrar um interno numa carteira: a carteira não fica');
select is((select carteira from public.com_clientes where tenant_id = (select a from f) and codigo = '2'), null,
  'marcar como interno tira da carteira');
select is((select carteira from public.com_clientes where tenant_id = (select a from f) and codigo = '3'), 'MG',
  'cliente comum continua na carteira');

select * from finish();
rollback;

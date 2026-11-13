-- COMPRA DE FUNCIONÁRIO FORA DA META (20270212721950) e CARTEIRA COLABORADORES (20270212722310):
-- o cliente interno vai para a COLABORADORES, e a compra dele não entra na venda de ninguém.
--   1  cadastrar um interno: ele nasce na COLABORADORES, seja qual for a carteira pedida
--   2  marcar um cliente da carteira como interno: ele passa para a COLABORADORES
--   3  cliente comum continua na carteira dele
--   4  interno já marcado não vai para outra carteira (fica sem)
--   5  cliente comum não entra na COLABORADORES
--   6  a vendedora não marca ninguém como colaborador
--   7  com a COLABORADORES tendo responsável, a compra do interno não vira faturado dela
--   8  a do cliente comum continua virando
begin;
\ir _helpers.psql

select plan(8);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-funcionario', 'Funcionário', false) as a;
create temporary table u on commit drop as
select tests.create_user('vendedora@funcionario.test', (select a from f)) as vend,
       tests.create_user('dono@funcionario.test', (select a from f)) as dono;
select tests.grant_role((select dono from u), 'owner');
select tests.grant_module((select vend from u), (select a from f), 'comercial');
grant select on f, u to authenticated;

insert into public.com_clientes (tenant_id, codigo, razao_social, carteira, origem, interno)
values ((select a from f), '1', 'VENDEDORA QUE COMPRA', 'MG', 'cadastro', true),
       ((select a from f), '2', 'FUNCIONARIO NOVO', 'MG', 'cadastro', false),
       ((select a from f), '3', 'SALAO DE VERDADE', 'MG', 'cadastro', false);
update public.com_clientes set interno = true where tenant_id = (select a from f) and codigo = '2';

select is((select carteira from public.com_clientes where tenant_id = (select a from f) and codigo = '1'), 'COLABORADORES',
  'cadastrar um interno: ele nasce na COLABORADORES');
select is((select carteira from public.com_clientes where tenant_id = (select a from f) and codigo = '2'), 'COLABORADORES',
  'marcar como interno leva para a COLABORADORES');
select is((select carteira from public.com_clientes where tenant_id = (select a from f) and codigo = '3'), 'MG',
  'cliente comum continua na carteira');

update public.com_clientes set carteira = 'MG' where tenant_id = (select a from f) and codigo = '1';
select is((select carteira from public.com_clientes where tenant_id = (select a from f) and codigo = '1'), null,
  'interno não vai para outra carteira');
update public.com_clientes set carteira = 'COLABORADORES' where tenant_id = (select a from f) and codigo = '1';

select throws_ok($$ update public.com_clientes set carteira = 'COLABORADORES'
                     where tenant_id = (select a from f) and codigo = '3' $$,
  '22023', null, 'cliente comum não entra na COLABORADORES');

-- A venda: uma nota de cada cliente, e a vendedora responde pelas duas carteiras.
insert into public.com_vendas_importacoes (id, tenant_id, tipo, file_name, linhas_lidas)
values ('00000000-0000-0000-0000-00000000f001', (select a from f), 'vendas', 'pgtap.xlsx', 2);
insert into public.com_vendas_itens (tenant_id, importacao_id, filial, emissao, documento, serie, cfop, classe,
                                     cliente_codigo, produto_codigo, produto_nome, quantidade, valor_nota)
values ((select a from f), '00000000-0000-0000-0000-00000000f001', 'MF', '2034-05-10', 'N1', '75', '5102', 'venda', '1', 'P', 'P', 1, 100),
       ((select a from f), '00000000-0000-0000-0000-00000000f001', 'MF', '2034-05-10', 'N2', '1', '5102', 'venda', '3', 'P', 'P', 1, 300);
insert into public.com_carteira_membros (tenant_id, carteira, user_id)
values ((select a from f), 'COLABORADORES', (select vend from u)), ((select a from f), 'MG', (select vend from u));

-- A vendedora tenta marcar o salão como colaborador: recusado no gatilho ou barrado antes, o salão não muda.
select tests.authenticate_as('vendedora@funcionario.test');
do $$ begin
  update public.com_clientes set interno = true where codigo = '3';
exception when others then null;
end $$;
select tests.clear_authentication();
select is((select interno from public.com_clientes where tenant_id = (select a from f) and codigo = '3'), false,
  'a vendedora não marca ninguém como colaborador');

select tests.authenticate_as('dono@funcionario.test');
select is((select coalesce(sum(faturado), 0) from public.com_venda_atribuida('2034-05-01', '2034-05-31') where cliente_codigo = '1'),
  0::numeric, 'a compra do interno não vira faturado da responsável da COLABORADORES');
select is((select coalesce(sum(faturado), 0) from public.com_venda_atribuida('2034-05-01', '2034-05-31') where cliente_codigo = '3'),
  300::numeric, 'a do cliente comum continua virando faturado');
select tests.clear_authentication();

select * from finish();
rollback;

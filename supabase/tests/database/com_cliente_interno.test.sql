-- CLIENTE INTERNO FORA DA BONIFICAÇÃO (20270212721600).
--   1  o cliente de verdade que recebe sem comprar continua no farol
--   2  o interno (vendedor, a própria empresa) sai do farol
--   3  e sai da bonificação por cliente
begin;
\ir _helpers.psql

select plan(3);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-interno', 'Interno', false) as a;
create temporary table u on commit drop as
select tests.create_user('dona@interno.test', (select a from f)) as dona;
grant select on f, u to authenticated;
select tests.grant_role((select dona from u), 'admin');

insert into public.com_clientes (tenant_id, codigo, razao_social, carteira, origem, interno)
values ((select a from f), '1', 'SALAO DE VERDADE', 'MG', 'cadastro', false),
       ((select a from f), '2', 'MINASFLOR MARKETING', 'MG', 'cadastro', true);

with imp as (insert into public.com_vendas_importacoes (tenant_id, tipo, file_name, linhas_lidas)
             values ((select a from f), 'vendas', 'fixture-interno.xlsx', 2) returning id)
insert into public.com_vendas_itens (tenant_id, importacao_id, filial, emissao, documento, serie, cfop, classe,
                                     cliente_codigo, produto_codigo, produto_nome, quantidade, valor_nota)
select (select a from f), imp.id, 'MF', '2026-11-05', v.doc, '75', '5910', 'bonificacao', v.cli, 'P1', 'Produto', 1, 100
  from imp, (values ('9001', '1'), ('9002', '2')) v(doc, cli);

select tests.authenticate_as('dona@interno.test');
select ok(exists (select 1 from public.com_bonificacao_farol_clientes('2026-11-01', '2026-11-30') where cliente_codigo = '1'),
  'o cliente de verdade que recebe sem comprar continua no farol');
select ok(not exists (select 1 from public.com_bonificacao_farol_clientes('2026-11-01', '2026-11-30') where cliente_codigo = '2'),
  'o interno sai do farol');
select ok(not exists (select 1 from public.com_bonificacao_por_cliente('2026-11-01', '2026-11-30') where cliente_codigo = '2'),
  'o interno sai da bonificação por cliente');
select tests.clear_authentication();

select * from finish();
rollback;

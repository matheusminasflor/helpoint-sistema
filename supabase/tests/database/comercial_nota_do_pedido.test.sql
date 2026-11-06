-- NOTA DIGITADA E A FATURAR (migration 20270212410000; dono, 2026-11-05). Forteplus da MF importado até 20/10.
--   1-2  nota digitada depois do corte conta; a da filial sem importação também
--   3    a nota já importada não conta duas vezes
--   4    nota não encontrada depois que a importação passou da data pede correção
--   5    pedido aprovado sem nota aparece como falta
--   6    A faturar soma o pedido sem nota, com a parte da condição
--   7    a importação encontra a nota por cliente, filial e valor
--   8    cada nota serve a um pedido só
--   9    A faturar cai depois do encontro
--  10    a importação concluída dispara o encontro
--  11    a mesma nota em dois pedidos soma uma vez
--  12    pedido devolvido não conta
--  13    nota digitada em pedido finalizado continua na lista
--  14    pedido finalizado sem nota é encontrado pela importação
begin;
\ir _helpers.psql

select plan(14);

create temporary table f on commit drop as select tests.create_tenant('pgtap-nota-pedido', 'Nota Pedido', false) as a;
create temporary table u on commit drop as select tests.create_user('dono@notapedido.test', (select a from f)) as dono;
select tests.grant_role((select dono from u), 'owner');
grant select on f, u to authenticated;

insert into public.com_carteira_membros (tenant_id, user_id, carteira, responsavel) values ((select a from f), (select dono from u), 'X', true);
insert into public.com_clientes (tenant_id, codigo, razao_social, carteira, tabela_preco, ativo, origem)
values ((select a from f), 'C1', 'CLIENTE UM', 'X', 'VIP', true, 'cadastro'),
       ((select a from f), 'C2', 'CLIENTE CONDICAO', 'X', 'VIP CONDICAO', true, 'cadastro');

create temporary table imp on commit drop as
with nova as (
  insert into public.com_vendas_importacoes (tenant_id, tipo, file_name, linhas_lidas)
  select a, 'vendas', 'pgtap-nota.xls', 2 from f returning id
) select id from nova;
insert into public.com_vendas_itens
  (tenant_id, importacao_id, filial, emissao, documento, serie, cfop, classe, cliente_codigo, produto_codigo, produto_nome, quantidade, valor_nota)
select (select a from f), (select id from imp), 'MF', e::date, d, '1', '5102', 'venda', 'C1', 'P1', 'Produto', 1, v
  from (values ('2026-10-20', '000500', 1000), ('2026-10-15', '000501', 700)) x(e, d, v);

create temporary table l on commit drop as
with n as (
  insert into public.com_interacoes (tenant_id, vendedor_id, cliente_codigo, data, status)
  select (select a from f), (select dono from u), c, '2026-10-02', 'em_andamento' from (values ('C1'), ('C2')) x(c) returning id, cliente_codigo
) select * from n;
create temporary table ck on commit drop as
with n as (
  insert into public.ped_checklists (tenant_id, interacao_id, protocolo, vendedor_id, cliente_codigo, cliente_nome, contato)
  select (select a from f), l.id, 'CK-' || l.cliente_codigo, (select dono from u), l.cliente_codigo, 'Cliente', 'Contato' from l returning id, cliente_codigo
) select * from n;
alter table public.ped_decisoes disable trigger user;
insert into public.ped_decisoes (tenant_id, checklist_id, versao, status) select c.tenant_id, c.id, c.versao, 'Aprovado' from public.ped_checklists c where c.id in (select id from ck);
alter table public.ped_decisoes enable trigger user;

insert into public.ped_pedidos (tenant_id, checklist_id, ordem, tipo, filial, numero, valor, nota_fiscal, nota_em, nota_valor, nota_origem)
select (select a from f), (select id from ck where cliente_codigo = cl), o, 'Venda', fi, 'N' || o, v, nf, ne::date, nv, nog
  from (values
    ('C1', 1, 'MF', 1000, null, null, null, null),
    ('C1', 2, 'MF', 300, '777', '2026-10-25', 300, 'digitada'),
    ('C1', 3, 'MF', 400, '888', '2026-10-10', 400, 'digitada'),
    ('C1', 4, 'MF', 700, '501', '2026-10-25', 700, 'digitada'),
    ('C1', 5, 'INBRAS', 150, '900', '2026-10-05', 150, 'digitada'),
    ('C1', 6, 'MF', 1000, null, null, null, null),
    ('C2', 1, 'MF', 200, null, null, null, null)) x(cl, o, fi, v, nf, ne, nv, nog);

select tests.authenticate_as('dono@notapedido.test');
select is((select string_agg(nota_fiscal, ',' order by nota_fiscal) from public.com_notas_a_confirmar('2026-10-01', '2026-10-31')), '777,900', 'contam so as notas ainda nao importadas');
select is((select sum(valor)::numeric from public.com_notas_a_confirmar('2026-10-01', '2026-10-31')), 450::numeric, 'o valor digitado entra na hora');
select is((select count(*)::int from public.com_notas_a_confirmar() where nota_fiscal = '501'), 0, 'nota ja importada nao conta duas vezes');
select is((select situacao from public.ped_notas_do_comercial() where nota_fiscal = '888'), 'corrigir', 'nota nao encontrada pede correcao');
select is((select count(*)::int from public.ped_notas_do_comercial() where situacao = 'falta_nota'), 3, 'pedido aprovado sem nota fica pendente');
select is((select sum(a_faturar)::numeric from public.com_acompanhamento_da_carteira('X', '2026-10-01')), 2400::numeric, 'A faturar com a parte da condicao');
select tests.clear_authentication();

select public.ped_achar_notas_importadas((select a from f));
select is((select nota_fiscal from public.ped_pedidos where numero = 'N1' and valor = 1000), '500', 'a importacao encontra a nota');
select is((select count(*)::int from public.ped_pedidos where nota_fiscal = '500'), 1, 'cada nota serve a um pedido so');
select tests.authenticate_as('dono@notapedido.test');
select is((select sum(a_faturar)::numeric from public.com_acompanhamento_da_carteira('X', '2026-10-01')), 1400::numeric, 'A faturar cai depois do encontro');

select tests.clear_authentication();

-- 10: o caminho real, pelo gatilho da importação concluída.
insert into public.com_vendas_itens
  (tenant_id, importacao_id, filial, emissao, documento, serie, cfop, classe, cliente_codigo, produto_codigo, produto_nome, quantidade, valor_nota)
select (select a from f), (select id from imp), 'MF', '2026-10-21', '000502', '1', '5102', 'venda', 'C2', 'P1', 'Produto', 1, 200;
update public.com_vendas_importacoes set status = 'concluida' where id = (select id from imp);
select is((select nota_fiscal from public.ped_pedidos where numero = 'N1' and valor = 200), '502', 'a importacao concluida dispara o encontro');

-- 11 a 14: a última decisão muda a situação do pedido.
alter table public.ped_decisoes disable trigger user;
alter table public.ped_finalizacoes disable trigger user;
insert into public.ped_pedidos (tenant_id, checklist_id, ordem, tipo, filial, numero, valor, nota_fiscal, nota_em, nota_valor, nota_origem)
select (select a from f), c.id, x.o, 'Venda', 'INBRAS', 'N' || x.o, 80, x.nf, '2026-10-06', 80, 'digitada'
  from (select id from ck where cliente_codigo = 'C2') c, (values (7, '901'), (8, '901')) x(o, nf);
select tests.authenticate_as('dono@notapedido.test');
select is((select count(*)::int from public.com_notas_a_confirmar() where nota_fiscal = '901'), 1, 'a mesma nota em dois pedidos soma uma vez');
select tests.clear_authentication();
insert into public.ped_decisoes (tenant_id, checklist_id, versao, status)
select c.tenant_id, c.id, c.versao, 'Recusado' from public.ped_checklists c where c.id = (select id from ck where cliente_codigo = 'C2');
select tests.authenticate_as('dono@notapedido.test');
select is((select count(*)::int from public.com_notas_a_confirmar() where nota_fiscal = '901'), 0, 'pedido devolvido nao conta');
select tests.clear_authentication();
insert into public.ped_finalizacoes (tenant_id, checklist_id, versao)
select c.tenant_id, c.id, c.versao from public.ped_checklists c where c.id = (select id from ck where cliente_codigo = 'C1');
select tests.authenticate_as('dono@notapedido.test');
select is((select situacao from public.ped_notas_do_comercial() where nota_fiscal = '888'), 'corrigir', 'nota digitada em pedido finalizado continua na lista');
select tests.clear_authentication();
insert into public.com_vendas_itens
  (tenant_id, importacao_id, filial, emissao, documento, serie, cfop, classe, cliente_codigo, produto_codigo, produto_nome, quantidade, valor_nota)
select (select a from f), (select id from imp), 'MF', '2026-10-21', '000503', '1', '5102', 'venda', 'C1', 'P1', 'Produto', 1, 1000;
select public.ped_achar_notas_importadas((select a from f));
select is((select nota_fiscal from public.ped_pedidos where numero = 'N6'), '503', 'pedido finalizado sem nota e encontrado');

select * from finish();
rollback;

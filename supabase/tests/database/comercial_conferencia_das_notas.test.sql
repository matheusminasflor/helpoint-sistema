-- A NOTA LANÇADA CONFERIDA CONTRA O FORTEPLUS E A DATA DA NOTA NUNCA NO FUTURO (migration 20270126010000; dono,
-- 2026-10-15). Forteplus importado até 20/05 (o corte). Ana lançou seis notas em maio:
--   101 certa (R$ 550 = venda 500 + bonificação 50) · 102 de outro cliente · 103 com zero a mais · 999 que não existe
--   104 com a data errada · 105 depois do corte (ainda não dá para conferir)
--   1  só as que não bateram aparecem, cada uma com o motivo
--   2  ... com o valor certo do Forteplus ao lado
--   3  data da nota depois de hoje é recusada
--   4  data da nota antes do contato é recusada
--   5  a colega não vê as notas da Ana
begin;
\ir _helpers.psql

select plan(5);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-confere-nota', 'Confere Nota', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@conferenota.test', (select a from f)) as ana,
       tests.create_user('bia@conferenota.test', (select a from f)) as bia;
select tests.grant_module((select ana from u), (select a from f), 'comercial');
select tests.grant_module((select bia from u), (select a from f), 'comercial');
grant select on f, u to authenticated;

insert into public.com_carteira_membros (tenant_id, user_id, carteira)
values ((select a from f), (select ana from u), 'NORTE'), ((select a from f), (select bia from u), 'SUL');
insert into public.com_clientes (tenant_id, codigo, razao_social, carteira, ativo, origem)
values ((select a from f), 'C1', 'CLIENTE UM', 'NORTE', true, 'cadastro'),
       ((select a from f), 'C2', 'CLIENTE DOIS', 'NORTE', true, 'cadastro');

create temporary table imp on commit drop as
with nova as (
  insert into public.com_vendas_importacoes (tenant_id, tipo, file_name, linhas_lidas)
  select a, 'vendas', 'pgtap-confere.xls', 5 from f returning id
) select id from nova;
insert into public.com_vendas_itens
  (tenant_id, importacao_id, filial, emissao, documento, serie, cfop, classe, cliente_codigo, produto_codigo, produto_nome,
   quantidade, valor_nota)
select (select a from f), (select id from imp), 'MF', e::date, d, '1', c, k, cl, 'P1', 'Produto', 1, v
  from (values ('2026-05-10', '000101', '5102', 'venda', 'C1', 500),
               ('2026-05-10', '000101', '5910', 'bonificacao', 'C1', 50),
               ('2026-05-11', '000102', '5102', 'venda', 'C2', 200),
               ('2026-05-12', '000103', '5102', 'venda', 'C1', 300),
               ('2026-05-20', '000104', '5102', 'venda', 'C1', 100)) x(e, d, c, k, cl, v);

insert into public.com_interacoes (tenant_id, vendedor_id, cliente_codigo, data, status, valor_venda, nota_fiscal, nota_em)
select (select a from f), (select ana from u), cl, '2026-05-05', 'concluido', v, n, e::date
  from (values ('C1', 550, '101', '2026-05-10'), ('C1', 200, '102', '2026-05-11'), ('C1', 3000, '103', '2026-05-12'),
               ('C1', 100, '999', '2026-05-13'), ('C1', 100, '104', '2026-05-19'), ('C1', 80, '105', '2026-05-25')) x(cl, v, n, e);

select tests.authenticate_as('ana@conferenota.test');
select is((select string_agg(nota_fiscal || ':' || problema, ' ' order by nota_fiscal)
             from public.com_notas_que_nao_bateram('2026-05-01', '2026-05-31')),
  '102:cliente_diferente 103:valor_diferente 104:data_diferente 999:nota_nao_encontrada',
  'so as notas que nao bateram aparecem, cada uma com o motivo');
select is((select forteplus_valor from public.com_notas_que_nao_bateram('2026-05-01', '2026-05-31') where nota_fiscal = '103'),
  300::numeric, 'com o valor certo do Forteplus ao lado');
select throws_ok($$ select public.com_salvar_interacao(null, jsonb_build_object('cliente_codigo', 'C1',
    'data', (now() at time zone 'America/Sao_Paulo')::date, 'status', 'concluido', 'valor_venda', '90', 'nota_filial', 'MF', 'nota_fiscal', '777',
    'nota_em', (now() at time zone 'America/Sao_Paulo')::date + 1), null) $$,
  '23514', null, 'data da nota depois de hoje e recusada');
select throws_ok($$ select public.com_salvar_interacao(null, '{"cliente_codigo":"C1","data":"2026-05-05","status":"concluido",
    "valor_venda":"90","nota_filial":"MF","nota_fiscal":"778","nota_em":"2026-05-01"}'::jsonb, null) $$,
  '23514', null, 'data da nota antes do contato e recusada');
select tests.clear_authentication();

select tests.authenticate_as('bia@conferenota.test');
select is((select count(*)::int from public.com_notas_que_nao_bateram('2026-05-01', '2026-05-31')), 0,
  'a colega nao ve as notas da Ana');
select tests.clear_authentication();

select * from finish();
rollback;

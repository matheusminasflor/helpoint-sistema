-- VALOR SÓ COM A NOTA E A CARTEIRA COM DIRECIONAIS (migration 20270123010000; dono, 2026-10-15).
-- Ana, carteira NORTE. Histórico do Forteplus até 10/04 (o corte); em maio ela lança.
--   1  valor sem o Nº da nota é recusado
--   2  o lançamento sem nota não conta na venda do mês
--   3  a vendedora completa a nota e o valor depois, mesmo no lançamento concluído...
--   4  ... e aí conta, na data da nota
--   5  a nota posta não muda depois
--   6  A faturar = o pedido fechado sem nota; Faturado = o lançamento com nota; e o mês passado
--   7  a média dos 3 meses divide por 3, contando o mês sem compra
--   8  o relatório Informado x Faturado saiu
begin;
\ir _helpers.psql

select plan(8);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-nota-lanc', 'Nota Lanc', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@notalanc.test', (select a from f)) as ana;
select tests.grant_module((select ana from u), (select a from f), 'comercial');
grant select on f, u to authenticated;

insert into public.com_carteira_membros (tenant_id, user_id, carteira) values ((select a from f), (select ana from u), 'NORTE');
insert into public.com_clientes (tenant_id, codigo, razao_social, carteira, ativo, origem)
values ((select a from f), 'C1', 'CLIENTE UM', 'NORTE', true, 'cadastro'),
       ((select a from f), 'C2', 'CLIENTE DOIS', 'NORTE', true, 'cadastro');

create temporary table imp on commit drop as
with nova as (
  insert into public.com_vendas_importacoes (tenant_id, tipo, file_name, linhas_lidas)
  select a, 'vendas', 'pgtap-nota.xls', 3 from f returning id
) select id from nova;
-- C1 comprou R$ 300 em fevereiro, nada em março e R$ 150 em abril (até o corte, 10/04).
insert into public.com_vendas_itens
  (tenant_id, importacao_id, filial, emissao, documento, serie, cfop, classe, cliente_codigo, produto_codigo, produto_nome,
   quantidade, valor_nota)
values ((select a from f), (select id from imp), 'MF', '2026-02-10', 'H1', '1', '5102', 'venda', 'C1', 'P1', 'Produto', 1, 300),
       ((select a from f), (select id from imp), 'MF', '2026-04-10', 'H2', '1', '5102', 'venda', 'C1', 'P1', 'Produto', 1, 150);

create temporary table l (nome text, id uuid) on commit drop;
grant select, insert on l to authenticated;

select tests.authenticate_as('ana@notalanc.test');
select throws_ok($$ select public.com_salvar_interacao(null,
  '{"cliente_codigo":"C1","data":"2026-05-05","status":"concluido","valor_venda":"900"}'::jsonb, null) $$,
  '23514', null, 'valor sem o numero da nota e recusado');
insert into l select 'c1', public.com_salvar_interacao(null, '{"cliente_codigo":"C1","data":"2026-05-05","status":"concluido"}'::jsonb, null);
select is((select venda_mes from public.com_acompanhamento_da_carteira('NORTE', '2026-05-01') where grupo_nome = 'CLIENTE UM'), 0::numeric,
  'o lancamento sem nota nao conta na venda do mes');
select lives_ok($$ select public.com_salvar_interacao((select id from l where nome = 'c1'),
  '{"cliente_codigo":"C1","data":"2026-05-05","status":"concluido","valor_venda":"900","nota_fiscal":"1234","nota_em":"2026-05-08"}'::jsonb, null) $$,
  'a vendedora completa a nota e o valor depois, mesmo concluido');
select is((select venda_mes || '|' || faturado_mes from public.com_acompanhamento_da_carteira('NORTE', '2026-05-01') where grupo_nome = 'CLIENTE UM'),
  '900.00|900.00', 'com a nota, conta na data da nota');
select throws_ok($$ select public.com_salvar_interacao((select id from l where nome = 'c1'),
  '{"cliente_codigo":"C1","data":"2026-05-05","status":"concluido","valor_venda":"950","nota_fiscal":"1234","nota_em":"2026-05-08"}'::jsonb, null) $$,
  '42501', null, 'a nota posta nao muda depois');
select tests.clear_authentication();

-- C2: pedido fechado (checklist) de R$ 400, ainda sem nota.
insert into public.com_interacoes (tenant_id, vendedor_id, cliente_codigo, data, status)
select a, (select ana from u), 'C2', '2026-05-06', 'concluido' from f;
insert into public.ped_checklists (tenant_id, interacao_id, protocolo, vendedor_id, cliente_codigo, cliente_nome, criado_por, contato)
select a, (select id from public.com_interacoes where cliente_codigo = 'C2'), 'CK-T-1', (select ana from u), 'C2', 'CLIENTE DOIS', (select ana from u), 'Telefone' from f;
insert into public.ped_pedidos (tenant_id, checklist_id, ordem, tipo, filial, numero, valor)
select a, (select id from public.ped_checklists where protocolo = 'CK-T-1'), 1, 'Venda', 'MF', 'P-1', 400 from f;

select tests.authenticate_as('ana@notalanc.test');
select is((select a_faturar || '|' || faturado_mes || '|' || venda_mes_passado from public.com_acompanhamento_da_carteira('NORTE', '2026-05-01') where grupo_nome = 'CLIENTE DOIS'),
  '400.00|0|0', 'A faturar e o pedido fechado sem nota; Faturado e o lancamento com nota');
select is((select media_3m from public.com_acompanhamento_da_carteira('NORTE', '2026-05-01') where grupo_nome = 'CLIENTE UM'), 150.00::numeric,
  'a media dos 3 meses (fev, mar, abr) divide por 3, contando o mes sem compra');
select tests.clear_authentication();

select ok(not exists (select 1 from pg_proc where proname = 'com_lancado_x_faturado'), 'o relatorio Informado x Faturado saiu');

select * from finish();
rollback;

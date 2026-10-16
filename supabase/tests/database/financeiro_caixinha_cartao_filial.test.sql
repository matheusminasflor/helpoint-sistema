-- AVALIAÇÃO DO FINANCEIRO (migration 20270107010000; dono, 2026-10-14). Cartão que fecha dia 5 e vence dia 12.
--   1  comprou antes do fechamento: a fatura deste mês
--   2  comprou no dia do fechamento: a fatura do mês seguinte
--   3  a 3ª parcela: duas faturas depois
--   4  vencimento antes do fechamento (fecha 25, vence 5): a fatura vence no mês seguinte
--   5  sem os dias cadastrados: vence no dia da compra, mês a mês
--   6  a entrada da Caixinha vira, no Financeiro, uma saída paga "Reposição da Caixinha"
--   7  a saída da Caixinha (o gasto) não vira conta no Financeiro
--   8  apagar a entrada apaga a reposição
--   9  a conta da compra leva a filial no campo
--  10  a função nova não abre para anon
--  11  cartão por filial (20270127050000): a MF usa a fatura do cartão dela
--  12  ... e a INBRAS continua na de antes
begin;
\ir _helpers.psql

select plan(12);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-fin-aval', 'Fin Aval', false) as a,
       tests.create_tenant('pgtap-fin-aval2', 'Fin Aval 2', false) as b;
insert into public.compras_config (tenant_id, cartao_fecha_dia, cartao_vence_dia) select a, 5, 12 from f;
insert into public.compras_config (tenant_id, cartao_fecha_dia, cartao_vence_dia) select b, 25, 5 from f;

select is(public.vencimento_da_fatura((select a from f), date '2026-10-03', 1), date '2026-10-12', 'antes do fechamento: a fatura deste mes');
select is(public.vencimento_da_fatura((select a from f), date '2026-10-05', 1), date '2026-11-12', 'no dia do fechamento: a fatura do mes seguinte');
select is(public.vencimento_da_fatura((select a from f), date '2026-10-03', 3), date '2026-12-12', 'a 3a parcela: duas faturas depois');
select is(public.vencimento_da_fatura((select b from f), date '2026-10-20', 1), date '2026-11-05', 'vence antes do fechamento: a fatura vence no mes seguinte');
select is(public.vencimento_da_fatura(gen_random_uuid(), date '2026-10-20', 2), date '2026-11-20', 'sem os dias cadastrados: no dia da compra, mes a mes');
update public.compras_config set cartao_mf_fecha_dia = 20, cartao_mf_vence_dia = 28 where tenant_id = (select a from f);
select is(public.vencimento_da_fatura((select a from f), date '2026-10-03', 1, 'MF'), date '2026-10-28', 'cartao por filial: a MF usa a fatura do cartao dela');
select is(public.vencimento_da_fatura((select a from f), date '2026-10-03', 1, 'INBRAS'), date '2026-10-12', 'a INBRAS continua na fatura de antes');

insert into public.compras_produtos (tenant_id, name) select a, 'Cafe' from f;
create temporary table mov on commit drop as
with x as (
  insert into public.caixinha_movimentos (tenant_id, tipo, valor, descricao, data)
  select a, 'entrada', 300, 'Repasse da semana', date '2026-10-12' from f returning id, fin_entry_id
) select * from x;
-- A saída solta escolhe o produto no Catálogo (20270120010000).
insert into public.caixinha_movimentos (tenant_id, tipo, valor, descricao, recibo_path, produto_id, quantidade)
select a, 'saida', 40, 'Cafe', 'r.jpg', (select id from public.compras_produtos where tenant_id = a and name = 'Cafe'), 1 from f;

select is((select description || '|' || amount || '|' || status || '|' || settled_at || '|' || source from public.fin_entries
            where id = (select fin_entry_id from public.caixinha_movimentos where id = (select id from mov))),
  'Reposição da Caixinha|300.00|paid|2026-10-12|caixinha', 'a entrada da Caixinha vira saida paga no Financeiro');
select is((select count(*)::int from public.fin_entries where tenant_id = (select a from f)), 1,
  'o gasto da Caixinha nao vira conta no Financeiro');

delete from public.caixinha_movimentos where id = (select id from mov);
select is((select count(*)::int from public.fin_entries where tenant_id = (select a from f) and source = 'caixinha'), 0,
  'apagar a entrada apaga a reposicao');

-- A conta da compra com a filial no campo: uma compra comum, por pix, na filial INBRAS.
create temporary table u on commit drop as
select tests.create_user('ana@finaval.test', (select a from f)) as ana,
       tests.create_user('apr@finaval.test', (select a from f)) as apr;
insert into public.access_profiles (tenant_id, department, name, permissions)
select a, 'compras', 'Aprovador', '{"solicitacoes": {"approve": true, "execute": true}}'::jsonb from f;
select tests.grant_module((select apr from u), (select a from f), 'compras');
select tests.grant_profile((select apr from u), (select a from f), 'compras', 'Aprovador');
create temporary table pedido (ticket uuid) on commit drop;
grant select on f, u to authenticated;
grant select, insert on pedido to authenticated;

select tests.authenticate_as('ana@finaval.test');
insert into pedido select public.compras_abrir_pedido('{"title":"Mouse","priority":"low"}'::jsonb,
  '{"product_name":"Mouse","department":"ti","quantidade":"1"}'::jsonb,
  '[{"supplier":"Loja","valor_unitario":"50","link":"https://l"}]'::jsonb);
select tests.clear_authentication();
select tests.authenticate_as('apr@finaval.test');
update public.compras_solicitacoes
   set status = 'approved', approved_by = auth.uid(), approved_at = now(), few_quotes_reason = 'unico',
       forma_pagamento = 'pix', forma_pagamento_2 = 'boleto', filial = 'INBRAS',
       approved_quote_id = (select q.id from public.compras_orcamentos q join public.compras_solicitacoes s on s.id = q.request_id
                             where s.ticket_id = (select ticket from pedido))
 where ticket_id = (select ticket from pedido) returning id;
update public.compras_solicitacoes
   set status = 'completed', purchase_file_path = 'nf.pdf', purchase_report = 'Comprado', executed_by = auth.uid(), executed_at = now()
 where ticket_id = (select ticket from pedido) returning id;
select tests.clear_authentication();
select is((select e.filial from public.fin_entries e join public.compras_solicitacoes s on s.id = e.purchase_request_id
            where s.ticket_id = (select ticket from pedido)), 'INBRAS', 'a conta da compra leva a filial no campo');

select ok(not has_function_privilege('anon', 'public.vencimento_da_fatura(uuid,date,integer)', 'execute'), 'a funcao nova nao abre para anon');

select * from finish();
rollback;

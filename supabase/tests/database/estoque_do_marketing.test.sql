-- ESTOQUE DO MARKETING (migration 20270128010000; dono, 2026-10-19). Brinde ligado ao produto "Caneca" do Catálogo de
-- Compras, mínimo 5.
--   1  quem tem a seção Estoque (Editar) cadastra o produto
--   2  quem só vê não cadastra (42501)
--   3  a entrada manual sobe o saldo
--   4  a saída diz quem retirou e o motivo, e baixa o saldo
--   5  saída maior que o saldo é recusada
--   6  saída sem quem retirou é recusada
--   7  cruzar o mínimo avisa o Marketing ("Repor Caneca")
--   8  a compra registrada do produto ligado entra pela quantidade aprovada
--   9  desfazer a compra tira a entrada
--  10  quem só vê lê o estoque
--  11  as funções novas não abrem para anon
begin;
\ir _helpers.psql

select plan(11);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-estoque-mkt', 'Estoque MKT') as tenant;
create temporary table u on commit drop as
select tests.create_user('mkt@estoque-mkt.test', (select tenant from f)) as mkt,
       tests.create_user('ver@estoque-mkt.test', (select tenant from f)) as ver,
       tests.create_user('ana@estoque-mkt.test', (select tenant from f)) as ana;
insert into public.access_profiles (tenant_id, department, name, permissions)
select tenant, 'marketing', n, p::jsonb from f,
  (values ('Estoque Total', '{"estoque": {"view": true, "create": true, "edit": true, "delete": true}}'),
          ('Estoque Ver', '{"estoque": {"view": true}}')) v(n, p);
select tests.grant_module((select mkt from u), (select tenant from f), 'marketing');
select tests.grant_profile((select mkt from u), (select tenant from f), 'marketing', 'Estoque Total');
select tests.grant_module((select ver from u), (select tenant from f), 'marketing');
select tests.grant_profile((select ver from u), (select tenant from f), 'marketing', 'Estoque Ver');
grant select on f, u to authenticated;

create temporary table cat on commit drop as
with x as (insert into public.compras_produtos (tenant_id, name) select tenant, 'Caneca' from f returning id) select id from x;
grant select on cat to authenticated;

select tests.authenticate_as('mkt@estoque-mkt.test');
create temporary table prod on commit drop as
with x as (
  insert into public.mkt_estoque_produtos (nome, unidade, estoque_minimo, compras_produto_id)
  values ('Caneca', 'un', 5, (select id from cat)) returning id
) select id from x;
select tests.clear_authentication();
grant select on prod to authenticated;
select is((select count(*)::int from prod), 1, 'quem tem Editar no Estoque cadastra o produto');

select tests.authenticate_as('ver@estoque-mkt.test');
select throws_ok($$ insert into public.mkt_estoque_produtos (nome) values ('Bone') returning id $$,
  '42501', null, 'quem so ve nao cadastra produto');
select tests.clear_authentication();

select tests.authenticate_as('mkt@estoque-mkt.test');
insert into public.mkt_estoque_movimentos (produto_id, tipo, quantidade, motivo, created_by)
select id, 'entrada', 6, 'Chegou da grafica', (select mkt from u) from prod returning id;
select is(public.saldo_do_estoque_mkt((select id from prod)), 6.00::numeric, 'a entrada manual sobe o saldo');
insert into public.mkt_estoque_movimentos (produto_id, tipo, quantidade, retirado_por, motivo, created_by)
select id, 'saida', 1, (select ana from u), 'Evento em BH', (select mkt from u) from prod returning id;
select is(public.saldo_do_estoque_mkt((select id from prod)), 5.00::numeric, 'a saida baixa o saldo');
select throws_ok(format($$ insert into public.mkt_estoque_movimentos (produto_id, tipo, quantidade, retirado_por, motivo, created_by)
                           values (%L::uuid, 'saida', 10, %L::uuid, 'x', %L::uuid) returning id $$,
                        (select id from prod), (select ana from u), (select mkt from u)),
  '23514', null, 'saida maior que o saldo e recusada');
select throws_ok(format($$ insert into public.mkt_estoque_movimentos (produto_id, tipo, quantidade, motivo, created_by)
                           values (%L::uuid, 'saida', 1, 'x', %L::uuid) returning id $$, (select id from prod), (select mkt from u)),
  '23514', null, 'saida sem quem retirou e recusada');
insert into public.mkt_estoque_movimentos (produto_id, tipo, quantidade, retirado_por, motivo, created_by)
select id, 'saida', 1, (select ana from u), 'Influenciadora', (select mkt from u) from prod returning id;
select tests.clear_authentication();
select ok((select count(*) > 0 from public.notifications where title = 'Repor Caneca' and user_id = (select mkt from u)),
  'cruzar o minimo avisa o Marketing');

-- A compra de "Caneca" (5 pedidas, 3 aprovadas) registrada entra no estoque do Marketing.
create temporary table pedido (solicitacao uuid) on commit drop;
grant select, insert on pedido to authenticated;
select tests.authenticate_as('ana@estoque-mkt.test');
insert into pedido select public.compras_abrir_pedido(jsonb_build_object('title', 'Canecas', 'priority', 'low'),
  jsonb_build_object('product_name', 'Caneca', 'product_id', (select id from cat), 'department', 'marketing', 'quantidade', '5'),
  '[{"supplier":"Grafica","valor_unitario":"10","link":"https://g"}]'::jsonb);
select tests.clear_authentication();
update public.compras_solicitacoes s
   set status = 'approved', approved_at = now(), few_quotes_reason = 'unico', forma_pagamento = 'pix', forma_pagamento_2 = 'boleto', filial = 'MF', quantidade_aprovada = 3,
       approved_quote_id = (select q.id from public.compras_orcamentos q where q.request_id = s.id limit 1)
 where s.solicitacao_id in (select solicitacao from pedido);
update public.compras_solicitacoes set status = 'completed', purchase_file_path = 'nf.pdf', purchase_report = 'Comprado', executed_at = now()
 where solicitacao_id in (select solicitacao from pedido);
select is(public.saldo_do_estoque_mkt((select id from prod)), 7.00::numeric, 'a compra registrada entra pela quantidade aprovada');
update public.compras_solicitacoes set status = 'approved' where solicitacao_id in (select solicitacao from pedido);
select is(public.saldo_do_estoque_mkt((select id from prod)), 4.00::numeric, 'desfazer a compra tira a entrada');

select tests.authenticate_as('ver@estoque-mkt.test');
select is((select count(*)::int from public.mkt_estoque_movimentos), 3, 'quem so ve le o estoque');
select tests.clear_authentication();

select ok(not has_function_privilege('anon', 'public.pode_no_estoque_mkt(text)', 'execute')
      and not has_function_privilege('anon', 'public.saldo_do_estoque_mkt(uuid)', 'execute'), 'as funcoes novas nao abrem para anon');

select * from finish();
rollback;

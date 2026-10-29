-- ESTOQUE DE SUPRIMENTOS (migration 20270118010000; dono, 2026-10-15). Café é suprimento (mínimo 2 pacotes); Monitor
-- não é.
--   1  a compra registrada de café entra no estoque pela quantidade aprovada
--   2  compra de item que não é suprimento não entra
--   3  a saída manual diz quem retirou e o motivo, e baixa o saldo
--   4  saída maior que o saldo é recusada
--   5  cruzar o mínimo avisa Compras ("Repor Café")
--   6  saída sem quem retirou é recusada
--   7  a saída da Caixinha que diz o suprimento entra no estoque
--   8  a função nova não abre para anon
begin;
\ir _helpers.psql

select plan(8);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-estoque', 'Estoque') as tenant;
create temporary table u on commit drop as
select tests.create_user('ana@estoque.test', (select tenant from f)) as ana,
       tests.create_user('comp@estoque.test', (select tenant from f)) as comp,
       tests.create_user('apr@estoque.test', (select tenant from f)) as apr;
select tests.grant_module((select comp from u), (select tenant from f), 'compras');
select tests.grant_profile((select comp from u), (select tenant from f), 'compras', 'Operador');
update public.access_profiles set permissions = permissions || '{"estoque": {"view": true, "create": true}, "solicitacoes": {"view": true, "execute": true}}'::jsonb
 where tenant_id = (select tenant from f) and department = 'compras' and name = 'Operador';
insert into public.access_profiles (tenant_id, department, name, permissions)
select tenant, 'compras', 'Aprovador', '{"solicitacoes": {"approve": true}}'::jsonb from f;
select tests.grant_module((select apr from u), (select tenant from f), 'compras');
select tests.grant_profile((select apr from u), (select tenant from f), 'compras', 'Aprovador');
grant select on f, u to authenticated;

create temporary table prod on commit drop as
with x as (
  insert into public.compras_produtos (tenant_id, name, suprimento, unidade, estoque_minimo)
  select tenant, n, s, 'pacote', m from f, (values ('Cafe', true, 2), ('Monitor', false, 0)) v(n, s, m)
  returning id, name
) select * from x;
grant select on prod to authenticated;

create temporary table pedido (nome text, solicitacao uuid) on commit drop;
grant select, insert on pedido to authenticated;
create or replace function pg_temp.compra(p text) returns public.compras_solicitacoes language sql as
  $$ select s.* from public.compras_solicitacoes s where s.solicitacao_id = (select solicitacao from pedido where nome = p) $$;

select tests.authenticate_as('ana@estoque.test');
insert into pedido select n, public.compras_abrir_pedido(jsonb_build_object('title', n, 'priority', 'low'),
  jsonb_build_object('few_quotes_reason', 'pgtap: fornecedor unico', 'product_name', n, 'product_id', (select id from prod where name = n), 'department', 'ti', 'quantidade', '5'),
  '[{"supplier":"Mercado","valor_unitario":"10","link":"https://m"}]'::jsonb)
from unnest(array['Cafe', 'Monitor']) n;
select tests.clear_authentication();

-- Aprova (4 de 5) e registra as duas compras, como o sistema faz.
update public.compras_solicitacoes s
   set status = 'approved', approved_at = now(), few_quotes_reason = 'unico', forma_pagamento = 'pix', forma_pagamento_2 = 'boleto', filial = 'MF', quantidade_aprovada = 4,
       approved_quote_id = (select q.id from public.compras_orcamentos q where q.request_id = s.id limit 1)
 where s.solicitacao_id in (select solicitacao from pedido);
update public.compras_solicitacoes set status = 'completed', purchase_file_path = 'nf.pdf', purchase_report = 'Comprado', executed_at = now()
 where solicitacao_id in (select solicitacao from pedido);

select is(public.saldo_do_estoque((select id from prod where name = 'Cafe')), 4.00::numeric, 'a compra registrada de cafe entra pela quantidade aprovada');
select is((select count(*)::int from public.estoque_movimentos where produto_id = (select id from prod where name = 'Monitor')), 0,
  'compra de item que nao e suprimento nao entra');

-- Quem recebe o "Repor" é o comprador configurado (20270120010000).
insert into public.compras_config (tenant_id, comprador_id) select tenant, (select comp from u) from f
  on conflict (tenant_id) do update set comprador_id = excluded.comprador_id;

select tests.authenticate_as('comp@estoque.test');
insert into public.estoque_movimentos (produto_id, tipo, quantidade, retirado_por, motivo, created_by)
select id, 'saida', 1, (select ana from u), 'Copa do escritorio', (select comp from u) from prod where name = 'Cafe' returning id;
select is(public.saldo_do_estoque((select id from prod where name = 'Cafe')), 3.00::numeric, 'a saida manual baixa o saldo');
select throws_ok(format($$ insert into public.estoque_movimentos (produto_id, tipo, quantidade, retirado_por, motivo, created_by)
                           values (%L::uuid, 'saida', 10, %L::uuid, 'x', %L::uuid) returning id $$,
                        (select id from prod where name = 'Cafe'), (select ana from u), (select comp from u)),
  '23514', null, 'saida maior que o saldo e recusada');
insert into public.estoque_movimentos (produto_id, tipo, quantidade, retirado_por, motivo, created_by)
select id, 'saida', 2, (select ana from u), 'Reuniao', (select comp from u) from prod where name = 'Cafe' returning id;
select tests.clear_authentication();
select ok((select count(*) > 0 from public.notifications where title = 'Repor Cafe'), 'cruzar o minimo avisa Compras');

select tests.authenticate_as('comp@estoque.test');
select throws_ok(format($$ insert into public.estoque_movimentos (produto_id, tipo, quantidade, motivo, created_by)
                           values (%L::uuid, 'saida', 1, 'x', %L::uuid) returning id $$, (select id from prod where name = 'Cafe'), (select comp from u)),
  '23514', null, 'saida sem quem retirou e recusada');
select tests.clear_authentication();

insert into public.caixinha_movimentos (tenant_id, tipo, valor, descricao) select tenant, 'entrada', 100, 'Repasse' from f;
insert into public.caixinha_movimentos (tenant_id, tipo, valor, descricao, recibo_path, produto_id, quantidade)
select tenant, 'saida', 20, 'Cafe no mercado', 'r.jpg', (select id from prod where name = 'Cafe'), 2 from f;
select is(public.saldo_do_estoque((select id from prod where name = 'Cafe')), 3.00::numeric, 'a saida da Caixinha com o suprimento entra no estoque');

select ok(not has_function_privilege('anon', 'public.pode_no_estoque(text)', 'execute')
      and not has_function_privilege('anon', 'public.saldo_do_estoque(uuid)', 'execute'), 'as funcoes novas nao abrem para anon');

select * from finish();
rollback;

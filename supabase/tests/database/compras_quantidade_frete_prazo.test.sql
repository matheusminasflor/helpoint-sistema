-- COMPRAS: QUANTIDADE, UNITÁRIO, FRETE, PRAZO, RECOMENDADO E QUANTIDADE APROVADA (migration 20261225010000;
-- dono, 2026-10-09). ana pede 4 cadeiras com três orçamentos; apr aprova; comp registra a compra.
--   1-4  o total de cada orçamento = unitário × quantidade + frete; a estimativa é o menor; o recomendado e o motivo
--   5    no ajuste, mudar a quantidade recalcula os totais
--   6-7  quem aprova escolhe outra quantidade (aqui, maior): o total aprovado muda e o aviso diz "Aprovadas X de Y"
--   8    a conta a pagar nasce do total aprovado
--   9    quantidade zero é recusada
begin;
\ir _helpers.psql

select plan(9);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-compras-qtd', 'Compras Qtd', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@comprasqtd.test',  (select a from f)) as ana,
       tests.create_user('apr@comprasqtd.test',  (select a from f)) as apr,
       tests.create_user('comp@comprasqtd.test', (select a from f)) as comp;
insert into public.access_profiles (tenant_id, department, name, permissions)
select a, 'compras', 'Aprovador', '{"solicitacoes": {"approve": true}}'::jsonb from f;
select tests.grant_module((select apr from u), (select a from f), 'compras');
select tests.grant_profile((select apr from u), (select a from f), 'compras', 'Aprovador');
select tests.grant_module((select comp from u), (select a from f), 'compras');
select tests.grant_profile((select comp from u), (select a from f), 'compras', 'Operador');

create temporary table pedido (ticket uuid) on commit drop;
grant select on f, u to authenticated;
grant select, insert on pedido to authenticated;
create or replace function pg_temp.compra() returns public.compras_solicitacoes language sql as
  $$ select * from public.compras_solicitacoes where ticket_id = (select ticket from pedido) $$;
create or replace function pg_temp.total(p text) returns numeric language sql as
  $$ select amount from public.compras_orcamentos where request_id = (pg_temp.compra()).id and supplier = p $$;

select tests.authenticate_as('ana@comprasqtd.test');
insert into pedido
select public.compras_abrir_pedido(
  '{"title":"Cadeira","priority":"low"}'::jsonb,
  '{"product_name":"Cadeira","department":"ti","quantidade":"4","motivo_recomendacao":"Entrega mais rapida"}'::jsonb,
  '[{"supplier":"Loja A","valor_unitario":"100","frete":"0","prazo_entrega_dias":"10","link":"https://a"},
    {"supplier":"Loja B","valor_unitario":"90","frete":"30","prazo_entrega_dias":"3","link":"https://b","recomendado":true},
    {"supplier":"Loja C","valor_unitario":"120","link":"https://c"}]'::jsonb);
select tests.clear_authentication();

select is((select string_agg(supplier || '=' || amount::text, ',' order by position) from public.compras_orcamentos
            where request_id = (pg_temp.compra()).id), 'Loja A=400.00,Loja B=390.00,Loja C=480.00',
  'total de cada orcamento = unitario x quantidade + frete');
select is((pg_temp.compra()).estimated_amount, 390.00::numeric, 'a estimativa e o menor total');
select is((select supplier from public.compras_orcamentos where id = (pg_temp.compra()).orcamento_recomendado_id), 'Loja B',
  'o orcamento recomendado por quem pediu fica marcado');
select is((select (pg_temp.compra()).motivo_recomendacao || '|' || prazo_entrega_dias from public.compras_orcamentos
            where supplier = 'Loja B' and request_id = (pg_temp.compra()).id), 'Entrega mais rapida|3',
  'com o motivo e o prazo de entrega');

-- ═══ 5. Ajuste: ana passa para 5 unidades e reenvia. ═══
select tests.authenticate_as('apr@comprasqtd.test');
update public.compras_solicitacoes set status = 'adjustment_requested', adjustment_reason = 'Confira a quantidade'
 where id = (pg_temp.compra()).id returning id;
select tests.clear_authentication();
select tests.authenticate_as('ana@comprasqtd.test');
update public.compras_solicitacoes set quantidade = 5 where id = (pg_temp.compra()).id returning id;
update public.compras_solicitacoes set status = 'pending_approval', adjustment_response = 'Sao 5'
 where id = (pg_temp.compra()).id returning id;
select tests.clear_authentication();
select is(pg_temp.total('Loja B') || '|' || (pg_temp.compra()).estimated_amount, '480.00|480.00',
  'mudar a quantidade recalcula os totais e a estimativa');

-- ═══ 6-7. apr aprova a Loja B com 6 unidades (mais do que o pedido). ═══
select tests.authenticate_as('apr@comprasqtd.test');
update public.compras_solicitacoes
   set status = 'approved', approved_by = auth.uid(), approved_at = now(), quantidade_aprovada = 6,
       approved_quote_id = (select id from public.compras_orcamentos where request_id = (pg_temp.compra()).id and supplier = 'Loja B')
 where id = (pg_temp.compra()).id returning id;
select tests.clear_authentication();
select is((pg_temp.compra()).estimated_amount, 570.00::numeric, 'total aprovado = 6 x 90 + 30 de frete');
select is((select count(*)::int from public.notifications where user_id = (select ana from u)
            and title like 'Compra aprovada —%' and message like 'Aprovadas 6 de 5 pedidas.%'), 1,
  'o aviso diz quantas foram aprovadas');

-- ═══ 8. A compra registrada vira conta a pagar do total aprovado. ═══
select tests.authenticate_as('comp@comprasqtd.test');
update public.compras_solicitacoes
   set status = 'completed', purchase_report = 'Comprada', executed_by = auth.uid(), executed_at = now()
 where id = (pg_temp.compra()).id returning id;
select tests.clear_authentication();
select is((select amount from public.fin_entries where purchase_request_id = (pg_temp.compra()).id), 570.00::numeric,
  'a conta a pagar nasce do total aprovado');

-- ═══ 9. Quantidade zero não abre pedido. ═══
select tests.authenticate_as('ana@comprasqtd.test');
select throws_ok($$ select public.compras_abrir_pedido('{"title":"X"}'::jsonb, '{"product_name":"X","quantidade":"0"}'::jsonb, '[]'::jsonb) $$,
  '23514', null, 'quantidade zero e recusada');
select tests.clear_authentication();

select * from finish();
rollback;

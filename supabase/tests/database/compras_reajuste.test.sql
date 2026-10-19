-- REAJUSTE DA COMPRA DEPOIS DE APROVADA (migration 20270128060000; dono, 2026-10-19). Compra de 10 un a R$ 10, sem frete
-- (R$ 100), aprovada; boleto em aberto de R$ 100.
--   1  quem só pede (sem "Executar compra") não reajusta
--   2  reajuste de até 10% (frete de R$ 8) vale na hora
--   3  ... o valor da compra passa a R$ 108
--   4  ... e a conta em aberto também
--   5  acima de 10% espera o aprovador
--   6  ... e o valor não muda enquanto espera
--   7  o aprovador aprova: o valor e a conta mudam
--   8  compra já paga não se reajusta
--   9  as funções novas não abrem para anon
begin;
\ir _helpers.psql

select plan(9);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-reajuste', 'Reajuste') as tenant;
create temporary table u on commit drop as
select tests.create_user('ana@reajuste.test', (select tenant from f)) as ana,
       tests.create_user('comp@reajuste.test', (select tenant from f)) as comp,
       tests.create_user('apr@reajuste.test', (select tenant from f)) as apr;
insert into public.access_profiles (tenant_id, department, name, permissions)
select tenant, 'compras', n, p::jsonb from f,
  (values ('Comprador Teste', '{"solicitacoes": {"view": true, "execute": true}}'),
          ('Aprovador Teste', '{"solicitacoes": {"view": true, "approve": true}}')) v(n, p);
select tests.grant_module((select comp from u), (select tenant from f), 'compras');
select tests.grant_profile((select comp from u), (select tenant from f), 'compras', 'Comprador Teste');
select tests.grant_module((select apr from u), (select tenant from f), 'compras');
select tests.grant_profile((select apr from u), (select tenant from f), 'compras', 'Aprovador Teste');
grant select on f, u to authenticated;

create temporary table pedido (ticket uuid) on commit drop;
grant select, insert on pedido to authenticated;
select tests.authenticate_as('ana@reajuste.test');
insert into pedido select public.compras_abrir_pedido(jsonb_build_object('title', 'Cadeira', 'priority', 'low'),
  jsonb_build_object('product_name', 'Cadeira', 'department', 'ti', 'quantidade', '10'),
  '[{"supplier":"Loja","valor_unitario":"10","link":"https://l"}]'::jsonb);
select tests.clear_authentication();
update public.compras_solicitacoes s
   set status = 'approved', approved_at = now(), few_quotes_reason = 'unico', forma_pagamento = 'pix', forma_pagamento_2 = 'boleto', filial = 'MF', quantidade_aprovada = 10,
       approved_quote_id = (select q.id from public.compras_orcamentos q where q.request_id = s.id limit 1)
 where s.ticket_id in (select ticket from pedido);
create temporary table c on commit drop as select id from public.compras_solicitacoes where ticket_id in (select ticket from pedido);
grant select on c to authenticated;
-- O boleto em aberto (a conta que o pagamento criaria).
insert into public.fin_entries (tenant_id, kind, description, category, amount, due_date, competence, status, purchase_request_id, parcela)
select tenant, 'payable', 'Compra: Cadeira', 'compras', 100, current_date + 10, date_trunc('month', current_date)::date, 'pending', (select id from c), 1 from f;

select tests.authenticate_as('ana@reajuste.test');
select throws_ok($$ select public.compras_reajustar((select id from c), 10, 8, 'frete') $$, '42501', null,
  'quem so pede nao reajusta');
select tests.clear_authentication();

select tests.authenticate_as('comp@reajuste.test');
select is(public.compras_reajustar((select id from c), 10, 8, 'Prazo curto: frete pago'), 'aplicado', 'ate 10% vale na hora');
select tests.clear_authentication();
select is(public.valor_da_compra((select id from c)), 108.00::numeric, 'o valor da compra passa a R$ 108');
select is((select amount from public.fin_entries where purchase_request_id = (select id from c) and status = 'pending'), 108.00::numeric,
  'a conta em aberto acompanha');

select tests.authenticate_as('comp@reajuste.test');
select is(public.compras_reajustar((select id from c), 15, 8, 'Fornecedor subiu o preco'), 'aguardando', 'acima de 10% espera o aprovador');
select tests.clear_authentication();
select is(public.valor_da_compra((select id from c)), 108.00::numeric, 'o valor nao muda enquanto espera');

select tests.authenticate_as('apr@reajuste.test');
select public.compras_decidir_reajuste((select id from public.compras_reajustes where status = 'aguardando'), true, null);
select tests.clear_authentication();
select ok(public.valor_da_compra((select id from c)) = 158.00
          and (select amount from public.fin_entries where purchase_request_id = (select id from c) and status = 'pending') = 158.00,
  'o aprovador aprova: valor e conta mudam');

update public.fin_entries set status = 'paid' where purchase_request_id = (select id from c);
select tests.authenticate_as('comp@reajuste.test');
select throws_ok($$ select public.compras_reajustar((select id from c), 10, 0, 'baixou') $$, '22023', null,
  'compra ja paga nao se reajusta');
select tests.clear_authentication();

select ok(not has_function_privilege('anon', 'public.compras_reajustar(uuid,numeric,numeric,text)', 'execute')
      and not has_function_privilege('anon', 'public.compras_decidir_reajuste(uuid,boolean,text)', 'execute'),
  'as funcoes novas nao abrem para anon');

select * from finish();
rollback;

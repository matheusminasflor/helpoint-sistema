-- COMPRAS: TROCAR A FORMA DEPOIS DE PAGA REFAZ A CONTA (migration 20270127010000; dono, 2026-10-16).
-- Como #90 e #89: o Mouse (boleto, 2ª opção cartão) enviado ao Financeiro levando o Cabo junto; depois vira cartão.
-- E um Teclado no boleto, que o Financeiro já pagou.
--   1  a compra que entrou no pagamento de outra não troca sozinha
--   2  trocada a principal: a conta dela vira "Cartão à vista", em aberto, sem o boleto, só com o valor dela
--   3  ... e diz o que era nas observações
--   4  a compra paga junto se separa: cartão, com a sua própria conta (20270127020000)
--   5  boleto já pago pelo Financeiro: a troca é recusada
--   6  liquidou por engano e reabriu: a compra deixa de estar "boleto pago" (20270127030000)
--   7  a conta que veio de uma compra não se exclui à mão
begin;
\ir _helpers.psql

select plan(7);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-troca-paga', 'Troca Paga') as tenant;
create temporary table u on commit drop as
select tests.create_user('ana@trocapaga.test', (select tenant from f)) as ana,
       tests.create_user('comp@trocapaga.test', (select tenant from f)) as comp;
select tests.grant_module((select comp from u), (select tenant from f), 'compras');
select tests.grant_profile((select comp from u), (select tenant from f), 'compras', 'Operador');
update public.access_profiles set permissions = permissions || '{"solicitacoes": {"view": true, "execute": true}}'::jsonb
 where tenant_id = (select tenant from f) and department = 'compras' and name = 'Operador';
grant select on f, u to authenticated;

create temporary table pedido (nome text, solicitacao uuid) on commit drop;
grant select, insert on pedido to authenticated;
create or replace function pg_temp.compra(p text) returns uuid language sql as
  $$ select s.id from public.compras_solicitacoes s where s.solicitacao_id = (select solicitacao from pedido where nome = p) $$;

select tests.authenticate_as('ana@trocapaga.test');
insert into pedido select n, public.compras_abrir_pedido(jsonb_build_object('title', n, 'priority', 'low'),
  jsonb_build_object('product_name', n, 'department', 'ti', 'quantidade', '1'),
  jsonb_build_array(jsonb_build_object('supplier', 'Mercado Livre', 'valor_unitario', v, 'link', 'https://ml')))
from (values ('Cabo', '20'), ('Mouse', '30'), ('Teclado', '80')) x(n, v);
select tests.clear_authentication();

update public.compras_solicitacoes s
   set status = 'approved', approved_at = now(), few_quotes_reason = 'unico', filial = 'MF',
       forma_pagamento = 'boleto', forma_pagamento_2 = 'cartao', parcelas_2 = 1,
       approved_quote_id = (select q.id from public.compras_orcamentos q where q.request_id = s.id limit 1)
 where s.id in (pg_temp.compra('Cabo'), pg_temp.compra('Mouse'), pg_temp.compra('Teclado'));

select tests.authenticate_as('comp@trocapaga.test');
update public.compras_solicitacoes set pago_junto_com = pg_temp.compra('Mouse') where id = pg_temp.compra('Cabo') returning id;
update public.compras_solicitacoes set pagamento_em = now() where id = pg_temp.compra('Cabo') returning id;
update public.compras_solicitacoes set pagamento_em = now(), pagamento_path = 'boleto.pdf', payment_due_date = current_date + 5
 where id in (pg_temp.compra('Mouse'), pg_temp.compra('Teclado')) returning id;

select throws_ok(format($$ update public.compras_solicitacoes
    set forma_pagamento = 'cartao', parcelas = 1, forma_pagamento_2 = 'boleto', parcelas_2 = null, troca_motivo = 'fatura'
  where id = %L::uuid $$, pg_temp.compra('Cabo')), '23514', null,
  'a compra que entrou no pagamento de outra nao troca sozinha');

update public.compras_solicitacoes
   set forma_pagamento = 'cartao', parcelas = 1, forma_pagamento_2 = 'boleto', parcelas_2 = null,
       troca_motivo = 'Antecipou a fatura'
 where id = pg_temp.compra('Mouse') returning id;
select tests.clear_authentication();

select is((select count(*)::int || '|' || min(payment_method) || '|' || min(status::text) || '|' || sum(amount)
                  || '|' || coalesce(min(anexo_path), 'sem anexo')
             from public.fin_entries where purchase_request_id = pg_temp.compra('Mouse')),
  '1|Cartão à vista|pending|30.00|sem anexo', 'trocada a principal: a conta dela vira cartao, em aberto, sem o boleto e so com o valor dela');
select ok((select notes like '%Era Boleto de R$ 50%Antecipou a fatura%' from public.fin_entries
            where purchase_request_id = pg_temp.compra('Mouse')), 'diz o que era nas observacoes');
select is((select s.forma_pagamento || '|' || (s.pago_junto_com is null) || '|' || e.payment_method || '|' || e.amount || '|' || e.status
             from public.compras_solicitacoes s join public.fin_entries e on e.purchase_request_id = s.id
            where s.id = pg_temp.compra('Cabo')),
  'cartao|true|Cartão à vista|20.00|pending', 'a compra paga junto se separa: cartao, com a sua propria conta');

update public.fin_entries set status = 'paid', settled_at = current_date where purchase_request_id = pg_temp.compra('Teclado');
select tests.authenticate_as('comp@trocapaga.test');
select throws_ok(format($$ update public.compras_solicitacoes
    set forma_pagamento = 'cartao', parcelas = 1, forma_pagamento_2 = 'boleto', parcelas_2 = null, troca_motivo = 'x'
  where id = %L::uuid $$, pg_temp.compra('Teclado')), '23514', null, 'boleto ja pago: a troca e recusada');
select tests.clear_authentication();

update public.fin_entries set status = 'pending' where purchase_request_id = pg_temp.compra('Teclado');
select is((select boleto_pago_em is null from public.compras_solicitacoes where id = pg_temp.compra('Teclado')), true,
  'reabriu a conta: a compra deixa de estar boleto pago');
select throws_ok(format($$ delete from public.fin_entries where purchase_request_id = %L::uuid $$, pg_temp.compra('Teclado')),
  '23514', null, 'a conta que veio de uma compra nao se exclui');

select * from finish();
rollback;

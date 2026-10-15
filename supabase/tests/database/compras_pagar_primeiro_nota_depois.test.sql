-- COMPRAS: PAGAR PRIMEIRO, NOTA DEPOIS, E SEM PRAZO (migration 20270121010000; dono, 2026-10-15).
-- Como #89 (cartão, 2ª opção boleto) e #90 (boleto) no mesmo boleto do Mercado Livre: Cabo e Mouse. E um Teclado no
-- cartão, sozinho.
--   1  no cartão: "Comprei" cria a conta na hora, sem nota
--   2  ... e quem pediu é avisado de que foi paga
--   3  o registro do Teclado pago (com a nota) não cria outra conta
--   4  boleto sem o arquivo não vai ao Financeiro
--   5  enviado com a outra junto: UMA conta em aberto, com a soma
--   6  ... e a compra que entrou no pagamento passa a ser "boleto"
--   7  registrar antes de o Financeiro pagar o boleto é recusado
--   8  o Financeiro paga: as duas ficam marcadas e quem enviou é avisado nas duas
--   9  depois de pago, cada uma registra com a sua nota (uma com recibo e motivo)
--  10  paga há 15 dias sem a nota: quem pagou é avisado, uma vez só
--  11  o chamado de compra aprovado não tem prazo
begin;
\ir _helpers.psql

select plan(11);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-pagar-primeiro', 'Pagar Primeiro') as tenant;
create temporary table u on commit drop as
select tests.create_user('ana@pagarprimeiro.test', (select tenant from f)) as ana,
       tests.create_user('comp@pagarprimeiro.test', (select tenant from f)) as comp;
select tests.grant_module((select comp from u), (select tenant from f), 'compras');
select tests.grant_profile((select comp from u), (select tenant from f), 'compras', 'Operador');
update public.access_profiles set permissions = permissions || '{"solicitacoes": {"view": true, "execute": true}}'::jsonb
 where tenant_id = (select tenant from f) and department = 'compras' and name = 'Operador';
grant select on f, u to authenticated;

create temporary table pedido (nome text, ticket uuid) on commit drop;
grant select, insert on pedido to authenticated;
create or replace function pg_temp.compra(p text) returns uuid language sql as
  $$ select s.id from public.compras_solicitacoes s where s.ticket_id = (select ticket from pedido where nome = p) $$;

select tests.authenticate_as('ana@pagarprimeiro.test');
insert into pedido select n, public.compras_abrir_pedido(jsonb_build_object('title', n, 'priority', 'low'),
  jsonb_build_object('product_name', n, 'department', 'ti', 'quantidade', q),
  jsonb_build_array(jsonb_build_object('supplier', 'Mercado Livre', 'valor_unitario', v, 'link', 'https://ml')))
from (values ('Cabo', '2', '10'), ('Mouse', '1', '30'), ('Teclado', '1', '80')) x(n, q, v);
select tests.clear_authentication();

update public.compras_solicitacoes s
   set status = 'approved', approved_at = now(), few_quotes_reason = 'unico', filial = 'MF',
       forma_pagamento = case when s.product_name = 'Mouse' then 'boleto' else 'cartao' end,
       parcelas = case when s.product_name = 'Mouse' then null else 1 end,
       forma_pagamento_2 = case when s.product_name = 'Mouse' then 'cartao' else 'boleto' end,
       parcelas_2 = case when s.product_name = 'Mouse' then 1 end,
       approved_quote_id = (select q.id from public.compras_orcamentos q where q.request_id = s.id limit 1)
 where s.id in (pg_temp.compra('Cabo'), pg_temp.compra('Mouse'), pg_temp.compra('Teclado'));

-- Cartão, sozinho: "Comprei".
select tests.authenticate_as('comp@pagarprimeiro.test');
update public.compras_solicitacoes set pagamento_em = now() where id = pg_temp.compra('Teclado') returning id;
select tests.clear_authentication();
select is((select count(*)::int || '|' || min(status::text) from public.fin_entries where purchase_request_id = pg_temp.compra('Teclado')),
  '1|pending', 'no cartao: Comprei cria a conta na hora, sem nota');
select is((select count(*)::int from public.notifications where user_id = (select ana from u) and title like 'Compra paga%Teclado'), 1,
  'quem pediu e avisado de que foi paga');
select tests.authenticate_as('comp@pagarprimeiro.test');
update public.compras_solicitacoes set status = 'completed', purchase_file_path = 'nf-teclado.pdf', purchase_report = 'Chegou',
       executed_by = auth.uid(), executed_at = now() where id = pg_temp.compra('Teclado') returning id;
select tests.clear_authentication();
select is((select count(*)::int from public.fin_entries where purchase_request_id = pg_temp.compra('Teclado')), 1,
  'o registro da compra paga nao cria outra conta');

-- Boleto: o Mouse leva o Cabo.
select tests.authenticate_as('comp@pagarprimeiro.test');
select throws_ok(format($$ update public.compras_solicitacoes set pagamento_em = now(), payment_due_date = current_date + 5 where id = %L::uuid $$,
  pg_temp.compra('Mouse')), '23514', null, 'boleto sem o arquivo nao vai ao Financeiro');
update public.compras_solicitacoes set pago_junto_com = pg_temp.compra('Mouse') where id = pg_temp.compra('Cabo') returning id;
update public.compras_solicitacoes set pagamento_em = now() where id = pg_temp.compra('Cabo') returning id;
update public.compras_solicitacoes set pagamento_em = now(), pagamento_path = 'boleto.pdf', payment_due_date = current_date + 5
 where id = pg_temp.compra('Mouse') returning id;
select tests.clear_authentication();

select is((select count(*)::int || '|' || sum(amount) || '|' || min(status::text) from public.fin_entries
            where purchase_request_id in (pg_temp.compra('Cabo'), pg_temp.compra('Mouse'))),
  '1|50.00|pending', 'enviado com a outra junto: uma conta em aberto, com a soma');
select is((select forma_pagamento from public.compras_solicitacoes where id = pg_temp.compra('Cabo')), 'boleto',
  'a compra que entrou no pagamento passa a ser boleto');

select tests.authenticate_as('comp@pagarprimeiro.test');
select throws_ok(format($$ update public.compras_solicitacoes set status = 'completed', purchase_file_path = 'nf.pdf', purchase_report = 'x',
                          executed_by = auth.uid(), executed_at = now() where id = %L::uuid $$, pg_temp.compra('Mouse')),
  '23514', null, 'registrar antes de o Financeiro pagar o boleto e recusado');
select tests.clear_authentication();

update public.fin_entries set status = 'paid', settled_at = current_date where purchase_request_id = pg_temp.compra('Mouse');
select is((select count(*)::int from public.compras_solicitacoes where id in (pg_temp.compra('Cabo'), pg_temp.compra('Mouse')) and boleto_pago_em is not null)
         || '|' || (select count(*) from public.notifications where user_id = (select comp from u) and title like 'Boleto pago%'), '2|2',
  'o Financeiro paga: as duas ficam marcadas e quem enviou e avisado nas duas');

-- 15 dias depois, o Cabo segue sem nota (o Mouse chega antes).
update public.compras_solicitacoes set boleto_pago_em = now() - interval '16 days' where id = pg_temp.compra('Cabo');
select tests.authenticate_as('comp@pagarprimeiro.test');
update public.compras_solicitacoes set status = 'completed', purchase_file_path = 'recibo-mouse.jpg', purchase_report = 'Chegou',
       sem_nota_motivo = 'Vendedor pessoa fisica', executed_by = auth.uid(), executed_at = now()
 where id = pg_temp.compra('Mouse') returning id;
select tests.clear_authentication();
select is((select count(*)::int || '|' || (select count(*) from public.fin_entries where purchase_request_id in (pg_temp.compra('Cabo'), pg_temp.compra('Mouse'))))
             from public.compras_solicitacoes where id = pg_temp.compra('Mouse') and status = 'completed' and sem_nota_motivo is not null),
  '1|1', 'depois de pago, registra com a sua nota (ou recibo e motivo), sem conta nova');

select public.compras_lembra_a_nota();
select public.compras_lembra_a_nota();
select is((select count(*)::int from public.notifications where user_id = (select comp from u) and title like 'Nota fiscal ainda%'), 1,
  'paga ha 15 dias sem a nota: quem pagou e avisado, uma vez so');

select ok((select bool_and(t.sla_due_at is null and t.first_response_due_at is null) from public.tickets t
            where t.id in (select ticket from pedido)), 'o chamado de compra nao tem prazo');

select * from finish();
rollback;

-- FORMA DE PAGAMENTO E FILIAL NA APROVAÇÃO (migration 20270102010000; dono, 2026-10-14).
-- ana pede 1 cadeira com três orçamentos; apr aprova; comp registra a compra.
--   1  aprovar sem forma de pagamento e filial é recusado
--   2  forma de pagamento fora de cartão/boleto/pix é recusada
--   3  com as duas, aprova e grava
--   4  pedir ajuste e reenviar apaga as duas: a nova aprovação escolhe de novo
--   5  registrar a compra sem a nota fiscal é recusado (20270103010000)
--   6  a conta a pagar leva a forma de pagamento e a filial
--   7  cartão (ou pix): a conta nasce paga, no dia, mesmo com vencimento informado
begin;
\ir _helpers.psql

select plan(7);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-compras-pag', 'Compras Pag', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@compraspag.test',  (select a from f)) as ana,
       tests.create_user('apr@compraspag.test',  (select a from f)) as apr,
       tests.create_user('comp@compraspag.test', (select a from f)) as comp;
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

select tests.authenticate_as('ana@compraspag.test');
insert into pedido
select public.compras_abrir_pedido(
  '{"title":"Cadeira","priority":"low"}'::jsonb,
  '{"product_name":"Cadeira","department":"ti","quantidade":"1"}'::jsonb,
  '[{"supplier":"Loja A","valor_unitario":"100","link":"https://a"},
    {"supplier":"Loja B","valor_unitario":"90","link":"https://b"},
    {"supplier":"Loja C","valor_unitario":"120","link":"https://c"}]'::jsonb);
select tests.clear_authentication();

create or replace function pg_temp.aprovar(p_extra text) returns text language plpgsql as $$
begin
  execute format($q$ update public.compras_solicitacoes
     set status = 'approved', approved_by = auth.uid(), approved_at = now() %s,
         approved_quote_id = (select id from public.compras_orcamentos where request_id = %L::uuid and supplier = 'Loja B')
   where id = %L::uuid returning id $q$, p_extra, (pg_temp.compra()).id, (pg_temp.compra()).id);
  return 'aprovada';
end;
$$;

select tests.authenticate_as('apr@compraspag.test');
select throws_ok($$ select pg_temp.aprovar('') $$, '23514', null, 'sem forma de pagamento e filial a aprovacao e recusada');
select throws_ok($$ select pg_temp.aprovar(', forma_pagamento = ''cheque'', filial = ''MF''') $$, '23514', null,
  'forma de pagamento fora de cartao/boleto/pix e recusada');
select pg_temp.aprovar(', forma_pagamento = ''boleto'', filial = ''INBRAS''');
select is((select status::text || '|' || forma_pagamento || '|' || filial from public.compras_solicitacoes where id = (pg_temp.compra()).id),
  'approved|boleto|INBRAS', 'com as duas, aprova e grava');

-- Ajuste e reenvio: as escolhas da aprovação anterior somem.
update public.compras_solicitacoes set status = 'adjustment_requested', adjustment_reason = 'Confira'
 where id = (pg_temp.compra()).id returning id;
select tests.clear_authentication();
select tests.authenticate_as('ana@compraspag.test');
update public.compras_solicitacoes set status = 'pending_approval', adjustment_response = 'Ok'
 where id = (pg_temp.compra()).id returning id;
select tests.clear_authentication();
select ok((select forma_pagamento is null and filial is null from public.compras_solicitacoes where id = (pg_temp.compra()).id),
  'reenviar para aprovacao apaga as escolhas da aprovacao anterior');

select tests.authenticate_as('apr@compraspag.test');
select pg_temp.aprovar(', forma_pagamento = ''cartao'', parcelas = 1, filial = ''MF''');
select tests.clear_authentication();
select tests.authenticate_as('comp@compraspag.test');
select throws_ok(format($$ update public.compras_solicitacoes set status = 'completed', purchase_report = 'Comprada'
                           where id = %L::uuid returning id $$, (pg_temp.compra()).id),
  '23514', null, 'registrar a compra sem a nota fiscal e recusado');
update public.compras_solicitacoes
   set status = 'completed', purchase_file_path = 'nf.pdf', purchase_report = 'Comprada', executed_by = auth.uid(), executed_at = now(),
       payment_due_date = (now() at time zone 'America/Sao_Paulo')::date + 30
 where id = (pg_temp.compra()).id returning id;
select tests.clear_authentication();
select is((select payment_method || '|' || notes from public.fin_entries where purchase_request_id = (pg_temp.compra()).id),
  E'Cartão à vista|Filial: MF\nComprada', 'a conta a pagar leva a forma de pagamento e a filial');
select is((select status::text || '|' || (due_date = (now() at time zone 'America/Sao_Paulo')::date)::text
             || '|' || (settled_at is not null)::text from public.fin_entries where purchase_request_id = (pg_temp.compra()).id),
  'paid|true|true', 'cartao: a conta nasce paga, no dia, sem o vencimento informado');

select * from finish();
rollback;

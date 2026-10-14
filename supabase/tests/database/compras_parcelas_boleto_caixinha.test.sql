-- PARCELAS, BOLETO E CAIXINHA COMO FORMA (migration 20270105010000; dono, 2026-10-14). Três compras de R$ 100.
--   1  cartão sem dizer à vista ou parcelado é recusado
--   2  cartão 3x: três contas, 33,33 + 33,33 + 33,34
--   3  ... a 1ª paga, as outras em aberto
--   4  ... uma por mês
--   5  boleto: conta em aberto no vencimento informado
--   6  ... e quem é do Financeiro recebe o aviso
--   7  caixinha como forma: vira saída do Caixinha, com a nota
--   8  ... e não vira conta a pagar
begin;
\ir _helpers.psql

select plan(8);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-parcelas', 'Parcelas', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@parcelas.test',  (select a from f)) as ana,
       tests.create_user('apr@parcelas.test',  (select a from f)) as apr,
       tests.create_user('comp@parcelas.test', (select a from f)) as comp,
       tests.create_user('fin@parcelas.test',  (select a from f)) as fin;
insert into public.access_profiles (tenant_id, department, name, permissions)
select a, 'compras', 'Aprovador', '{"solicitacoes": {"approve": true}}'::jsonb from f;
select tests.grant_module((select apr from u), (select a from f), 'compras');
select tests.grant_profile((select apr from u), (select a from f), 'compras', 'Aprovador');
select tests.grant_module((select comp from u), (select a from f), 'compras');
select tests.grant_profile((select comp from u), (select a from f), 'compras', 'Operador');
select tests.grant_module((select fin from u), (select a from f), 'financeiro');
insert into public.caixinha_movimentos (tenant_id, tipo, valor, descricao) select a, 'entrada', 500, 'Repasse' from f;

create temporary table pedido (nome text, ticket uuid) on commit drop;
grant select on f, u to authenticated;
grant select, insert on pedido to authenticated;
create or replace function pg_temp.compra(p text) returns public.compras_solicitacoes language sql as
  $$ select s.* from public.compras_solicitacoes s where s.ticket_id = (select ticket from pedido where nome = p) $$;
create or replace function pg_temp.aprovar(p text, p_extra text) returns text language plpgsql as $$
begin
  execute format($q$ update public.compras_solicitacoes
     set status = 'approved', approved_by = auth.uid(), approved_at = now(), few_quotes_reason = 'unico' %s,
         approved_quote_id = (select id from public.compras_orcamentos where request_id = %L::uuid limit 1)
   where id = %L::uuid returning id $q$, p_extra, (pg_temp.compra(p)).id, (pg_temp.compra(p)).id);
  return 'aprovada';
end;
$$;
create or replace function pg_temp.registrar(p text, p_vence date) returns text language plpgsql as $$
begin
  update public.compras_solicitacoes
     set status = 'completed', purchase_file_path = 'nf-' || p || '.pdf', purchase_report = 'Comprada',
         executed_by = auth.uid(), executed_at = now(), payment_due_date = p_vence
   where id = (pg_temp.compra(p)).id;
  return 'registrada';
end;
$$;
create or replace function pg_temp.contas(p text) returns setof public.fin_entries language sql as
  $$ select * from public.fin_entries where purchase_request_id = (pg_temp.compra(p)).id order by parcela $$;

select tests.authenticate_as('ana@parcelas.test');
insert into pedido
select n, public.compras_abrir_pedido(jsonb_build_object('title', n, 'priority', 'low'),
  jsonb_build_object('product_name', n, 'department', 'ti', 'quantidade', '1'),
  '[{"supplier":"Loja","valor_unitario":"100","link":"https://l"}]'::jsonb)
from unnest(array['cartao', 'boleto', 'caixa']) n;
select tests.clear_authentication();

select tests.authenticate_as('apr@parcelas.test');
select throws_ok($$ select pg_temp.aprovar('cartao', ', forma_pagamento = ''cartao'', filial = ''MF''') $$,
  '23514', null, 'cartao sem dizer a vista ou parcelado e recusado');
select pg_temp.aprovar('cartao', ', forma_pagamento = ''cartao'', parcelas = 3, filial = ''MF''');
select pg_temp.aprovar('boleto', ', forma_pagamento = ''boleto'', filial = ''INBRAS''');
select pg_temp.aprovar('caixa', ', forma_pagamento = ''caixinha'', filial = ''MF''');
select tests.clear_authentication();

select tests.authenticate_as('comp@parcelas.test');
select pg_temp.registrar('cartao', null);
select pg_temp.registrar('boleto', ((now() at time zone 'America/Sao_Paulo')::date + 20));
select pg_temp.registrar('caixa', null);
select tests.clear_authentication();

select is((select string_agg(amount::text, '+' order by parcela) from pg_temp.contas('cartao')), '33.33+33.33+33.34',
  'cartao 3x: tres contas que somam o total');
select is((select string_agg(status::text, ',' order by parcela) from pg_temp.contas('cartao')), 'paid,pending,pending',
  'a 1a parcela paga, as outras em aberto');
select is((select array_agg(due_date order by parcela) from pg_temp.contas('cartao')),
  (select array_agg(((now() at time zone 'America/Sao_Paulo')::date + make_interval(months => m))::date order by m)
     from generate_series(0, 2) m),
  'uma parcela por mes');
select is((select status::text || '|' || due_date::text || '|' || payment_method from pg_temp.contas('boleto')),
  'pending|' || ((now() at time zone 'America/Sao_Paulo')::date + 20)::text || '|Boleto',
  'boleto: conta em aberto no vencimento informado');
select is((select count(*)::int from public.notifications where user_id = (select fin from u) and title like 'Boleto para pagar —%'), 1,
  'quem e do Financeiro recebe o aviso do boleto');
select is((select tipo || '|' || valor || '|' || recibo_path from public.caixinha_movimentos
            where purchase_request_id = (pg_temp.compra('caixa')).id), 'saida|100.00|nf-caixa.pdf',
  'caixinha como forma: vira saida do Caixinha, com a nota');
select is((select count(*)::int from pg_temp.contas('caixa')), 0, 'caixinha como forma: nao vira conta a pagar');

select * from finish();
rollback;

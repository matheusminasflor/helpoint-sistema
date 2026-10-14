-- CAIXINHA E QUEM COMPRA (migration 20270104010000; dono, 2026-10-14). ana pede café na categoria Caixinha;
-- fre aprova a Caixinha; apr aprova compra comum; dono compra o resto; zeca não tem nada com o Caixinha.
--   1  o pedido na categoria Caixinha nasce marcado como Caixinha
--   2  quem aprova compra comum não decide a Caixinha
--   3  o aprovador da Caixinha aprova sem forma de pagamento, filial nem três orçamentos
--   4  aprovada, a compra da Caixinha vai para o aprovador dela
--   5  registrar a compra com o Caixinha sem saldo é recusado
--   6  com a entrada lançada, registrar a compra vira saída do Caixinha, com o recibo
--   7  ... e não vira conta a pagar
--   8  saída solta sem recibo é recusada
--   9  compra comum aprovada vai para quem faz as compras
--  10  quem não tem a seção Caixinha não vê os lançamentos
--  11  a função nova não abre para anon
begin;
\ir _helpers.psql

select plan(11);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-caixinha', 'Caixinha', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@caixinha.test',  (select a from f)) as ana,
       tests.create_user('fre@caixinha.test',  (select a from f)) as fre,
       tests.create_user('apr@caixinha.test',  (select a from f)) as apr,
       tests.create_user('dono@caixinha.test', (select a from f)) as dono,
       tests.create_user('zeca@caixinha.test', (select a from f)) as zeca;
insert into public.access_profiles (tenant_id, department, name, permissions)
select a, 'compras', 'Aprovador', '{"solicitacoes": {"approve": true}}'::jsonb from f;
select tests.grant_module((select apr from u), (select a from f), 'compras');
select tests.grant_profile((select apr from u), (select a from f), 'compras', 'Aprovador');
insert into public.compras_config (tenant_id, comprador_id, caixinha_aprovador_id)
select a, (select dono from u), (select fre from u) from f;

create temporary table cat on commit drop as
with x as (
  insert into public.ti_categories (tenant_id, module, name, is_purchase, caixinha)
  select a, 'compras', 'Caixinha', true, true from f returning id
) select id from x;

create temporary table pedido (nome text, ticket uuid) on commit drop;
grant select on f, u, cat to authenticated;
grant select, insert on pedido to authenticated;
create or replace function pg_temp.compra(p text) returns public.compras_solicitacoes language sql as
  $$ select s.* from public.compras_solicitacoes s where s.ticket_id = (select ticket from pedido where nome = p) $$;

select tests.authenticate_as('ana@caixinha.test');
insert into pedido
select 'cafe', public.compras_abrir_pedido(
  jsonb_build_object('title', 'Cafe', 'priority', 'low', 'category_id', (select id from cat)),
  '{"product_name":"Cafe 500g","quantidade":"2"}'::jsonb,
  '[{"supplier":"Mercado","valor_unitario":"20","link":"https://m"}]'::jsonb);
insert into pedido
select 'cadeira', public.compras_abrir_pedido(
  '{"title":"Cadeira","priority":"low"}'::jsonb,
  '{"product_name":"Cadeira","department":"ti","quantidade":"1"}'::jsonb,
  '[{"supplier":"Loja A","valor_unitario":"100","link":"https://a"}]'::jsonb);
select tests.clear_authentication();

select ok((pg_temp.compra('cafe')).caixinha and not (pg_temp.compra('cadeira')).caixinha,
  'o pedido na categoria Caixinha nasce marcado como Caixinha');

create or replace function pg_temp.aprovar(p text, p_extra text) returns text language plpgsql as $$
begin
  execute format($q$ update public.compras_solicitacoes
     set status = 'approved', approved_by = auth.uid(), approved_at = now() %s,
         approved_quote_id = (select id from public.compras_orcamentos where request_id = %L::uuid limit 1)
   where id = %L::uuid returning id $q$, p_extra, (pg_temp.compra(p)).id, (pg_temp.compra(p)).id);
  return 'aprovada';
end;
$$;

select tests.authenticate_as('apr@caixinha.test');
select throws_ok($$ select pg_temp.aprovar('cafe', '') $$, '42501', null, 'quem aprova compra comum nao decide a Caixinha');
select tests.clear_authentication();

select tests.authenticate_as('fre@caixinha.test');
select pg_temp.aprovar('cafe', '');
select tests.clear_authentication();
select is((pg_temp.compra('cafe')).status::text, 'approved',
  'o aprovador da Caixinha aprova sem forma de pagamento, filial nem tres orcamentos');
select is((select assigned_to from public.tickets where id = (pg_temp.compra('cafe')).ticket_id), (select fre from u),
  'aprovada, a compra da Caixinha vai para o aprovador dela');

create or replace function pg_temp.registrar() returns text language plpgsql as $$
begin
  update public.compras_solicitacoes
     set status = 'completed', purchase_file_path = 'recibo.jpg', purchase_report = 'Comprado no mercado',
         executed_by = auth.uid(), executed_at = now()
   where id = (pg_temp.compra('cafe')).id;
  return 'registrada';
end;
$$;
select tests.authenticate_as('fre@caixinha.test');
select throws_ok($$ select pg_temp.registrar() $$, '23514', null, 'com o Caixinha sem saldo, registrar a compra e recusado');
insert into public.caixinha_movimentos (tipo, valor, descricao, created_by)
values ('entrada', 100, 'Repasse da semana', auth.uid()) returning id;
select pg_temp.registrar();
select tests.clear_authentication();
select is((select tipo || '|' || valor || '|' || recibo_path from public.caixinha_movimentos
            where purchase_request_id = (pg_temp.compra('cafe')).id), 'saida|40.00|recibo.jpg',
  'registrar a compra vira saida do Caixinha, com o recibo');
select is((select count(*)::int from public.fin_entries where purchase_request_id = (pg_temp.compra('cafe')).id), 0,
  'a compra da Caixinha nao vira conta a pagar');

select tests.authenticate_as('fre@caixinha.test');
select throws_ok($$ insert into public.caixinha_movimentos (tipo, valor, descricao, created_by)
                    values ('saida', 5, 'Acucar', auth.uid()) returning id $$,
  '23514', null, 'saida solta sem recibo e recusada');
select tests.clear_authentication();

select tests.authenticate_as('apr@caixinha.test');
select pg_temp.aprovar('cadeira', ', forma_pagamento = ''pix'', filial = ''MF'', few_quotes_reason = ''unico''');
select tests.clear_authentication();
select is((select assigned_to from public.tickets where id = (pg_temp.compra('cadeira')).ticket_id), (select dono from u),
  'compra comum aprovada vai para quem faz as compras');

select tests.authenticate_as('zeca@caixinha.test');
select is((select count(*)::int from public.caixinha_movimentos), 0, 'quem nao tem a secao Caixinha nao ve os lancamentos');
select tests.clear_authentication();

select ok(not has_function_privilege('anon', 'public.pode_na_caixinha(text)', 'execute'), 'a funcao nova nao abre para anon');

select * from finish();
rollback;

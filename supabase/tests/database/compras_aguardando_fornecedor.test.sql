-- COMPRAS: AGUARDANDO FORNECEDOR (migration 20270212040000; dono, 2026-10-27: o Kit Tigela e Pincel espera o
-- fornecedor produzir para sair o boleto).
--   1  quem pediu não marca
--   2  previsão antes de hoje é recusada
--   3  quem compra marca: guarda desde quando e quem
--   4  o histórico do pedido ganha a linha com a previsão
--   5  a previsão vencida avisa quem marcou, uma vez
--   6  previsão nova, aviso novo
--   7  depois de paga não volta a esperar o fornecedor
--   8  o lembrete não é chamável por fora
begin;
\ir _helpers.psql

select plan(8);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-aguarda-forn', 'Aguarda Fornecedor') as tenant;
create temporary table u on commit drop as
select tests.create_user('ana@aguardaforn.test', (select tenant from f)) as ana,
       tests.create_user('comp@aguardaforn.test', (select tenant from f)) as comp;
select tests.grant_module((select comp from u), (select tenant from f), 'compras');
select tests.grant_profile((select comp from u), (select tenant from f), 'compras', 'Operador');
update public.access_profiles set permissions = permissions || '{"solicitacoes": {"view": true, "execute": true}}'::jsonb
 where tenant_id = (select tenant from f) and department = 'compras' and name = 'Operador';
grant select on f, u to authenticated;
create temporary table d on commit drop as select (now() at time zone 'America/Sao_Paulo')::date as hoje;
grant select on d to authenticated;

create temporary table pedido (nome text, solicitacao uuid) on commit drop;
grant select, insert on pedido to authenticated;
create or replace function pg_temp.compra(p text) returns uuid language sql as
  $$ select s.id from public.compras_solicitacoes s where s.solicitacao_id = (select solicitacao from pedido where nome = p) $$;

select tests.authenticate_as('ana@aguardaforn.test');
insert into pedido select n, public.compras_abrir_pedido(jsonb_build_object('title', n, 'priority', 'low'),
  jsonb_build_object('few_quotes_reason', 'pgtap: fornecedor unico', 'product_name', n, 'department', 'ti', 'quantidade', '1'),
  jsonb_build_array(jsonb_build_object('supplier', 'Fabrica', 'valor_unitario', '50', 'link', 'https://f')))
from (values ('Kit'), ('Pago')) x(n);
select tests.clear_authentication();

update public.compras_solicitacoes s
   set status = 'approved', approved_at = now(), few_quotes_reason = 'unico', filial = 'MF', forma_pagamento = 'pix',
       approved_quote_id = (select q.id from public.compras_orcamentos q where q.request_id = s.id limit 1)
 where s.id in (pg_temp.compra('Kit'), pg_temp.compra('Pago'));

-- ═══ 1-3. Quem marca ═══
select tests.authenticate_as('ana@aguardaforn.test');
select throws_ok(format($$ update public.compras_solicitacoes set fornecedor_previsao = %L::date where id = %L::uuid $$,
  (select hoje + 5 from d), pg_temp.compra('Kit')), '42501', null, 'quem pediu nao marca aguardando fornecedor');
select tests.clear_authentication();

select tests.authenticate_as('comp@aguardaforn.test');
select throws_ok(format($$ update public.compras_solicitacoes set fornecedor_previsao = %L::date where id = %L::uuid $$,
  (select hoje - 1 from d), pg_temp.compra('Kit')), '23514', null, 'previsao antes de hoje e recusada');
update public.compras_solicitacoes set fornecedor_previsao = (select hoje + 5 from d), fornecedor_obs = '  produzindo  '
 where id = pg_temp.compra('Kit') returning id;
select tests.clear_authentication();

select is((select (fornecedor_desde is not null) || '|' || (fornecedor_por = (select comp from u)) || '|' || fornecedor_obs
             from public.compras_solicitacoes where id = pg_temp.compra('Kit')),
  'true|true|produzindo', 'quem compra marca: guarda desde quando e quem');
select ok((select texto like 'Aguardando o fornecedor, previsão %produzindo' from public.solicitacoes_eventos
            where solicitacao_id = (select solicitacao from pedido where nome = 'Kit') and acao = 'aguardar_fornecedor'),
  'o historico do pedido ganha a linha com a previsao');

-- ═══ 5-6. A previsão passou ═══
-- O tempo anda: a previsão vira ontem (pelo sistema, sem passar pela regra de "não antes de hoje").
update public.compras_solicitacoes set fornecedor_previsao = (select hoje - 1 from d) where id = pg_temp.compra('Kit');
select public.compras_lembra_o_fornecedor();
select public.compras_lembra_o_fornecedor();
select is((select count(*)::int from public.notifications
            where user_id = (select comp from u) and title like 'Fornecedor passou da previsão%'), 1,
  'a previsao vencida avisa quem marcou, uma vez');

select tests.authenticate_as('comp@aguardaforn.test');
update public.compras_solicitacoes set fornecedor_previsao = (select hoje + 3 from d) where id = pg_temp.compra('Kit') returning id;
select tests.clear_authentication();
select is((select aviso_fornecedor_em from public.compras_solicitacoes where id = pg_temp.compra('Kit')), null,
  'previsao nova, aviso novo');

-- ═══ 7-8. Depois de paga; e a porta ═══
select tests.authenticate_as('comp@aguardaforn.test');
update public.compras_solicitacoes set pagamento_em = now() where id = pg_temp.compra('Pago') returning id;
select throws_ok(format($$ update public.compras_solicitacoes set fornecedor_previsao = %L::date where id = %L::uuid $$,
  (select hoje + 5 from d), pg_temp.compra('Pago')), '23514', null, 'depois de paga nao volta a esperar o fornecedor');
select tests.clear_authentication();

select ok(not has_function_privilege('authenticated', 'public.compras_lembra_o_fornecedor()', 'execute')
      and not has_function_privilege('anon', 'public.compras_lembra_o_fornecedor()', 'execute'),
  'o lembrete nao e chamavel por fora');

select * from finish();
rollback;

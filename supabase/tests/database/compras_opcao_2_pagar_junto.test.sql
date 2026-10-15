-- OPÇÃO 2, PAGAR JUNTO, AVISO DE ESTOQUE E CAIXINHA PELO CATÁLOGO (migration 20270120010000; dono, 2026-10-15).
-- Duas compras do mesmo boleto: Cabo (2 × R$ 10) e Mouse (1 × R$ 30).
--   1  aprovar sem a 2ª forma é recusado
--   2  a 2ª forma igual à 1ª é recusada
--   3  trocar sem motivo é recusado
--   4  trocar por uma forma que não foi aprovada é recusado
--   5  o comprador troca pela 2ª forma, com motivo...
--   6  ... e quem aprovou é avisado
--   7  uma compra não paga junto com ela mesma
--   8  pagar junto: a parceira não gera conta...
--   9  ... e a principal leva a soma (R$ 50)
--  10  o aviso de estoque vai para o comprador configurado...
--  11  ... e não para todos com acesso a Compras
--  12  Caixinha: saída sem recibo, escolhida no Catálogo, entra
--  13  Caixinha: saída sem dizer o produto é recusada
--  14  as funções novas não abrem para anon
begin;
\ir _helpers.psql

select plan(14);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-opcao2', 'Opcao 2') as tenant;
create temporary table u on commit drop as
select tests.create_user('ana@opcao2.test', (select tenant from f)) as ana,
       tests.create_user('comp@opcao2.test', (select tenant from f)) as comp,
       tests.create_user('apr@opcao2.test', (select tenant from f)) as apr;
select tests.grant_module((select comp from u), (select tenant from f), 'compras');
select tests.grant_profile((select comp from u), (select tenant from f), 'compras', 'Operador');
update public.access_profiles set permissions = permissions || '{"solicitacoes": {"view": true, "execute": true}}'::jsonb
 where tenant_id = (select tenant from f) and department = 'compras' and name = 'Operador';
insert into public.access_profiles (tenant_id, department, name, permissions)
select tenant, 'compras', 'Aprovador', '{"solicitacoes": {"approve": true}}'::jsonb from f;
select tests.grant_module((select apr from u), (select tenant from f), 'compras');
select tests.grant_profile((select apr from u), (select tenant from f), 'compras', 'Aprovador');
grant select on f, u to authenticated;

create temporary table pedido (nome text, ticket uuid) on commit drop;
grant select, insert on pedido to authenticated;
create or replace function pg_temp.compra(p text) returns uuid language sql as
  $$ select s.id from public.compras_solicitacoes s where s.ticket_id = (select ticket from pedido where nome = p) $$;

select tests.authenticate_as('ana@opcao2.test');
insert into pedido select n, public.compras_abrir_pedido(jsonb_build_object('title', n, 'priority', 'low'),
  jsonb_build_object('product_name', n, 'department', 'ti', 'quantidade', q),
  jsonb_build_array(jsonb_build_object('supplier', 'Mercado Livre', 'valor_unitario', v, 'link', 'https://ml')))
from (values ('Cabo', '2', '10'), ('Mouse', '1', '30')) x(n, q, v);
select tests.clear_authentication();

create or replace function pg_temp.aprovar(p text, p_extra text) returns text language plpgsql as $$
begin
  execute format($q$ update public.compras_solicitacoes
     set status = 'approved', approved_by = (select apr from u), approved_at = now(), few_quotes_reason = 'unico', filial = 'MF' %s,
         approved_quote_id = (select id from public.compras_orcamentos where request_id = %L::uuid limit 1)
   where id = %L::uuid $q$, p_extra, pg_temp.compra(p), pg_temp.compra(p));
  return 'aprovada';
end;
$$;

select throws_ok($$ select pg_temp.aprovar('Cabo', ', forma_pagamento = ''boleto''') $$, '23514', null, 'aprovar sem a 2a forma e recusado');
select throws_ok($$ select pg_temp.aprovar('Cabo', ', forma_pagamento = ''boleto'', forma_pagamento_2 = ''boleto''') $$, '23514', null,
  'a 2a forma igual a 1a e recusada');
select pg_temp.aprovar('Cabo', ', forma_pagamento = ''boleto'', forma_pagamento_2 = ''pix''');
select pg_temp.aprovar('Mouse', ', forma_pagamento = ''boleto'', forma_pagamento_2 = ''pix''');

select tests.authenticate_as('comp@opcao2.test');
select throws_ok(format($$ update public.compras_solicitacoes set forma_pagamento = 'pix', forma_pagamento_2 = 'boleto' where id = %L::uuid $$,
  pg_temp.compra('Cabo')), '23514', null, 'trocar sem motivo e recusado');
select throws_ok(format($$ update public.compras_solicitacoes set forma_pagamento = 'cartao', parcelas = 1, forma_pagamento_2 = 'boleto', troca_motivo = 'x'
                          where id = %L::uuid $$, pg_temp.compra('Cabo')), '23514', null, 'trocar por forma nao aprovada e recusado');
update public.compras_solicitacoes set forma_pagamento = 'pix', forma_pagamento_2 = 'boleto', troca_motivo = 'O boleto nao foi gerado'
 where id = pg_temp.compra('Cabo') returning id;
select tests.clear_authentication();
select is((select forma_pagamento || '|' || forma_pagamento_2 from public.compras_solicitacoes where id = pg_temp.compra('Cabo')), 'pix|boleto',
  'o comprador troca pela 2a forma, com motivo');
select is((select count(*)::int from public.notifications where user_id = (select apr from u) and title like 'Forma de pagamento trocada%'), 1,
  'quem aprovou e avisado');

-- Volta para o boleto (a troca vale nos dois sentidos) e paga junto.
select tests.authenticate_as('comp@opcao2.test');
update public.compras_solicitacoes set forma_pagamento = 'boleto', forma_pagamento_2 = 'pix', troca_motivo = 'Saiu o boleto'
 where id = pg_temp.compra('Cabo') returning id;
select throws_ok(format($$ update public.compras_solicitacoes set pago_junto_com = id where id = %L::uuid $$, pg_temp.compra('Mouse')),
  '23514', null, 'uma compra nao paga junto com ela mesma');
update public.compras_solicitacoes set pago_junto_com = pg_temp.compra('Cabo') where id = pg_temp.compra('Mouse') returning id;
update public.compras_solicitacoes set status = 'completed', purchase_file_path = 'nf.pdf', purchase_report = 'Comprado', executed_by = auth.uid(), executed_at = now()
 where id in (pg_temp.compra('Cabo'), pg_temp.compra('Mouse')) returning id;
select tests.clear_authentication();

select is((select count(*)::int from public.fin_entries where purchase_request_id = pg_temp.compra('Mouse')), 0, 'pagar junto: a parceira nao gera conta');
select is((select sum(amount) from public.fin_entries where purchase_request_id = pg_temp.compra('Cabo')), 50.00::numeric(14,2),
  'a principal leva a soma');

-- Aviso de estoque: o comprador configurado, não todo mundo de Compras.
insert into public.compras_config (tenant_id, comprador_id) select tenant, (select comp from u) from f
  on conflict (tenant_id) do update set comprador_id = excluded.comprador_id;
create temporary table cafe on commit drop as
with x as (
  insert into public.compras_produtos (tenant_id, name, suprimento, unidade, estoque_minimo)
  select tenant, 'Cafe', true, 'pacote', 2 from f returning id
) select id from x;
insert into public.estoque_movimentos (tenant_id, produto_id, tipo, quantidade, motivo)
select tenant, (select id from cafe), 'entrada', 3, 'Contagem' from f;
insert into public.estoque_movimentos (tenant_id, produto_id, tipo, quantidade, retirado_por, motivo)
select tenant, (select id from cafe), 'saida', 2, (select ana from u), 'Copa' from f;
select is((select count(*)::int from public.notifications where user_id = (select comp from u) and title = 'Repor Cafe'), 1,
  'o aviso de estoque vai para o comprador configurado');
select is((select count(*)::int from public.notifications where user_id = (select apr from u) and title = 'Repor Cafe'), 0,
  'e nao para todos com acesso a Compras');

-- Caixinha: recibo opcional, produto do Catálogo obrigatório na saída solta.
insert into public.caixinha_movimentos (tenant_id, tipo, valor, descricao) select tenant, 'entrada', 100, 'Repasse' from f;
select lives_ok(format($$ insert into public.caixinha_movimentos (tenant_id, tipo, valor, descricao, produto_id, quantidade)
                         values (%L::uuid, 'saida', 15, 'Cafe', %L::uuid, 1) $$, (select tenant from f), (select id from cafe)),
  'caixinha: saida sem recibo, escolhida no catalogo, entra');
select throws_ok(format($$ insert into public.caixinha_movimentos (tenant_id, tipo, valor, descricao, recibo_path)
                          values (%L::uuid, 'saida', 15, 'qualquer coisa', 'r.jpg') $$, (select tenant from f)),
  '23514', null, 'caixinha: saida sem dizer o produto e recusada');

select ok(not has_function_privilege('anon', 'public.valor_da_compra(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.quem_recebe_aviso_de_estoque(uuid)', 'execute'), 'as funcoes novas nao abrem para anon');

select * from finish();
rollback;

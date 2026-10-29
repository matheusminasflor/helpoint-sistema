-- QUEM PEDE COTA (migration 20270212110000, dono 2026-10-29; antes, 20270201020000 deixava quem compra incluir os
-- orçamentos que faltavam). O pedido de compra nasce com três orçamentos — ou com menos e o porquê, escrito por quem
-- pede —, e Compras não inclui orçamento: faltou, quem aprova devolve "Em ajuste" e quem pediu corrige.
begin;
\ir _helpers.psql

select plan(8);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-cota', 'Cota', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@cota.test', (select a from f)) as ana,
       tests.create_user('comp@cota.test', (select a from f)) as comp,
       tests.create_user('zeca@cota.test', (select a from f)) as zeca;
insert into public.compras_config (tenant_id, comprador_id) select a, (select comp from u) from f;
select tests.grant_module((select comp from u), (select a from f), 'compras');
select tests.grant_profile((select comp from u), (select a from f), 'compras', 'Somente leitura');
create temporary table pedido (nome text, solicitacao uuid) on commit drop;
grant select on f, u to authenticated;
grant select, insert on pedido to authenticated;

select tests.authenticate_as('ana@cota.test');
select throws_ok($$ select public.compras_abrir_pedido('{"title":"Compra: Mesa"}'::jsonb,
    '{"product_name":"Mesa","department":"ti"}'::jsonb, '[]'::jsonb) $$,
  '23514', null, 'pedido de compra sem orcamento nenhum nao sai');
select throws_ok($$ select public.compras_abrir_pedido('{"title":"Compra: Mesa"}'::jsonb,
    '{"product_name":"Mesa","department":"ti"}'::jsonb, '[{"supplier":"Loja A","valor_unitario":"500"}]'::jsonb) $$,
  '23514', null, 'com um orcamento so e sem o porque, nao sai');
insert into pedido select 'unico', public.compras_abrir_pedido('{"title":"Compra: Rotulo"}'::jsonb,
  '{"product_name":"Rotulo","department":"marketing","few_quotes_reason":"Grafica unica que tem a faca do rotulo"}'::jsonb,
  '[{"supplier":"Grafica A","valor_unitario":"2"}]'::jsonb);
insert into pedido select 'tres', public.compras_abrir_pedido('{"title":"Compra: Cadeira"}'::jsonb,
  '{"product_name":"Cadeira","department":"ti"}'::jsonb,
  '[{"supplier":"Loja A","valor_unitario":"500"},{"supplier":"Loja B","valor_unitario":"450","recomendado":true},{"supplier":"Loja C","valor_unitario":"600"}]'::jsonb);
select tests.clear_authentication();

create temporary table compra on commit drop as
select p.nome, s.id, s.few_quotes_reason, s.orcamento_recomendado_id
  from pedido p join public.compras_solicitacoes s on s.solicitacao_id = p.solicitacao;
grant select on compra to authenticated;

select is((select few_quotes_reason from compra where nome = 'unico'), 'Grafica unica que tem a faca do rotulo',
  'com menos de tres, o porque de quem pediu fica no pedido');
select is((select count(*)::int from public.compras_orcamentos where request_id = (select id from compra where nome = 'tres')), 3,
  'com tres orcamentos, sai sem porque');
select ok((select orcamento_recomendado_id is not null from compra where nome = 'tres'),
  'e o orcamento que quem pediu recomenda fica marcado');

-- Compras (quem compra) não inclui orçamento; ninguém de fora também não.
select tests.authenticate_as('comp@cota.test');
select throws_ok($$
  insert into public.compras_orcamentos (tenant_id, request_id, supplier, amount, valor_unitario, position)
  select a, (select id from compra where nome = 'unico'), 'Grafica B', 3, 3, 2 from f
$$, '42501', null, 'quem compra nao inclui orcamento: os orcamentos sao de quem pede');
select tests.clear_authentication();
select tests.authenticate_as('zeca@cota.test');
select throws_ok($$
  insert into public.compras_orcamentos (tenant_id, request_id, supplier, amount, valor_unitario, position)
  select a, (select id from compra where nome = 'unico'), 'Loja Z', 1, 1, 3 from f
$$, '42501', null, 'quem nao e de Compras tambem nao');
select tests.clear_authentication();

-- Pedido antigo sem o porquê, reenviado depois de um ajuste com menos de três: o porquê passa a ser exigido.
update public.compras_solicitacoes set status = 'adjustment_requested', adjustment_reason = 'falta orcamento', few_quotes_reason = null
 where id = (select id from compra where nome = 'unico');
select tests.authenticate_as('ana@cota.test');
select throws_ok($$ update public.compras_solicitacoes set status = 'pending_approval'
                     where id = (select id from compra where nome = 'unico') $$,
  '23514', null, 'reenviar o ajuste com menos de tres e sem o porque e recusado');
select tests.clear_authentication();

select * from finish();
rollback;

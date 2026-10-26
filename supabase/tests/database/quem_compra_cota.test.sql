-- QUEM COMPRA COTA (migration 20270201020000): o pedido nasce com um orçamento (ou nenhum) e quem compra inclui os
-- outros enquanto a compra espera a aprovação.
begin;
\ir _helpers.psql

select plan(3);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-cota', 'Cota', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@cota.test', (select a from f)) as ana,
       tests.create_user('comp@cota.test', (select a from f)) as comp,
       tests.create_user('zeca@cota.test', (select a from f)) as zeca;
insert into public.compras_config (tenant_id, comprador_id) select a, (select comp from u) from f;
-- Quem compra é de Compras, mas só com "Somente leitura": não aprova, então não cotava pela policy do setor.
select tests.grant_module((select comp from u), (select a from f), 'compras');
select tests.grant_profile((select comp from u), (select a from f), 'compras', 'Somente leitura');
create temporary table pedido (solicitacao uuid) on commit drop;
grant select on f, u to authenticated;
grant select, insert on pedido to authenticated;

-- Ana pede a cadeira com um orçamento só (o "se souber").
select tests.authenticate_as('ana@cota.test');
insert into pedido select public.compras_abrir_pedido(
  '{"title":"Compra: Cadeira","description":"A minha quebrou"}'::jsonb,
  '{"product_name":"Cadeira","department":"ti"}'::jsonb,
  '[{"supplier":"Loja A","valor_unitario":"500"}]'::jsonb);
select tests.clear_authentication();
create temporary table compra on commit drop as
select id from public.compras_solicitacoes where solicitacao_id = (select solicitacao from pedido);
grant select on compra to authenticated;

select tests.authenticate_as('comp@cota.test');
select lives_ok($$
  insert into public.compras_orcamentos (tenant_id, request_id, supplier, amount, valor_unitario, position)
  select a, (select id from compra), 'Loja B', 450, 450, 2 from f returning id
$$, 'quem compra inclui um orçamento enquanto a compra espera a aprovação');
select is((select count(*)::int from public.compras_orcamentos where request_id = (select id from compra)), 2, 'e vê os dois');
select tests.clear_authentication();

select tests.authenticate_as('zeca@cota.test');
select throws_ok($$
  insert into public.compras_orcamentos (tenant_id, request_id, supplier, amount, valor_unitario, position)
  select a, (select id from compra), 'Loja Z', 1, 1, 3 from f
$$, '42501', null, 'quem não é de Compras nem quem compra não cota');
select tests.clear_authentication();

select * from finish();
rollback;

-- A 2ª FORMA DE PAGAMENTO SÓ COM CARTÃO OU BOLETO (migration 20270130070000).
begin;
\ir _helpers.psql

select plan(3);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-forma2', 'Forma 2') as tenant;
create temporary table u on commit drop as
select tests.create_user('ana@forma2.test', (select tenant from f)) as ana,
       tests.create_user('apr@forma2.test', (select tenant from f)) as apr;
insert into public.access_profiles (tenant_id, department, name, permissions)
select tenant, 'compras', 'Aprovador', '{"solicitacoes": {"approve": true}}'::jsonb from f;
select tests.grant_module((select apr from u), (select tenant from f), 'compras');
select tests.grant_profile((select apr from u), (select tenant from f), 'compras', 'Aprovador');
grant select on f, u to authenticated;

create temporary table pedido (nome text, ticket uuid) on commit drop;
grant select, insert on pedido to authenticated;
create or replace function pg_temp.compra(p text) returns uuid language sql as
  $$ select s.id from public.compras_solicitacoes s where s.ticket_id = (select ticket from pedido where nome = p) $$;

select tests.authenticate_as('ana@forma2.test');
insert into pedido select n, public.compras_abrir_pedido(jsonb_build_object('title', n, 'priority', 'low'),
  jsonb_build_object('product_name', n, 'department', 'ti', 'quantidade', '1'),
  jsonb_build_array(jsonb_build_object('supplier', s, 'valor_unitario', '10', 'link', 'https://loja')))
from (values ('Pix', 'Loja A'), ('Boleto', 'Loja B')) x(n, s);
select tests.clear_authentication();

create or replace function pg_temp.aprovar(p text, p_extra text) returns text language plpgsql as $$
begin
  execute format($q$ update public.compras_solicitacoes
     set status = 'approved', approved_by = (select apr from u), approved_at = now(), few_quotes_reason = 'unico', filial = 'MF' %s,
         approved_quote_id = (select id from public.compras_orcamentos where request_id = %L::uuid limit 1)
   where id = %L::uuid returning id $q$, p_extra, pg_temp.compra(p), pg_temp.compra(p));
  return 'aprovada';
end;
$$;

select tests.authenticate_as('apr@forma2.test');
select lives_ok($$ select pg_temp.aprovar('Pix', ', forma_pagamento = ''pix''') $$, 'com Pix, a 2ª forma é opcional');
select throws_ok($$ select pg_temp.aprovar('Boleto', ', forma_pagamento = ''boleto''') $$, '23514', null,
  'com boleto, sem a 2ª forma, continua recusado');
select throws_ok($$ select pg_temp.aprovar('Boleto', ', forma_pagamento = ''boleto'', forma_pagamento_2 = ''boleto''') $$, '23514', null,
  'a 2ª forma igual à 1ª continua recusada');
select tests.clear_authentication();

select * from finish();
rollback;

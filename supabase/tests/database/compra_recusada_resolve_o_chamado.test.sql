-- COMPRA RECUSADA FINALIZA O CHAMADO (migration 20270106010000; dono, 2026-10-14, exemplo #79).
--   1  recusada, o chamado fica resolvido
--   2  com a data de resolução
--   3  e o motivo da recusa como solução
begin;
\ir _helpers.psql

select plan(3);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-recusada', 'Recusada', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@recusada.test', (select a from f)) as ana,
       tests.create_user('apr@recusada.test', (select a from f)) as apr;
insert into public.access_profiles (tenant_id, department, name, permissions)
select a, 'compras', 'Aprovador', '{"solicitacoes": {"approve": true}}'::jsonb from f;
select tests.grant_module((select apr from u), (select a from f), 'compras');
select tests.grant_profile((select apr from u), (select a from f), 'compras', 'Aprovador');

create temporary table pedido (ticket uuid) on commit drop;
grant select on f, u to authenticated;
grant select, insert on pedido to authenticated;

select tests.authenticate_as('ana@recusada.test');
insert into pedido
select public.compras_abrir_pedido('{"title":"Monitor","priority":"low"}'::jsonb,
  '{"product_name":"Monitor","department":"ti","quantidade":"1"}'::jsonb,
  '[{"supplier":"Loja","valor_unitario":"900","link":"https://l"}]'::jsonb);
select tests.clear_authentication();

select tests.authenticate_as('apr@recusada.test');
update public.compras_solicitacoes set status = 'rejected', rejection_reason = 'Sem verba este mes', rejected_at = now()
 where ticket_id = (select ticket from pedido) returning id;
select tests.clear_authentication();

select is((select status::text from public.tickets where id = (select ticket from pedido)), 'resolved',
  'recusada, o chamado fica resolvido');
select ok((select resolved_at is not null from public.tickets where id = (select ticket from pedido)),
  'com a data de resolucao');
select is((select resolution_notes from public.tickets where id = (select ticket from pedido)), 'Compra recusada: Sem verba este mes',
  'e o motivo da recusa como solucao');

select * from finish();
rollback;

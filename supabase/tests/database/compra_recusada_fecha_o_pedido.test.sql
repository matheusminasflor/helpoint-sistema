-- COMPRA RECUSADA FECHA O PEDIDO (migration 20270106010000; dono, 2026-10-14, exemplo #79). Era "finaliza o chamado";
-- desde 20270206010000 a compra é um pedido, sem chamado por baixo, e a recusa fecha o pedido.
--   1  recusada, o pedido fica recusado
--   2  com o motivo da recusa no histórico
--   3  e quem pediu é avisado, no pedido
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

create temporary table pedido (solicitacao uuid) on commit drop;
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
 where solicitacao_id = (select solicitacao from pedido) returning id;
select tests.clear_authentication();

select is((select etapa from public.solicitacoes where id = (select solicitacao from pedido)), 'recusada',
  'recusada, o pedido fica recusado');
select is((select string_agg(texto, ' / ') from public.solicitacoes_eventos
            where solicitacao_id = (select solicitacao from pedido) and acao = 'recusar'), 'Sem verba este mes',
  'com o motivo da recusa no historico');
select is((select count(*)::int from public.notifications
            where user_id = (select ana from u) and reference_type = 'solicitacao'
              and reference_id = (select solicitacao from pedido) and title like 'Compra recusada%'), 1,
  'e quem pediu e avisado, no pedido');

select * from finish();
rollback;

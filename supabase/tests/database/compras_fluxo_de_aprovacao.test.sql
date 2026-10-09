-- COMPRAS: O FLUXO DE APROVAÇÃO (migration 20261221010000; dono, 2026-10-09).
--   ana   pede a compra (sem módulo de Compras)
--   apr   Compras, perfil só com "Aprovar / reprovar compra"
--   comp  Compras, Operador — compra e registra; assume o chamado ANTES da aprovação (o caso do aviso perdido)
--   leit  Compras, Somente leitura — não decide
-- Prova o caminho inteiro: aguardando aprovação (prazo pausado) → ajuste → reenvio → aprovada com aviso
-- mesmo com o chamado já assumido → "Resolver" por fora recusado → compra registrada → resolvido.
begin;
\ir _helpers.psql

select plan(13);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-compras-fluxo', 'Compras Fluxo', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@comprasfluxo.test',  (select a from f)) as ana,
       tests.create_user('apr@comprasfluxo.test',  (select a from f)) as apr,
       tests.create_user('comp@comprasfluxo.test', (select a from f)) as comp,
       tests.create_user('leit@comprasfluxo.test', (select a from f)) as leit;
insert into public.access_profiles (tenant_id, department, name, permissions)
select a, 'compras', 'Aprovador', '{"solicitacoes": {"approve": true}}'::jsonb from f;
select tests.grant_module((select apr from u), (select a from f), 'compras');
select tests.grant_profile((select apr from u), (select a from f), 'compras', 'Aprovador');
select tests.grant_module((select comp from u), (select a from f), 'compras');
select tests.grant_profile((select comp from u), (select a from f), 'compras', 'Operador');
select tests.grant_module((select leit from u), (select a from f), 'compras');
select tests.grant_profile((select leit from u), (select a from f), 'compras', 'Somente leitura');

create temporary table pedido (ticket uuid) on commit drop;
grant select on f, u to authenticated;
grant select, insert on pedido to authenticated;
create or replace function pg_temp.chamado() returns public.tickets language sql as
  $$ select * from public.tickets where id = (select ticket from pedido) $$;
create or replace function pg_temp.compra() returns uuid language sql as
  $$ select id from public.compras_solicitacoes where ticket_id = (select ticket from pedido) $$;

-- ═══ 1-2. Pedido aberto: aguardando aprovação, prazo parado, quem aprova avisado (com e-mail). ═══
select tests.authenticate_as('ana@comprasfluxo.test');
insert into pedido
select public.compras_abrir_pedido(
  '{"title":"Cadeira","description":"A minha quebrou","priority":"low"}'::jsonb,
  '{"product_name":"Cadeira","department":"ti"}'::jsonb,
  '[{"supplier":"Loja A","amount":"500","link":"https://a"},{"supplier":"Loja B","amount":"450","link":"https://b"},{"supplier":"Loja C","amount":"600","link":"https://c"}]'::jsonb);
select tests.clear_authentication();
select is((select status::text || '|' || (pendente_desde is not null)::text from pg_temp.chamado()), 'waiting_parts|true',
  'o chamado nasce aguardando aprovacao, com o prazo de Compras parado');
select is((select string_agg(email_sent::text, ',') from public.notifications
            where user_id = (select apr from u) and type = 'purchase_requested'), 'false',
  'quem tem a caixinha de aprovar e avisado do pedido, com e-mail');

-- Compras assume o chamado antes da decisão (é aqui que o aviso de aprovação se perdia).
update public.tickets set assigned_to = (select comp from u) where id = (select ticket from pedido);

-- ═══ 3. Quem só lê não decide. ═══
select tests.authenticate_as('leit@comprasfluxo.test');
select throws_ok($$ update public.compras_solicitacoes set status = 'approved' where id = pg_temp.compra() returning id $$,
  '42501', null, 'Somente leitura de Compras nao aprova');
select tests.clear_authentication();

-- ═══ 4-5. Ajuste: o chamado espera quem pediu; reenviado, volta a aguardar aprovação. ═══
select tests.authenticate_as('apr@comprasfluxo.test');
update public.compras_solicitacoes set status = 'adjustment_requested', adjustment_reason = 'Falta o frete'
 where id = pg_temp.compra() returning id;
select tests.clear_authentication();
select is((pg_temp.chamado()).status::text, 'waiting_user', 'pedido de ajuste: o chamado aguarda quem pediu');
select tests.authenticate_as('ana@comprasfluxo.test');
update public.compras_solicitacoes set status = 'pending_approval', adjustment_response = 'Frete incluido'
 where id = pg_temp.compra() returning id;
select tests.clear_authentication();
select is((pg_temp.chamado()).status::text, 'waiting_parts', 'reenviada: volta a aguardar aprovacao');

-- ═══ 6-8. Aprovada com o chamado já assumido: aguardando compra, e os dois lados avisados. ═══
select tests.authenticate_as('apr@comprasfluxo.test');
update public.compras_solicitacoes
   set status = 'approved', approved_by = auth.uid(), approved_at = now(),
       approved_quote_id = (select id from public.compras_orcamentos where request_id = pg_temp.compra() and supplier = 'Loja B')
 where id = pg_temp.compra() returning id;
select tests.clear_authentication();
select is((select status::text || '|' || (pendente_desde is null)::text from pg_temp.chamado()), 'in_progress|true',
  'aprovada: o chamado fica aguardando a compra e o prazo volta a correr');
select is((select count(*)::int from public.notifications where user_id = (select ana from u) and title like 'Compra aprovada —%'), 1,
  'quem pediu e avisado da aprovacao mesmo com o chamado ja assumido');
select is((select count(*)::int from public.notifications where user_id = (select comp from u) and title like 'Compra aprovada, pode comprar%'), 1,
  'e quem compra tambem');

-- ═══ 9. O "Resolver" comum não fecha compra aprovada. ═══
select tests.authenticate_as('comp@comprasfluxo.test');
select throws_ok($$ update public.tickets set status = 'resolved' where id = (select ticket from pedido) $$,
  '23514', null, 'compra aprovada nao fecha pelo Resolver comum');

-- ═══ 10-11. Registrar a compra resolve o chamado e avisa quem pediu. ═══
update public.compras_solicitacoes
   set status = 'completed', purchase_report = 'Comprada na Loja B, NF 123', executed_by = auth.uid(), executed_at = now()
 where id = pg_temp.compra() returning id;
select tests.clear_authentication();
select is((select status::text || '|' || resolution_notes from pg_temp.chamado()), 'resolved|Comprada na Loja B, NF 123',
  'registrar a compra resolve o chamado com o laudo');
select is((select count(*)::int from public.notifications where user_id = (select ana from u) and title like 'Compra realizada%'), 1,
  'e quem pediu e avisado da compra feita');

-- ═══ 12-13. Portas. ═══
select ok(not has_function_privilege('authenticated', 'public.aprovadores_de_compra(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.aprovadores_de_compra(uuid)', 'execute'),
  'a lista de aprovadores so roda por dentro');
select is((select count(*)::int from public.compras_decisoes where request_id = pg_temp.compra()), 4,
  'o registro tem ajuste, reenvio, aprovacao e conclusao');

select * from finish();
rollback;

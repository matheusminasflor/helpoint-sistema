-- COMPRAS: O FLUXO DE APROVAÇÃO (migration 20261221010000; dono, 2026-10-09).
--   ana   pede a compra (sem módulo de Compras)
--   apr   Compras, perfil só com "Aprovar / reprovar compra"
--   comp  Compras, Operador — compra e registra; já é quem compra ANTES da aprovação (o caso do aviso perdido)
--   leit  Compras, Somente leitura — não decide
-- Prova o caminho inteiro: aguardando aprovação → ajuste → reenvio → aprovada com aviso mesmo com quem compra já
-- definido → a etapa não muda por fora da compra → compra registrada → concluída.
-- Desde 20270206010000 a compra é um PEDIDO, sem chamado por baixo: o que o chamado mostrava (situação, laudo) é a
-- etapa do pedido e o histórico dele.
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

create temporary table pedido (solicitacao uuid) on commit drop;
grant select on f, u to authenticated;
grant select, insert on pedido to authenticated;
create or replace function pg_temp.etapa() returns text language sql as
  $$ select etapa from public.solicitacoes where id = (select solicitacao from pedido) $$;
create or replace function pg_temp.evento(p_acao text) returns text language sql as
  $$ select string_agg(coalesce(texto, ''), ' / ' order by created_at) from public.solicitacoes_eventos
      where solicitacao_id = (select solicitacao from pedido) and acao = p_acao $$;
create or replace function pg_temp.compra() returns uuid language sql as
  $$ select id from public.compras_solicitacoes where solicitacao_id = (select solicitacao from pedido) $$;

-- ═══ 1-2. Pedido aberto: aguardando aprovação, sem chamado, quem aprova avisado (com e-mail). ═══
select tests.authenticate_as('ana@comprasfluxo.test');
insert into pedido
select public.compras_abrir_pedido(
  '{"title":"Cadeira","description":"A minha quebrou","priority":"low"}'::jsonb,
  '{"product_name":"Cadeira","department":"ti"}'::jsonb,
  '[{"supplier":"Loja A","amount":"500","link":"https://a"},{"supplier":"Loja B","amount":"450","link":"https://b"},{"supplier":"Loja C","amount":"600","link":"https://c"}]'::jsonb);
select tests.clear_authentication();
select is(pg_temp.etapa() || '|' || (select count(*) from public.tickets where tenant_id = (select a from f))::text, 'pedido|0',
  'o pedido nasce aguardando aprovacao, e nenhum chamado nasce com ele');
select is((select string_agg(email_sent::text, ',') from public.notifications
            where user_id = (select apr from u) and type = 'purchase_requested'), 'false',
  'quem tem a caixinha de aprovar e avisado do pedido, com e-mail');

-- Quem compra já está definido antes da decisão (era o chamado assumido, onde o aviso de aprovação se perdia).
update public.compras_solicitacoes set comprador_id = (select comp from u) where id = pg_temp.compra();

-- ═══ 3. Quem só lê não decide. ═══
select tests.authenticate_as('leit@comprasfluxo.test');
select throws_ok($$ update public.compras_solicitacoes set status = 'approved', forma_pagamento = 'boleto', forma_pagamento_2 = 'pix', filial = 'MF' where id = pg_temp.compra() returning id $$,
  '42501', null, 'Somente leitura de Compras nao aprova');
select tests.clear_authentication();

-- ═══ 4-5. Ajuste: o pedido continua esperando, e o histórico guarda o que foi pedido e respondido. ═══
select tests.authenticate_as('apr@comprasfluxo.test');
update public.compras_solicitacoes set status = 'adjustment_requested', adjustment_reason = 'Falta o frete'
 where id = pg_temp.compra() returning id;
select tests.clear_authentication();
select is(pg_temp.etapa() || '|' || pg_temp.evento('ajustar'), 'pedido|Falta o frete',
  'pedido de ajuste: o pedido segue esperando, com o motivo no historico');
select tests.authenticate_as('ana@comprasfluxo.test');
update public.compras_solicitacoes set status = 'pending_approval', adjustment_response = 'Frete incluido'
 where id = pg_temp.compra() returning id;
select tests.clear_authentication();
select is(pg_temp.etapa() || '|' || pg_temp.evento('reenviar'), 'pedido|Frete incluido',
  'reenviada: volta a aguardar aprovacao, com a resposta no historico');

-- ═══ 6-8. Aprovada com quem compra já definido: a etapa anda, e os dois lados avisados. ═══
select tests.authenticate_as('apr@comprasfluxo.test');
update public.compras_solicitacoes
   set status = 'approved', forma_pagamento = 'boleto', forma_pagamento_2 = 'pix', filial = 'MF', approved_by = auth.uid(), approved_at = now(),
       approved_quote_id = (select id from public.compras_orcamentos where request_id = pg_temp.compra() and supplier = 'Loja B')
 where id = pg_temp.compra() returning id;
select tests.clear_authentication();
select is(pg_temp.etapa(), 'aprovada', 'aprovada: o pedido fica aprovado, esperando a compra');
select is((select count(*)::int from public.notifications where user_id = (select ana from u) and title like 'Compra aprovada —%'), 1,
  'quem pediu e avisado da aprovacao mesmo com quem compra ja definido');
select is((select count(*)::int from public.notifications where user_id = (select comp from u) and title like 'Compra aprovada, pode comprar%'), 1,
  'e quem compra tambem');

-- ═══ 9. A etapa do pedido de compra não muda por fora da compra (era o "Resolver" comum no chamado). ═══
select throws_ok($$ update public.solicitacoes set etapa = 'concluida' where id = (select solicitacao from pedido) $$,
  '42501', null, 'compra aprovada nao se encerra mexendo no pedido');

-- ═══ 10-11. Registrar a compra encerra o pedido com o laudo e avisa quem pediu. ═══
select tests.authenticate_as('comp@comprasfluxo.test');
update public.compras_solicitacoes
   set status = 'completed', purchase_file_path = 'nf.pdf', purchase_report = 'Comprada na Loja B, NF 123', executed_by = auth.uid(), executed_at = now()
 where id = pg_temp.compra() returning id;
select tests.clear_authentication();
select is(pg_temp.etapa() || '|' || pg_temp.evento('comprar'), 'concluida|Comprada na Loja B, NF 123',
  'registrar a compra conclui o pedido, com o laudo no historico');
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

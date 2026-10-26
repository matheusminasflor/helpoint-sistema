-- A COMPRA VIRA PEDIDO DE VERDADE (migration 20270206010000; rodada 2, decisões do dono de 2026-10-25).
-- A compra deixa de ter chamado por baixo: é um pedido (`solicitacoes`, tipo 'compra'), que anda com ela. E todo
-- pedido ganha conversa (`pedido_escrever`) e e-mail (`pedido_emails_pendentes`).
--   ana   pede (Comercial, sem Compras)          apr   aprova compra (Compras, "Aprovar / reprovar")
--   comp  quem faz as compras (compras_config)    ver   Compras, só "Visualizar"
--   mkt   Marketing, Operador (decide a arte)     zeca  Comercial, sem nada com Compras
--    1  pedir a compra cria o pedido: tipo compra, setor compras, etapa pedido
--    2  ... e nenhum chamado
--    3  ... e a compra fica ligada a ele, com o "para quê" no pedido
--    4  compra inserida direto também ganha o seu pedido
--    5  ninguém cria pedido de compra sem compra
--    6  cancelar o pedido de compra por fora da compra é recusado
--    7  aprovada: o pedido anda para "aprovada" e quem compra é o da configuração
--    8  ... e quem pediu é avisado no pedido
--    9  recusada: o pedido fica "recusada", com o motivo no histórico
--   10  quem não tem nada com Compras não vê os pedidos de compra
--   11  quem tem "Visualizar" em Compras vê
--   12  escrever num pedido de arte grava a mensagem no histórico
--   13  ... e avisa quem decide no Marketing
--   14  mensagem em branco é recusada
--   15  quem não vê o pedido não escreve nele
--   16  a fila de e-mail traz o aviso do pedido
--   17  as portas novas não abrem para anon, e a fila de e-mail não abre para quem está logado
begin;
\ir _helpers.psql

select plan(17);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-compra-pedido', 'Compra Pedido', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@comprapedido.test',  (select a from f)) as ana,
       tests.create_user('apr@comprapedido.test',  (select a from f)) as apr,
       tests.create_user('comp@comprapedido.test', (select a from f)) as comp,
       tests.create_user('ver@comprapedido.test',  (select a from f)) as ver,
       tests.create_user('mkt@comprapedido.test',  (select a from f)) as mkt,
       tests.create_user('zeca@comprapedido.test', (select a from f)) as zeca;
insert into public.access_profiles (tenant_id, department, name, permissions)
select a, 'compras', p, perm::jsonb from f,
  (values ('Aprovador', '{"solicitacoes": {"approve": true}}'), ('Leitor', '{"solicitacoes": {"view": true}}')) x(p, perm);
select tests.grant_module((select ana from u), (select a from f), 'comercial');
select tests.grant_module((select zeca from u), (select a from f), 'comercial');
select tests.grant_module((select apr from u), (select a from f), 'compras');
select tests.grant_profile((select apr from u), (select a from f), 'compras', 'Aprovador');
select tests.grant_module((select ver from u), (select a from f), 'compras');
select tests.grant_profile((select ver from u), (select a from f), 'compras', 'Leitor');
select tests.grant_module((select mkt from u), (select a from f), 'marketing');
select tests.grant_profile((select mkt from u), (select a from f), 'marketing', 'Operador');
insert into public.compras_config (tenant_id, comprador_id) select a, (select comp from u) from f;

create temporary table p (nome text, id uuid) on commit drop;
grant select on f, u to authenticated;
grant select, insert on p to authenticated;
create or replace function pg_temp.pedido(p_nome text) returns uuid language sql as
  $$ select id from p where nome = p_nome $$;
create or replace function pg_temp.compra(p_nome text) returns public.compras_solicitacoes language sql as
  $$ select c.* from public.compras_solicitacoes c where c.solicitacao_id = pg_temp.pedido(p_nome) $$;

-- ═══ 1-3. Pedir a compra: nasce o pedido, sem chamado. ═══
select tests.authenticate_as('ana@comprapedido.test');
insert into p
select 'projetor', public.compras_abrir_pedido(
  '{"title":"Compra: Projetor","description":"Para a reuniao com clientes","priority":"low"}'::jsonb,
  '{"product_name":"Projetor","department":"comercial","quantidade":"1"}'::jsonb,
  '[{"supplier":"Loja A","valor_unitario":"2000","link":"https://a"}]'::jsonb);
insert into p
select 'cadeira', public.compras_abrir_pedido(
  '{"title":"Compra: Cadeira","priority":"low"}'::jsonb,
  '{"product_name":"Cadeira","department":"comercial","quantidade":"1"}'::jsonb,
  '[{"supplier":"Loja B","valor_unitario":"300","link":"https://b"}]'::jsonb);
-- Lido por quem pediu: a policy de leitura do pedido deixa.
select is((select tipo || '|' || setor || '|' || etapa from public.solicitacoes where id = pg_temp.pedido('projetor')),
  'compra|compras|pedido', 'pedir a compra cria o pedido: tipo compra, setor compras, etapa pedido');
select tests.clear_authentication();

select is((select count(*)::int from public.tickets where tenant_id = (select a from f)), 0, 'e nenhum chamado');
select is((select c.product_name || '|' || s.detalhes from public.compras_solicitacoes c
             join public.solicitacoes s on s.id = c.solicitacao_id where s.id = pg_temp.pedido('projetor')),
  'Projetor|Para a reuniao com clientes', 'e a compra fica ligada ao pedido, com o para que nele');

-- ═══ 4. Insert direto (a policy de INSERT da compra deixa): o pedido nasce junto. ═══
insert into public.compras_solicitacoes (tenant_id, product_name, department, status, created_by)
select a, 'Grampeador', 'comercial', 'pending_approval', (select ana from u) from f;
select is((select s.titulo || '|' || (s.solicitante_id = (select ana from u))::text
             from public.compras_solicitacoes c join public.solicitacoes s on s.id = c.solicitacao_id
            where c.product_name = 'Grampeador' and c.tenant_id = (select a from f)),
  'Compra: Grampeador|true', 'compra inserida direto tambem ganha o seu pedido');

-- ═══ 5-6. O pedido de compra só nasce e anda pela compra. ═══
select tests.authenticate_as('ana@comprapedido.test');
select throws_ok($$ insert into public.solicitacoes (tipo, titulo) values ('compra', 'Compra sem compra') returning id $$,
  '42501', 'Compra se pede em "Novo › Pedido › Compra".', 'ninguem cria pedido de compra sem compra');
-- Sem a trava, cancelaria: é quem pediu, e o pedido ainda está em "pedido".
select throws_ok($$ select public.solicitacao_agir(pg_temp.pedido('cadeira'), 'cancelar') $$,
  '42501', 'A compra anda pelo quadro de Compras, não por aqui.', 'cancelar o pedido de compra por fora da compra e recusado');
select tests.clear_authentication();

-- ═══ 7-8. Aprovada: o pedido anda, quem compra vem da configuração, quem pediu é avisado. ═══
select tests.authenticate_as('apr@comprapedido.test');
update public.compras_solicitacoes
   set status = 'approved', approved_by = auth.uid(), approved_at = now(), few_quotes_reason = 'unico',
       forma_pagamento = 'pix', forma_pagamento_2 = 'boleto', filial = 'MF',
       approved_quote_id = (select q.id from public.compras_orcamentos q where q.request_id = (pg_temp.compra('projetor')).id limit 1)
 where id = (pg_temp.compra('projetor')).id returning id;
update public.compras_solicitacoes set status = 'rejected', rejection_reason = 'Fora do orcamento', rejected_at = now()
 where id = (pg_temp.compra('cadeira')).id returning id;
select tests.clear_authentication();

select is((select s.etapa || '|' || coalesce((c.comprador_id = (select comp from u))::text, 'sem comprador')
             from public.solicitacoes s join public.compras_solicitacoes c on c.solicitacao_id = s.id
            where s.id = pg_temp.pedido('projetor')),
  'aprovada|true', 'aprovada: o pedido anda para aprovada, e quem compra e o da configuracao');
select is((select count(*)::int from public.notifications
            where user_id = (select ana from u) and reference_type = 'solicitacao'
              and reference_id = pg_temp.pedido('projetor') and title like 'Compra aprovada —%'), 1,
  'e quem pediu e avisado no pedido');

-- ═══ 9. Recusada. ═══
select is((select s.etapa || '|' || coalesce((select string_agg(e.texto, ' / ') from public.solicitacoes_eventos e
                                               where e.solicitacao_id = s.id and e.acao = 'recusar'), 'sem motivo')
             from public.solicitacoes s where s.id = pg_temp.pedido('cadeira')),
  'recusada|Fora do orcamento', 'recusada: o pedido fica recusado, com o motivo no historico');

-- ═══ 10-11. Quem vê o pedido de compra. Contagem: SELECT barrado por RLS devolve vazio. ═══
select tests.authenticate_as('zeca@comprapedido.test');
select is((select count(*)::int from public.solicitacoes where tipo = 'compra'), 0,
  'quem nao tem nada com Compras nao ve os pedidos de compra');
select tests.clear_authentication();
select tests.authenticate_as('ver@comprapedido.test');
select is((select count(*)::int from public.solicitacoes where tipo = 'compra'), 3,
  'quem tem Visualizar em Compras ve os tres');
select tests.clear_authentication();

-- ═══ 12-15. Escrever no pedido (todo pedido, decisão do dono). ═══
select tests.authenticate_as('ana@comprapedido.test');
with x as (
  insert into public.solicitacoes (tipo, titulo, preciso_ate) values ('arte', 'Banner da feira', current_date + 7) returning id)
insert into p select 'arte', id from x;
select public.pedido_escrever(pg_temp.pedido('arte'), '  Pode ser azul?  ');
select throws_ok($$ select public.pedido_escrever(pg_temp.pedido('arte'), '   ') $$, '23514', null,
  'mensagem em branco e recusada');
select tests.clear_authentication();

select is((select string_agg(texto, ' / ') from public.solicitacoes_eventos
            where solicitacao_id = pg_temp.pedido('arte') and acao = 'escrever' and quem = (select ana from u)),
  'Pode ser azul?', 'escrever num pedido de arte grava a mensagem no historico');
select is((select count(*)::int from public.notifications
            where user_id = (select mkt from u) and reference_id = pg_temp.pedido('arte')
              and title like 'Mensagem no pedido #%' and message like '%Pode ser azul?%'), 1,
  'e avisa quem decide no Marketing');

-- O id sai ANTES de autenticar: o zeca não enxerga o pedido da Ana.
create temporary table arte on commit drop as select pg_temp.pedido('arte') as id;
grant select on arte to authenticated;
select tests.authenticate_as('zeca@comprapedido.test');
select throws_ok($$ select public.pedido_escrever((select id from arte), 'Oi') $$, 'P0002', null,
  'quem nao ve o pedido nao escreve nele');
select tests.clear_authentication();

-- ═══ 16. O e-mail do pedido. ═══
select is((select count(*)::int from public.pedido_emails_pendentes(50, '0 seconds')
            where user_id = (select mkt from u) and solicitacao_id = (select id from arte)), 1,
  'a fila de e-mail traz o aviso do pedido');

-- ═══ 17. Portas. ═══
select ok(not has_function_privilege('anon', 'public.pedido_escrever(uuid, text)', 'execute')
      and not has_function_privilege('anon', 'public.compras_abrir_pedido(jsonb, jsonb, jsonb)', 'execute')
      and not has_function_privilege('authenticated', 'public.pedido_emails_pendentes(integer, interval)', 'execute')
      and not has_function_privilege('authenticated', 'public.notify_compra(uuid, public.notification_type, uuid[], text, text, boolean, uuid)', 'execute'),
  'as portas novas nao abrem para anon, e a fila de e-mail nao abre para quem esta logado');

select * from finish();
rollback;

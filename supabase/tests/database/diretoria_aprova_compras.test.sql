-- A Diretoria decide as compras (migration 20261130010000; decisões do dono, 2026-10-03).
--
--   ana   pede a compra
--   gest  Compras, Gestor — aprova, recusa e pede ajuste
--   dir   só o módulo Diretoria — vê, não decide
begin;
\ir _helpers.psql

select plan(14);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-dir-compras', 'Dir Compras', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@dircompras.test',  (select a from f)) as ana,
       tests.create_user('gest@dircompras.test', (select a from f)) as gest,
       tests.create_user('dir@dircompras.test',  (select a from f)) as dir;
select tests.grant_module((select gest from u), (select a from f), 'compras');
select tests.grant_profile((select gest from u), (select a from f), 'compras', 'Gestor');
select tests.grant_module((select dir from u), (select a from f), 'diretoria');

create temporary table pedido (ticket uuid) on commit drop;
create temporary table cnt (n int) on commit drop;
grant select on f, u to authenticated;
grant select, insert, delete on pedido, cnt to authenticated;

select tests.authenticate_as('ana@dircompras.test');
insert into pedido
select public.compras_abrir_pedido(
  '{"title":"Cadeira","description":"A minha quebrou","priority":"low"}'::jsonb,
  '{"product_name":"Cadeira","department":"ti"}'::jsonb,
  '[{"supplier":"Loja A","amount":"500"},{"supplier":"Loja B","amount":"450"},{"supplier":"Loja C","amount":"600"}]'::jsonb);
select tests.clear_authentication();

create temporary table req on commit drop as
select id from public.compras_solicitacoes where ticket_id = (select ticket from pedido);
grant select on req to authenticated;

-- ═══ 1-2. A Diretoria vê; não decide. ═══
select tests.authenticate_as('dir@dircompras.test');
select is((select count(*)::int from public.compras_solicitacoes), 1, 'quem tem a Diretoria ve o pedido');
select throws_ok($$ update public.compras_solicitacoes set status = 'adjustment_requested', adjustment_reason = 'x'
  where id = (select id from req) returning id $$, '42501', null, 'e nao decide sem a caixinha de Compras');
select tests.clear_authentication();

-- ═══ 3-5. Pedir ajuste exige o porquê, fica registrado e avisa quem pediu. ═══
select tests.authenticate_as('gest@dircompras.test');
select throws_ok($$ update public.compras_solicitacoes set status = 'adjustment_requested'
  where id = (select id from req) returning id $$, '23514', null, 'pedir ajuste sem dizer o que ajustar e recusado');
update public.compras_solicitacoes set status = 'adjustment_requested', adjustment_reason = 'Falta o frete nos orcamentos'
 where id = (select id from req);
select tests.clear_authentication();
select is((select decisao || '|' || observacao from public.compras_decisoes where request_id = (select id from req)),
  'ajuste|Falta o frete nos orcamentos', 'o ajuste fica registrado com a observacao');
select is((select user_id from public.compras_decisoes where request_id = (select id from req)), (select gest from u),
  'e com quem decidiu');
select is((select count(*)::int from public.notifications where user_id = (select ana from u) and title like 'Ajuste pedido%'), 1,
  'quem pediu e avisado do ajuste');

-- ═══ 6-9. No ajuste, quem pediu mexe só nos orçamentos e reenvia. ═══
select tests.authenticate_as('ana@dircompras.test');
select throws_ok($$ update public.compras_solicitacoes set product_name = 'Mesa' where id = (select id from req) returning id $$,
  '42501', null, 'no ajuste o produto nao muda');
with x as (update public.compras_orcamentos set amount = 480 where supplier = 'Loja B' and request_id = (select id from req) returning 1)
insert into cnt select count(*) from x;
select is((select n from cnt), 1, 'quem pediu corrige o orcamento no ajuste');
select lives_ok($$ insert into public.compras_orcamentos (tenant_id, request_id, supplier, amount, position)
  select a, (select id from req), 'Loja D', 470, 4 from f returning id $$, 'e acrescenta orcamento');
update public.compras_solicitacoes set status = 'pending_approval', adjustment_response = 'Frete incluido'
 where id = (select id from req);
select is((select status from public.compras_solicitacoes where id = (select id from req)), 'pending_approval',
  'e reenvia para aprovacao');
select tests.clear_authentication();

-- ═══ 10-12. Recusar exige motivo; aprovar registra a observação opcional. ═══
select tests.authenticate_as('gest@dircompras.test');
select throws_ok($$ update public.compras_solicitacoes set status = 'rejected' where id = (select id from req) returning id $$,
  '23514', null, 'recusar sem motivo e recusado');
update public.compras_solicitacoes
   set status = 'approved', approval_notes = 'Pode fechar com a Loja D',
       approved_quote_id = (select id from public.compras_orcamentos where supplier = 'Loja D' and request_id = (select id from req))
 where id = (select id from req);
select tests.clear_authentication();
-- Na mesma transação `now()` é constante (lição 9): compara-se o conjunto, não a ordem por data.
select is((select array_agg(decisao order by decisao) from public.compras_decisoes where request_id = (select id from req)),
  array['ajuste', 'aprovada', 'reenviada'], 'cada passo fica no registro');
select is((select observacao from public.compras_decisoes where request_id = (select id from req) and decisao = 'aprovada'),
  'Pode fechar com a Loja D', 'com a observacao de quem aprovou');

-- ═══ 13-14. O registro não se escreve à mão, e quem pediu o lê. ═══
select tests.authenticate_as('ana@dircompras.test');
select throws_ok($$ insert into public.compras_decisoes (tenant_id, request_id, decisao)
  select a, (select id from req), 'aprovada' from f $$, '42501', null, 'ninguem escreve no registro a mao');
select is((select count(*)::int from public.compras_decisoes where request_id = (select id from req)), 3,
  'quem pediu le o registro da propria compra');
select tests.clear_authentication();

select * from finish();
rollback;

-- QUEM PEDE COMPRA CONSEGUE PEDIR (migration 20261115010000, LEVA P parte 1)
--
-- O dono, 2026-09-28: "quando eu vou fazer uma solicitação de compras … eu não consigo."
-- Reproduzido antes do conserto: chamado e pedido gravavam, e o primeiro orçamento levava
-- 42501. Estas asserções são o caminho da pessoa, pela função que a tela chama:
--
--   1 e 2 — quem NÃO tem Compras abre o pedido com os três orçamentos, e o chamado é de
--           Compras, dela. Antes do conserto a 1 reprovava com 42501;
--   3 e 4 — falha no meio desfaz tudo: nenhum chamado órfão (eram três chamadas do navegador);
--   5 — pedido que já saiu de "aguardando" não recebe orçamento de quem pediu;
--   6 — colega não põe orçamento no pedido dos outros;
--   7 — quem é de Compras continua gravando orçamento, como antes.
begin;
\ir _helpers.psql

select plan(7);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-quem-pede', 'Quem Pede', false) as a;

create temporary table u on commit drop as
select tests.create_user('ana@pede.test',    (select a from f)) as ana,
       tests.create_user('bia@pede.test',    (select a from f)) as bia,
       tests.create_user('compra@pede.test', (select a from f)) as compra;

select tests.grant_module((select compra from u), (select a from f), 'compras');
-- Desde 20261124010000 a equipe grava orçamento pela caixinha "Aprovar / reprovar compra"
-- do perfil, não pelo módulo sozinho.
select tests.grant_profile((select compra from u), (select a from f), 'compras', 'Gestor');
grant select on f, u to authenticated;

create temporary table pedido (ticket uuid, request uuid) on commit drop;
grant select, insert, update on pedido to authenticated;

select tests.authenticate_as('ana@pede.test');

-- 1. A Ana, sem acesso a Compras, pede com três orçamentos.
insert into pedido (ticket)
select public.compras_abrir_pedido(
  '{"title":"Mouse","description":"O meu quebrou","priority":"low"}'::jsonb,
  '{"product_name":"Mouse sem fio","product_link":"https://loja.test/mouse","department":"ti"}'::jsonb,
  '[{"supplier":"Loja A","amount":"50"},{"supplier":"Loja B","amount":"45.9"},{"supplier":"Loja C","amount":"60"}]'::jsonb
);
update pedido set request = (select r.id from public.compras_solicitacoes r where r.ticket_id = pedido.ticket);

select is(
  (select array[count(*)::numeric, min(o.amount)] from public.compras_orcamentos o
    where o.request_id = (select request from pedido)),
  array[3, 45.9]::numeric[],
  'quem nao e de Compras abre o pedido com os tres orcamentos'
);

-- 2. O chamado é de Compras e é dela, e a estimativa é o menor orçamento.
select is(
  (select t.module || '|' || (t.requester_id = (select ana from u))::text || '|' || r.estimated_amount::text
     from public.tickets t join public.compras_solicitacoes r on r.ticket_id = t.id
    where t.id = (select ticket from pedido)),
  'compras|true|45.90',
  'o chamado e de Compras, de quem pediu, com o menor orcamento como estimativa'
);

-- 3. O último passo falha — o orçamento aponta para um fornecedor que não existe, e a chave
-- estrangeira só é conferida DEPOIS de o chamado e o pedido terem sido gravados. É o mesmo
-- ponto em que o conserto antigo quebrava.
select throws_ok(
  $$ select public.compras_abrir_pedido(
       '{"title":"Teclado","description":"x"}'::jsonb,
       '{"product_name":"Teclado"}'::jsonb,
       '[{"supplier":"Loja A","amount":"80","supplier_id":"00000000-0000-0000-0000-00000000dead"}]'::jsonb) $$,
  '23503', null,
  'o ultimo passo falhando derruba o pedido inteiro'
);
select tests.clear_authentication();
select is(
  (select count(*) from public.tickets where requester_id = (select ana from u)),
  1::bigint,
  'a falha no meio nao deixa chamado orfao'
);

-- 4. Pedido reprovado: a Ana não põe mais orçamento.
update public.compras_solicitacoes set status = 'rejected', rejected_at = now()
 where id = (select request from pedido);
select tests.authenticate_as('ana@pede.test');
select throws_ok(
  format($$ insert into public.compras_orcamentos (tenant_id, request_id, supplier, amount, position)
            values (%L, %L, 'Loja D', 10, 4) $$, (select a from f), (select request from pedido)),
  '42501', null,
  'depois que o pedido sai de aguardando, quem pediu nao grava orcamento'
);
select tests.clear_authentication();

-- 5 e 6 num pedido novo da Ana, ainda aguardando.
select tests.authenticate_as('ana@pede.test');
insert into pedido (ticket)
select public.compras_abrir_pedido(
  '{"title":"Cadeira","description":"x"}'::jsonb,
  '{"product_name":"Cadeira"}'::jsonb,
  '[]'::jsonb
);
select tests.clear_authentication();
update pedido set request = (select r.id from public.compras_solicitacoes r where r.ticket_id = pedido.ticket)
 where request is null;

-- O id sai ANTES de autenticar: a Bia não enxerga o pedido da Ana, e um id nulo daria
-- 23502 (coluna obrigatória), não a recusa que se quer provar.
create temporary table cadeira on commit drop as
select r.id from public.compras_solicitacoes r where r.product_name = 'Cadeira'
   and r.tenant_id = (select a from f);
grant select on cadeira to authenticated;

select tests.authenticate_as('bia@pede.test');
select throws_ok(
  format($$ insert into public.compras_orcamentos (tenant_id, request_id, supplier, amount, position)
            values (%L, %L, 'Loja X', 10, 1) $$, (select a from f), (select id from cadeira)),
  '42501', null,
  'colega nao poe orcamento no pedido dos outros'
);
select tests.clear_authentication();

select tests.authenticate_as('compra@pede.test');
select lives_ok(
  format($$ insert into public.compras_orcamentos (tenant_id, request_id, supplier, amount, position)
            values (%L, %L, 'Loja Y', 12, 1) $$, (select a from f), (select id from cadeira)),
  'quem e de Compras continua gravando orcamento'
);
select tests.clear_authentication();

select * from finish();
rollback;

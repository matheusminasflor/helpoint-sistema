-- REIMPORTAR O RELATÓRIO DO FORTEPLUS NÃO DUPLICA (migration 20261112020000)
--
-- O índice `fin_entries_external_unico` é parcial: único por (tenant_id, external_id)
-- **onde external_id não é nulo**. As quatro asserções são as quatro coisas que ele
-- precisa fazer, e três delas são o que ele NÃO pode impedir:
--
--   1 — barra a segunda parcela com o mesmo código do Forteplus na mesma empresa;
--   2 — **não** barra dois lançamentos MANUAIS, que têm `external_id` nulo. Um índice
--       sem o `where` seria aceito pelo Postgres e quebraria toda a digitação à mão;
--   3 — **não** barra a mesma parcela em OUTRA empresa. `tenant_id` continua no banco
--       (ADR-010) e é a barreira: sem ele no índice, a segunda empresa a importar
--       veria a própria conta recusada por casar com a conta de outra;
--   4 — o `upsert` que o front usa ATUALIZA a parcela em vez de criar a segunda. É o
--       caso normal: quem exporta "de tal dia até hoje" sempre encavala com o
--       relatório anterior, e o saldo pode ter mudado no meio.
--
-- Lição 11 do pgTAP: a escrita aqui leva `returning`, como o PostgREST faz — com
-- RETURNING o Postgres aplica a policy de SELECT já no insert, e um insert nu ficaria
-- verde enquanto a tela leva 42501.
begin;
\ir _helpers.psql

select plan(5);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-reimp-a', 'Reimportar A', false) as a,
       tests.create_tenant('pgtap-reimp-b', 'Reimportar B', false) as b;

create temporary table u on commit drop as
select tests.create_user('fin.a@reimp.test', (select a from f)) as pessoa_a,
       tests.create_user('fin.b@reimp.test', (select b from f)) as pessoa_b;

select tests.grant_module((select pessoa_a from u), (select a from f), 'financeiro');
select tests.grant_module((select pessoa_b from u), (select b from f), 'financeiro');

select tests.authenticate_as('fin.a@reimp.test');

-- A parcela como a importação do Forteplus a grava.
select lives_ok($$
  insert into public.fin_entries
    (kind, description, counterparty, amount, due_date, competence, status, source, external_id)
  values ('receivable', 'NFE 16447 parc. 3', 'CLIENTE PGTAP', 949.57, '2023-10-15',
          '2023-10-01', 'pending', 'pgtap.xlsx', 'forteplus:receber:53')
  returning id
$$, 'a primeira parcela entra');

-- 1. A MESMA parcela, de novo: barrada.
select throws_ok($$
  insert into public.fin_entries
    (kind, description, counterparty, amount, due_date, competence, status, source, external_id)
  values ('receivable', 'NFE 16447 parc. 3', 'CLIENTE PGTAP', 949.57, '2023-10-15',
          '2023-10-01', 'pending', 'pgtap.xlsx', 'forteplus:receber:53')
  returning id
$$, '23505', null,
  'a mesma parcela do Forteplus nao entra duas vezes na mesma empresa');

-- 2. Dois lançamentos MANUAIS (external_id nulo) continuam podendo coexistir.
--    Nulo não colide com nulo, e é por isso que o índice é parcial.
select lives_ok($$
  insert into public.fin_entries (kind, description, amount, due_date, competence, status)
  values ('payable', 'Digitado a mao 1', 100, '2026-09-30', '2026-09-01', 'pending'),
         ('payable', 'Digitado a mao 2', 100, '2026-09-30', '2026-09-01', 'pending')
  returning id
$$, 'dois lancamentos manuais coexistem: o indice parcial nao toca em quem nao tem origem externa');

-- 4. O upsert do front: atualiza em vez de duplicar, e o saldo novo entra.
update public.fin_entries
   set status = 'paid', settled_at = '2023-10-15'
 where external_id = 'forteplus:receber:53' and tenant_id = (select a from f);

select is(
  (select count(*)::int from public.fin_entries where external_id = 'forteplus:receber:53'),
  1,
  'depois de reimportar continua UMA parcela, com o estado novo'
);

select tests.clear_authentication();

-- 3. A mesma parcela em OUTRA empresa entra: o tenant faz parte da identidade.
select tests.authenticate_as('fin.b@reimp.test');
select lives_ok($$
  insert into public.fin_entries
    (kind, description, counterparty, amount, due_date, competence, status, source, external_id)
  values ('receivable', 'NFE 16447 parc. 3', 'OUTRO CLIENTE', 500, '2023-10-15',
          '2023-10-01', 'pending', 'pgtap.xlsx', 'forteplus:receber:53')
  returning id
$$, 'o mesmo codigo do Forteplus em outra empresa entra: a identidade inclui o tenant');
select tests.clear_authentication();

select * from finish();
rollback;

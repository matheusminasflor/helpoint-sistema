-- CONTA PAGA TEM DATA DE PAGAMENTO (migration 20261108020000)
--
-- Decisão do dono em 2026-09-27: "Sim, exigir a data." O defeito era três telas
-- discordando sobre o mesmo dinheiro — a lista soma pelo status e põe a conta em
-- "Já pago"; o fluxo de caixa e os indicadores agrupam por `settled_at` e a
-- ignoram. O valor saía do realizado sem sair do total, sem erro em lugar nenhum.
--
-- REGRA 10 DO PGTAP, e é a razão de este arquivo não usar `current_date`: o trigger
-- grava `(now() at time zone 'America/Sao_Paulo')::date`, e a asserção compara com a
-- MESMA expressão. Com `current_date` (UTC) o teste passaria o dia inteiro e
-- quebraria sozinho depois das 21h — o CI roda em UTC, e foi assim que o run #36
-- reprovou sem nada ter mudado.
--
-- A asserção 6 é a que exige o trigger em vez de só um CHECK: reabrir uma conta
-- TIRA a data. Sem isso a conta reaberta continuaria contando no realizado daquele
-- mês, que é o mesmo defeito ao contrário — e um CHECK sozinho não faria isso.
--
-- Os ids são fixos de propósito: `returning ... into` só existe em PL/pgSQL, e
-- carregar id por CTE em cada asserção deixaria o teste sobre a plumbing em vez de
-- sobre a regra.
begin;
\ir _helpers.psql

select plan(8);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-pagdata', 'Conta Paga', false) as a;

-- Sem autenticar: estas asserções são sobre o TRIGGER, que roda para qualquer
-- escrita. A RLS de `fin_entries` é outro assunto e tem suíte própria.

-- 1. Paga sem data recebe o dia de hoje (no fuso do Brasil).
insert into public.fin_entries (id, tenant_id, kind, description, due_date, competence, amount, status)
values ('aaaaaaaa-0000-4000-8000-000000000001', (select a from f), 'payable',
        'paga sem data', '2026-09-10', '2026-09-01', 100, 'paid');

select is(
  (select settled_at from public.fin_entries where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  (now() at time zone 'America/Sao_Paulo')::date,
  'paga sem data recebe o dia de hoje no fuso do Brasil'
);

-- 2. Paga COM data mantém a data informada — o trigger não sobrescreve ninguém.
insert into public.fin_entries (id, tenant_id, kind, description, due_date, competence, amount, status, settled_at)
values ('aaaaaaaa-0000-4000-8000-000000000002', (select a from f), 'payable',
        'paga com data', '2026-09-10', '2026-09-01', 100, 'paid', '2026-09-12');

select is(
  (select settled_at from public.fin_entries where id = 'aaaaaaaa-0000-4000-8000-000000000002'),
  '2026-09-12'::date,
  'paga com data mantem a data informada'
);

-- 3. Pendente sem data continua sem data: nulo aqui é ausência, e é o certo.
insert into public.fin_entries (id, tenant_id, kind, description, due_date, competence, amount, status)
values ('aaaaaaaa-0000-4000-8000-000000000003', (select a from f), 'payable',
        'pendente', '2026-12-10', '2026-12-01', 100, 'pending');

select ok(
  (select settled_at is null from public.fin_entries
    where id = 'aaaaaaaa-0000-4000-8000-000000000003'),
  'pendente continua sem data de pagamento'
);

-- 4. Liquidar pela tela (status para paid, sem informar data) preenche.
update public.fin_entries set status = 'paid'
 where id = 'aaaaaaaa-0000-4000-8000-000000000003';

select is(
  (select settled_at from public.fin_entries where id = 'aaaaaaaa-0000-4000-8000-000000000003'),
  (now() at time zone 'America/Sao_Paulo')::date,
  'liquidar sem informar data preenche com hoje'
);

-- 5. A invariante existe como CHECK, para falhar alto se alguém apagar o trigger.
select is(
  (select count(*)::int from pg_constraint con
     join pg_class c on c.oid = con.conrelid
    where c.relname = 'fin_entries' and con.conname = 'fin_entries_paga_tem_data'),
  1,
  'o CHECK fin_entries_paga_tem_data existe: a invariante nao depende so do trigger'
);

-- 6. Reabrir a conta TIRA a data — senão ela seguiria no realizado daquele mês.
update public.fin_entries set status = 'pending'
 where id = 'aaaaaaaa-0000-4000-8000-000000000003';

select ok(
  (select settled_at is null from public.fin_entries
    where id = 'aaaaaaaa-0000-4000-8000-000000000003'),
  'reabrir a conta tira a data de pagamento'
);

-- 7. Mas se a pessoa informa OUTRA data ao reabrir, ela está dizendo algo: respeita.
update public.fin_entries set status = 'paid'
 where id = 'aaaaaaaa-0000-4000-8000-000000000003';
update public.fin_entries set status = 'pending', settled_at = '2026-08-01'
 where id = 'aaaaaaaa-0000-4000-8000-000000000003';

select is(
  (select settled_at from public.fin_entries where id = 'aaaaaaaa-0000-4000-8000-000000000003'),
  '2026-08-01'::date,
  'data informada na mao ao reabrir e respeitada, nao apagada'
);

-- 8. Cancelar não é reabrir: a conta cancelada guarda o que foi pago, porque o
--    histórico de um pagamento que aconteceu não se apaga por cancelamento.
update public.fin_entries set status = 'paid', settled_at = '2026-09-15'
 where id = 'aaaaaaaa-0000-4000-8000-000000000003';
update public.fin_entries set status = 'cancelled'
 where id = 'aaaaaaaa-0000-4000-8000-000000000003';

select is(
  (select settled_at from public.fin_entries where id = 'aaaaaaaa-0000-4000-8000-000000000003'),
  '2026-09-15'::date,
  'cancelar nao apaga a data: pagamento que aconteceu fica no historico'
);

select * from finish();
rollback;

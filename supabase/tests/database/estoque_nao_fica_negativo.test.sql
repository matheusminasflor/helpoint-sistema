-- O SALDO DO LOTE NÃO FICA NEGATIVO (migration 20261108040000)
--
-- Achado na varredura de 2026-09-27: `adjust` aceitava qualquer sinal (o CHECK
-- `exp_stock_moves_sign` só exige coerência para `in` e `out`), o único trigger da
-- tabela era `inject_tenant_id`, e `exp_lot_balances` é uma **view** — não há coluna
-- de saldo para um CHECK proteger. Um ajuste negativo maior que o saldo levava o
-- lote a estoque negativo sem aviso, e `exp_scan` só conferia na hora de bipar.
--
-- A ASSERÇÃO 4 é a que importa e a que um teste ingênuo não faria: **tirar
-- exatamente o saldo é permitido**. Guarda que barra o limite legítimo é pior que
-- guarda nenhuma, porque quem esvazia um lote de propósito não consegue trabalhar.
--
-- Aqui `throws_ok` VALE (ao contrário da regra 12), porque quem barra é um trigger
-- `before insert` levantando exceção, não uma policy filtrando linha.
begin;
\ir _helpers.psql

select plan(7);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-estneg', 'Estoque Negativo', true) as a;

-- Um produto e um lote com 10 unidades.
insert into public.crm_products (id, tenant_id, name, sku)
values ('bbbbbbbb-0000-4000-8000-000000000001', (select a from f), 'Produto Teste', 'PT-1');

insert into public.exp_lots (id, tenant_id, product_id, code, received_on)
values ('bbbbbbbb-0000-4000-8000-000000000002', (select a from f),
        'bbbbbbbb-0000-4000-8000-000000000001', 'LOTE-1', '2026-09-01');

insert into public.exp_stock_moves (tenant_id, lot_id, product_id, kind, quantity)
values ((select a from f), 'bbbbbbbb-0000-4000-8000-000000000002',
        'bbbbbbbb-0000-4000-8000-000000000001', 'in', 10);

select is(
  (select balance from public.exp_lot_balances
    where lot_id = 'bbbbbbbb-0000-4000-8000-000000000002'),
  10::numeric,
  'o lote comeca com 10 em estoque'
);

-- 1. Ajuste negativo maior que o saldo é barrado.
select throws_ok(
  $$ insert into public.exp_stock_moves (tenant_id, lot_id, product_id, kind, quantity)
     select a, 'bbbbbbbb-0000-4000-8000-000000000002',
            'bbbbbbbb-0000-4000-8000-000000000001', 'adjust', -11 from f $$,
  '23514',
  null,
  'ajuste negativo maior que o saldo e barrado'
);

-- 2. Saída maior que o saldo também — mesmo caminho, outro `kind`.
select throws_ok(
  $$ insert into public.exp_stock_moves (tenant_id, lot_id, product_id, kind, quantity)
     select a, 'bbbbbbbb-0000-4000-8000-000000000002',
            'bbbbbbbb-0000-4000-8000-000000000001', 'out', -11 from f $$,
  '23514',
  null,
  'saida maior que o saldo e barrada pela mesma guarda'
);

-- 3. E o saldo continua intacto depois das duas tentativas.
select is(
  (select balance from public.exp_lot_balances
    where lot_id = 'bbbbbbbb-0000-4000-8000-000000000002'),
  10::numeric,
  'o saldo continua 10 depois das duas tentativas barradas'
);

-- 4. Tirar EXATAMENTE o saldo passa: zerar o lote é operação legítima.
insert into public.exp_stock_moves (tenant_id, lot_id, product_id, kind, quantity)
select a, 'bbbbbbbb-0000-4000-8000-000000000002',
       'bbbbbbbb-0000-4000-8000-000000000001', 'adjust', -10 from f;

select is(
  (select balance from public.exp_lot_balances
    where lot_id = 'bbbbbbbb-0000-4000-8000-000000000002'),
  0::numeric,
  'tirar exatamente o saldo e permitido: o lote zera'
);

-- 5. Zerado, nem uma unidade sai.
select throws_ok(
  $$ insert into public.exp_stock_moves (tenant_id, lot_id, product_id, kind, quantity)
     select a, 'bbbbbbbb-0000-4000-8000-000000000002',
            'bbbbbbbb-0000-4000-8000-000000000001', 'out', -1 from f $$,
  '23514',
  null,
  'lote zerado nao deixa sair nem uma unidade'
);

-- 6. E A GUARDA NÃO RESPONDE PELA GUARDA VELHA.
--
-- Esta asserção nasceu de o CI reprovar: a primeira versão do trigger rodava antes
-- da chave estrangeira composta `(lot_id, tenant_id)` e respondia **23514** ("o lote
-- tem 0 em estoque") para o caso que `expedicao_estoque.test.sql:207` cobre —
-- empresa B lançando contra o lote da empresa A, que é violação de FK, **23503**.
-- Verdade inútil: o problema não era o saldo, era o lote não ser dela.
--
-- É a lição 8 do pgTAP outra vez, no sentido inverso: ali o guard barrava o que
-- devia passar; aqui o guard respondia no lugar de quem sabia a resposta certa.
-- Sem lote casando por empresa, este trigger sai de cena.
select throws_ok(
  $$ insert into public.exp_stock_moves (tenant_id, lot_id, product_id, kind, quantity)
     select a, gen_random_uuid(),
            'bbbbbbbb-0000-4000-8000-000000000001', 'out', -999 from f $$,
  '23503',
  null,
  'lote que nao e da empresa continua dando erro de chave estrangeira, nao de saldo'
);

select * from finish();
rollback;

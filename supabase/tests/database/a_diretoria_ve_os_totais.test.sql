-- A DIRETORIA VÊ OS TOTAIS DE TODOS OS SETORES, E SÓ OS TOTAIS
-- (migration 20261114040000, LEVA O parte 4)
--
-- Decisão do dono (2026-09-28): "Todos, só em totais". O diretor vê o número de cada
-- setor; Financeiro e RH nunca linha a linha.
--
--   1 e 2 — o diretor recebe os totais do Financeiro e do RH do mês, e o outro tenant não
--           entra na soma;
--   3 e 4 — o mesmo diretor CONTINUA sem ler `fin_entries` e a folha linha a linha: a
--           função é a única porta, e ela só devolve agregado;
--   5 — chamados contam no banco, além das 1.000 linhas em que o PostgREST cortava sem
--       aviso, e Compras aparece (a lista antiga do front não tinha);
--   6 e 7 — quem não é da Diretoria é recusado nas duas funções.
begin;
\ir _helpers.psql

select plan(7);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-dir-totais', 'Dir Totais', false) as a,
       tests.create_tenant('pgtap-dir-outro', 'Dir Outro', false) as b;

create temporary table u on commit drop as
select tests.create_user('diretor@dirtot.test', (select a from f)) as diretor,
       tests.create_user('comum@dirtot.test',   (select a from f)) as comum,
       tests.create_user('outro@dirtot.test',   (select b from f)) as outro;

-- O diretor é membro comum com o módulo Diretoria, e nada de Financeiro ou RH.
select tests.grant_module((select diretor from u), (select a from f), 'diretoria');
select tests.grant_module((select comum from u),   (select a from f), 'comercial');
grant select on f, u to authenticated;

-- Financeiro, competência maio/2026. "Vencido hoje" usa datas longe de hoje nos dois
-- sentidos, para a asserção não depender do dia em que o CI roda (regra 10).
insert into public.fin_entries (tenant_id, kind, description, amount, due_date, competence, status, settled_at)
values ((select a from f), 'payable',    'P1', 50,  '2026-05-12', '2026-05-01', 'paid',      '2026-05-12'),
       ((select a from f), 'payable',    'P2', 70,  '2026-05-20', '2026-05-01', 'cancelled', null),
       ((select a from f), 'receivable', 'R1', 200, '2026-05-15', '2026-05-01', 'paid',      '2026-05-15'),
       ((select a from f), 'receivable', 'R2', 100, '2020-01-10', '2020-01-01', 'pending',   null),
       ((select a from f), 'receivable', 'R3', 300, '2099-01-10', '2099-01-01', 'pending',   null),
       ((select b from f), 'payable',    'OUTRO', 999, '2026-05-12', '2026-05-01', 'pending', null);

-- RH: uma pessoa ativa, com a folha de maio.
with e as (
  insert into public.rh_employee_profiles (tenant_id, full_name, status, admission_date)
  values ((select a from f), 'FULANA', 'ativo', '2026-05-04')
  returning id
)
insert into public.rh_payroll_entries (tenant_id, employee_id, reference_month, gross_salary)
select (select a from f), e.id, '2026-05-01', 5000 from e;

-- 1.001 chamados abertos de Compras.
insert into public.tickets (tenant_id, title, description, requester_id, module, status)
select (select a from f), 'C' || g, 'x', (select comum from u), 'compras', 'open'
  from generate_series(1, 1001) g;

select tests.authenticate_as('diretor@dirtot.test');

-- 1. Financeiro: a pagar 50 (o cancelado fica fora, o outro tenant também), a receber 200,
--    saldo 200 − 50, vencido 100, inadimplência 100 ÷ 400.
select is(
  (select array_agg(valor order by ordem) from public.dir_indicadores_dos_setores('2026-05-01')
    where setor = 'financeiro'),
  array[50, 200, 150, 100, 25]::numeric[],
  'o diretor recebe os totais do Financeiro do mes, sem o outro tenant'
);

-- 2. RH: headcount 1, admissão 1, desligamento 0, ausência 0, folha bruta 5.000.
select is(
  (select array_agg(valor order by ordem) from public.dir_indicadores_dos_setores('2026-05-01')
    where setor = 'rh'),
  array[1, 1, 0, 0, 5000]::numeric[],
  'o diretor recebe os totais do RH do mes, com a folha so no total'
);

-- 3 e 4. Mas nenhuma linha. Contagem, não throws_ok: SELECT barrado por RLS devolve vazio.
select is((select count(*) from public.fin_entries), 0::bigint,
  'o diretor continua sem ler fin_entries linha a linha');
select is((select count(*) from public.rh_payroll_entries), 0::bigint,
  'o diretor continua sem ler a folha linha a linha');

-- 5. Além das 1.000 linhas, e com Compras na lista.
select is(
  (select abertos from public.dir_chamados_por_setor(now() - interval '30 days') where modulo = 'compras'),
  1001::bigint,
  'chamados contam no banco alem de 1000 linhas, e Compras aparece'
);

select tests.clear_authentication();
select tests.authenticate_as('comum@dirtot.test');

-- 6 e 7. Quem não é da Diretoria.
select throws_ok(
  $$ select * from public.dir_indicadores_dos_setores('2026-05-01') $$,
  '42501', null,
  'quem nao e da Diretoria nao le os totais dos setores'
);
select throws_ok(
  $$ select * from public.dir_chamados_por_setor(now()) $$,
  '42501', null,
  'quem nao e da Diretoria nao le os chamados de todos os setores'
);

select * from finish();
rollback;

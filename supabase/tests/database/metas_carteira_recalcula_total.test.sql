-- Frente 7c, bloco 2 — o trigger que mantém `metas_ano.total_realizado`
-- igual à soma de `metas_carteira`, sem a tela precisar digitar os dois
-- números (.scratch/plano-frente7c-total-e-bercario.md §2/§5). Prova:
-- 1) escrever/apagar realizado em duas carteiras reflete na soma, e apagar
--    as duas volta a NULL, nunca zero; 2) a importação do JSON, que escreve
--    `metas_carteira` sem passar pela tela, não quebra com o trigger no
--    caminho; 3) isolamento entre tenants.
begin;
\ir _helpers.psql

select plan(14);

create temporary table f on commit drop as
select tests.create_tenant('metas-recalcula', 'Metas Recalcula Total', false) as tenant,
       tests.create_tenant('metas-recalcula-outro', 'Metas Recalcula Outro Tenant', false) as outro_tenant;

create temporary table u on commit drop as
select tests.create_user('owner@metas-recalcula.test', (select tenant from f)) as owner,
       tests.create_user('outro-owner@metas-recalcula.test', (select outro_tenant from f)) as outro_owner;

select tests.grant_role((select owner from u), 'owner');
select tests.grant_role((select outro_owner from u), 'owner');

grant select on f, u to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1/6. Duas carteiras do mesmo mês somam; apagar as duas (realizado = NULL,
-- a forma como a tela "apaga" — regra 1 da Frente 7) volta o total a NULL,
-- nunca a zero.
--
-- MUTAÇÃO (rodada e confirmada pelo executor, ver relatório): trocar
-- `sum(realizado)` por `coalesce(sum(realizado), 0)` no corpo do trigger faz
-- a asserção 4/6 abaixo acusar — o total volta 0.00 em vez de NULL depois de
-- apagar as duas carteiras. Trigger restaurado à versão da migration
-- 20261025040000 antes de seguir.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.authenticate_as('owner@metas-recalcula.test');

select lives_ok(
  $sql$ insert into public.metas_carteira (ano, mes, carteira, realizado) values (2098, 1, 'VIP', 700.00) returning carteira $sql$,
  '1/6 grava realizado da carteira VIP em 2098/mes 1'
);
select lives_ok(
  $sql$ insert into public.metas_carteira (ano, mes, carteira, realizado) values (2098, 1, 'MG', 300.00) returning carteira $sql$,
  '2/6 grava realizado da carteira MG no mesmo ano/mês'
);
select is(
  (select total_realizado from public.metas_ano where ano = 2098 and mes = 1),
  1000.00::numeric,
  '3/6 o trigger recalculou metas_ano.total_realizado como a SOMA das duas carteiras (700 + 300)'
);

update public.metas_carteira set realizado = null where ano = 2098 and mes = 1 and carteira = 'VIP';
update public.metas_carteira set realizado = null where ano = 2098 and mes = 1 and carteira = 'MG';

select is(
  (select total_realizado from public.metas_ano where ano = 2098 and mes = 1),
  null::numeric,
  '4/6 com as DUAS carteiras apagadas (realizado NULL), o total volta a NULL — nunca R$ 0,00'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5/8. A importação do JSON (`com_importar_metas`) também escreve
-- `metas_carteira` — sem passar pela tela — e dispara o MESMO trigger. Antes
-- desta migration, o INSERT simples que a função fazia em `metas_ano` depois
-- de gravar as carteiras batia de frente com a linha que o trigger já tinha
-- criado (23505). `lives_ok` aqui prova que o upsert evita a colisão.
-- ═══════════════════════════════════════════════════════════════════════════
select lives_ok(
  $sql$
    select public.com_importar_metas('fixture-teste.json', $json$
      {"anos": {"2097": {
        "cart": {"VIP": [100,0,0,0,0,0,0,0,0,0,0,0], "MG": [50,0,0,0,0,0,0,0,0,0,0,0]},
        "total": [150,0,0,0,0,0,0,0,0,0,0,0],
        "meta": null,
        "metaTotal": null
      }}}
    $json$::jsonb)
  $sql$,
  '5/8 importar um ano com carteiras não quebra com o trigger no caminho (regressão que esta migration existe para evitar)'
);
select is(
  (select realizado from public.metas_carteira where ano = 2097 and mes = 1 and carteira = 'VIP'),
  100.00::numeric,
  '6/8 a importação gravou o realizado por carteira normalmente'
);
select is(
  (select total_realizado from public.metas_ano where ano = 2097 and mes = 1),
  150.00::numeric,
  '7/8 o total de janeiro/2097 é o que o JSON informou (100 + 50) — importação e trigger reconciliados'
);
select is(
  (select total_realizado from public.metas_ano where ano = 2097 and mes = 2),
  null::numeric,
  '8/8 fevereiro/2097 (0.0 nas duas carteiras e no total do JSON) fica NULL, não zero — a mesma ausência dos dois lados'
);

select tests.clear_authentication();

-- ═══════════════════════════════════════════════════════════════════════════
-- 9/14. Isolamento — a outra empresa grava a MESMA carteira no MESMO
-- ano/mês, com valor diferente, e o trigger de cada uma só recalcula o
-- total da SUA empresa (mesma leitura da Frente 7,
-- metas_realizado_digitado.test.sql).
-- ═══════════════════════════════════════════════════════════════════════════
select tests.authenticate_as('outro-owner@metas-recalcula.test');
select lives_ok(
  $sql$ insert into public.metas_carteira (ano, mes, carteira, realizado) values (2096, 5, 'TESTE', 20.00) returning carteira $sql$,
  '9/14 a outra empresa grava sua carteira TESTE em 2096/mes 5'
);
select is(
  (select total_realizado from public.metas_ano where ano = 2096 and mes = 5),
  20.00::numeric,
  '10/14 o total da OUTRA empresa reflete só o dela (20.00)'
);
select tests.clear_authentication();

select tests.authenticate_as('owner@metas-recalcula.test');
select lives_ok(
  $sql$ insert into public.metas_carteira (ano, mes, carteira, realizado) values (2096, 5, 'TESTE', 90.00) returning carteira $sql$,
  '11/14 o tenant principal grava a MESMA carteira/mês, com valor diferente (90.00)'
);
select is(
  (select total_realizado from public.metas_ano where ano = 2096 and mes = 5),
  90.00::numeric,
  '12/14 o total do tenant principal é o SEU (90.00), nunca somado nem confundido com o da outra empresa'
);
select is(
  (select count(*)::int from public.metas_ano where ano = 2096 and mes = 5),
  1,
  '13/14 o tenant principal só enxerga a PRÓPRIA linha de metas_ano em 2096/mes 5'
);
select is(
  (select count(*)::int from public.metas_carteira where ano = 2096 and mes = 5 and carteira = 'TESTE'),
  1,
  '14/14 idem para metas_carteira — a linha da outra empresa fica invisível'
);

select tests.clear_authentication();
select tests.authenticate_as('owner@metas-recalcula.test');

select * from finish();
rollback;

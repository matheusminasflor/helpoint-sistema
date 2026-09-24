-- Frente 7 — o diretor digita o realizado, sem JSON
-- (.scratch/plano-frente7-metas-digitadas.md). Esta suíte NÃO prova função
-- nova nenhuma: prova as policies de INSERT/UPDATE de `metas_carteira` e
-- `metas_ano` que já existem desde a migration 20261021010000 — a Frente 7
-- não trouxe migration, só passou a escrever nessas tabelas a partir da
-- grade, no lugar do JSON. É exatamente por isso que a suíte tem de existir
-- separada: "o banco já aceita" (conferido em pg_policy) e "está provado"
-- são coisas diferentes.
begin;
\ir _helpers.psql

select plan(15);

create temporary table f on commit drop as
select tests.create_tenant('metas-realizado', 'Metas Realizado Digitado', false) as tenant,
       tests.create_tenant('metas-realizado-outro', 'Metas Realizado Outro Tenant', false) as outro_tenant;

create temporary table u on commit drop as
select tests.create_user('owner@metas-realizado.test', (select tenant from f)) as owner,
       tests.create_user('outro-owner@metas-realizado.test', (select outro_tenant from f)) as outro_owner,
       tests.create_user('sem-permissao@metas-realizado.test', (select tenant from f)) as sem_permissao,
       tests.create_user('so-metas-definir@metas-realizado.test', (select tenant from f)) as so_metas_definir;

select tests.grant_role((select owner from u), 'owner');
select tests.grant_role((select outro_owner from u), 'owner');
select tests.grant_role((select sem_permissao from u), 'member');
select tests.grant_module((select sem_permissao from u), (select tenant from f), 'comercial');
select tests.grant_role((select so_metas_definir from u), 'member');
select tests.grant_module((select so_metas_definir from u), (select tenant from f), 'comercial');

-- Perfil que concede SÓ `metas.definir` — o mesmo perfil-alvo da correção
-- GRAVE de `metas_do_diretor.test.sql` (achado da auditoria de
-- 2026-09-22), reproduzido aqui porque é exatamente quem a grade de
-- Realizado da Frente 7 é feita para atender.
create temporary table perfil on commit drop as
with ins as (
  insert into public.access_profiles (tenant_id, department, name, permissions)
  values ((select tenant from f), 'comercial', 'Só metas.definir', '{"metas": {"definir": true}}'::jsonb)
  returning id
)
select id as perfil from ins;

insert into public.user_access_profiles (tenant_id, user_id, department, profile_id)
select (select tenant from f), (select so_metas_definir from u), 'comercial', (select perfil from perfil);

grant select on f, u, perfil to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1/4. Quem tem `metas.definir` grava realizado em metas_carteira — regra 11
-- do pgTAP: escrito com RETURNING, como o front escreve
-- (`.select('carteira')` em useSalvarRealizadoCarteira).
--
-- MUDOU NA FRENTE 7c (2026-09-24): as duas asserções que estavam aqui
-- afirmavam que o TOTAL é digitado direto em `metas_ano` e que "o total
-- gravado é exatamente o digitado". Isso deixou de ser verdade por decisão
-- do dono — o total da empresa virou a SOMA das carteiras, mantida pelo
-- trigger `trg_metas_carteira_recalcula_total`. A suíte quebrou no CI #92
-- justamente por isso, e o conserto é afirmar a regra NOVA, não afrouxar a
-- antiga: inserir o total à mão agora colide com a linha que o trigger já
-- criou (metas_ano_pkey), que é o comportamento correto.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.authenticate_as('so-metas-definir@metas-realizado.test');

select lives_ok(
  $sql$ insert into public.metas_carteira (ano, mes, carteira, realizado) values (2099, 1, 'TESTE', 12345.67) returning carteira $sql$,
  'quem tem metas.definir grava realizado em metas_carteira'
);
select is(
  (select realizado from public.metas_carteira where ano = 2099 and mes = 1 and carteira = 'TESTE'),
  12345.67::numeric,
  'o valor gravado é exatamente o digitado, sem arredondar nem truncar'
);
-- O total NÃO é digitado: nasce do trigger, igual à soma das carteiras
-- daquele mês. Mutação: remover o trigger deixa `total_realizado` nulo aqui
-- e derruba as duas asserções abaixo.
select is(
  (select total_realizado from public.metas_ano where ano = 2099 and mes = 1),
  12345.67::numeric,
  'o total da empresa é a soma das carteiras — escrito pelo trigger, nunca digitado'
);
select lives_ok(
  $sql$ insert into public.metas_carteira (ano, mes, carteira, realizado) values (2099, 1, 'TESTE2', 1.33) returning carteira $sql$,
  'uma segunda carteira no mesmo mês grava normalmente'
);
select is(
  (select total_realizado from public.metas_ano where ano = 2099 and mes = 1),
  12347.00::numeric,
  'o total acompanha: 12345,67 + 1,33 = 12347,00, sem o diretor tocar em metas_ano'
);

select tests.clear_authentication();

-- ═══════════════════════════════════════════════════════════════════════════
-- 5/6. Quem NÃO tem `metas.definir` (nem é admin/owner) leva 42501 ao gravar
-- nas duas tabelas — nunca silêncio (a UPDATE/DELETE barrada por policy não
-- levanta erro, regra 12 do pgTAP; mas esta é INSERT com WITH CHECK, que
-- levanta antes de qualquer CHECK de coluna).
--
-- MUTAÇÃO (rodada e confirmada nesta leva, ver relatório do executor):
-- recriar `metas_carteira_insert`/`metas_ano_insert` SEM o braço
-- `tem_permissao(..., 'metas', 'definir')` faz as DUAS asserções abaixo
-- acusarem — `so_metas_definir` (que só tem essa permissão, nunca
-- is_admin_or_higher) passaria a levar 42501 também, e a suíte inteira do
-- bloco 1/4 quebraria. Policies restauradas à definição da migration
-- 20261021010000 antes de seguir.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.authenticate_as('sem-permissao@metas-realizado.test');
select throws_like(
  $sql$ insert into public.metas_carteira (ano, mes, carteira, realizado) values (2099, 2, 'TESTE', 1) $sql$,
  '%row-level security%',
  'quem não tem metas.definir leva 42501 ao gravar realizado em metas_carteira, não silêncio'
);
select throws_like(
  $sql$ insert into public.metas_ano (ano, mes, total_realizado) values (2099, 2, 1) $sql$,
  '%row-level security%',
  'quem não tem metas.definir leva 42501 ao gravar o total em metas_ano, não silêncio'
);
select tests.clear_authentication();

-- ═══════════════════════════════════════════════════════════════════════════
-- 7/12. Isolamento — a outra empresa tem DADO PRÓPRIO no mesmo ano/mês, com
-- VALOR DIFERENTE, e o tenant principal não o enxerga (nem na leitura, nem
-- confundindo o valor). Isolamento com a outra empresa vazia provaria só
-- ausência, não isolamento (lição da Frente 5b, CLAUDE.md) — por isso as
-- duas empresas escrevem antes de qualquer leitura.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.authenticate_as('outro-owner@metas-realizado.test');
select lives_ok(
  $sql$ insert into public.metas_carteira (ano, mes, carteira, realizado) values (2099, 3, 'TESTE', 1.11) returning carteira $sql$,
  'a outra empresa grava seu próprio realizado de carteira em 2099/mes 3'
);
select lives_ok(
  $sql$ insert into public.metas_ano (ano, mes, total_realizado) values (2099, 4, 1.11) returning ano $sql$,
  'a outra empresa grava seu próprio total em 2099/mes 4'
);
select tests.clear_authentication();

select tests.authenticate_as('owner@metas-realizado.test');
select lives_ok(
  $sql$ insert into public.metas_carteira (ano, mes, carteira, realizado) values (2099, 3, 'TESTE', 2.22) returning carteira $sql$,
  'o tenant principal grava o SEU realizado no mesmo ano/mês/carteira, com valor diferente'
);
select lives_ok(
  $sql$ insert into public.metas_ano (ano, mes, total_realizado) values (2099, 4, 2.22) returning ano $sql$,
  'o tenant principal grava o SEU total no mesmo ano/mês, com valor diferente'
);
select is(
  (select count(*)::int from public.metas_carteira where ano = 2099 and mes = 3 and carteira = 'TESTE'),
  1,
  'o tenant principal só enxerga UMA linha em 2099/mes 3/TESTE — a da outra empresa fica invisível'
);
select is(
  (select realizado from public.metas_carteira where ano = 2099 and mes = 3 and carteira = 'TESTE'),
  2.22::numeric,
  'e o valor enxergado é o PRÓPRIO (2.22), nunca o da outra empresa (1.11)'
);
select is(
  (select count(*)::int from public.metas_ano where ano = 2099 and mes = 4),
  1,
  'o tenant principal só enxerga UMA linha em 2099/mes 4 — a da outra empresa fica invisível'
);
select is(
  (select total_realizado from public.metas_ano where ano = 2099 and mes = 4),
  2.22::numeric,
  'e o total enxergado é o PRÓPRIO (2.22), nunca o da outra empresa (1.11)'
);

select tests.clear_authentication();
select tests.authenticate_as('owner@metas-realizado.test');

select * from finish();
rollback;

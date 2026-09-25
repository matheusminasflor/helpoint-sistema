-- Frente 7d — renomear carteira, com memória. Ver
-- .scratch/plano-frente7d-renomear-carteira.md e a migration
-- 20261025050000_carteira_renomear.sql.
begin;
\ir _helpers.psql

select plan(19);

-- ═══════════════════════════════════════════════════════════════════════════
-- Fixtures — dois tenants (isolamento), owner de cada, mais `sem_permissao`
-- (módulo Comercial, nenhuma permissão granular) e `com_permissao`
-- (`metas.definir`) no tenant principal — regra 12 do pgTAP: RLS de
-- escrita não se prova só com owner.
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table f on commit drop as
select tests.create_tenant('carteira-renomear', 'Carteira Renomear', false) as tenant,
       tests.create_tenant('carteira-renomear-outro', 'Carteira Renomear Outro Tenant', false) as outro_tenant;

create temporary table u on commit drop as
select tests.create_user('owner@carteira-renomear.test', (select tenant from f)) as owner,
       tests.create_user('sem-permissao@carteira-renomear.test', (select tenant from f)) as sem_permissao,
       tests.create_user('com-permissao@carteira-renomear.test', (select tenant from f)) as com_permissao,
       tests.create_user('outro-owner@carteira-renomear.test', (select outro_tenant from f)) as outro_owner;

select tests.grant_role((select owner from u), 'owner');
select tests.grant_role((select outro_owner from u), 'owner');
select tests.grant_role((select sem_permissao from u), 'member');
select tests.grant_module((select sem_permissao from u), (select tenant from f), 'comercial');
select tests.grant_role((select com_permissao from u), 'member');
select tests.grant_module((select com_permissao from u), (select tenant from f), 'comercial');

create temporary table perfil on commit drop as
with ins as (
  insert into public.access_profiles (tenant_id, department, name, permissions)
  values ((select tenant from f), 'comercial', 'Renomear Teste', '{"metas": {"definir": true}}'::jsonb)
  returning id
)
select id as perfil from ins;

insert into public.user_access_profiles (tenant_id, user_id, department, profile_id)
select (select tenant from f), (select com_permissao from u), 'comercial', (select perfil from perfil);

grant select on f, u, perfil to authenticated;

select tests.authenticate_as('owner@carteira-renomear.test');

-- Fixture: VIP tem realizado (dois meses), meta definida e um membro. MG
-- existe com um mês de realizado, EM MÊS DIFERENTE de VIP (de propósito —
-- ver bloco 2: se MG e VIP/ESPECIAL tivessem o mesmo ano/mês, a própria PK
-- de `metas_carteira` já recusaria a fusão sozinha, e o throws_ok passaria
-- mesmo que a checagem explícita da função fosse removida — sem provar
-- nada sobre ELA. Com meses disjuntos, só a checagem explícita impede a
-- fusão silenciosa; confirmado rodando a mutação, ver comentário do bloco 2).
insert into public.metas_carteira (ano, mes, carteira, realizado) values
  (2025, 1, 'VIP', 1000), (2025, 2, 'VIP', 2000), (2025, 6, 'MG', 500);
insert into public.com_metas (ano, mes, carteira, valor) values (2025, 1, 'VIP', 10000);
insert into public.com_carteira_membros (carteira, user_id) values ('VIP', (select owner from u));

-- Fixture de isolamento (bloco 6): a outra empresa tem a MESMA carteira
-- "VIP", com valor próprio — nunca vazia, para a prova não passar por
-- acidente com uma tabela sem linha nenhuma.
select tests.clear_authentication();
select tests.authenticate_as('outro-owner@carteira-renomear.test');
insert into public.metas_carteira (ano, mes, carteira, realizado) values (2025, 1, 'VIP', 777);
select tests.clear_authentication();
select tests.authenticate_as('owner@carteira-renomear.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- 0. normalizar_nome_carteira — o mesmo caso que
-- src/lib/carteira-nome.test.ts prova para `normalizarNomeCarteira` do
-- front (sem acento, maiúsculo, sem espaço nas pontas). As duas suítes
-- têm de bater exatamente para os mesmos casos.
-- ═══════════════════════════════════════════════════════════════════════════
select is(public.normalizar_nome_carteira(' Berçário '), 'BERCARIO', 'sem acento, maiúsculo, sem espaço nas pontas');
select is(public.normalizar_nome_carteira('São Paulo'), 'SAO PAULO', 'acento composto e espaço interno preservado');

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Renomear move as linhas das três tabelas — nenhuma sobra com o nome
-- velho. Rodado por `com_permissao` (metas.definir), não pelo owner —
-- prova que a permissão granular basta, sem precisar de cargo.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('com-permissao@carteira-renomear.test');
select com_renomear_carteira('VIP', 'ESPECIAL');

select is((select count(*)::int from public.metas_carteira where carteira = 'VIP'), 0,
  'nenhuma linha de metas_carteira sobra com VIP depois de renomear');
select is((select count(*)::int from public.metas_carteira where carteira = 'ESPECIAL'), 2,
  'as duas linhas de VIP em metas_carteira migraram para ESPECIAL');
select is((select count(*)::int from public.com_metas where carteira = 'VIP'), 0,
  'nenhuma linha de com_metas sobra com VIP');
select is((select count(*)::int from public.com_metas where carteira = 'ESPECIAL'), 1,
  'a linha de com_metas migrou para ESPECIAL');
select is((select count(*)::int from public.com_carteira_membros where carteira = 'VIP'), 0,
  'nenhuma linha de com_carteira_membros sobra com VIP');
select is((select count(*)::int from public.com_carteira_membros where carteira = 'ESPECIAL'), 1,
  'o membro migrou para ESPECIAL');

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Renomear para um nome que já existe (MG) é recusado, e NADA muda —
-- seria fundir duas carteiras.
--
-- Mutação (rodada e confirmada, ver relatório do executor): comentar o
-- bloco `if exists (...) then raise exception ...` faz o `throws_ok`
-- acusar "not ok" (a chamada deixa de lançar) — e, mesmo restaurando só
-- esse throws_ok, a asserção "nada mudou" continuaria vermelha se a
-- recusa não tivesse voltado, porque a fusão já teria acontecido: MG
-- passaria a ter 3 linhas (as 2 de ESPECIAL somadas à 1 original). Função
-- restaurada à definição da migration antes de seguir.
-- ═══════════════════════════════════════════════════════════════════════════
select throws_ok(
  $sql$ select com_renomear_carteira('ESPECIAL', 'MG') $sql$,
  '23505', null,
  'renomear para um nome que já existe (MG) é recusado — fundiria as duas carteiras'
);
select is((select count(*)::int from public.metas_carteira where carteira = 'MG'), 1,
  'nada mudou em metas_carteira depois da recusa — MG continua com uma linha só');

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Quem não tem metas.definir (e não é admin) leva 42501, nunca silêncio
-- — a checagem explícita do passo 1 da função, não a RLS (que só filtraria
-- a linha do UPDATE em silêncio, regra 12 do pgTAP).
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('sem-permissao@carteira-renomear.test');
select throws_ok(
  $sql$ select com_renomear_carteira('ESPECIAL', 'PREMIUM') $sql$,
  '42501', null,
  'quem não tem metas.definir (e não é admin) não renomeia — 42501, não silêncio'
);
select tests.clear_authentication();
select tests.authenticate_as('com-permissao@carteira-renomear.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. A prova central: a importação aplica a memória. VIP no arquivo
-- (ano novo, 2030, para não colidir com nada da fixture) vira ESPECIAL no
-- banco, e nenhuma linha com VIP sobra.
--
-- Mutação (rodada e confirmada, ver relatório do executor): trocar o
-- `select para into v_carteira_final from public.com_carteira_
-- renomeacoes ...` por `v_carteira_final := null;` (não consultar a
-- memória) faz a PRIMEIRA asserção abaixo acusar — `metas_carteira` do ano
-- 2030 grava 12 linhas de "VIP", zero de "ESPECIAL". Função restaurada à
-- definição da migration antes de seguir.
-- ═══════════════════════════════════════════════════════════════════════════
select public.com_importar_metas('fixture-memoria.json', $json$
  {"anos": {"2030": {"cart": {"VIP": [100,100,100,100,100,100,100,100,100,100,100,100]}, "total": [100,100,100,100,100,100,100,100,100,100,100,100]}}}
$json$::jsonb);

select is((select count(*)::int from public.metas_carteira where ano = 2030 and carteira = 'ESPECIAL'), 12,
  'importar um JSON com VIP, depois da renomeação, grava ESPECIAL');
select is((select count(*)::int from public.metas_carteira where ano = 2030 and carteira = 'VIP'), 0,
  'nenhuma linha com VIP sobra depois da importação — a memória foi aplicada');

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Cadeia de renomeações: VIP→ESPECIAL (bloco 1) e agora ESPECIAL→SUPREMA
-- deixam a memória resolvendo as DUAS origens (VIP e ESPECIAL) para SUPREMA
-- — senão um arquivo antigo com VIP cairia em ESPECIAL, que já não existe
-- mais como carteira ativa.
-- ═══════════════════════════════════════════════════════════════════════════
select com_renomear_carteira('ESPECIAL', 'SUPREMA');

select is((select para from public.com_carteira_renomeacoes where de = 'VIP'), 'SUPREMA',
  'a cadeia VIP→ESPECIAL→SUPREMA deixa VIP apontando direto para SUPREMA');
select is((select para from public.com_carteira_renomeacoes where de = 'ESPECIAL'), 'SUPREMA',
  'e ESPECIAL também aponta para SUPREMA');

-- ═══════════════════════════════════════════════════════════════════════════
-- 5b. O CICLO — achado da auditoria de 2026-09-25, que a cadeia "para frente"
-- acima não pegava.
--
-- Voltar ao nome anterior (SUPREMA→VIP, fechando VIP→…→VIP) deixava a memória
-- com `VIP→ESPECIAL` de pé enquanto VIP voltava a ser a carteira VIVA. Um
-- arquivo com a chave VIP era então desviado para ESPECIAL, que já não
-- existe: a memória mandava o dado para um nome morto.
--
-- A regra que conserta, em uma frase: **o nome de destino sai da memória como
-- origem** — o que está vivo não pode ser redirecionado.
--
-- Mutação (rodada em 2026-09-25): tirar o `delete … where de = v_para` do fim
-- de `com_renomear_carteira` faz a primeira asserção abaixo acusar — sobra
-- `VIP→ESPECIAL` e a importação de VIP vai parar em ESPECIAL.
-- ═══════════════════════════════════════════════════════════════════════════
select com_renomear_carteira('SUPREMA', 'VIP');

select is(
  (select count(*)::int from public.com_carteira_renomeacoes where de = 'VIP'),
  0,
  'depois de voltar ao nome VIP, ele deixa de ser ORIGEM na memória — o que está vivo não se redireciona'
);
select is(
  (select para from public.com_carteira_renomeacoes where de = 'SUPREMA'),
  'VIP',
  'e o nome que ficou para trás (SUPREMA) é que passa a apontar para o vivo'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Isolamento: a outra empresa tem a mesma carteira "VIP", com valor
-- próprio (777) — e a renomeação desta empresa não a toca. Conferido pelo
-- papel do runner (`clear_authentication`), porque a RLS de `metas_carteira`
-- não deixaria o tenant principal ver a linha da outra empresa de propósito.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select is(
  (select count(*)::int from public.metas_carteira mc join f on mc.tenant_id = f.outro_tenant
    where mc.carteira = 'VIP' and mc.realizado = 777),
  1,
  'a outra empresa continua com VIP e o valor 777 — não foi tocada pela renomeação desta'
);
select is(
  (select count(*)::int from public.metas_carteira mc join f on mc.tenant_id = f.outro_tenant
    where mc.carteira in ('ESPECIAL', 'SUPREMA')),
  0,
  'a outra empresa não ganhou ESPECIAL nem SUPREMA — a renomeação é por tenant'
);

select * from finish();
rollback;

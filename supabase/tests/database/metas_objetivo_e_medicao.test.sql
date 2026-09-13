-- OKR-1: Metas (migration 20260929010000). Prova:
--   - a empresa toda vê a meta, mas só gestor cria e edita
--   - o que se mede fica embaixo de um objetivo, e não embaixo de outro indicador
--   - lançar o número do mês atualiza o valor da meta sozinho, e corrigir um mês
--     antigo não bagunça o valor de hoje
--   - o progresso está certo nos dois sentidos — meta de subir e meta de descer
--   - o responsável do indicador lança o número dele sem ser gestor
--   - o modo (OKR ou indicadores) é por empresa, só dono/admin muda, e o
--     visitante de fora não lê nada
begin;
\ir _helpers.psql

select plan(24);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-meta-a', 'Meta A') as a,
       tests.create_tenant('pgtap-meta-b', 'Meta B') as b;

create temporary table u on commit drop as
select tests.create_user('gestor@meta.test',   (select a from f)) as gestor,
       tests.create_user('operador@meta.test', (select a from f)) as operador,
       tests.create_user('dono@meta.test',     (select a from f)) as dono,
       tests.create_user('gestorb@meta.test',  (select b from f)) as gestor_b;
select tests.grant_role((select gestor from u),   'manager');
select tests.grant_role((select dono from u),     'owner');
select tests.grant_role((select gestor_b from u), 'manager');
grant select on f, u to authenticated, anon;

-- O objetivo e os dois indicadores nascem com o papel do runner: o que se prova
-- abaixo é quem pode mexer, não quem semeou.
create temporary table s on commit drop as
select gen_random_uuid() as objetivo,
       gen_random_uuid() as ind_sobe,
       gen_random_uuid() as ind_desce,
       gen_random_uuid() as objetivo_b;
grant select on s to authenticated, anon;

insert into public.goals (id, tenant_id, created_by, title, scope, target_value, start_date, end_date)
select objetivo, (select a from f), (select gestor from u),
       'Ser referencia em atendimento', 'company', 1, date '2026-01-01', date '2026-12-31' from s;

-- Meta de subir que não parte do zero: 80% hoje, 90% no fim do ano. Quem ignora
-- o ponto de partida mostra "89% da meta" no primeiro dia.
insert into public.goals (id, tenant_id, created_by, assigned_to, parent_goal_id, title,
                          scope, unit, direction, baseline, target_value, start_date, end_date)
select ind_sobe, (select a from f), (select gestor from u), (select operador from u), objetivo,
       'Chamados resolvidos no prazo', 'company', 'percent', 'up', 80, 90,
       date '2026-01-01', date '2026-12-31' from s;

-- Meta de descer: 5 dias hoje, 2 dias no fim.
insert into public.goals (id, tenant_id, created_by, parent_goal_id, title,
                          scope, unit, direction, baseline, target_value, start_date, end_date)
select ind_desce, (select a from f), (select gestor from u), objetivo,
       'Dias para fechar um chamado', 'company', 'number', 'down', 5, 2,
       date '2026-01-01', date '2026-12-31' from s;

insert into public.goals (id, tenant_id, created_by, title, scope, target_value, start_date, end_date)
select objetivo_b, (select b from f), (select gestor_b from u),
       'Objetivo da outra empresa', 'company', 1, date '2026-01-01', date '2026-12-31' from s;

-- ───────────────────────────────────────────────────────────────────────────
-- Quem vê e quem mexe
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('operador@meta.test');
select is(
  (select count(*)::int from public.goals),
  3,
  'quem nao tem cargo nenhum ve as tres metas da empresa'
);
select throws_ok(
  format($$ insert into public.goals (id, tenant_id, created_by, title, scope, target_value, start_date, end_date)
            values (gen_random_uuid(), %L::uuid, auth.uid(), 'Meta do operador', 'individual', 1, date '2026-01-01', date '2026-12-31') $$,
         (select a from f)),
  '42501', null,
  'operador nao cria meta'
);
select throws_ok(
  format($$ update public.goals set title = 'Mudei' where id = %L::uuid $$, (select objetivo from s)),
  'P0002', null,
  'operador nao edita meta'
);
select tests.clear_authentication();

select tests.authenticate_as('gestorb@meta.test');
select is(
  (select count(*)::int from public.goals where tenant_id = (select a from f)),
  0,
  'a empresa B nao ve as metas da A'
);
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- Dois níveis, e só dois
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('gestor@meta.test');
select is(
  (select count(*)::int from public.goals where parent_goal_id = (select objetivo from s)),
  2,
  'os dois indicadores estao pendurados no objetivo'
);
select throws_ok(
  format($$ insert into public.goals (tenant_id, created_by, parent_goal_id, title, scope, target_value, start_date, end_date)
            values (%L::uuid, auth.uid(), %L::uuid, 'Neto', 'company', 1, date '2026-01-01', date '2026-12-31') $$,
         (select a from f), (select ind_sobe from s)),
  '23514', null,
  'indicador pendurado em indicador nao entra'
);
-- Um objetivo de outra empresa não vira pai de indicador desta: a chave
-- composta (id, empresa) barra antes de qualquer política.
select throws_ok(
  format($$ insert into public.goals (tenant_id, created_by, parent_goal_id, title, scope, target_value, start_date, end_date)
            values (%L::uuid, auth.uid(), %L::uuid, 'Filho de fora', 'company', 1, date '2026-01-01', date '2026-12-31') $$,
         (select a from f), (select objetivo_b from s)),
  '23503', null,
  'objetivo de outra empresa nao vira pai'
);
select throws_ok(
  format($$ insert into public.goals (tenant_id, created_by, title, scope, target_value, start_date, end_date)
            values (%L::uuid, auth.uid(), 'Periodo ao contrario', 'company', 1, date '2026-12-31', date '2026-01-01') $$,
         (select a from f)),
  '23514', null,
  'meta que termina antes de comecar nao entra'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Lançar o número
-- ───────────────────────────────────────────────────────────────────────────
-- Antes de qualquer medição o indicador não vale zero: vale nada. Com o zero
-- de fábrica que existia antes, este indicador — que parte de 80 rumo a 90 —
-- aparecia na tela como **-800%** e farol vermelho no minuto em que nascia.
select is(
  (select coalesce(current_value::text, 'nulo') || '|' || coalesce(progress::text, 'nulo')
     from public.goals where id = (select ind_sobe from s)),
  'nulo|nulo',
  'indicador recem-criado nao tem valor nem progresso — nao vale zero'
);

insert into public.goal_checkins (tenant_id, goal_id, period_date, value, author_id)
select (select a from f), ind_sobe, date '2026-01-01', 82, auth.uid() from s;
insert into public.goal_checkins (tenant_id, goal_id, period_date, value, author_id)
select (select a from f), ind_sobe, date '2026-02-01', 85, auth.uid() from s;

select is(
  (select current_value from public.goals where id = (select ind_sobe from s)),
  85::numeric,
  'o valor da meta e a medicao mais recente, sem ninguem digitar duas vezes'
);
-- 85 de um caminho que vai de 80 a 90: metade andada. Sem o ponto de partida
-- esta conta daria 94%, e o farol ficaria verde num indicador que mal saiu do
-- lugar.
select is(
  (select round(progress, 4) from public.goals where id = (select ind_sobe from s)),
  0.5000::numeric,
  'o progresso conta a partir de onde a meta partiu'
);
-- Corrigir janeiro em março não pode mexer no valor de hoje, que é o de
-- fevereiro. É o erro que aparece quando alguem guarda so "o ultimo lancado".
update public.goal_checkins set value = 81
 where goal_id = (select ind_sobe from s) and period_date = date '2026-01-01';
select is(
  (select current_value from public.goals where id = (select ind_sobe from s)),
  85::numeric,
  'corrigir um mes antigo nao mexe no valor de hoje'
);
select throws_ok(
  format($$ insert into public.goal_checkins (tenant_id, goal_id, period_date, value)
            values (%L::uuid, %L::uuid, date '2026-02-01', 99) $$,
         (select a from f), (select ind_sobe from s)),
  '23505', null,
  'o mesmo mes nao entra duas vezes'
);

-- Meta de descer: 4 dias num caminho de 5 para 2 é um terço andado. Sem o
-- sentido da meta, a mesma conta diria -33% e o farol pintaria vermelho
-- justamente porque o indicador melhorou.
insert into public.goal_checkins (tenant_id, goal_id, period_date, value)
select (select a from f), ind_desce, date '2026-01-01', 4 from s;
select is(
  (select round(progress, 4) from public.goals where id = (select ind_desce from s)),
  0.3333::numeric,
  'meta de descer anda para frente quando o numero cai'
);

-- Apagar a última medição devolve o indicador a "não medido", e não a zero —
-- a outra metade do mesmo engano do `-800%`.
delete from public.goal_checkins
 where goal_id = (select ind_desce from s) and period_date = date '2026-01-01';
select is(
  (select coalesce(current_value::text, 'nulo') from public.goals where id = (select ind_desce from s)),
  'nulo',
  'apagar a ultima medicao devolve a meta para nao medida'
);
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- Quem lança o número
-- ───────────────────────────────────────────────────────────────────────────
-- O operador é o responsável do indicador "chamados no prazo": ele lança o
-- número dele sem virar gestor.
select tests.authenticate_as('operador@meta.test');
select lives_ok(
  format($$ insert into public.goal_checkins (tenant_id, goal_id, period_date, value, author_id)
            values (%L::uuid, %L::uuid, date '2026-03-01', 87, auth.uid()) $$,
         (select a from f), (select ind_sobe from s)),
  'o responsavel lanca o numero do indicador dele sem ser gestor'
);
-- Mas não no indicador que não é dele.
select throws_ok(
  format($$ insert into public.goal_checkins (tenant_id, goal_id, period_date, value)
            values (%L::uuid, %L::uuid, date '2026-03-01', 3) $$,
         (select a from f), (select ind_desce from s)),
  '42501', null,
  'e nao lanca no indicador de outro'
);
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- O modo, por empresa
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('gestor@meta.test');
select is(public.metas_modo(), 'indicadores', 'sem escolher nada, a empresa comeca em indicadores');
select throws_ok(
  $$ select public.tenant_set_config('metas', 'modo', '"okr"'::jsonb) $$,
  '42501', null,
  'gestor nao muda o modo das Metas — e o erro fala de Metas, nao do CRM'
);
select tests.clear_authentication();

select tests.authenticate_as('dono@meta.test');
select lives_ok(
  $$ select public.tenant_set_config('metas', 'modo', '"okr"'::jsonb) $$,
  'o dono muda o modo'
);
select is(public.metas_modo(), 'okr', 'e a tela passa a ler okr');
select throws_ok(
  $$ select public.tenant_set_config('metas', 'modo', '"scopi"'::jsonb) $$,
  '22023', null,
  'modo inventado nao entra'
);
select tests.clear_authentication();

set local role anon;
select throws_ok(
  $$ select public.metas_modo() $$,
  '42501', null,
  'visitante de fora nao le o modo da empresa'
);
reset role;

-- ───────────────────────────────────────────────────────────────────────────
-- Apagar o objetivo leva o que estava embaixo
-- ───────────────────────────────────────────────────────────────────────────
delete from public.goals where id = (select objetivo from s);
select is(
  (select count(*)::int from public.goals where tenant_id = (select a from f))
  + (select count(*)::int from public.goal_checkins where tenant_id = (select a from f)),
  0,
  'apagar o objetivo leva indicadores e medicoes junto'
);

select * from finish();
rollback;

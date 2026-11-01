-- TI › Indicadores › Semanal (migration 20270212150000; dono, 2026-11-01): o FSENSE e as interrupções.
--
--   gest  TI, Gestor (com "Lançar FSENSE e interrupções") — lança, confirma, vê tudo
--   leit  TI, Somente leitura — vê as interrupções; NÃO vê a produtividade por pessoa; não lança
--   op    TI, Operador — sem os Indicadores: não vê nada
--   dono  dono — vê tudo e define a meta
begin;
\ir _helpers.psql

select plan(15);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-ti-semanal', 'TI semanal', false) as a;
create temporary table u on commit drop as
select tests.create_user('gest@tisemanal.test', (select a from f)) as gest,
       tests.create_user('leit@tisemanal.test', (select a from f)) as leit,
       tests.create_user('op@tisemanal.test',   (select a from f)) as op,
       tests.create_user('dono@tisemanal.test', (select a from f)) as dono;
select tests.grant_module(x, (select a from f), 'ti')
  from (select gest x from u union all select leit from u union all select op from u) s;
select tests.grant_profile((select gest from u), (select a from f), 'ti', 'Gestor');
select tests.grant_profile((select leit from u), (select a from f), 'ti', 'Somente leitura');
select tests.grant_profile((select op from u), (select a from f), 'ti', 'Operador');
select tests.grant_role((select dono from u), 'owner');
-- Empresa nova não nasce com a ação (ponytail da migration): liga como a migration fez na Minasflor.
update public.access_profiles
   set permissions = jsonb_set(permissions, '{reports}', coalesce(permissions -> 'reports', '{}'::jsonb) || '{"lancar": true}'::jsonb)
 where tenant_id = (select a from f) and department = 'ti' and name = 'Gestor';

create temporary table r (nome text, id uuid) on commit drop;
grant select on f, u to authenticated;
grant select, insert on r to authenticated;

-- ═══ 1-5. O Gestor lança; fica a confirmar; confirmar carimba quem está logado; colar de novo volta a confirmar ═══
select tests.authenticate_as('gest@tisemanal.test');
select lives_ok($$
  with t as (insert into public.ti_fsense (tenant_id, data, colaborador, horas, trabalho, ocioso)
             select a, date '2026-10-25', 'Rondinelly', 38.4, 46.5, 40.3 from f returning id)
  insert into r select 'rond', id from t $$, 'o Gestor da TI lança uma linha do FSENSE (com returning)');
select is((select confirmado_em from public.ti_fsense where id = (select id from r where nome = 'rond')), null,
  'o que entra fica a confirmar');
update public.ti_fsense set confirmado_em = now(), confirmado_por = (select op from u)
 where id = (select id from r where nome = 'rond');
select is((select confirmado_por from public.ti_fsense where id = (select id from r where nome = 'rond')), (select gest from u),
  'confirmar carimba quem está logado, não quem o cliente mandou');
update public.ti_fsense set trabalho = 47.0 where id = (select id from r where nome = 'rond');
select isnt((select confirmado_em from public.ti_fsense where id = (select id from r where nome = 'rond')), null,
  'corrigir um número de uma semana confirmada não desconfirma');
select is(public.ti_fsense_lancar(date '2026-10-25',
  '[{"colaborador": "RONDINELLY", "horas": 40, "trabalho": 50, "ocioso": 30}]'::jsonb), 1, 'colar a semana grava pela função');
select is((select format('%s %s %s', count(*), max(horas), count(confirmado_em)) from public.ti_fsense), '1 40.0 0',
  'colar por cima atualiza a mesma pessoa (sem duplicar) e volta a semana para a confirmar');

-- ═══ 6. Uma linha por pessoa por semana (sem diferença de maiúscula) ═══
select throws_ok($$ insert into public.ti_fsense (tenant_id, data, colaborador, horas)
  select a, date '2026-10-25', ' rondinelly', 10 from f $$, '23505', null, 'a mesma pessoa não entra duas vezes na semana');

-- ═══ 7-8. Interrupção: o Gestor registra; tipo fora da lista não entra ═══
select lives_ok($$ insert into public.ti_interrupcoes (tenant_id, tipo, inicio, fim, observacao)
  select a, 'luz', timestamptz '2026-10-24 14:00-03', timestamptz '2026-10-24 16:30-03', 'Acidente na rua' from f returning id $$,
  'o Gestor registra uma interrupção');
select throws_ok($$ insert into public.ti_interrupcoes (tenant_id, tipo, inicio) select a, 'chuva', now() from f $$,
  '23514', null, 'tipo fora da lista não entra');
select tests.clear_authentication();

-- ═══ 9-11. Somente leitura: vê a interrupção, não vê a produtividade por pessoa, não lança ═══
select tests.authenticate_as('leit@tisemanal.test');
select is((select count(*)::int from public.ti_interrupcoes), 1, 'quem vê os Indicadores da TI vê as interrupções');
select is((select count(*)::int from public.ti_fsense), 0, 'sem "Ver métricas da equipe" não vê a produtividade por pessoa');
select throws_ok($$ insert into public.ti_interrupcoes (tenant_id, tipo, inicio) select a, 'internet', now() from f $$,
  '42501', null, 'sem "Lançar" não registra interrupção');
select tests.clear_authentication();

-- ═══ 12. Operador (sem os Indicadores): nada ═══
select tests.authenticate_as('op@tisemanal.test');
select is((select count(*)::int from public.ti_interrupcoes) + (select count(*)::int from public.ti_fsense), 0,
  'sem os Indicadores da TI não vê nada');
select tests.clear_authentication();

-- ═══ 13-14. A meta: o dono define; quem vê os Indicadores da TI lê a da TI, e só a da TI ═══
select tests.authenticate_as('dono@tisemanal.test');
insert into public.dir_metas_dos_setores (tenant_id, setor, indicador, meta)
select a, 'ti', 'fsense_ocioso', 18 from f union all select a, 'rh', 'turnover', 2 from f;
select tests.clear_authentication();
select tests.authenticate_as('leit@tisemanal.test');
select is((select meta from public.dir_metas_dos_setores where setor = 'ti' and indicador = 'fsense_ocioso'), 18::numeric,
  'quem vê os Indicadores da TI lê a meta da TI');
select is((select count(*)::int from public.dir_metas_dos_setores where setor <> 'ti'), 0,
  'e não lê a meta dos outros setores');
select tests.clear_authentication();

select * from finish();
rollback;

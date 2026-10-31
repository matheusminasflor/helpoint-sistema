-- Rotinas do dia, etapa 2 (2026-10-30, migration 20270212130000): o que o gestor vê da equipe.
--
-- Prova: cada rotina de cada pessoa em cada dia útil, com a situação certa (feita, pulada com motivo, pendente hoje,
-- não feita no dia que passou, pausada nas férias); só do setor em que o gestor tem a caixinha; quem não tem não vê
-- nada; e a rotina excluída sai a partir do dia da exclusão.
begin;
\ir _helpers.psql

select plan(12);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-rotinas-eq', 'Rotinas Equipe', false) as a;
create temporary table u on commit drop as
select tests.create_user('gestor@rotinaseq.test', (select a from f)) as gestor,
       tests.create_user('ana@rotinaseq.test',    (select a from f)) as ana,
       tests.create_user('bia@rotinaseq.test',    (select a from f)) as bia,
       tests.create_user('caio@rotinaseq.test',   (select a from f)) as caio,
       tests.create_user('rh@rotinaseq.test',     (select a from f)) as rh;
select tests.grant_module(x, (select a from f), 'comercial')
  from (select ana x from u union all select bia from u union all select gestor from u) s;
select tests.grant_profile((select gestor from u), (select a from f), 'comercial', 'Gestor');
select tests.grant_module((select caio from u), (select a from f), 'marketing');
select tests.grant_module((select rh from u), (select a from f), 'rh');
select tests.grant_profile((select rh from u), (select a from f), 'rh', 'Gestor');
select tests.create_colaborador((select bia from u));
update public.access_profiles set permissions = permissions || '{"rotinas": {"view": true, "edit": true, "delete": true}}'::jsonb
 where tenant_id = (select a from f) and department = 'comercial' and name = 'Gestor';

-- "Hoje" = o próximo dia útil (regra 10; num sábado o CI não teria rotina).
create temporary table hoje on commit drop as
select min(g::date) as d
  from generate_series((now() at time zone 'America/Sao_Paulo')::date, (now() at time zone 'America/Sao_Paulo')::date + 10, interval '1 day') g
 where public.rotina_dia_util((select a from f), g::date);
select set_config('rotinas.hoje', (select d from hoje)::text, true);
-- Quantos dias úteis num intervalo — pela mesma régua do sistema, para a conta do teste não errar em feriado.
create temporary table uteis on commit drop as
select (select count(*)::int from generate_series((select d from hoje) - 7, (select d from hoje) - 7, interval '1 day') g
         where public.rotina_dia_util((select a from f), g::date)) as dia_7,
       (select count(*)::int from generate_series((select d from hoje) - 6, (select d from hoje) - 1, interval '1 day') g
         where public.rotina_dia_util((select a from f), g::date)) as dias_6_a_1;

create temporary table r (nome text, id uuid) on commit drop;
grant select on f, u, hoje, uteis to authenticated;
grant select, insert on r to authenticated;

-- A rotina da Ana (manhã), a do gestor para Ana e Bia (tarde) e a do Caio (Marketing).
select tests.authenticate_as('ana@rotinaseq.test');
with t as (insert into public.rotinas (setor, titulo, periodo, repeticao, pessoas)
           values ('comercial', 'Conferir pedidos', 'manha', 'dias_uteis', array[(select ana from u)]) returning id)
insert into r select 'da_ana', id from t;
select tests.clear_authentication();
select tests.authenticate_as('gestor@rotinaseq.test');
with t as (insert into public.rotinas (setor, titulo, periodo, repeticao, pessoas)
           values ('comercial', 'Resumo do dia', 'tarde', 'dias_uteis', array[(select ana from u), (select bia from u)]) returning id)
insert into r select 'do_gestor', id from t;
select tests.clear_authentication();
select tests.authenticate_as('caio@rotinaseq.test');
with t as (insert into public.rotinas (setor, titulo, periodo, repeticao, pessoas)
           values ('marketing', 'Postar nas redes', 'manha', 'dias_uteis', array[(select caio from u)]) returning id)
insert into r select 'do_caio', id from t;
select tests.clear_authentication();

-- Ana marca a dela; Bia pula a do gestor.
select tests.authenticate_as('ana@rotinaseq.test');
select public.rotina_marcar((select id from r where nome = 'da_ana'), (select ana from u), 'feita');
select tests.clear_authentication();
select tests.authenticate_as('bia@rotinaseq.test');
select public.rotina_marcar((select id from r where nome = 'do_gestor'), (select bia from u), 'pulada', 'Reunião com cliente');
select tests.clear_authentication();

-- ═══ 1-6. Hoje ═══
select tests.authenticate_as('gestor@rotinaseq.test');
select is((select count(*)::int from public.rotinas_da_equipe((select d from hoje), (select d from hoje))), 3,
  'o gestor vê as três rotinas de hoje da equipe (a da Ana, e a dele para Ana e Bia)');
select is((select situacao from public.rotinas_da_equipe((select d from hoje), (select d from hoje))
            where rotina_id = (select id from r where nome = 'da_ana')), 'feita', 'a da Ana aparece feita');
select is((select situacao || ': ' || motivo from public.rotinas_da_equipe((select d from hoje), (select d from hoje))
            where pessoa_id = (select bia from u)), 'pulada: Reunião com cliente', 'a da Bia aparece pulada, com o motivo');
select is((select situacao from public.rotinas_da_equipe((select d from hoje), (select d from hoje))
            where rotina_id = (select id from r where nome = 'do_gestor') and pessoa_id = (select ana from u)), 'pendente',
  'a de hoje sem registro ainda é pendente, não "não feita"');
select is((select count(*)::int from public.rotinas_da_equipe((select d from hoje), (select d from hoje)) where setor = 'marketing'), 0,
  'o gestor do Comercial não vê a rotina do Marketing');
select is(public.rotina_setores_que_vejo(), array['comercial'], 'o gestor vê só o setor em que tem a caixinha');
select tests.clear_authentication();

select tests.authenticate_as('bia@rotinaseq.test');
select is((select count(*)::int from public.rotinas_da_equipe((select d from hoje), (select d from hoje))), 0,
  'sem a caixinha, a Bia não vê a equipe');
select tests.clear_authentication();

-- ═══ 8-9. Os dias que passaram: não feita, e pausada nas férias ═══
-- A rotina do gestor nasceu há 7 dias; a Bia esteve de férias do 6º ao 1º dia antes de hoje.
update public.rotinas set created_at = ((select d from hoje) - 7)::timestamp at time zone 'America/Sao_Paulo'
 where id = (select id from r where nome = 'do_gestor');
select tests.authenticate_as('rh@rotinaseq.test');
with v as (
  insert into public.rh_vacation_requests (tenant_id, user_id, start_date, end_date, days_requested, type, status)
  select a, (select bia from u), (select d from hoje) - 6, (select d from hoje) - 1, 6, 'ferias', 'aprovada' from f
  returning id
) select count(*) from v;
select tests.clear_authentication();

select tests.authenticate_as('gestor@rotinaseq.test');
select is((select count(*)::int from public.rotinas_da_equipe((select d from hoje) - 7, (select d from hoje) - 1)
            where pessoa_id = (select bia from u) and situacao = 'pausada'), (select dias_6_a_1 from uteis),
  'nos dias úteis de férias a rotina da Bia aparece pausada');
select is((select count(*)::int from public.rotinas_da_equipe((select d from hoje) - 7, (select d from hoje) - 1)
            where pessoa_id = (select bia from u) and situacao = 'nao_feita'), (select dia_7 from uteis),
  'o dia útil que passou sem registro fica como não feita');
select throws_ok($$ select * from public.rotinas_da_equipe((select d from hoje) - 100, (select d from hoje)) $$,
  '22023', 'O período vai de 1 a 93 dias.', 'o período tem limite');
select tests.clear_authentication();

-- ═══ 11-12. A rotina excluída sai a partir do dia da exclusão ═══
select tests.authenticate_as('ana@rotinaseq.test');
update public.rotinas set ativa = false where id = (select id from r where nome = 'da_ana');
select tests.clear_authentication();
select tests.authenticate_as('gestor@rotinaseq.test');
select is((select count(*)::int from public.rotinas_da_equipe((select d from hoje), (select d from hoje))
            where rotina_id = (select id from r where nome = 'da_ana')), 0, 'excluída hoje, a rotina da Ana sai de hoje');
select tests.clear_authentication();
select tests.authenticate_as('bia@rotinaseq.test');
select is(public.rotina_setores_que_vejo(), '{}'::text[], 'a Bia não vê setor nenhum');
select tests.clear_authentication();

select * from finish();
rollback;

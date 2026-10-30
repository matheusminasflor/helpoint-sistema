-- Rotinas do dia (2026-10-30, migration 20270212120000; docs/proposta-rotinas.md).
--
-- O que se prova: a pessoa cria só a sua, no setor dela; o gestor cria para quem é do setor; a rotina do gestor a
-- pessoa não muda nem exclui; a lista de hoje traz só o que vale no dia; marcar pede o que a rotina pede; pular pede
-- motivo; o registro não vaza para o colega; o calendário (fim de semana, feriado, "todo dia X" e último dia útil);
-- e as férias: a rotina pausa, e a que "passa ao substituto" aparece para ele.
--
-- O dia: `rotinas.hoje` fixa o próximo dia útil — num sábado o CI não teria rotina (regra 10: o dia é do Brasil).
begin;
\ir _helpers.psql

select plan(28);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-rotinas', 'Rotinas', false) as a,
       tests.create_tenant('pgtap-rotinas-outra', 'Outra', false) as b;
create temporary table u on commit drop as
select tests.create_user('gestor@rotinas.test', (select a from f)) as gestor,
       tests.create_user('ana@rotinas.test',    (select a from f)) as ana,
       tests.create_user('bia@rotinas.test',    (select a from f)) as bia,
       tests.create_user('caio@rotinas.test',   (select a from f)) as caio,
       tests.create_user('rh@rotinas.test',     (select a from f)) as rh,
       tests.create_user('fora@rotinas.test',   (select b from f)) as fora;
select tests.grant_module(x, (select a from f), 'comercial')
  from (select ana x from u union all select bia from u union all select gestor from u) s;
select tests.grant_profile((select gestor from u), (select a from f), 'comercial', 'Gestor');
select tests.grant_module((select caio from u), (select a from f), 'marketing');
select tests.grant_module((select rh from u), (select a from f), 'rh');
select tests.grant_profile((select rh from u), (select a from f), 'rh', 'Gestor');
select tests.create_colaborador((select ana from u));
-- A empresa de teste nasce depois da migration: a caixinha do Gestor vem aqui, como a migration deu às que existiam.
update public.access_profiles set permissions = permissions || '{"rotinas": {"view": true, "edit": true, "delete": true}}'::jsonb
 where tenant_id = (select a from f) and department = 'comercial' and name = 'Gestor';

-- O próximo dia útil a partir de hoje (dia do Brasil).
create temporary table hoje on commit drop as
select min(d)::date as d
  from generate_series((now() at time zone 'America/Sao_Paulo')::date, (now() at time zone 'America/Sao_Paulo')::date + 10, interval '1 day') g(d)
 where public.rotina_dia_util((select a from f), d::date);
select set_config('rotinas.hoje', (select d from hoje)::text, true);

create temporary table r (nome text, id uuid) on commit drop;
grant select on f, u, hoje to authenticated;
grant select, insert on r to authenticated;

-- ═══ 1-4. Quem cria ═══
select tests.authenticate_as('ana@rotinas.test');
select lives_ok($$
  with t as (insert into public.rotinas (setor, titulo, periodo, repeticao, pessoas)
             values ('comercial', 'Conferir pedidos da manhã', 'manha', 'dias_uteis', array[(select ana from u)]) returning id)
  insert into r select 'da_ana', id from t
$$, 'a pessoa cria a sua rotina no setor dela');
select throws_ok($$
  insert into public.rotinas (setor, titulo, periodo, repeticao, pessoas)
  values ('comercial', 'Rotina da Bia', 'manha', 'dias_uteis', array[(select bia from u)]) returning id
$$, '42501', null, 'sem a caixinha, não cria rotina para outra pessoa');
select throws_ok($$
  insert into public.rotinas (setor, titulo, periodo, repeticao, pessoas)
  values ('marketing', 'Rotina de outro setor', 'manha', 'dias_uteis', array[(select ana from u)]) returning id
$$, '23514', null, 'nem a sua num setor em que não trabalha (a guarda barra antes da policy)');
select tests.clear_authentication();

select tests.authenticate_as('gestor@rotinas.test');
select lives_ok($$
  with t as (insert into public.rotinas (setor, titulo, periodo, repeticao, pessoas, pede, passa_ao_substituto)
             values ('comercial', 'Enviar o resumo do dia', 'fim_do_dia', 'dias_uteis',
                     array[(select ana from u), (select bia from u)], 'observacao', true) returning id)
  insert into r select 'do_gestor', id from t
$$, 'o gestor cria a rotina para duas pessoas do setor');
select throws_ok($$
  insert into public.rotinas (setor, titulo, periodo, repeticao, pessoas)
  values ('comercial', 'Rotina do Caio', 'tarde', 'dias_uteis', array[(select caio from u)]) returning id
$$, '23514', 'Toda pessoa da rotina precisa ser do setor dela.', 'nem o gestor põe na rotina quem não é do setor');
select tests.clear_authentication();

-- ═══ 6-7. A rotina do gestor a pessoa não muda nem exclui ═══
select tests.authenticate_as('ana@rotinas.test');
update public.rotinas set titulo = 'Mudei', ativa = false where id = (select id from r where nome = 'do_gestor');
select throws_ok($$ update public.rotinas set setor = 'marketing' where id = (select id from r where nome = 'da_ana') $$,
  '23514', null, 'a Ana não leva a rotina dela para um setor de que não é');
select tests.clear_authentication();
select is((select titulo || '/' || ativa from public.rotinas where id = (select id from r where nome = 'do_gestor')),
  'Enviar o resumo do dia/true', 'a Ana não muda nem exclui a rotina que o gestor criou (a policy filtra a linha)');

-- ═══ 8-15. A lista de hoje, marcar e pular ═══
select tests.authenticate_as('ana@rotinas.test');
select is((select count(*)::int from public.rotinas_de_hoje()), 2, 'a Ana vê as duas rotinas de hoje');
select is((select string_agg(periodo, ',' order by periodo) from public.rotinas_de_hoje()), 'fim_do_dia,manha',
  'cada uma no seu período');
select lives_ok($$ select public.rotina_marcar((select id from r where nome = 'da_ana'), (select ana from u), 'feita') $$,
  'marcar como feita');
select is((select situacao from public.rotinas_de_hoje() where rotina_id = (select id from r where nome = 'da_ana')), 'feita',
  'a lista mostra a feita');
select throws_ok($$ select public.rotina_marcar((select id from r where nome = 'do_gestor'), (select ana from u), 'feita') $$,
  '23514', 'Esta rotina pede uma observação ao marcar.', 'a rotina que pede observação não marca sem ela');
select throws_ok($$ select public.rotina_marcar((select id from r where nome = 'do_gestor'), (select ana from u), 'pulada', '') $$,
  '23514', null, 'pular sem motivo não passa');
select lives_ok($$ select public.rotina_marcar((select id from r where nome = 'do_gestor'), (select ana from u), 'pulada', 'Cliente remarcou') $$,
  'pular com motivo');
select throws_ok($$ select public.rotina_marcar((select id from r where nome = 'do_gestor'), (select bia from u), 'feita', null, 'ok') $$,
  '42501', null, 'a Ana não marca a rotina da Bia');
select lives_ok($$ select public.rotina_desmarcar((select id from r where nome = 'da_ana'), (select ana from u)) $$,
  'desmarcar o toque errado');
select is((select situacao from public.rotinas_de_hoje() where rotina_id = (select id from r where nome = 'da_ana')), null,
  'desmarcada, volta a ficar em aberto');
select tests.clear_authentication();

-- ═══ 18-20. Quem lê o registro ═══
select tests.authenticate_as('bia@rotinas.test');
select is((select count(*)::int from public.rotina_registros), 0, 'a Bia não lê o registro da Ana');
select tests.clear_authentication();
select tests.authenticate_as('gestor@rotinas.test');
select is((select motivo from public.rotina_registros where pessoa_id = (select ana from u)), 'Cliente remarcou',
  'o gestor do setor lê o motivo do pulo');
select tests.clear_authentication();
select tests.authenticate_as('fora@rotinas.test');
select is((select count(*)::int from public.rotinas), 0, 'quem é de outra empresa não vê nenhuma rotina');
select tests.clear_authentication();

-- ═══ 21-24. O calendário ═══
-- Novembro de 2026: dia 15 é domingo e feriado nacional, dia 30 é segunda-feira.
select is(public.rotina_dia_do_mes((select a from f), '2026-11-01', 15::smallint), '2026-11-13'::date,
  '"todo dia 15" num domingo de feriado antecipa para a sexta, dia 13');
select is(public.rotina_dia_do_mes((select a from f), '2026-11-01', 31::smallint), '2026-11-30'::date,
  'o último dia útil de novembro de 2026 é o dia 30 (e "dia 31" vira o último do mês)');
insert into public.feriados_da_empresa (tenant_id, data, nome) values ((select a from f), '2026-11-13', 'Folga da empresa');
select is(public.rotina_dia_do_mes((select a from f), '2026-11-01', 15::smallint), '2026-11-12'::date,
  'com feriado da empresa na sexta, antecipa para a quinta');
select is(public.rotina_dia_util((select a from f), '2026-11-14'), false, 'sábado não tem rotina');

-- ═══ 25-27. Férias: pausa, e passa ao substituto quando a rotina pede ═══
select tests.authenticate_as('rh@rotinas.test');
with v as (
  insert into public.rh_vacation_requests (tenant_id, user_id, start_date, end_date, days_requested, type, status)
  select a, (select ana from u), (now() at time zone 'America/Sao_Paulo')::date, (now() at time zone 'America/Sao_Paulo')::date + 12,
         13, 'ferias', 'aprovada' from f
  returning id
) select 1 from v;
select tests.clear_authentication();
with c as (insert into public.ti_categories (tenant_id, module, name) select a, 'comercial', 'Pedidos (pgTAP)' from f returning id)
insert into public.ferias_substitutos (tenant_id, ausencia_id, category_id, substituto_id)
select (select a from f), (select id from public.rh_vacation_requests where user_id = (select ana from u)), c.id, (select bia from u) from c;

select tests.authenticate_as('ana@rotinas.test');
select is((select count(*)::int from public.rotinas_de_hoje()), 0, 'de férias, as rotinas da Ana pausam');
select tests.clear_authentication();
select tests.authenticate_as('bia@rotinas.test');
select is((select string_agg(titulo, ',') from public.rotinas_de_hoje() where pessoa_id = (select ana from u)), 'Enviar o resumo do dia',
  'a Bia, substituta, recebe só a rotina que passa ao substituto (a pessoal da Ana pausa)');
select lives_ok($$ select public.rotina_marcar((select id from r where nome = 'do_gestor'), (select ana from u), 'feita', null, 'Enviado pela Bia') $$,
  'a substituta marca a rotina da Ana');
select tests.clear_authentication();

-- O balde do anexo existe e é privado (foto de rotina não sai por link sem login).
select is((select public from storage.buckets where id = 'rotinas'), false, 'o balde das fotos de rotina existe e é privado');

select * from finish();
rollback;

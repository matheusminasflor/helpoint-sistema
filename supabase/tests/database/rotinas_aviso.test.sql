-- Rotinas do dia, etapa 3 (2026-10-30, migration 20270212140000): o aviso 30 minutos antes do fim do expediente.
--
-- Prova: avisa quem tem rotina aberta, um aviso só por dia, dizendo quantas faltam; não avisa quem fez tudo; fora da
-- janela não avisa; e ninguém de fora chama a função (só o agendamento).
begin;
\ir _helpers.psql

select plan(7);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-rotinas-aviso', 'Rotinas Aviso', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@rotinasaviso.test', (select a from f)) as ana,
       tests.create_user('bia@rotinasaviso.test', (select a from f)) as bia;
select tests.grant_module(x, (select a from f), 'comercial') from (select ana x from u union all select bia from u) s;

-- O próximo dia útil (regra 10). Sem setor no perfil e sem Prazos cadastrados, o expediente é o padrão: 8h às 18h.
create temporary table hoje on commit drop as
select min(g::date) as d
  from generate_series((now() at time zone 'America/Sao_Paulo')::date, (now() at time zone 'America/Sao_Paulo')::date + 10, interval '1 day') g
 where public.rotina_dia_util((select a from f), g::date);
select set_config('rotinas.hoje', (select d from hoje)::text, true);
create temporary table r (nome text, id uuid) on commit drop;
grant select on f, u, hoje to authenticated;
grant select, insert on r to authenticated;

select tests.authenticate_as('ana@rotinasaviso.test');
with t as (insert into public.rotinas (setor, titulo, periodo, repeticao, pessoas)
           values ('comercial', 'Conferir pedidos', 'manha', 'dias_uteis', array[(select ana from u)]),
                  ('comercial', 'Enviar o resumo', 'fim_do_dia', 'dias_uteis', array[(select ana from u)]),
                  ('comercial', 'Ligar para clientes', 'tarde', 'dias_uteis', array[(select ana from u)]) returning id, titulo)
insert into r select titulo, id from t;
select public.rotina_marcar((select id from r where nome = 'Conferir pedidos'), (select ana from u), 'feita');
select tests.clear_authentication();
select tests.authenticate_as('bia@rotinasaviso.test');
with t as (insert into public.rotinas (setor, titulo, periodo, repeticao, pessoas)
           values ('comercial', 'Arquivar notas', 'tarde', 'dias_uteis', array[(select bia from u)]) returning id)
insert into r select 'da_bia', id from t;
select public.rotina_marcar((select id from r where nome = 'da_bia'), (select bia from u), 'feita');
select tests.clear_authentication();

-- ═══ 1. Fora da janela (10h) ninguém é avisado ═══
select is(public.rotinas_avisa_pendentes(((select d from hoje) + time '10:00') at time zone 'America/Sao_Paulo'), 0,
  'às 10h ninguém recebe aviso');

-- ═══ 2-5. Às 17h40, 20 minutos antes das 18h ═══
select is(public.rotinas_avisa_pendentes(((select d from hoje) + time '17:40') at time zone 'America/Sao_Paulo'), 1,
  'às 17h40 sai um aviso (só a Ana tem rotina aberta)');
select is((select title from public.notifications where user_id = (select ana from u) and reference_type = 'rotina'), 'Faltam 2 rotinas hoje',
  'o aviso diz quantas faltam');
select is((select message from public.notifications where user_id = (select ana from u) and reference_type = 'rotina'),
  'Ligar para clientes · Enviar o resumo. O expediente acaba em 30 minutos.', 'e quais, na ordem do dia');
select is((select count(*)::int from public.notifications where user_id = (select bia from u) and reference_type = 'rotina'), 0,
  'quem fez tudo não recebe aviso');

-- ═══ 6. Um aviso só por dia ═══
select is(public.rotinas_avisa_pendentes(((select d from hoje) + time '17:50') at time zone 'America/Sao_Paulo'), 0,
  'dez minutos depois não repete');

-- ═══ 7. Só o agendamento chama ═══
select tests.authenticate_as('ana@rotinasaviso.test');
select throws_ok($$ select public.rotinas_avisa_pendentes() $$, '42501', null, 'ninguém logado dispara o aviso');
select tests.clear_authentication();

select * from finish();
rollback;

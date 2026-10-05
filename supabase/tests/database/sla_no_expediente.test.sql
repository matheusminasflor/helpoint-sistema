-- O PRAZO (SLA) SÓ ANDA NO EXPEDIENTE (migration 20261203050000, decisão do dono 2026-10-04).
--
--   1-4   expediente 08-18: fim do dia passa para o dia seguinte; sexta passa para segunda; aberto
--         fora do expediente começa na abertura seguinte; aberto no sábado começa segunda;
--   5-7   feriados nacionais pulam: Finados (segunda), Consciência Negra (sexta, nacional desde a
--         Lei 14.759/2023) e Sexta-feira Santa (móvel, pela Páscoa);
--   8     os feriados móveis de 2026 caem nas datas certas;
--   9     feriado cadastrado pela empresa pula;
--   10-13 a regra do setor: Produção sem linha = 07-17; horário gravado vale; expediente em branco
--         com pausa desligada = corrido; pausa desligada com horário conta o sábado;
--   14    expediente com fim antes do início é recusado;
--   15    o chamado novo, aberto por quem pede com RETURNING (lição 11), ganha o prazo em dias úteis
--         do padrão semeado (média = 1200 minutos úteis = 2 dias de 10h);
--   16-17 só quem configura algum setor cadastra feriado (WITH CHECK de INSERT levanta 42501,
--         lição 12); o dono cadastra;
--   18-19 as portas (lição 14).
--
-- Datas FIXAS com fuso explícito (lições 9 e 10). 2026-10-02 é sexta; 2026-10-06, terça.
begin;
\ir _helpers.psql

select plan(19);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-sla-expediente', 'SLA Expediente', false) as tenant;
create temporary table u on commit drop as
select tests.create_user('pede@sla-exp.test', (select tenant from f)) as pede,
       tests.create_user('dono@sla-exp.test', (select tenant from f)) as dono;
select tests.grant_role((select dono from u), 'owner');
grant select on f, u to authenticated;

-- A soma com expediente 08-18, pausa no fim de semana, na empresa de teste.
create function pg_temp.soma(p_inicio timestamptz, p_min int) returns timestamptz language sql as $$
  select public.somar_minutos_uteis(p_inicio, p_min, '08:00', '18:00', false, (select tenant from f))
$$;

-- ═══ 1-4. O expediente. ═══
select is(pg_temp.soma('2026-10-06 17:00-03', 480), '2026-10-07 15:00-03'::timestamptz,
  'terca 17h + 8h uteis: 1h na terca, 7h na quarta -> quarta 15h');
select is(pg_temp.soma('2026-10-02 17:00-03', 480), '2026-10-05 15:00-03'::timestamptz,
  'sexta 17h + 8h uteis -> segunda 15h');
select is(pg_temp.soma('2026-10-06 20:00-03', 60), '2026-10-07 09:00-03'::timestamptz,
  'aberto as 20h comeca a contar no dia seguinte as 8h');
select is(pg_temp.soma('2026-10-03 10:00-03', 60), '2026-10-05 09:00-03'::timestamptz,
  'aberto no sabado comeca a contar na segunda as 8h');

-- ═══ 5-8. Feriados nacionais. ═══
select is(pg_temp.soma('2026-10-30 17:00-03', 480), '2026-11-03 15:00-03'::timestamptz,
  'Finados (segunda 02/11) nao conta: sexta 17h + 8h -> terca 15h');
select is(pg_temp.soma('2026-11-19 17:00-03', 480), '2026-11-23 15:00-03'::timestamptz,
  'Consciencia Negra (sexta 20/11) nao conta: quinta 17h + 8h -> segunda 15h');
select is(pg_temp.soma('2026-04-02 17:00-03', 480), '2026-04-06 15:00-03'::timestamptz,
  'Sexta-feira Santa (03/04/2026, pela Pascoa) nao conta');
select is(
  (select array_agg(data order by data) from public.feriados_nacionais(2026) where nome in ('Carnaval', 'Corpus Christi')),
  array['2026-02-16', '2026-02-17', '2026-06-04']::date[],
  'Carnaval e Corpus Christi de 2026 nas datas certas (Pascoa em 05/04)');

-- ═══ 9. Feriado da empresa. ═══
insert into public.feriados_da_empresa (tenant_id, data, nome)
values ((select tenant from f), '2026-10-07', 'Ponte da cidade');
select is(pg_temp.soma('2026-10-06 17:00-03', 480), '2026-10-08 15:00-03'::timestamptz,
  'feriado cadastrado pela empresa (quarta) nao conta: terca 17h + 8h -> quinta 15h');

-- ═══ 10-13. A regra do setor. ═══
select is(public.prazo_do_chamado((select tenant from f), 'producao', '2026-10-13 16:30-03', 120),
  '2026-10-14 08:30-03'::timestamptz,
  'Producao sem linha gravada usa 07-17: terca 16h30 + 2h -> quarta 08h30');

insert into public.sla_regras_do_setor (tenant_id, module, pausa_fim_de_semana, inicio_expediente, fim_expediente)
values ((select tenant from f), 'marketing', true,  '09:00', '12:00'),
       ((select tenant from f), 'expedicao', false, null,    null),
       ((select tenant from f), 'compras',   false, '08:00', '18:00');

select is(public.prazo_do_chamado((select tenant from f), 'marketing', '2026-10-13 11:00-03', 120),
  '2026-10-14 10:00-03'::timestamptz,
  'horario gravado pelo setor (09-12) vale: terca 11h + 2h -> quarta 10h');
select is(public.prazo_do_chamado((select tenant from f), 'expedicao', '2026-10-02 17:00-03', 480),
  '2026-10-03 01:00-03'::timestamptz,
  'expediente em branco e pausa desligada: conta o dia inteiro, todo dia');
select is(public.prazo_do_chamado((select tenant from f), 'compras', '2026-10-02 17:00-03', 480),
  '2026-10-03 15:00-03'::timestamptz,
  'pausa desligada com horario: o sabado conta no mesmo expediente');

-- ═══ 14. Fim antes do início. ═══
select throws_ok(
  format($$insert into public.sla_regras_do_setor (tenant_id, module, inicio_expediente, fim_expediente)
           values (%L, 'rh', '18:00', '08:00')$$, (select tenant from f)),
  '23514', null, 'expediente que termina antes de comecar e recusado');

-- ═══ 15. O chamado novo. ═══
-- RH sem linha = 08-18; a média semeada é 1200 minutos úteis. Terça 17h: 1h na terça, 10h na
-- quarta, 9h na quinta -> quinta 17h.
select tests.authenticate_as('pede@sla-exp.test');
create temporary table novo on commit drop as
with t as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, created_by, priority, status, created_at)
  values ((select tenant from f), 'rh', 'ferias', 'x', (select pede from u), (select pede from u), 'medium', 'open', '2026-10-13 17:00-03')
  returning sla_due_at
)
select sla_due_at from t;
select tests.clear_authentication();
select is((select sla_due_at from novo), '2026-10-15 17:00-03'::timestamptz,
  'chamado novo de prioridade media vence em 2 dias uteis (terca 17h -> quinta 17h)');

-- ═══ 16-17. Quem cadastra feriado. ═══
select tests.authenticate_as('pede@sla-exp.test');
select throws_ok(
  $$insert into public.feriados_da_empresa (tenant_id, data, nome)
    values ((select tenant from f), '2026-12-24', 'Vespera') returning id$$,
  '42501', null, 'quem nao configura nenhum setor nao cadastra feriado');
select tests.clear_authentication();

select tests.authenticate_as('dono@sla-exp.test');
select lives_ok(
  $$insert into public.feriados_da_empresa (tenant_id, data, nome)
    values ((select tenant from f), '2026-12-24', 'Vespera de Natal') returning id$$,
  'o dono cadastra o feriado da empresa');
select tests.clear_authentication();

-- ═══ 18-19. As portas. ═══
select ok(not has_function_privilege('anon', 'public.somar_minutos_uteis(timestamptz, integer, time, time, boolean, uuid)', 'execute'),
  'anon nao chama somar_minutos_uteis');
select ok(not has_function_privilege('anon', 'public.feriados_nacionais(integer)', 'execute'),
  'anon nao chama feriados_nacionais');

select * from finish();
rollback;

-- O PRAZO PARA NO ALMOÇO DE QUEM ATENDE (migration 20261205040000, decisão do dono 2026-10-04).
--
--   atende  tem almoço 12:00-13:00 no cadastro do RH
--   outro   sem almoço informado
--   Marketing sem linha de regra = expediente 08-18; prioridade alta do Marketing = 240 min úteis.
--   2026-10-13 é terça.
--
--   1     aberto às 10:00 já com o atendente que almoça 12-13: vence às 15:00 (o almoço não conta);
--   2     aberto às 10:00 sem atendente: vence às 14:00 (não é o almoço de ninguém);
--   3     atribuir o chamado a quem almoça recalcula: 15:00;
--   4     trocar para quem não tem almoço recalcula de volta: 14:00;
--   5     chamado resolvido não muda o prazo ao trocar o atendente;
--   6     o mesmo comando que muda o prazo na mão manda: a troca não recalcula por cima;
--   7     almoço que termina antes de começar é recusado;
--   8     o colaborador não muda o próprio almoço (UPDATE barrado = zero linhas, lição 12);
--   9-11  as portas novas não abrem para anon (lição 14);
--   12    prazo posto à mão sobrevive a uma troca de atendente depois (20261205060000).
begin;
\ir _helpers.psql

select plan(12);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-sla-almoco', 'SLA Almoco', false) as tenant;
create temporary table u on commit drop as
select tests.create_user('pede@sla-almoco.test',   (select tenant from f)) as pede,
       tests.create_user('atende@sla-almoco.test', (select tenant from f)) as atende,
       tests.create_user('outro@sla-almoco.test',  (select tenant from f)) as outro;
grant select on f, u to authenticated;

insert into public.rh_employee_profiles (tenant_id, user_id, full_name, inicio_almoco, fim_almoco)
values ((select tenant from f), (select atende from u), 'Atende', '12:00', '13:00'),
       ((select tenant from f), (select outro from u), 'Outro', null, null);

insert into public.sla_policies (tenant_id, module, name, priority, first_response_time, resolution_time)
values ((select tenant from f), 'marketing', 'MKT alto', 'high', 60, 240);

create temporary table ch on commit drop as
with t as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, priority, status, created_at, assigned_to)
  values ((select tenant from f), 'marketing', 'com atendente', 'x', (select pede from u), 'high', 'open', '2026-10-13 10:00-03', (select atende from u)),
         ((select tenant from f), 'marketing', 'sem atendente', 'x', (select pede from u), 'high', 'open', '2026-10-13 10:00-03', null),
         ((select tenant from f), 'marketing', 'resolvido',     'x', (select pede from u), 'high', 'open', '2026-10-13 10:00-03', null),
         ((select tenant from f), 'marketing', 'prazo na mao',  'x', (select pede from u), 'high', 'open', '2026-10-13 10:00-03', null)
  returning id, title
) select id, title from t;
create function pg_temp.prazo(p_titulo text) returns timestamptz language sql as $$
  select sla_due_at from public.tickets where id = (select id from ch where title = p_titulo)
$$;

-- ═══ 1-2. Na abertura. ═══
select is(pg_temp.prazo('com atendente'), '2026-10-13 15:00-03'::timestamptz,
  'aberto as 10h com quem almoca 12-13: 4h uteis vencem as 15h');
select is(pg_temp.prazo('sem atendente'), '2026-10-13 14:00-03'::timestamptz,
  'aberto as 10h sem atendente: vence as 14h, sem almoco');

-- ═══ 3-4. Trocar o atendente recalcula desde a abertura. ═══
update public.tickets set assigned_to = (select atende from u) where id = (select id from ch where title = 'sem atendente');
select is(pg_temp.prazo('sem atendente'), '2026-10-13 15:00-03'::timestamptz,
  'atribuir a quem almoca 12-13 recalcula: 15h');
update public.tickets set assigned_to = (select outro from u) where id = (select id from ch where title = 'com atendente');
select is(pg_temp.prazo('com atendente'), '2026-10-13 14:00-03'::timestamptz,
  'trocar para quem nao tem almoco recalcula: 14h');

-- ═══ 5. Resolvido não muda. ═══
update public.tickets set status = 'resolved', resolved_at = '2026-10-13 11:00-03' where id = (select id from ch where title = 'resolvido');
update public.tickets set assigned_to = (select atende from u) where id = (select id from ch where title = 'resolvido');
select is(pg_temp.prazo('resolvido'), '2026-10-13 14:00-03'::timestamptz,
  'chamado resolvido: trocar o atendente nao mexe no prazo');

-- ═══ 6. Quem muda o prazo no mesmo comando manda. ═══
update public.tickets set assigned_to = (select atende from u), sla_due_at = '2026-10-20 10:00-03'
 where id = (select id from ch where title = 'prazo na mao');
select is(pg_temp.prazo('prazo na mao'), '2026-10-20 10:00-03'::timestamptz,
  'prazo mudado no mesmo comando da troca fica como foi mandado');

-- ═══ 12. Prazo posto à mão sobrevive a uma troca DEPOIS (revisão de 2026-10-05, 20261205060000). ═══
-- O prazo de agora (20/10) não é o que a conta daria com o atendente atual: foi escolha de alguém.
update public.tickets set assigned_to = (select outro from u) where id = (select id from ch where title = 'prazo na mao');
select is(pg_temp.prazo('prazo na mao'), '2026-10-20 10:00-03'::timestamptz,
  'trocar o atendente depois nao apaga o prazo posto a mao');

-- ═══ 7. Almoço coerente. ═══
select throws_ok(
  format($$update public.rh_employee_profiles set inicio_almoco = '13:00', fim_almoco = '12:00' where user_id = %L$$,
         (select outro from u)),
  '23514', null, 'almoco que termina antes de comecar e recusado');

-- ═══ 8. O colaborador não muda o próprio almoço. ═══
select tests.authenticate_as('atende@sla-almoco.test');
update public.rh_employee_profiles set inicio_almoco = '14:00', fim_almoco = '15:00' where user_id = auth.uid();
select tests.clear_authentication();
select is((select inicio_almoco from public.rh_employee_profiles where user_id = (select atende from u)), '12:00'::time,
  'o colaborador nao muda o proprio almoco: quem preenche e o RH');

-- ═══ 9-11. As portas. ═══
select ok(not has_function_privilege('anon', 'public.somar_minutos_uteis(timestamptz, integer, time, time, boolean, uuid, time, time)', 'execute'),
  'anon nao chama a soma com almoco');
select ok(not has_function_privilege('anon', 'public.prazo_do_chamado(uuid, text, timestamptz, integer, uuid)', 'execute'),
  'anon nao chama o prazo com atendente');
select ok(not has_function_privilege('anon', 'public.prazo_padrao_do_chamado(uuid, text, text, timestamptz, uuid, timestamptz)', 'execute'),
  'anon nao chama o prazo-padrao');

select * from finish();
rollback;

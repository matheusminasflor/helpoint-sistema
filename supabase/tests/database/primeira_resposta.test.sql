-- A PRIMEIRA RESPOSTA É REGISTRADA E TEM PRAZO PRÓPRIO (migration 20261207010000, dono 2026-10-06).
--
--   atende  almoça 12:00-13:00 (cadastro do RH)
--   Marketing sem linha de regra = expediente 08-18; prioridade alta: 1ª resposta em 120 min úteis.
--   2026-10-13 é terça.
--
--   1     aberto terça 17:00: a 1ª resposta vence quarta 09:00 (1h na terça, 1h na quarta);
--   2     resposta pública do SOLICITANTE não conta como primeira resposta;
--   3     nota interna da equipe não conta;
--   4     resposta pública da equipe, como o PostgREST grava (RETURNING, lição 11), registra a hora;
--   5     a segunda resposta não sobrescreve a primeira;
--   6     sem resposta ainda, atribuir a quem almoça recalcula o prazo da resposta (11:00 + 2h = 14:00);
--   7     já respondido, trocar o atendente não mexe no prazo da resposta;
--   8-9   as portas novas fechadas (lição 14).
begin;
\ir _helpers.psql

select plan(9);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-primeira-resposta', 'Primeira resposta', false) as tenant;
create temporary table u on commit drop as
select tests.create_user('pede@primeira-resposta.test',   (select tenant from f)) as pede,
       tests.create_user('atende@primeira-resposta.test', (select tenant from f)) as atende,
       tests.create_user('outro@primeira-resposta.test',  (select tenant from f)) as outro;
grant select on f, u to authenticated;

insert into public.rh_employee_profiles (tenant_id, user_id, full_name, inicio_almoco, fim_almoco)
values ((select tenant from f), (select atende from u), 'Atende', '12:00', '13:00');

insert into public.sla_policies (tenant_id, module, name, priority, first_response_time, resolution_time)
values ((select tenant from f), 'marketing', 'MKT alto', 'high', 120, 480);

create temporary table ch on commit drop as
with t as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, priority, status, created_at, assigned_to)
  values ((select tenant from f), 'marketing', 'fim do dia', 'x', (select pede from u), 'high', 'open', '2026-10-13 17:00-03', (select atende from u)),
         ((select tenant from f), 'marketing', 'manha',      'x', (select pede from u), 'high', 'open', '2026-10-13 11:00-03', null)
  returning id, title
) select id, title from t;
grant select on ch to authenticated;

create function pg_temp.chamado(p_titulo text) returns public.tickets language sql as $$
  select * from public.tickets where id = (select id from ch where title = p_titulo)
$$;

-- ═══ 1. O prazo da resposta nasce em minutos úteis. ═══
select is((pg_temp.chamado('fim do dia')).first_response_due_at, '2026-10-14 09:00-03'::timestamptz,
  'aberto terca 17h com 2h uteis de resposta: vence quarta 9h');

-- ═══ 2. O solicitante responder não é a primeira resposta. ═══
select tests.authenticate_as('pede@primeira-resposta.test');
create temporary table do_solicitante on commit drop as
with c as (
  insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
  values ((select tenant from f), (select id from ch where title = 'fim do dia'), auth.uid(), 'Alguma novidade?', false)
  returning id
) select id from c;
select tests.clear_authentication();
select ok((pg_temp.chamado('fim do dia')).first_response_at is null,
  'resposta do solicitante nao conta como primeira resposta');

-- ═══ 3. Nota interna não é resposta. ═══
insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
values ((select tenant from f), (select id from ch where title = 'fim do dia'), (select atende from u), 'Vou ver amanha', true);
select ok((pg_temp.chamado('fim do dia')).first_response_at is null,
  'nota interna da equipe nao conta como primeira resposta');

-- ═══ 4. A resposta pública da equipe registra. ═══
select tests.authenticate_as('atende@primeira-resposta.test');
create temporary table resposta on commit drop as
with c as (
  insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
  values ((select tenant from f), (select id from ch where title = 'fim do dia'), auth.uid(), 'Ja estou vendo', false)
  returning created_at
) select created_at from c;
select tests.clear_authentication();
select is((pg_temp.chamado('fim do dia')).first_response_at, (select created_at from resposta),
  'resposta publica da equipe grava a hora da primeira resposta');

-- ═══ 5. A segunda não sobrescreve. ═══
insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal, created_at)
values ((select tenant from f), (select id from ch where title = 'fim do dia'), (select outro from u), 'Mais uma', false, '2026-10-20 10:00-03');
select is((pg_temp.chamado('fim do dia')).first_response_at, (select created_at from resposta),
  'a segunda resposta nao muda a primeira');

-- ═══ 6. Sem resposta, o prazo da resposta segue o almoço do atendente. ═══
update public.tickets set assigned_to = (select atende from u) where id = (select id from ch where title = 'manha');
select is((pg_temp.chamado('manha')).first_response_due_at, '2026-10-13 14:00-03'::timestamptz,
  'aberto 11h, atribuido a quem almoca 12-13: a resposta vence 14h');

-- ═══ 7. Respondido, a troca não mexe. ═══
update public.tickets set assigned_to = (select outro from u) where id = (select id from ch where title = 'fim do dia');
select is((pg_temp.chamado('fim do dia')).first_response_due_at, '2026-10-14 09:00-03'::timestamptz,
  'ja respondido: trocar o atendente nao mexe no prazo da resposta');

-- ═══ 8-9. As portas. ═══
select ok(not has_function_privilege('anon', 'public.prazo_da_primeira_resposta(uuid, text, text, timestamptz, uuid)', 'execute'),
  'anon nao chama o prazo da primeira resposta');
select ok(not has_function_privilege('authenticated', 'public.chamado_registra_primeira_resposta()', 'execute'),
  'ninguem logado chama a funcao do gatilho direto');

select * from finish();
rollback;

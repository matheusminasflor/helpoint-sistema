-- RESPONDER PÕE EM PENDENTE, E O PRAZO PAUSA ENQUANTO ESPERA O SOLICITANTE
-- (migration 20261210010000; decisões do dono, 2026-10-06).
--
--   Marketing sem linha de regra = expediente 08-18; ninguém almoça. 2026-10-13 é terça.
--
--   1-2   resposta pública da equipe, gravada como o PostgREST grava (RETURNING, lição 11):
--         o chamado vira Pendente e o solicitante recebe UM aviso, "respondido e aguarda";
--   3-4   o solicitante responde (como ele, papel authenticated, com RETURNING — lição 8:
--         testar a corrente, não o UPDATE): volta para Em andamento, sem aviso de "alterado";
--   5     "Continuo trabalhando nele" mantém o status;
--   6     nota interna não muda o status;
--   7     entrar em Pendente marca desde quando;
--   8     contar minutos úteis atravessa a noite: terça 17:00 → quarta 09:00 = 2h úteis;
--   9     empurrar o vencimento 2h úteis a partir de terça 17:00 dá quarta 10:00;
--   10-11 sair de Pendente empurra o prazo pelos minutos úteis parados e soma em minutos_pausados;
--   12    chamado Pendente com prazo vencido não gera aviso de vencido;
--   13-14 as portas novas fechadas (lição 14).
begin;
\ir _helpers.psql

select plan(14);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-pendente-pausa', 'Pendente pausa', false) as tenant;
create temporary table u on commit drop as
select tests.create_user('pede@pendente.test',   (select tenant from f)) as pede,
       tests.create_user('atende@pendente.test', (select tenant from f)) as atende;
grant select on f, u to authenticated;

insert into public.sla_policies (tenant_id, module, name, priority, first_response_time, resolution_time)
values ((select tenant from f), 'marketing', 'MKT alto', 'high', 120, 480);

create temporary table ch on commit drop as
with t as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, priority, status, created_at, assigned_to)
  values ((select tenant from f), 'marketing', 'conversa', 'x', (select pede from u), 'high', 'in_progress', '2026-10-13 09:00-03', (select atende from u)),
         ((select tenant from f), 'marketing', 'pausa',    'x', (select pede from u), 'high', 'in_progress', '2026-10-13 09:00-03', (select atende from u)),
         ((select tenant from f), 'marketing', 'vencido',  'x', (select pede from u), 'high', 'in_progress', '2020-01-06 09:00-03', (select atende from u))
  returning id, title
) select id, title from t;
grant select on ch to authenticated;

create function pg_temp.chamado(p_titulo text) returns public.tickets language sql as $$
  select * from public.tickets where id = (select id from ch where title = p_titulo)
$$;

-- ═══ 1-2. A equipe responde em público → Pendente, e o solicitante é avisado uma vez. ═══
select tests.authenticate_as('atende@pendente.test');
create temporary table r1 on commit drop as
with c as (
  insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
  values ((select tenant from f), (select id from ch where title = 'conversa'), auth.uid(), 'Pode me mandar o arquivo?', false)
  returning id
) select id from c;
select tests.clear_authentication();

select is((pg_temp.chamado('conversa')).status::text, 'waiting_user',
  'resposta publica da equipe poe o chamado em Pendente');
select is(
  (select string_agg(n.type::text || ':' || n.title, ' | ')
     from public.notifications n
    where n.reference_id = (select id from ch where title = 'conversa') and n.user_id = (select pede from u)
      and n.type in ('ticket_reply', 'ticket_waiting', 'ticket_updated')),
  'ticket_reply:Chamado #' || (pg_temp.chamado('conversa')).ticket_number || ' foi respondido e aguarda seu retorno.',
  'o solicitante recebe UM aviso, "respondido e aguarda seu retorno" — a troca de status nao gera outro');

-- ═══ 3-4. O solicitante responde → volta para Em andamento, sem aviso de "alterado". ═══
select tests.authenticate_as('pede@pendente.test');
create temporary table r2 on commit drop as
with c as (
  insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
  values ((select tenant from f), (select id from ch where title = 'conversa'), auth.uid(), 'Segue o arquivo', false)
  returning id
) select id from c;
select tests.clear_authentication();

select is((pg_temp.chamado('conversa')).status::text, 'in_progress',
  'o solicitante respondeu (como ele, pelo PostgREST): volta para Em andamento');
select is(
  (select count(*)::int from public.notifications
    where reference_id = (select id from ch where title = 'conversa') and type in ('ticket_updated', 'ticket_waiting')),
  0, 'as trocas de status feitas pela resposta nao geram aviso proprio');

-- ═══ 5. "Continuo trabalhando nele" mantém Em andamento. ═══
select tests.authenticate_as('atende@pendente.test');
create temporary table r3 on commit drop as
with c as (
  insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal, mantem_status)
  values ((select tenant from f), (select id from ch where title = 'conversa'), auth.uid(), 'Recebi, ja estou vendo', false, true)
  returning id
) select id from c;
select tests.clear_authentication();

-- ═══ 6. Nota interna não muda nada. (Gravada pelo papel do runner: a nota interna pede caixinha
-- de perfil, que tem teste próprio — `chamado_obedece_o_perfil`.) ═══
create temporary table r4 on commit drop as
with c as (
  insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
  values ((select tenant from f), (select id from ch where title = 'conversa'), (select atende from u), 'falta o logo', true)
  returning id
) select id from c;

select is((pg_temp.chamado('conversa')).status::text, 'in_progress',
  '"Continuo trabalhando nele" e a nota interna mantem Em andamento');
select is(
  (select count(*)::int from public.ticket_comments where id in ((select id from r3), (select id from r4))),
  2, 'as duas mensagens foram gravadas (nao foram barradas)');

-- ═══ 7. Entrar em Pendente marca desde quando. ═══
update public.tickets set status = 'waiting_user' where id = (select id from ch where title = 'pausa');
select ok((pg_temp.chamado('pausa')).pendente_desde is not null, 'entrar em Pendente grava pendente_desde');

-- ═══ 8-9. O relógio útil atravessa a noite. ═══
select is(public.minutos_uteis_do_chamado((select tenant from f), 'marketing',
            '2026-10-13 17:00-03', '2026-10-14 09:00-03', null),
  120, 'terca 17h ate quarta 9h sao 2h uteis (1h na terca, 1h na quarta)');
select is(public.prazo_do_chamado((select tenant from f), 'marketing', '2026-10-13 17:00-03', 120, null),
  '2026-10-14 09:00-03'::timestamptz, 'vencimento terca 17h + 2h uteis de pausa = quarta 9h');

-- ═══ 10-11. Sair de Pendente empurra o prazo pelo tempo útil parado. ═══
-- O relógio da pausa é o de verdade (now()); o teste fixa o começo da pausa num passado com
-- horas úteis garantidas e confere a ligação com a mesma conta que o gatilho faz.
update public.tickets set pendente_desde = now() - interval '30 days', sla_due_at = '2026-10-13 17:00-03'
 where id = (select id from ch where title = 'pausa');
create temporary table esperado on commit drop as
select public.minutos_uteis_do_chamado((select tenant from f), 'marketing', now() - interval '30 days', now(),
                                       (select atende from u)) as minutos;
update public.tickets set status = 'in_progress' where id = (select id from ch where title = 'pausa');
select is((pg_temp.chamado('pausa')).sla_due_at,
  public.prazo_do_chamado((select tenant from f), 'marketing', '2026-10-13 17:00-03',
                          (select minutos from esperado), (select atende from u)),
  'saiu de Pendente: o vencimento anda o mesmo tempo util que ficou parado');
select is((pg_temp.chamado('pausa')).minutos_pausados::text || '|' || ((pg_temp.chamado('pausa')).pendente_desde is null)::text,
  (select minutos from esperado)::text || '|true',
  'a pausa soma em minutos_pausados e a marca de inicio se apaga');

-- ═══ 12. Pendente não vence. ═══
update public.tickets set status = 'waiting_user' where id = (select id from ch where title = 'vencido');
select is(public.avisar_prazo_vencido((select id from ch where title = 'vencido')), 0,
  'chamado Pendente com prazo vencido nao gera aviso de vencido');

-- ═══ 13-14. As portas. ═══
select ok(not has_function_privilege('anon', 'public.minutos_uteis_do_chamado(uuid, text, timestamptz, timestamptz, uuid)', 'execute'),
  'anon nao chama a contagem de minutos uteis');
select ok(not has_function_privilege('authenticated', 'public.chamado_status_pela_resposta()', 'execute'),
  'ninguem logado chama a funcao do gatilho direto');

select * from finish();
rollback;

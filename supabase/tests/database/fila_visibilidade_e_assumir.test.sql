-- QUEM VÊ A FILA E A 1ª RESPOSTA QUE ASSUME (migration 20261213010000; dono, 2026-10-06).
--
--   Comercial. op1 e op2 são Operadores SEM "Ver os chamados do setor"; gestor tem a caixinha.
--   A = do op1, B = do op2, C = sem atendente, D = aberto pelo solicitante (com RETURNING).
--
--   1     o operador sem a caixinha vê os seus e os sem atendente — não o do colega;
--   2     e não lê a conversa do chamado do colega;
--   3     o gestor (com a caixinha) vê o setor inteiro;
--   4     abrir chamado continua funcionando: insert com RETURNING por quem pede (lição 11);
--   5     `pode_ver_chamado` (avisos/Lyra) segue a mesma regra;
--   6-7   resposta pública do operador num chamado SEM atendente o assume (como ele, pelo PostgREST,
--         com RETURNING — lição 8: a corrente, não o UPDATE); e o solicitante não recebe
--         "atribuído" por cima do "respondido";
--   8     resposta num chamado COM atendente não o tira de quem está;
--   9     nota interna não assume;
--   10    resposta do solicitante não assume;
--   11-12 as portas novas (lição 14).
begin;
\ir _helpers.psql

select plan(12);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-fila-visibilidade', 'Fila visibilidade', false) as tenant;
create temporary table u on commit drop as
select tests.create_user('pede@fila.test',   (select tenant from f)) as pede,
       tests.create_user('op1@fila.test',    (select tenant from f)) as op1,
       tests.create_user('op2@fila.test',    (select tenant from f)) as op2,
       tests.create_user('gestor@fila.test', (select tenant from f)) as gestor;
grant select on f, u to authenticated;

-- Operador do Comercial desta empresa: atende e assume, mas NÃO vê o setor inteiro.
update public.access_profiles
   set permissions = jsonb_set(jsonb_set(permissions, '{tickets,view_all}', 'false'::jsonb, true),
                               '{tickets,assume}', 'true'::jsonb, true)
 where tenant_id = (select tenant from f) and department = 'comercial' and name = 'Operador';
update public.access_profiles
   set permissions = jsonb_set(permissions, '{tickets,view_all}', 'true'::jsonb, true)
 where tenant_id = (select tenant from f) and department = 'comercial' and name = 'Gestor';

select tests.grant_module((select op1 from u), (select tenant from f), 'comercial');
select tests.grant_module((select op2 from u), (select tenant from f), 'comercial');
select tests.grant_module((select gestor from u), (select tenant from f), 'comercial');
select tests.grant_profile((select op1 from u), (select tenant from f), 'comercial', 'Operador');
select tests.grant_profile((select op2 from u), (select tenant from f), 'comercial', 'Operador');
select tests.grant_profile((select gestor from u), (select tenant from f), 'comercial', 'Gestor');

create temporary table ch on commit drop as
with t as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, priority, status, assigned_to)
  values ((select tenant from f), 'comercial', 'A', 'x', (select pede from u), 'medium', 'in_progress', (select op1 from u)),
         ((select tenant from f), 'comercial', 'B', 'x', (select pede from u), 'medium', 'in_progress', (select op2 from u)),
         ((select tenant from f), 'comercial', 'C', 'x', (select pede from u), 'medium', 'open', null)
  returning id, title
) select id, title from t;
grant select, insert on ch to authenticated;

insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
values ((select tenant from f), (select id from ch where title = 'B'), (select op2 from u), 'conversa do B', false);

-- ═══ 1-2. O operador sem a caixinha. ═══
select tests.authenticate_as('op1@fila.test');
select is((select string_agg(t.title, ',' order by t.title) from public.tickets t where t.module = 'comercial'),
  'A,C', 'operador sem "Ver os chamados do setor" ve os seus e os sem atendente — nao o do colega');
select is((select count(*)::int from public.ticket_comments c where c.ticket_id = (select id from ch where title = 'B')),
  0, 'e nao le a conversa do chamado do colega');
select tests.clear_authentication();

-- ═══ 3. O gestor. ═══
select tests.authenticate_as('gestor@fila.test');
select is((select string_agg(t.title, ',' order by t.title) from public.tickets t where t.module = 'comercial'),
  'A,B,C', 'com a caixinha, o setor inteiro');
select tests.clear_authentication();

-- ═══ 4. Abrir chamado, como a tela abre. ═══
select tests.authenticate_as('pede@fila.test');
select lives_ok(
  $$with n as (
      insert into public.tickets (tenant_id, module, title, description, requester_id, priority)
      values ((select tenant from f), 'comercial', 'D', 'x', auth.uid(), 'medium')
      returning id, title
    ) insert into ch (id, title) select id, title from n$$,
  'quem pede abre o chamado com RETURNING (licao 11)');
select tests.clear_authentication();

-- ═══ 5. A mesma regra para avisos e Lyra. ═══
select is(
  (select array[public.pode_ver_chamado((select op1 from u), (select tenant from f), 'comercial', (select pede from u), null),
                public.pode_ver_chamado((select op1 from u), (select tenant from f), 'comercial', (select pede from u), (select op2 from u))]),
  array[true, false], 'pode_ver_chamado: sem atendente sim, do colega nao');

-- ═══ 6-7. A resposta pública assume o chamado sem atendente. ═══
select tests.authenticate_as('op1@fila.test');
create temporary table r1 on commit drop as
with c as (
  insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
  values ((select tenant from f), (select id from ch where title = 'C'), auth.uid(), 'Ja vejo isso', false)
  returning id
) select id from c;
select tests.clear_authentication();

select is(
  (select assigned_to::text || '|' || status::text from public.tickets where id = (select id from ch where title = 'C')),
  (select op1 from u)::text || '|waiting_user',
  'a 1a resposta publica de quem pode atender assume o chamado sem atendente (e poe Pendente)');
select is(
  (select count(*)::int from public.notifications
    where reference_id = (select id from ch where title = 'C') and user_id = (select pede from u)
      and type in ('ticket_assigned', 'ticket_updated')),
  0, 'o solicitante nao recebe "atribuido" por cima do "respondido"');

-- ═══ 8. Com atendente, responder não tira. ═══
select tests.authenticate_as('op2@fila.test');
-- op2 nao ve o A (e do op1); responde no C, que agora e do op1: tambem nao pode tirar.
select lives_ok(
  $$insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
    values ((select tenant from f), (select id from ch where title = 'C'), auth.uid(), 'oi', false)$$,
  'outro operador responde num chamado ja atribuido');
select tests.clear_authentication();
-- (a asserção acima só prova que não quebrou; esta prova que não mudou de mãos)
select is((select assigned_to from public.tickets where id = (select id from ch where title = 'C')), (select op1 from u),
  'com atendente, responder nao tira o chamado de quem esta');

-- ═══ 9-10. Nota interna e solicitante não assumem. ═══
select tests.authenticate_as('op2@fila.test');
insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
values ((select tenant from f), (select id from ch where title = 'D'), auth.uid(), 'nota', true);
select tests.clear_authentication();
select tests.authenticate_as('pede@fila.test');
insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
values ((select tenant from f), (select id from ch where title = 'D'), auth.uid(), 'mais detalhes', false);
select tests.clear_authentication();
select is((select assigned_to from public.tickets where id = (select id from ch where title = 'D')), null::uuid,
  'nota interna e resposta do solicitante nao assumem');

-- ═══ 11-12. As portas (lição 14). ═══
select ok(not has_function_privilege('anon', 'public.modulos_de_chamado_que_atendo()', 'execute'),
  'anon nao chama modulos_de_chamado_que_atendo');
select ok(not has_function_privilege('authenticated', 'public.modulos_de_chamado_que_atendo_de(uuid)', 'execute'),
  'nem quem esta logado pergunta pelos setores de outra pessoa');

select * from finish();
rollback;

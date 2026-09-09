-- Leva L2 (Fase 3): motor de automação, regras simples (migration 20260909010000).
--
-- "Quando X → então Y" vive no banco. Isto prova o que o dono decidiu em
-- 2026-09-08: os quatro gatilhos, as cinco ações, quem pode editar, e que
-- uma regra não dispara outra em cadeia infinita.
--
-- Rode com:  npx supabase test db --linked   (precisa do Docker Desktop de pé)

begin;
\ir _helpers.psql

select plan(16);

-- ───────────────────────────────────────────────────────────────────────────
-- Fixtures
-- ───────────────────────────────────────────────────────────────────────────
create temporary table f on commit drop as
select tests.create_tenant('pgtap-automacao', 'Automação') as tenant;

create temporary table u on commit drop as
select tests.create_user('gerente@pgtap.test',     (select tenant from f)) as gerente,
       tests.create_user('tecnico@pgtap.test',     (select tenant from f)) as tecnico,
       tests.create_user('solicitante@pgtap.test', (select tenant from f)) as solicitante,
       tests.create_user('comum@pgtap.test',       (select tenant from f)) as comum;

select tests.grant_role((select gerente from u), 'manager');
select tests.grant_module((select tecnico from u), (select tenant from f), 'ti');

create temporary table s on commit drop as
select gen_random_uuid() as cat_impressora, gen_random_uuid() as t1, gen_random_uuid() as t2;

insert into public.ti_categories (id, tenant_id, module, name)
select cat_impressora, tenant, 'tickets', 'Impressora' from s, f;

grant select on f, u, s to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- Quem pode escrever: gerente sim, usuário comum não (RLS)
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('comum@pgtap.test');
select throws_ok(
  $$ insert into public.automation_rules (tenant_id, module, name, trigger_kind, action_kind, action_config)
     select tenant, 'tickets', 'nao pode', 'ticket_created', 'notify', '{"team_module":"ti"}' from f $$,
  '42501',
  null,
  'usuario comum nao cria regra'
);
select tests.clear_authentication();

select tests.authenticate_as('gerente@pgtap.test');
insert into public.automation_rules (tenant_id, module, name, trigger_kind, trigger_config, action_kind, action_config, created_by)
select tenant, 'tickets', 'Impressora vai para o tecnico', 'ticket_created',
       jsonb_build_object('category_id', cat_impressora), 'assign', jsonb_build_object('user_id', tecnico), gerente
  from f, s, u;
select is(
  (select count(*)::int from public.automation_rules where name = 'Impressora vai para o tecnico'),
  1,
  'gerente cria regra'
);
select tests.clear_authentication();

-- As demais regras entram pelo runner (fixture), não é o que se prova aqui.
insert into public.automation_rules (tenant_id, module, name, trigger_kind, trigger_config, action_kind, action_config, created_by)
select tenant, 'tickets', 'Critico avisa o gerente', 'ticket_created', '{"priority":"critical"}',
       'notify', jsonb_build_object('user_id', gerente, 'title', 'Critico #{numero}', 'message', '{titulo}'), gerente from f, u
union all
select tenant, 'tickets', 'Resolvido cria tarefa', 'ticket_status_changed', '{"status":"resolved"}',
       'create_task', '{"title":"Conferir #{numero}","due_in_days":2}', gerente from f, u
union all
select tenant, 'tickets', 'Aguardando peca sobe prioridade', 'ticket_status_changed', '{"status":"waiting_parts"}',
       'set_priority', '{"priority":"high"}', gerente from f, u
union all
select tenant, 'tickets', 'TI aberto abre RH', 'ticket_created', '{}',
       'create_ticket', '{"module":"rh","title":"Espelho de {titulo}"}', gerente from f, u
union all
select tenant, 'rh', 'RH aberto abre TI', 'ticket_created', '{}',
       'create_ticket', '{"module":"tickets","title":"Volta de {titulo}"}', gerente from f, u
union all
select tenant, 'tickets', 'Regra mal configurada', 'ticket_created', '{}',
       'notify', '{}', gerente from f, u
union all
select tenant, 'tickets', 'Bom dia', 'schedule', '{"every":"day","time":"00:01"}',
       'notify', '{"team_module":"ti","message":"Bom dia, equipe"}', gerente from f, u
union all
select tenant, 'tickets', 'Prazo estourado avisa gerente', 'ticket_deadline_expired', '{}',
       'notify', jsonb_build_object('user_id', gerente, 'message', 'Estourou #{numero}'), gerente from f, u;

-- Sem chamado não há o que atribuir: o banco recusa a combinação.
select throws_ok(
  $$ insert into public.automation_rules (tenant_id, module, name, trigger_kind, trigger_config, action_kind, action_config)
     select tenant, 'tickets', 'invalida', 'schedule', '{"every":"day","time":"08:00"}', 'assign', '{}' from f $$,
  '23514',
  null,
  'regra agendada nao pode atribuir chamado'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Chamado aberto: atribui por categoria, avisa por prioridade, abre espelho —
-- e o espelho NÃO dispara a regra de volta.
-- ───────────────────────────────────────────────────────────────────────────
insert into public.tickets (id, tenant_id, module, title, description, priority, status, created_by, requester_id, category_id)
select t1, tenant, 'tickets', 'Impressora travou', 'x', 'critical', 'open', solicitante, solicitante, cat_impressora from s, f, u;

select is(
  (select assigned_to from public.tickets where id = (select t1 from s)),
  (select tecnico from u),
  'chamado da categoria Impressora foi atribuido ao tecnico'
);

select is(
  (select count(*)::int from public.notifications
    where type = 'ticket_assigned' and reference_id = (select t1 from s) and user_id = (select tecnico from u)),
  1,
  'e o tecnico foi avisado da atribuicao'
);

select is(
  (select title || ' | ' || message from public.notifications
    where type = 'automation' and reference_id = (select t1 from s) and user_id = (select gerente from u)),
  'Critico #' || (select ticket_number from public.tickets where id = (select t1 from s)) || ' | Impressora travou',
  'critico avisou o gerente, com {numero} e {titulo} trocados'
);

select is(
  (select array_agg(module || ':' || title order by module) from public.tickets
    where tenant_id = (select tenant from f) and id <> (select t1 from s)),
  array['rh:Espelho de Impressora travou'],
  'abriu o espelho no RH — e o espelho nao abriu outro na TI (cadeia cortada)'
);

select is(
  (select last_error from public.automation_rules where name = 'Regra mal configurada'),
  'a acao "avisar" precisa de uma pessoa ou de uma equipe',
  'regra mal configurada registra o erro em portugues e nao trava o chamado'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Mudança de status: prioridade e tarefa; repetir o status não repete a ação
-- ───────────────────────────────────────────────────────────────────────────
update public.tickets set status = 'waiting_parts' where id = (select t1 from s);
select is(
  (select priority::text from public.tickets where id = (select t1 from s)),
  'high',
  'aguardando peca subiu a prioridade para alta'
);

update public.tickets set status = 'resolved' where id = (select t1 from s);
select is(
  (select user_id from public.tasks where source_type = 'automation'
     and title = 'Conferir #' || (select ticket_number from public.tickets where id = (select t1 from s))),
  (select tecnico from u),
  'resolvido criou a tarefa para quem estava atendendo'
);

update public.tickets set status = 'resolved' where id = (select t1 from s);
select is(
  (select run_count from public.automation_rules where name = 'Resolvido cria tarefa'),
  1,
  'gravar o mesmo status de novo nao dispara de novo'
);

-- ───────────────────────────────────────────────────────────────────────────
-- O relógio: agendada (00:01 já passou) e prazo estourado — uma vez só
-- ───────────────────────────────────────────────────────────────────────────
insert into public.tickets (id, tenant_id, module, title, description, priority, status, created_by, requester_id, due_date)
select t2, tenant, 'tickets', 'Atrasado', 'x', 'low', 'open', solicitante, solicitante, now() - interval '1 hour' from s, f, u;

select is(
  public.run_automations_tick(),
  '{"deadline": 1, "scheduled": 1}'::jsonb,
  'primeiro tick: a agendada roda e o prazo estourado dispara para o chamado atrasado'
);

select is(
  (select array_agg(distinct user_id) from public.notifications
    where type = 'automation' and message = 'Bom dia, equipe'),
  (select array[tecnico] from u),
  'bom dia foi para quem tem o modulo TI'
);

select is(
  (select message from public.notifications
    where type = 'automation' and reference_id = (select t2 from s)),
  'Estourou #' || (select ticket_number from public.tickets where id = (select t2 from s)),
  'prazo estourado avisou o gerente'
);

select is(
  public.run_automations_tick(),
  '{"deadline": 0, "scheduled": 0}'::jsonb,
  'segundo tick: nada roda de novo'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Regra inativa não dispara
-- ───────────────────────────────────────────────────────────────────────────
update public.automation_rules set is_active = false where name = 'Critico avisa o gerente';
insert into public.tickets (tenant_id, module, title, description, priority, status, created_by, requester_id)
select tenant, 'tickets', 'Outro critico', 'x', 'critical', 'open', solicitante, solicitante from f, u;

select is(
  (select count(*)::int from public.notifications where type = 'automation' and message = 'Outro critico'),
  0,
  'regra desligada nao avisa'
);

select * from finish();
rollback;

-- Correções dos avisos do chamado (migration 20261122020000), achadas na revisão de 2026-10-02:
-- mencionados recebem tudo, nota interna avisa o lado de dentro, "Transferir" de um atendente
-- para outro é "transferido", compra decidida é um aviso só, e a fila de e-mail entrega o tipo.
--
--   sol    solicitante, sem módulo
--   tec    TI, Operador — atende
--   men    TI, Operador — mencionado no chamado
--   outro  TI, Operador — recebe a transferência
-- Quem age: `request.jwt.claims` (o autor não recebe o próprio aviso), como em
-- `chamado_avisa_as_movimentacoes`.
begin;
\ir _helpers.psql

select plan(8);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-avisos-correcoes', 'Avisos correcoes') as tenant;
create temporary table u on commit drop as
select tests.create_user('sol@avcor.test',   (select tenant from f)) as sol,
       tests.create_user('tec@avcor.test',   (select tenant from f)) as tec,
       tests.create_user('men@avcor.test',   (select tenant from f)) as men,
       tests.create_user('outro@avcor.test', (select tenant from f)) as outro;
select tests.grant_module(x, (select tenant from f), 'ti') from (select tec x from u union all select men from u union all select outro from u) s;
select tests.grant_profile(x, (select tenant from f), 'ti', 'Operador') from (select tec x from u union all select men from u union all select outro from u) s;

create temporary table s on commit drop as select gen_random_uuid() as ticket, gen_random_uuid() as compra;

create function tests.como(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user)::text, true);
$$;
create function tests.avisados(p_ref uuid, p_type public.notification_type) returns text language sql as $$
  select coalesce(string_agg(distinct au.email::text, ',' order by au.email::text), 'ninguem')
    from public.notifications n join auth.users au on au.id = n.user_id
   where n.reference_id = p_ref and n.type = p_type;
$$;

select tests.como((select sol from u));
insert into public.tickets (id, tenant_id, module, title, description, priority, status, created_by, requester_id)
select ticket, tenant, 'tickets', 'Impressora', 'x', 'medium', 'open', sol, sol from s, f, u;
select tests.como((select tec from u));
update public.tickets set assigned_to = (select tec from u), status = 'in_progress' where id = (select ticket from s);
insert into public.ticket_mentions (tenant_id, ticket_id, mentioned_user_id, mentioned_by)
select tenant, ticket, men, tec from s, f, u;

-- ═══ 1. O mencionado recebe também a alteração, não só a resposta. ═══
update public.tickets set priority = 'high' where id = (select ticket from s);
select is(tests.avisados((select ticket from s), 'ticket_updated'), 'men@avcor.test,sol@avcor.test',
  'alterado: solicitante e mencionado');

-- ═══ 2. Nota interna: o lado de dentro sim, o solicitante nunca. ═══
insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
select tenant, ticket, tec, 'so entre nos', true from s, f, u;
select is((select string_agg(au.email::text, ',') from public.notifications n join auth.users au on au.id = n.user_id
            where n.reference_id = (select ticket from s) and n.type = 'ticket_reply' and n.message like '%so entre nos'),
  'men@avcor.test', 'nota interna avisa o mencionado (o atendente e quem escreveu) e nunca o solicitante');

-- ═══ 3-4. Transferir de um atendente para outro é "transferido". ═══
update public.tickets set assigned_to = (select outro from u) where id = (select ticket from s);
select is(tests.avisados((select ticket from s), 'ticket_transferred'), 'men@avcor.test,outro@avcor.test,sol@avcor.test',
  'transferido: o novo atendente, o solicitante e o mencionado');
select is(
  (select string_agg(au.email::text || '=' || n.email_sent::text, ',' order by au.email::text)
     from public.notifications n join auth.users au on au.id = n.user_id
    where n.reference_id = (select ticket from s) and n.type = 'ticket_transferred'),
  'men@avcor.test=true,outro@avcor.test=false,sol@avcor.test=true',
  'so o novo atendente ganha e-mail ("transferido para voce")');

-- ═══ 5. A fila de e-mail entrega o tipo, para o e-mail ter a frase do dono. ═══
select set_config('request.jwt.claims', '', true);
select is(
  (select tipos from public.chamado_emails_pendentes(50, '0 seconds')
    where user_id = (select outro from u) and ticket_id = (select ticket from s)),
  array['ticket_transferred'], 'a fila traz o tipo de cada aviso');

-- ═══ 6-7. Compra aprovada: um aviso só, o da decisão. ═══
select tests.como((select sol from u));
insert into public.tickets (id, tenant_id, module, title, description, priority, status, created_by, requester_id)
select compra, tenant, 'compras', 'Monitor', 'x', 'medium', 'open', sol, sol from s, f, u;
select tests.como((select tec from u));
update public.tickets set status = 'in_progress' where id = (select compra from s);
select is(
  (select string_agg(type::text || ':' || title, ',') from public.notifications
    where reference_id = (select compra from s) and user_id = (select sol from u)),
  'purchase_decided:A compra do chamado #' || (select ticket_number from public.tickets where id = (select compra from s)) || ' foi aprovada.',
  'compra aprovada: um aviso so, o da decisao (antes vinham dois)');
update public.tickets set status = 'rejected', resolution_notes = 'sem verba' where id = (select compra from s);
select is(
  (select message from public.notifications
    where reference_id = (select compra from s) and user_id = (select sol from u) and title like '%reprovada.'),
  'sem verba', 'compra reprovada leva o motivo');

-- ═══ 8. Ninguém de fora fabrica o mencionado: a função não abre para quem está logado. ═══
select ok(not has_function_privilege('authenticated', 'public.mencionados_do_chamado(uuid)', 'execute'),
  'mencionados_do_chamado so roda por dentro');

select * from finish();
rollback;

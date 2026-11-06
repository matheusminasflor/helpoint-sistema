-- QUEM ABRIU ENCERRA O CHAMADO (migration 20270212500000; dono, 2026-11-06).
--   1-3  cancelar exige o motivo, registra na conversa e avisa o atendente
--   4-5  resolver depois da resposta da equipe conta como resolvido
--   6    resolver sem resposta termina cancelado: não conta para ninguém
--  13    atendente escolhido na abertura não é resposta: também termina cancelado
--  14    comentário interno não é resposta
--   7    sem atendente, a equipe do setor não recebe o registro
--   8    outra pessoa não encerra
--   9    item obrigatório do checklist segura o "resolvido"
--  10    chamado de compra segue a compra
--  11    chamado encerrado não encerra de novo
--  12    a função não abre para anon
begin;
\ir _helpers.psql

select plan(14);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-quem-abriu', 'Quem Abriu', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@quemabriu.test',  (select a from f)) as ana,
       tests.create_user('yuri@quemabriu.test', (select a from f)) as yuri,
       tests.create_user('bia@quemabriu.test',  (select a from f)) as bia;
select tests.grant_module((select yuri from u), (select a from f), 'ti');
select tests.grant_profile((select yuri from u), (select a from f), 'ti', 'Operador');
grant select on f, u to authenticated;

create temporary table c on commit drop as
with t as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, created_by, priority, status, assigned_to, first_response_at)
  select a, v.modulo, v.nome, 'x', (select ana from u), (select ana from u), 'medium', v.situacao::public.ticket_status,
         case when v.com_atendente then (select yuri from u) end, case when v.respondido then now() end
    from f, (values ('cancela', 'tickets', 'in_progress', true, true),
                    ('resolve', 'tickets', 'in_progress', true, true),
                    ('sem_resposta', 'tickets', 'in_progress', true, false),
                    ('escolhido', 'tickets', 'in_progress', true, true),
                    ('interno', 'tickets', 'in_progress', true, true),
                    ('sem_atendente', 'tickets', 'open', false, false),
                    ('etapa', 'tickets', 'in_progress', true, true),
                    ('compra', 'compras', 'in_progress', true, true)) v(nome, modulo, situacao, com_atendente, respondido)
  returning id, title
) select * from t;
grant select on c to authenticated;

with l as (
  insert into public.ticket_checklists (tenant_id, ticket_id)
  select (select a from f), (select id from c where title = 'etapa') returning id
)
insert into public.ticket_checklist_items (tenant_id, ticket_checklist_id, description, is_required, is_completed)
select (select a from f), id, 'Conferir', true, false from l;

insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
select (select a from f), id, (select yuri from u), 'Resposta da equipe', title = 'interno'
  from c where title in ('resolve', 'interno');

select tests.authenticate_as('ana@quemabriu.test');

select throws_ok($$ select public.chamado_encerrar_como_solicitante((select id from c where title = 'cancela'), 'cancelar', null) $$,
  '23514', null, 'cancelar exige o motivo');
select is(public.chamado_encerrar_como_solicitante((select id from c where title = 'cancela'), 'cancelar', 'Abri errado'), 'cancelled',
  'quem abriu cancela, mesmo com atendente');
select tests.clear_authentication();
select ok((select count(*) = 1 from public.notifications n where n.reference_id = (select id from c where title = 'cancela')
            and n.user_id = (select yuri from u) and n.type = 'ticket_reply' and n.message like '%Motivo: Abri errado%'),
  'o atendente recebe o motivo');

select tests.authenticate_as('ana@quemabriu.test');
select is(public.chamado_encerrar_como_solicitante((select id from c where title = 'resolve'), 'resolver', null, 'Reiniciei'), 'resolved',
  'depois da resposta da equipe, fica resolvido');
select tests.clear_authentication();
select ok((select resolved_at is not null and resolution_notes = 'Marcado como resolvido por quem abriu. Reiniciei'
             from public.tickets where id = (select id from c where title = 'resolve')),
  'com a hora e o registro de quem resolveu');

select tests.authenticate_as('ana@quemabriu.test');
select is(public.chamado_encerrar_como_solicitante((select id from c where title = 'sem_resposta'), 'resolver', null), 'cancelled',
  'sem resposta da equipe, termina cancelado e nao conta para ninguem');

select is(public.chamado_encerrar_como_solicitante((select id from c where title = 'escolhido'), 'resolver', null), 'cancelled',
  'atendente escolhido na abertura, sem resposta, nao conta');
select is(public.chamado_encerrar_como_solicitante((select id from c where title = 'interno'), 'resolver', null), 'cancelled',
  'comentario interno nao e resposta');

select public.chamado_encerrar_como_solicitante((select id from c where title = 'sem_atendente'), 'cancelar', 'Abri repetido');
select tests.clear_authentication();
select is((select count(*)::int from public.notifications n where n.reference_id = (select id from c where title = 'sem_atendente')
            and n.type = 'ticket_reply'), 0, 'sem atendente, o chamado so sai da fila');

select tests.authenticate_as('bia@quemabriu.test');
select throws_ok($$ select public.chamado_encerrar_como_solicitante((select id from c where title = 'etapa'), 'cancelar', 'Abri errado') $$,
  '42501', null, 'outra pessoa nao encerra');
select tests.clear_authentication();

select tests.authenticate_as('ana@quemabriu.test');
select throws_ok($$ select public.chamado_encerrar_como_solicitante((select id from c where title = 'etapa'), 'resolver', null) $$,
  '23514', null, 'etapa pendente segura o resolvido');
select throws_ok($$ select public.chamado_encerrar_como_solicitante((select id from c where title = 'compra'), 'cancelar', 'Abri errado') $$,
  '23514', null, 'chamado de compra segue a compra');
select throws_ok($$ select public.chamado_encerrar_como_solicitante((select id from c where title = 'cancela'), 'cancelar', 'Abri errado') $$,
  '23514', null, 'chamado encerrado nao encerra de novo');
select tests.clear_authentication();

select ok(not has_function_privilege('anon', 'public.chamado_encerrar_como_solicitante(uuid, text, text, text)', 'execute'),
  'a funcao nao abre para anon');

select * from finish();
rollback;

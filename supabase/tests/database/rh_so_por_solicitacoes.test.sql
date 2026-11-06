-- RH SÓ POR SOLICITAÇÕES (migration 20270212540000; dono, 2026-11-06).
--   1-2  férias nasce como pedido, com o prazo do assunto
--   3    férias e atestado não se concluem pelo pedido
--   4-5  aprovar conclui o pedido; recusar leva o motivo
--   6    cancelar o pedido cancela as férias
--   7    atestado validado conclui o pedido
--   8    o prazo do atestado é um dia de expediente
--   9    desligamento pede o colaborador
--  10    quem não é gestor nem RH não pede desligamento
--  11    o RH pede, e a TI recebe o chamado
--  12    chamado novo não entra no RH
--  13    transferir chamado para o RH também não
--  14    quem pediu cancela
--  15    a função do prazo não abre para anon
begin;
\ir _helpers.psql

select plan(15);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-rh-pedidos', 'RH Pedidos', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@rhped.test', (select a from f)) as ana,
       tests.create_user('rh@rhped.test', (select a from f)) as rh,
       tests.create_user('dono@rhped.test', (select a from f)) as dono,
       tests.create_user('bia@rhped.test', (select a from f)) as bia;
select tests.grant_role((select ana from u), 'member');
select tests.grant_role((select bia from u), 'member');
select tests.grant_role((select rh from u), 'member');
select tests.grant_role((select dono from u), 'owner');
select tests.grant_module((select rh from u), (select a from f), 'rh');
select tests.grant_profile((select rh from u), (select a from f), 'rh', 'Gestor');
select tests.create_colaborador((select ana from u));
grant select on f, u to authenticated;

select tests.authenticate_as('dono@rhped.test');
select public.rh_ligar_meu_rh(true);
select tests.clear_authentication();

select tests.authenticate_as('ana@rhped.test');
create temporary table p on commit drop as
with v1 as (insert into public.rh_vacation_requests (tenant_id, user_id, start_date, end_date, days_requested, type)
            select a, (select ana from u), '2027-03-01', '2027-03-10', 10, 'ferias' from f returning id, solicitacao_id),
     v2 as (insert into public.rh_vacation_requests (tenant_id, user_id, start_date, end_date, days_requested, type)
            select a, (select ana from u), '2027-04-01', '2027-04-10', 10, 'ferias' from f returning id, solicitacao_id),
     v3 as (insert into public.rh_vacation_requests (tenant_id, user_id, start_date, end_date, days_requested, type)
            select a, (select ana from u), '2027-05-01', '2027-05-10', 10, 'ferias' from f returning id, solicitacao_id),
     c as (insert into public.rh_medical_certificates (tenant_id, user_id, issue_date, days_off, file_path)
           select a, (select ana from u), '2026-11-05', 1, 'atestados/x.pdf' from f returning id, solicitacao_id)
select (select id from v1) as f1, (select solicitacao_id from v1) as s1,
       (select id from v2) as f2, (select solicitacao_id from v2) as s2,
       (select id from v3) as f3, (select solicitacao_id from v3) as s3,
       (select id from c) as c1, (select solicitacao_id from c) as s4;
grant select on p to authenticated;

select is((select tipo from public.solicitacoes where id = (select s1 from p)), 'rh_ferias', 'ferias nasce como pedido');
select isnt((select sla_due_at from public.solicitacoes where id = (select s1 from p)), null::timestamptz, 'com o prazo do assunto');
select is(public.solicitacao_agir((select s3 from p), 'cancelar'), 'cancelada', 'quem pediu cancela');
select tests.clear_authentication();

select tests.authenticate_as('rh@rhped.test');
select throws_ok($$ select public.solicitacao_agir((select s1 from p), 'concluir') $$, '23514', null, 'ferias se decide em Aprovacoes');
update public.rh_vacation_requests set status = 'aprovada' where id = (select f1 from p);
update public.rh_vacation_requests set status = 'recusada', decision_notes = 'Periodo de pico' where id = (select f2 from p);
update public.rh_medical_certificates set status = 'validado' where id = (select c1 from p);
select tests.clear_authentication();

select is((select etapa from public.solicitacoes where id = (select s1 from p)), 'concluida', 'aprovar conclui o pedido');
select is((select motivo_recusa from public.solicitacoes where id = (select s2 from p)), 'Periodo de pico', 'recusar leva o motivo');
select is((select status::text from public.rh_vacation_requests where id = (select f3 from p)), 'cancelada', 'cancelar o pedido cancela as ferias');
select is((select etapa from public.solicitacoes where id = (select s4 from p)), 'concluida', 'atestado validado conclui o pedido');

select tests.authenticate_as('ana@rhped.test');
select is((select total from public.solicitacoes_tempo_util(array[(select s4 from p)])), 600, 'o prazo do atestado e um dia de expediente');
select throws_ok($$ insert into public.solicitacoes (tenant_id, tipo, solicitante_id, para_id, titulo, dados)
                    select a, 'rh_desligamento', (select ana from u), (select ana from u), 'Desligamento', '{}'::jsonb from f $$,
  '23514', null, 'desligamento pede o colaborador');
select throws_ok($$ insert into public.solicitacoes (tenant_id, tipo, solicitante_id, para_id, titulo, dados)
                    select a, 'rh_desligamento', (select ana from u), (select ana from u), 'Desligamento',
                           jsonb_build_object('colaborador_id', (select bia from u)) from f $$,
  '42501', null, 'quem nao e gestor nem RH nao pede');
select throws_ok($$ insert into public.tickets (tenant_id, module, title, description, requester_id, created_by, priority)
                    select a, 'rh', 'Chamado', 'x', (select ana from u), (select ana from u), 'low' from f $$,
  '23514', null, 'chamado novo nao entra no RH');
select tests.clear_authentication();

select tests.authenticate_as('rh@rhped.test');
insert into public.solicitacoes (tenant_id, tipo, solicitante_id, para_id, titulo, dados)
select a, 'rh_desligamento', (select rh from u), (select rh from u), 'Desligamento', jsonb_build_object('colaborador_id', (select bia from u)) from f;
select tests.clear_authentication();
select is((select count(*)::int from public.tickets where module = 'tickets' and colaborador_id = (select bia from u)
            and tenant_id = (select a from f)), 1, 'o RH pede, e a TI recebe o chamado');

create temporary table t on commit drop as
with n as (insert into public.tickets (tenant_id, module, title, description, requester_id, created_by, priority)
           select a, 'tickets', 'Chamado da TI', 'x', (select ana from u), (select ana from u), 'low' from f returning id)
select id from n;
grant select on t to authenticated;
select tests.authenticate_as('dono@rhped.test');
select throws_ok($$ update public.tickets set module = 'rh' where id = (select id from t) $$, '23514', null, 'transferir para o RH tambem nao');
select tests.clear_authentication();

select ok(not has_function_privilege('anon', 'public.solicitacoes_tempo_util(uuid[])', 'execute'), 'a funcao nao abre para anon');

select * from finish();
rollback;

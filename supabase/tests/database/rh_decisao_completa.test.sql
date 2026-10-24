-- RH › APROVAÇÕES: A DECISÃO FICA COMPLETA (migration 20270129160000; proposta "Helpoint no dia a dia", defeitos 1 e 14).
-- Quem decidiu fica gravado; recusar sem motivo é barrado; o chamado que nasceu junto é resolvido pela decisão.
begin;
\ir _helpers.psql

select plan(10);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-rh-decisao', 'RH Decisao', false) as a;
create temporary table u on commit drop as
select tests.create_user('rh@rhdec.test',   (select a from f)) as rh,
       tests.create_user('ana@rhdec.test',  (select a from f)) as ana;
select tests.grant_role((select rh from u), 'member');
select tests.grant_role((select ana from u), 'member');
select tests.grant_module((select rh from u), (select a from f), 'rh');
select tests.grant_profile((select rh from u), (select a from f), 'rh', 'Gestor');
grant select on f, u to authenticated;

-- A Ana pede duas férias e manda um atestado: cada pedido nasce com o seu chamado no RH (como pela tela, com RETURNING).
select tests.authenticate_as('ana@rhdec.test');
create temporary table pedidos on commit drop as
with v1 as (insert into public.rh_vacation_requests (tenant_id, user_id, start_date, end_date, days_requested, status)
            values ((select a from f), (select ana from u), current_date + 30, current_date + 34, 5, 'pendente') returning id),
     v2 as (insert into public.rh_vacation_requests (tenant_id, user_id, start_date, end_date, days_requested, status)
            values ((select a from f), (select ana from u), current_date + 60, current_date + 64, 5, 'pendente') returning id),
     c1 as (insert into public.rh_medical_certificates (tenant_id, user_id, issue_date, days_off, file_path)
            values ((select a from f), (select ana from u), current_date, 1, 'atestados/x.pdf') returning id)
select (select id from v1) as ferias1, (select id from v2) as ferias2, (select id from c1) as atestado;
select tests.clear_authentication();
grant select on pedidos to authenticated;

select isnt((select ticket_id from public.rh_vacation_requests where id = (select ferias1 from pedidos)), null::uuid,
  'o pedido de férias nasce com um chamado no RH');

-- ═══ O RH decide ═══
select tests.authenticate_as('rh@rhdec.test');

update public.rh_vacation_requests set status = 'aprovada' where id = (select ferias1 from pedidos);
select tests.clear_authentication();
select is((select decided_by from public.rh_vacation_requests where id = (select ferias1 from pedidos)), (select rh from u),
  'aprovar grava quem aprovou');
select is((select t.status::text from public.tickets t join public.rh_vacation_requests v on v.ticket_id = t.id
            where v.id = (select ferias1 from pedidos)), 'resolved',
  'aprovar as férias resolve o chamado que nasceu junto');
select isnt((select t.resolved_at from public.tickets t join public.rh_vacation_requests v on v.ticket_id = t.id
              where v.id = (select ferias1 from pedidos)), null::timestamptz,
  'o chamado resolvido ganha a data de resolução');

select tests.authenticate_as('rh@rhdec.test');
select throws_ok($$ update public.rh_vacation_requests set status = 'recusada' where id = (select ferias2 from pedidos) $$,
  '23514', 'Escreva o motivo da recusa.', 'recusar sem motivo é barrado');
update public.rh_vacation_requests set status = 'recusada', decision_notes = 'Coincide com o inventário de novembro.'
 where id = (select ferias2 from pedidos);
select tests.clear_authentication();
select is((select t.resolution_notes from public.tickets t join public.rh_vacation_requests v on v.ticket_id = t.id
            where v.id = (select ferias2 from pedidos)), 'Recusada pelo RH: Coincide com o inventário de novembro.',
  'a recusa resolve o chamado com o motivo como solução');

select tests.authenticate_as('rh@rhdec.test');
select throws_ok($$ update public.rh_medical_certificates set status = 'rejeitado' where id = (select atestado from pedidos) $$,
  '23514', 'Escreva o motivo da rejeição.', 'rejeitar atestado sem motivo é barrado');
update public.rh_medical_certificates set status = 'validado' where id = (select atestado from pedidos);
select tests.clear_authentication();
select is((select validated_by from public.rh_medical_certificates where id = (select atestado from pedidos)), (select rh from u),
  'validar grava quem validou');
select is((select t.status::text from public.tickets t join public.rh_medical_certificates c on c.ticket_id = t.id
            where c.id = (select atestado from pedidos)), 'resolved',
  'validar o atestado resolve o chamado que nasceu junto');

-- A tela não consegue gravar outro nome como quem decidiu.
select is((select count(*)::int from public.rh_vacation_requests
            where tenant_id = (select a from f) and status in ('aprovada', 'recusada') and decided_by = (select rh from u)), 2,
  'as duas decisões ficam no nome de quem decidiu');

select * from finish();
rollback;

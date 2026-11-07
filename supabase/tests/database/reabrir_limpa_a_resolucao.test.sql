-- REABRIR LIMPA A RESOLUÇÃO (migration 20270212550000; auditoria 2026-11-06).
--   1  resolvido guarda a data
--   2  voltar para em andamento limpa a data
--   3  resolver de novo grava a data nova
--   4  voltar para aberto também limpa
begin;
\ir _helpers.psql

select plan(4);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-reabrir', 'Reabrir', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@reabrir.test', (select a from f)) as ana;

create temporary table c on commit drop as
with t as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, created_by, priority, status)
  select a, 'tickets', 'reabre', 'x', (select ana from u), (select ana from u), 'medium', 'in_progress'::public.ticket_status
    from f
  returning id
) select * from t;

update public.tickets set status = 'resolved', resolved_at = now() where id = (select id from c);
select isnt((select resolved_at from public.tickets where id = (select id from c)), null, 'resolvido guarda a data');

update public.tickets set status = 'in_progress' where id = (select id from c);
select is((select resolved_at from public.tickets where id = (select id from c)), null, 'reabrir limpa a data');

update public.tickets set status = 'resolved', resolved_at = now() where id = (select id from c);
select isnt((select resolved_at from public.tickets where id = (select id from c)), null, 'resolver de novo grava a data');

update public.tickets set status = 'open' where id = (select id from c);
select is((select resolved_at from public.tickets where id = (select id from c)), null, 'qualquer saída de resolvido limpa');

select * from finish();
rollback;

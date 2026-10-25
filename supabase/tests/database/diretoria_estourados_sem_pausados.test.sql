-- DIRETORIA: ESTOURADO NÃO CONTA PRAZO PAUSADO (migration 20270115020000; dono, 2026-10-15). Três chamados da TI com o
-- prazo de ontem: em andamento (conta), pendente (pausado, não conta) e agendado depois de vencido (conta).
--   1  estourados = 2
begin;
\ir _helpers.psql

select plan(1);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-dir-estourados', 'Dir Estourados', false) as a;
create temporary table u on commit drop as
select tests.create_user('dir@estourados.test', (select a from f)) as dir,
       tests.create_user('pede@estourados.test', (select a from f)) as pede;
select tests.grant_module((select dir from u), (select a from f), 'diretoria');
-- Desde 20270130010000 a Diretoria é setor: o módulo vem com o perfil ("Diretor", semeado na empresa nova).
select tests.grant_profile((select dir from u), (select a from f), 'diretoria', 'Diretor');
grant select on f, u to authenticated;

insert into public.tickets (tenant_id, module, title, description, requester_id, created_by, priority, status, agendado_para)
select a, 'tickets', t, 'x', (select pede from u), (select pede from u), 'medium', s::public.ticket_status,
       case when s = 'scheduled' then now() + interval '1 day' end
  from f, (values ('andamento', 'in_progress'), ('pendente', 'waiting_user'), ('agendado', 'scheduled')) v(t, s);
update public.tickets set sla_due_at = now() - interval '1 day', agendou_vencido = (title = 'agendado')
 where tenant_id = (select a from f);

select tests.authenticate_as('dir@estourados.test');
select is((select estourados::int from public.dir_chamados_por_setor(now() - interval '30 days') where modulo = 'tickets'), 2,
  'estourado conta o em andamento e o agendado depois de vencido; o pendente (pausado) nao');
select tests.clear_authentication();

select * from finish();
rollback;

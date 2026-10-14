-- PRAZOS PARA PJ (migration 20270101010000; dono, 2026-10-13). Setor com relógio corrido (pausa do fim de
-- semana desligada, expediente em branco) para a conta ser exata. Média: comum 8h, PJ 16h.
--   1  o chamado com atendente PJ ganha o prazo de PJ (16h)
--   2  com atendente CLT, o prazo comum (8h)
--   3  urgência sem prazo de PJ preenchido: o PJ usa o comum
--   4  quem não configura o setor não marca ninguém como PJ
--   5  a função nova não abre para anon
begin;
\ir _helpers.psql

select plan(5);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-sla-pj', 'SLA PJ', false) as a;
create temporary table u on commit drop as
select tests.create_user('pj@slapj.test',   (select a from f)) as pj,
       tests.create_user('clt@slapj.test',  (select a from f)) as clt,
       tests.create_user('pede@slapj.test', (select a from f)) as pede;
grant select on f, u to authenticated;

insert into public.sla_regras_do_setor (tenant_id, module, pausa_fim_de_semana) select a, 'expedicao', false from f;
insert into public.sla_policies (tenant_id, module, name, priority, first_response_time, resolution_time, para_pj)
select a, 'expedicao', n, p::public.ticket_priority, 60, r, pj from f,
  (values ('EXP média', 'medium', 480, false), ('EXP média PJ', 'medium', 960, true), ('EXP alta', 'high', 240, false)) v(n, p, r, pj);
insert into public.sla_pj (tenant_id, module, user_id) select a, 'expedicao', (select pj from u) from f;

create temporary table t on commit drop as
with x as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, created_by, priority, status, assigned_to)
  select a, 'expedicao', nome, 'x', (select pede from u), (select pede from u), pr::public.ticket_priority, 'in_progress', quem
    from f, (values ('pj', 'medium', (select pj from u)), ('clt', 'medium', (select clt from u)), ('pj-alta', 'high', (select pj from u))) v(nome, pr, quem)
  returning id, title, sla_due_at, created_at
) select * from x;

select is((select sla_due_at - created_at from t where title = 'pj'), interval '16 hours', 'atendente PJ: o prazo de PJ (16h)');
select is((select sla_due_at - created_at from t where title = 'clt'), interval '8 hours', 'atendente CLT: o prazo comum (8h)');
select is((select sla_due_at - created_at from t where title = 'pj-alta'), interval '4 hours', 'sem prazo de PJ na urgencia: o PJ usa o comum');

select tests.authenticate_as('pede@slapj.test');
select throws_ok(format($$ insert into public.sla_pj (tenant_id, module, user_id) values (%L::uuid, 'expedicao', %L::uuid) $$,
                        (select a from f), (select clt from u)),
  '42501', null, 'quem nao configura o setor nao marca ninguem como PJ');
select tests.clear_authentication();

select ok(not has_function_privilege('anon', 'public.atendente_pj(uuid,text,uuid)', 'execute'), 'a funcao nova nao abre para anon');

select * from finish();
rollback;

-- O PRAZO RECOMEÇA NA TRANSFERÊNCIA (migration 20261229010000; dono, 2026-10-13 — caso do #27, que chegou
-- à Mel quase vencido). Setor com a pausa de fim de semana desligada e expediente em branco: relógio
-- corrido, conta exata. Urgência média = 8 horas.
--   1-2  transferir de uma pessoa para outra: o prazo vira agora + 8h, e `prazo_desde` marca o recomeço
--   3    pegar da fila (sem atendente → alguém) NÃO recomeça: continua o prazo da abertura
--   4    prazo posto à mão fica, mesmo transferindo
--   5-6  transferir parado (Pendente): a pausa até aqui fica contada e a pausa recomeça agora
begin;
\ir _helpers.psql

select plan(6);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-prazo-transf', 'Prazo Transf', false) as tenant;
create temporary table u on commit drop as
select tests.create_user('a@prazotransf.test', (select tenant from f)) as a,
       tests.create_user('b@prazotransf.test', (select tenant from f)) as b,
       tests.create_user('pede@prazotransf.test', (select tenant from f)) as pede;

insert into public.sla_regras_do_setor (tenant_id, module, pausa_fim_de_semana)
values ((select tenant from f), 'expedicao', false);
insert into public.sla_policies (tenant_id, module, name, priority, first_response_time, resolution_time)
values ((select tenant from f), 'expedicao', 'EXP médio', 'medium', 60, 480);

create temporary table t on commit drop as
with x as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, created_by, priority, status, created_at, assigned_to)
  select tenant, 'expedicao', nome, 'x', (select pede from u), (select pede from u), 'medium', st::public.ticket_status, now() - interval '7 hours', quem
    from f, (values ('transfere', 'in_progress', (select a from u)),
                    ('fila',      'open',        null::uuid),
                    ('mao',       'in_progress', (select a from u)),
                    ('parado',    'in_progress', (select a from u))) v(nome, st, quem)
  returning id, title
) select * from x;

-- O prazo à mão do terceiro, e o quarto em Pendente há 2 horas.
update public.tickets set sla_due_at = now() + interval '30 days' where id = (select id from t where title = 'mao');
update public.tickets set status = 'waiting_user' where id = (select id from t where title = 'parado');
update public.tickets set pendente_desde = now() - interval '2 hours' where id = (select id from t where title = 'parado');

-- ═══ 1-2. Transferir. ═══
update public.tickets set assigned_to = (select b from u) where id = (select id from t where title = 'transfere');
select is((select sla_due_at from public.tickets where id = (select id from t where title = 'transfere')),
  now() + interval '8 hours', 'transferido: o prazo recomeca agora, cheio (8h)');
select is((select prazo_desde from public.tickets where id = (select id from t where title = 'transfere')),
  now(), 'e marca de quando o prazo conta');

-- ═══ 3. Pegar da fila. ═══
update public.tickets set assigned_to = (select a from u) where id = (select id from t where title = 'fila');
select is((select sla_due_at from public.tickets where id = (select id from t where title = 'fila')),
  now() + interval '1 hour', 'pegar da fila nao recomeca: continua o prazo da abertura (7h ja corridas)');

-- ═══ 4. Prazo à mão. ═══
update public.tickets set assigned_to = (select b from u) where id = (select id from t where title = 'mao');
select is((select sla_due_at from public.tickets where id = (select id from t where title = 'mao')),
  now() + interval '30 days', 'prazo posto a mao fica, mesmo transferindo');

-- ═══ 5-6. Transferir parado. ═══
update public.tickets set assigned_to = (select b from u) where id = (select id from t where title = 'parado');
select is((select pendente_desde from public.tickets where id = (select id from t where title = 'parado')),
  now(), 'transferido em Pendente: a pausa recomeca agora');
select ok((select minutos_pausados from public.tickets where id = (select id from t where title = 'parado')) >= 120,
  'e as 2 horas paradas antes da transferencia ficam contadas');

select * from finish();
rollback;

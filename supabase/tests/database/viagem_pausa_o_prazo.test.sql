-- VIAGEM PAUSA O PRAZO DO CHAMADO NOVO (migration 20261219020000; dono, 2026-10-08).
-- Pelo caminho da tela (insert com RETURNING, papel authenticated — lições 8 e 11):
--   1    o gestor do setor registra a viagem de quem atende o setor;
--   2    quem não é gestor não registra (e não vê erro escondido: a escrita falha);
--   3-4  chamado novo para quem viaja: solução e 1ª resposta contam da volta;
--   5    chamado sem atendente, com o setor inteiro viajando: conta da volta;
--   6    chamado sem atendente, com alguém do setor em casa: corre normal;
--   7    o chamado que já existia não muda;
--   8    quem abre o chamado recebe a volta para o aviso; 9 anon não chama.
begin;
\ir _helpers.psql

select plan(9);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-viagem', 'Viagem') as a;
create temporary table u on commit drop as
select tests.create_user('gestor@viagem.test', (select a from f)) as gestor,
       tests.create_user('silvana@viagem.test', (select a from f)) as silvana,
       tests.create_user('outra@viagem.test', (select a from f)) as outra,
       tests.create_user('pede@viagem.test', (select a from f)) as pede;
select tests.grant_profile((select gestor from u), (select a from f), 'educacional', 'Gestor');
select tests.grant_module((select silvana from u), (select a from f), 'educacional');
grant select on f, u to authenticated;
create temporary table ch (nome text primary key, id uuid);
grant select, insert on ch to authenticated;

-- O chamado que já existia, aberto antes de a viagem ser registrada.
select tests.authenticate_as('pede@viagem.test');
with c as (
  insert into public.tickets (tenant_id, module, title, description, priority, status, requester_id, created_by, assigned_to)
  select a, 'educacional', 'Antes', 'x', 'medium', 'open', pede, pede, silvana from f, u returning id
) insert into ch select 'antes', id from c;
select tests.clear_authentication();
create temporary table antes on commit drop as select sla_due_at from public.tickets where id = (select id from ch where nome = 'antes');

-- ─── O gestor registra a viagem da Silvana: 30 dias fora ─────────────────────────────────────────
select tests.authenticate_as('gestor@viagem.test');
insert into public.viagens_de_atendimento (tenant_id, user_id, inicio, fim)
select a, silvana, now() - interval '1 hour', now() + interval '30 days' from f, u returning id;
select tests.clear_authentication();
select is((select count(*)::int from public.viagens_de_atendimento where user_id = (select silvana from u)), 1,
  'o gestor do setor registra a viagem de quem atende');

select tests.authenticate_as('pede@viagem.test');
select throws_ok(
  $$insert into public.viagens_de_atendimento (tenant_id, user_id, inicio, fim)
    select a, silvana, now(), now() + interval '1 day' from f, u returning id$$,
  '42501', null, 'quem nao e gestor do setor nao registra viagem');

-- ─── Chamados novos durante a viagem ─────────────────────────────────────────────────────────────
with c as (
  insert into public.tickets (tenant_id, module, title, description, priority, status, requester_id, created_by, assigned_to)
  select a, 'educacional', 'Para a Silvana', 'x', 'medium', 'open', pede, pede, silvana from f, u returning id
) insert into ch select 'para_ela', id from c;
with c as (
  insert into public.tickets (tenant_id, module, title, description, priority, status, requester_id, created_by)
  select a, 'educacional', 'Fila sozinha', 'x', 'medium', 'open', pede, pede from f, u returning id
) insert into ch select 'fila_sozinha', id from c;
select is(public.aviso_de_viagem('educacional', null) > now() + interval '29 days', true,
  'quem abre o chamado recebe a volta para o aviso');
select tests.clear_authentication();

select ok((select sla_due_at > now() + interval '30 days' from public.tickets where id = (select id from ch where nome = 'para_ela')),
  'chamado para quem viaja: o prazo de solucao conta da volta');
select ok((select first_response_due_at > now() + interval '30 days' from public.tickets where id = (select id from ch where nome = 'para_ela')),
  'chamado para quem viaja: o prazo da 1a resposta tambem conta da volta');
select ok((select sla_due_at > now() + interval '30 days' from public.tickets where id = (select id from ch where nome = 'fila_sozinha')),
  'sem atendente e o setor inteiro viajando: conta da volta');

-- Outra pessoa entra no Educacional e fica em casa: a fila volta a correr.
select tests.grant_module((select outra from u), (select a from f), 'educacional');
select tests.authenticate_as('pede@viagem.test');
with c as (
  insert into public.tickets (tenant_id, module, title, description, priority, status, requester_id, created_by)
  select a, 'educacional', 'Fila com gente', 'x', 'medium', 'open', pede, pede from f, u returning id
) insert into ch select 'fila_com_gente', id from c;
select tests.clear_authentication();
select ok((select sla_due_at < now() + interval '30 days' from public.tickets where id = (select id from ch where nome = 'fila_com_gente')),
  'sem atendente e alguem do setor em casa: o prazo corre normal');

select is((select sla_due_at from public.tickets where id = (select id from ch where nome = 'antes')), (select sla_due_at from antes),
  'o chamado que ja existia nao muda de prazo');

select ok(not has_function_privilege('anon', 'public.aviso_de_viagem(text, uuid)', 'execute'), 'anon nao consulta viagem');

select * from finish();
rollback;

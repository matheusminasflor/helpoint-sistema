-- Chamado resolvido não "fecha" e o SLA não conta sábado e domingo (decisões do dono, 2026-10-04).
-- Migrations 20261203020000_chamado_resolvido_nao_fecha.sql e 20261203030000_sla_sem_fim_de_semana.sql.
--
--   1-4   a soma de minutos pula o fim de semana (sexta 17h + 8h = segunda 1h; sábado começa na
--         segunda 0h; dia útil soma direto; atravessar semana);
--   5-6   a regra do setor: sem linha = pausa ligada; setor que desligou = soma corrida;
--   7-8   o chamado NOVO ganha o prazo pela regra do setor — inserido como o PostgREST insere, com
--         RETURNING (lição 11), por quem abre o chamado;
--   9-10  avaliar não muda o status: resolvido continua resolvido;
--   11-13 a arrumação `closed` → `resolved` guarda o `resolved_at`, não avisa ninguém e devolve os
--         triggers ligados;
--   14    quem não configura o setor não muda a regra;
--   15-18 as funções novas não abrem para anon (lição 14), e a arrumação nem para quem está logado.
--
-- Datas FIXAS em todo lugar (com fuso explícito): `now()` e `current_date` dependem do dia em que o
-- CI roda (lições 9 e 10), e a regra aqui é justamente sobre o dia da semana. 2026-10-02 é sexta.
begin;
\ir _helpers.psql

-- 2026-10-04, segunda rodada (20261203050000): o relógio passou a andar só no EXPEDIENTE. A soma
-- da primeira rodada (`somar_minutos_sem_fim_de_semana`, antigas asserções 1-4) saiu; a soma nova
-- tem teste próprio, `sla_no_expediente.test.sql`. Aqui ficam o setor sem linha (agora 08–18) e o
-- setor com a pausa desligada e o expediente em branco (dia inteiro: continua corrido).
select plan(14);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-resolvido-sla', 'Resolvido e SLA', false) as tenant;
create temporary table u on commit drop as
select tests.create_user('pede@resolvido-sla.test',  (select tenant from f)) as pede,
       tests.create_user('outro@resolvido-sla.test', (select tenant from f)) as outro;
grant select on f, u to authenticated;

-- ═══ 1-2. A regra do setor. ═══
insert into public.sla_regras_do_setor (tenant_id, module, pausa_fim_de_semana)
values ((select tenant from f), 'expedicao', false);

select is(public.prazo_do_chamado((select tenant from f), 'marketing', '2026-10-02 17:00-03', 480, null::uuid),
  '2026-10-05 15:00-03'::timestamptz,
  'setor sem regra gravada: expediente 08-18 e sem fim de semana (sexta 17h + 8h = segunda 15h)');
select is(public.prazo_do_chamado((select tenant from f), 'expedicao', '2026-10-02 17:00-03', 480, null::uuid),
  '2026-10-03 01:00-03'::timestamptz,
  'setor que desligou a pausa e deixou o expediente em branco: soma corrida');

-- ═══ 7-8. O chamado novo, aberto por quem pede, com RETURNING. ═══
insert into public.sla_policies (tenant_id, module, name, priority, first_response_time, resolution_time)
values ((select tenant from f), 'marketing', 'MKT médio', 'medium', 60, 480),
       ((select tenant from f), 'expedicao', 'EXP médio', 'medium', 60, 480);

select tests.authenticate_as('pede@resolvido-sla.test');
create temporary table novo on commit drop as
with t as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, created_by, priority, status, created_at)
  values ((select tenant from f), 'marketing', 'arte', 'x', (select pede from u), (select pede from u), 'medium', 'open', '2026-10-02 17:00-03'),
         ((select tenant from f), 'expedicao', 'envio', 'x', (select pede from u), (select pede from u), 'medium', 'open', '2026-10-02 17:00-03')
  returning id, module, sla_due_at
)
select id, module, sla_due_at from t;
select tests.clear_authentication();

select is((select sla_due_at from novo where module = 'marketing'), '2026-10-05 15:00-03'::timestamptz,
  'chamado novo no Marketing (expediente 08-18): sexta 17h + 8h vence segunda 15:00');
select is((select sla_due_at from novo where module = 'expedicao'), '2026-10-03 01:00-03'::timestamptz,
  'chamado novo na Expedicao (pausa desligada): vence sabado 01:00');

-- ═══ 9-10. Avaliar não muda o status. ═══
-- O atendente resolve (aqui pelo papel do runner: a guarda de perfil tem teste próprio).
update public.tickets set status = 'resolved', resolved_at = '2026-10-02 18:00-03'
 where id = (select id from novo where module = 'marketing');

select tests.authenticate_as('pede@resolvido-sla.test');
select lives_ok(
  $$update public.tickets set satisfaction_rating = 4
     where id = (select id from novo where module = 'marketing') returning id$$,
  'quem abriu avalia o chamado resolvido gravando so a nota'
);
select tests.clear_authentication();
select is((select status::text from public.tickets where id = (select id from novo where module = 'marketing')),
  'resolved', 'depois da avaliacao o chamado continua Resolvido — nada o fecha');

-- ═══ 11-13. A arrumação `closed` → `resolved`. ═══
-- O chamado que a regra antiga fechou: `closed`, com `closed_at` e sem `resolved_at`.
update public.tickets set status = 'closed', closed_at = '2026-10-02 19:00-03', resolved_at = null
 where id = (select id from novo where module = 'expedicao');
select public.chamados_fechados_viram_resolvidos();

select is(
  (select status::text || '|' || (resolved_at = '2026-10-02 19:00-03'::timestamptz)::text
     from public.tickets where id = (select id from novo where module = 'expedicao')),
  'resolved|true',
  'closed vira resolved, e sem resolved_at o marco passa a ser quando fechou');
select is(
  (select count(*)::int from public.notifications
    where reference_id = (select id from novo where module = 'expedicao') and type = 'ticket_resolved'),
  0, 'a arrumacao nao manda "foi resolvido" (nem e-mail) para ninguem');
select is(
  (select count(*)::int from pg_trigger
    where tgrelid = 'public.tickets'::regclass and tgenabled = 'O'
      and tgname in ('trg_notify_on_ticket_change', 'trg_tickets_enforce_checklist_before_closing',
                     'trg_enforce_maintenance_before_closing')),
  3, 'os tres triggers desligados para a arrumacao voltam ligados');

-- ═══ 14. Quem não configura o setor não muda a regra. ═══
-- WITH CHECK de INSERT levanta 42501 (lição 12).
select tests.authenticate_as('outro@resolvido-sla.test');
select throws_ok(
  $$insert into public.sla_regras_do_setor (tenant_id, module, pausa_fim_de_semana)
    values ((select tenant from f), 'rh', false) returning id$$,
  '42501', null,
  'sem "Configuracoes: Alterar" do setor, ninguem desliga a pausa do fim de semana');
select tests.clear_authentication();

-- ═══ 15-18. As portas (lição 14). ═══
select ok(not has_function_privilege('anon', 'public.somar_minutos_uteis(timestamptz, integer, time, time, boolean, uuid, time, time)', 'execute'),
  'anon nao chama somar_minutos_uteis');
select ok(not has_function_privilege('anon', 'public.prazo_do_chamado(uuid, text, timestamptz, integer, uuid)', 'execute'),
  'anon nao chama prazo_do_chamado');
select ok(not has_function_privilege('anon', 'public.chamados_fechados_viram_resolvidos()', 'execute'),
  'anon nao chama a arrumacao');
select ok(not has_function_privilege('authenticated', 'public.chamados_fechados_viram_resolvidos()', 'execute'),
  'nem quem esta logado: a arrumacao desliga triggers e e so da migration');

select * from finish();
rollback;

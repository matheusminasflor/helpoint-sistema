-- PRAZO DE ATENDIMENTO POR SETOR (migration 20261115020000, LEVA P parte 4)
--
-- Decisão do dono (2026-09-28): "Prazo próprio por setor". Antes, os quatro lugares que
-- mostravam "Prazos (SLA)" editavam a mesma linha da empresa.
--
--   1 — setor sem prazo próprio usa o padrão da empresa (nada muda até alguém mudar);
--   2 — setor com prazo próprio usa o dele;
--   3 — e o prazo do RH não vaza para os outros setores, que é o defeito de antes;
--   4 — prazo de setor desligado volta ao padrão;
--   5 — não existem dois padrões para a mesma prioridade (o UNIQUE comum deixaria, porque
--       trata dois nulos como diferentes).
begin;
\ir _helpers.psql

select plan(5);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-prazo-setor', 'Prazo Setor', false) as a;
create temporary table u on commit drop as
select tests.create_user('pede@prazo.test', (select a from f)) as pede;

-- AJUSTE DE 2026-10-04 (decisão do dono: o SLA não conta sábado e domingo, ligado por padrão em
-- todo setor — migration 20261203030000). Este teste pergunta QUAL política vale, não como os
-- minutos se somam; com a pausa ligada, `sla_due_at - created_at` passaria a depender do dia da
-- semana em que o CI roda (1440 minutos numa sexta viram 3 dias). Então RH e TI desligam a pausa
-- aqui, e a soma volta a ser corrida. A pausa tem teste próprio:
-- `chamado_resolvido_e_sla_sem_fim_de_semana.test.sql`.
-- 2026-10-04, segunda rodada (20261203050000, SLA só no expediente): as duas linhas não trazem
-- horário de expediente, e expediente em branco = dia inteiro — a soma continua corrida. O padrão
-- semeado da média passou a 1200 minutos úteis (2 dias úteis). O expediente tem teste próprio:
-- `sla_no_expediente.test.sql`.
insert into public.sla_regras_do_setor (tenant_id, module, pausa_fim_de_semana)
values ((select a from f), 'rh', false), ((select a from f), 'tickets', false);

-- O prazo que o trigger deu a cada chamado, pelo título. Inserir com RETURNING dentro de
-- subconsulta não é permitido; no topo de um WITH, é.
create temporary table prazo (titulo text, prazo interval) on commit drop;

-- O padrão semeado com a empresa: prioridade média resolve em 1200 minutos (úteis).
with t as (
  insert into public.tickets (tenant_id, title, description, requester_id, module, priority)
  values ((select a from f), 'rh antes', 'x', (select pede from u), 'rh', 'medium')
  returning title, sla_due_at - created_at as p
) insert into prazo select title, p from t;

insert into public.sla_policies (tenant_id, module, name, priority, first_response_time, resolution_time)
values ((select a from f), 'rh', 'RH médio', 'medium', 30, 60);

with t as (
  insert into public.tickets (tenant_id, title, description, requester_id, module, priority)
  values ((select a from f), 'rh depois', 'x', (select pede from u), 'rh', 'medium'),
         ((select a from f), 'ti', 'x', (select pede from u), 'tickets', 'medium')
  returning title, sla_due_at - created_at as p
) insert into prazo select title, p from t;

update public.sla_policies set is_active = false
 where tenant_id = (select a from f) and module = 'rh';

with t as (
  insert into public.tickets (tenant_id, title, description, requester_id, module, priority)
  values ((select a from f), 'rh desligado', 'x', (select pede from u), 'rh', 'medium')
  returning title, sla_due_at - created_at as p
) insert into prazo select title, p from t;

select is((select prazo from prazo where titulo = 'rh antes'), interval '1200 minutes',
  'setor sem prazo proprio usa o padrao da empresa');
select is((select prazo from prazo where titulo = 'rh depois'), interval '60 minutes',
  'setor com prazo proprio usa o dele');
select is((select prazo from prazo where titulo = 'ti'), interval '1200 minutes',
  'o prazo do RH nao vaza para os outros setores');
select is((select prazo from prazo where titulo = 'rh desligado'), interval '1200 minutes',
  'prazo de setor desligado volta ao padrao da empresa');

select throws_ok(
  format($$ insert into public.sla_policies (tenant_id, name, priority, first_response_time, resolution_time)
            values (%L, 'outro padrao', 'medium', 1, 1) $$, (select a from f)),
  '23505', null,
  'nao existem dois padroes da empresa para a mesma prioridade'
);

select * from finish();
rollback;

-- CRM-3b: marcar reunião pelo negócio (migration 20260928010000). Prova:
--   - marcar cria as duas coisas **juntas**: o evento na agenda de quem marcou
--     e a linha na história do negócio
--   - o evento aponta de volta para o negócio, e dura o que se pediu
--   - negócio que o vendedor não enxerga não vira reunião (a função é
--     `security invoker`: a RLS continua mandando)
--   - título vazio e data ausente são recusados
--   - a agenda continua sendo de cada um: ninguém vê o evento do outro
begin;
\ir _helpers.psql

select plan(10);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-reu-a', 'Reu A') as a,
       tests.create_tenant('pgtap-reu-b', 'Reu B') as b;

create temporary table u on commit drop as
select tests.create_user('vendedor@reu.test',  (select a from f)) as vendedor,
       tests.create_user('colega@reu.test',    (select a from f)) as colega,
       tests.create_user('vendedorb@reu.test', (select b from f)) as vendedor_b;
select tests.grant_module((select vendedor from u),   (select a from f), 'crm');
select tests.grant_module((select colega from u),     (select a from f), 'crm');
select tests.grant_module((select vendedor_b from u), (select b from f), 'crm');
grant select on f, u to authenticated;

create temporary table s on commit drop as
select gen_random_uuid() as contato, gen_random_uuid() as negocio,
       gen_random_uuid() as contato_b, gen_random_uuid() as negocio_b,
       (select id from public.crm_pipeline_stages where tenant_id = (select a from f) and kind = 'open' order by position limit 1) as etapa,
       (select id from public.crm_pipeline_stages where tenant_id = (select b from f) and kind = 'open' order by position limit 1) as etapa_b;
grant select on s to authenticated;

insert into public.crm_contacts (id, tenant_id, name) select contato, (select a from f), 'Padaria do Ze' from s;
insert into public.crm_deals (id, tenant_id, contact_id, stage_id, title)
select negocio, (select a from f), contato, etapa, 'Venda de teste' from s;

insert into public.crm_contacts (id, tenant_id, name) select contato_b, (select b from f), 'Cliente da B' from s;
insert into public.crm_deals (id, tenant_id, contact_id, stage_id, title)
select negocio_b, (select b from f), contato_b, etapa_b, 'Negocio da B' from s;

-- ───────────────────────────────────────────────────────────────────────────
-- Marcar: as duas coisas, juntas
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('vendedor@reu.test');

create temporary table r on commit drop as
select public.crm_agendar_reuniao(
  (select negocio from s), 'Visita na padaria',
  timestamptz '2027-03-10 14:00:00-03', 90, 'Levar catalogo'
) as evento;
grant select on r to authenticated;

select isnt((select evento from r), null, 'marcar devolve o evento criado');
select is(
  (select count(*)::int from public.calendar_events where id = (select evento from r)),
  1,
  'o evento entra na agenda de quem marcou'
);
select is(
  (select e.event_type || '|' || e.source_type || '|' || (e.source_id = (select negocio from s))::text
     from public.calendar_events e where e.id = (select evento from r)),
  'meeting|crm_deal|true',
  'e aponta de volta para o negocio'
);
select is(
  (select extract(epoch from (e.end_at - e.start_at))::int / 60
     from public.calendar_events e where e.id = (select evento from r)),
  90,
  'a reuniao dura o que se pediu'
);
select is(
  (select count(*)::int from public.crm_deal_activities
    where deal_id = (select negocio from s) and kind = 'meeting'),
  1,
  'e a linha do tempo do negocio registra a reuniao'
);
select is(
  (select (meta->>'event_id')::uuid from public.crm_deal_activities
    where deal_id = (select negocio from s) and kind = 'meeting'),
  (select evento from r),
  'a linha do tempo aponta para o mesmo evento'
);

-- ───────────────────────────────────────────────────────────────────────────
-- O que a função recusa
-- ───────────────────────────────────────────────────────────────────────────
select throws_ok(
  format($$ select public.crm_agendar_reuniao(%L::uuid, '   ', timestamptz '2027-03-10 14:00:00-03') $$, (select negocio from s)),
  '22023', null,
  'reuniao sem titulo nao entra'
);
select throws_ok(
  format($$ select public.crm_agendar_reuniao(%L::uuid, 'Sem hora', null) $$, (select negocio from s)),
  '22023', null,
  'reuniao sem data e hora nao entra'
);
-- A função é `security invoker`: o negócio da outra empresa simplesmente não
-- existe para quem chama, e nada é criado.
select throws_ok(
  format($$ select public.crm_agendar_reuniao(%L::uuid, 'Invasao', timestamptz '2027-03-10 14:00:00-03') $$, (select negocio_b from s)),
  'P0002', null,
  'negocio de outra empresa nao vira reuniao'
);
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- A agenda continua sendo de cada um
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('colega@reu.test');
select is(
  (select count(*)::int from public.calendar_events where id = (select evento from r)),
  0,
  'o colega da mesma empresa nao ve o evento na agenda alheia'
);
select tests.clear_authentication();

select * from finish();
rollback;

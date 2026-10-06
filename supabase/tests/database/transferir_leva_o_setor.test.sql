-- Transferir para alguém de outro setor leva o chamado para o setor dela
-- (migration 20261212010000; decisões do dono, 2026-10-06 — o caso do chamado #27).
--
--   tigest  TI, perfil Gestor          — "Transferir" na TI (setor de ORIGEM)
--   mktgest Marketing, perfil Gestor   — "Transferir" só no Marketing
--   meri    Marketing, perfil Operador — recebe o chamado
--   req     abriu o chamado; sem setor
-- Datas FIXAS (lição 10): aberto terça 2026-10-06 09:00 (São Paulo). Prioridade média: a TI usa o
-- padrão da empresa (1200 min úteis); o Marketing tem prazo próprio de 60 min úteis — então o
-- prazo recalculado pelo setor novo é 10:00 do mesmo dia.
begin;
\ir _helpers.psql

select plan(13);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-transf-setor', 'Transfere Setor', false) as a;
create temporary table u on commit drop as
select tests.create_user('tigest@transf.test',  (select a from f)) as tigest,
       tests.create_user('mktgest@transf.test', (select a from f)) as mktgest,
       tests.create_user('meri@transf.test',    (select a from f)) as meri,
       tests.create_user('req@transf.test',     (select a from f)) as req;
select tests.grant_role(x, 'member') from (select tigest x from u union all select mktgest from u
  union all select meri from u union all select req from u) s;
select tests.grant_module((select tigest from u), (select a from f), 'ti');
select tests.grant_profile((select tigest from u), (select a from f), 'ti', 'Gestor');
select tests.grant_module(x, (select a from f), 'marketing') from (select mktgest x from u union all select meri from u) s;
select tests.grant_profile((select mktgest from u), (select a from f), 'marketing', 'Gestor');
select tests.grant_profile((select meri from u), (select a from f), 'marketing', 'Operador');

insert into public.sla_policies (tenant_id, module, name, priority, first_response_time, resolution_time)
select a, 'marketing', 'MKT médio (pgTAP)', 'medium', 30, 60 from f;

create temporary table cat on commit drop as
with rede as (
  insert into public.ti_categories (tenant_id, module, name) select a, 'tickets', 'Rede (pgTAP)' from f returning id
), arte as (
  insert into public.ti_categories (tenant_id, module, name) select a, 'marketing', 'Arte (pgTAP)' from f returning id
) select (select id from rede) rede, (select id from arte) arte;
-- A subcategoria "Rótulo" dentro de "Arte" (o nome vai em `subcategory`, o pai em `category`).
create temporary table sub on commit drop as
with s as (
  insert into public.ti_categories (tenant_id, module, name, parent_id)
  select a, 'marketing', 'Rotulo (pgTAP)', (select arte from cat) from f returning id
) select id from s;

-- O chamado #27: aberto na TI, na categoria da TI, por quem pede.
create temporary table c (id uuid) on commit drop;
grant select on f, u, cat, sub to authenticated;
grant select, insert on c to authenticated;
select tests.authenticate_as('req@transf.test');
with t as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, category_id, category,
                              priority, created_at)
  select a, 'tickets', 'arte do evento', 'x', (select req from u), (select rede from cat), 'Rede (pgTAP)',
         'medium', '2026-10-06 09:00-03' from f
  returning id
) insert into c select id from t;
select tests.clear_authentication();

-- ═══ 1. Antes: a Merilyn não vê o chamado da TI. ═══
select tests.authenticate_as('meri@transf.test');
select is((select count(*)::int from public.tickets where id = (select id from c)), 0,
  'antes da transferencia a pessoa do Marketing nao ve o chamado da TI');
select tests.clear_authentication();

-- ═══ 2. A tela sabe para que setor a pessoa recebe. ═══
select tests.authenticate_as('tigest@transf.test');
select is(public.setores_para_transferir((select meri from u)), array['marketing'],
  'a Merilyn atende o Marketing');

-- ═══ 3-5. As recusas, antes de gravar qualquer coisa. ═══
select throws_ok(
  format($$select public.transferir_chamado(%L, %L, 'marketing', %L, 'veio errado')$$,
         (select id from c), (select meri from u), (select rede from cat)),
  '23514', null, 'categoria de outro setor e recusada: tem de ser do setor novo');
select throws_ok(
  format($$select public.transferir_chamado(%L, %L, 'marketing', %L, 'veio errado')$$,
         (select id from c), (select req from u), (select arte from cat)),
  '22023', null, 'quem nao atende o setor novo nao recebe o chamado');
select tests.clear_authentication();

select tests.authenticate_as('mktgest@transf.test');
select throws_ok(
  format($$select public.transferir_chamado(%L, %L, 'marketing', %L, 'veio errado')$$,
         (select id from c), (select meri from u), (select arte from cat)),
  '42501', null, 'quem so transfere no Marketing nao transfere o chamado da TI');
select tests.clear_authentication();

-- ═══ 6-9. A transferência de verdade: setor, categoria e atendente num comando só. ═══
select tests.authenticate_as('tigest@transf.test');
select lives_ok(
  format($$select public.transferir_chamado(%L, %L, 'marketing', %L, 'e do Marketing')$$,
         (select id from c), (select meri from u), (select id from sub)),
  'quem transfere na TI manda o chamado para o Marketing');
select tests.clear_authentication();

select is((select module || '|' || category || '|' || subcategory || '|' || (category_id = (select id from sub))::text
                  || '|' || (assigned_to = (select meri from u))::text
             from public.tickets where id = (select id from c)),
  'marketing|Arte (pgTAP)|Rotulo (pgTAP)|true|true',
  'o chamado foi para o Marketing, na categoria escolhida, com a Merilyn');
select is((select count(*)::int from public.ticket_comments
            where ticket_id = (select id from c) and is_internal
              and content like 'Transferido de % para Marketing — para meri@transf.test. Categoria: Arte (pgTAP) › Rotulo (pgTAP). Motivo: e do Marketing'),
  1, 'a transferencia fica no historico, com setores, pessoa, categoria e motivo');
select is((select sla_due_at from public.tickets where id = (select id from c)),
  '2026-10-06 10:00-03'::timestamptz,
  'o prazo foi recalculado pelo Marketing desde a abertura (60 min uteis)');

-- ═══ 10. Depois: a Merilyn lê o chamado. ═══
select tests.authenticate_as('meri@transf.test');
select is((select count(*)::int from public.tickets where id = (select id from c)), 1,
  'depois da transferencia a Merilyn ve o chamado');
select tests.clear_authentication();

-- ═══ 11. O solicitante e a Merilyn foram avisados de que foi para o Marketing. ═══
select is((select count(distinct user_id)::int from public.notifications
            where reference_id = (select id from c) and type = 'ticket_transferred'
              and user_id in ((select meri from u), (select req from u))),
  2, 'solicitante e atendente nova sao avisados da transferencia');

-- ═══ 12-13. As portas (lição 14). ═══
select ok(not has_function_privilege('anon', 'public.transferir_chamado(uuid, uuid, text, uuid, text)', 'execute'),
  'anon nao chama transferir_chamado');
select ok(not has_function_privilege('anon', 'public.setores_para_transferir(uuid)', 'execute'),
  'anon nao chama setores_para_transferir');

select * from finish();
rollback;

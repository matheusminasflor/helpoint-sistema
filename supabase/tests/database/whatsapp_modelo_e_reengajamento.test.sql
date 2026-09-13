-- CRM-4b: mensagem-modelo e reengajamento (migrations 20261002010000 e
-- 20261002020000). Prova:
--   - o catálogo de modelos é da Meta: quem tem o CRM lê, ninguém escreve
--   - o gatilho "negócio parado" acha quem sumiu e **não** acha quem tem
--     negociação viva — que é a diferença entre reengajar e importunar
--   - cada negócio é reengajado uma vez só por fluxo, mesmo com o tique diário
--   - o passo e o gatilho novos passam pela validação do motor
--   - outra empresa não vê modelo nem é varrida junto
begin;
\ir _helpers.psql

select plan(17);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-tpl-a', 'Tpl A') as a,
       tests.create_tenant('pgtap-tpl-b', 'Tpl B') as b;

create temporary table u on commit drop as
select tests.create_user('vendedor@tpl.test',  (select a from f)) as vendedor,
       tests.create_user('semcrm@tpl.test',    (select a from f)) as sem_crm,
       tests.create_user('vendedorb@tpl.test', (select b from f)) as vendedor_b;
select tests.grant_module((select vendedor from u),   (select a from f), 'crm');
select tests.grant_module((select vendedor_b from u), (select b from f), 'crm');
grant select on f, u to authenticated, anon;

insert into public.crm_whatsapp_templates (tenant_id, name, language, status, body, variaveis)
values ((select a from f), 'retomar_contato', 'pt_BR', 'APPROVED',
        'Oi {{1}}, tudo bem? Vi que conversamos sobre {{2}} e ficou parado. Posso ajudar?', 2),
       ((select a from f), 'em_analise', 'pt_BR', 'PENDING', 'Oi {{1}}, seu pedido está em análise.', 1),
       ((select b from f), 'da_outra_empresa', 'pt_BR', 'APPROVED', 'Oi {{1}}.', 1);

-- ───────────────────────────────────────────────────────────────────────────
-- O catálogo é da Meta: aqui só se lê
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('vendedor@tpl.test');
select is(
  (select count(*)::int from public.crm_whatsapp_templates),
  2,
  'quem tem o Comercial ve os modelos da empresa dele'
);
select is(
  (select variaveis from public.crm_whatsapp_templates where name = 'retomar_contato'),
  2,
  'e o sistema sabe quantas lacunas o modelo tem'
);
-- Quem aprova é a Meta. Uma linha escrita aqui seria um modelo que a tela
-- oferece e que o envio recusa.
select throws_ok(
  format($$ insert into public.crm_whatsapp_templates (tenant_id, name, language, status)
            values (%L::uuid, 'inventado', 'pt_BR', 'APPROVED') $$, (select a from f)),
  '42501', null,
  'ninguem inventa modelo pela tela — quem aprova e a Meta'
);
select throws_ok(
  $$ update public.crm_whatsapp_templates set status = 'APPROVED' where name = 'em_analise' $$,
  '42501', null,
  'nem promove a aprovado o que a Meta deixou pendente'
);
select tests.clear_authentication();

select tests.authenticate_as('semcrm@tpl.test');
select is((select count(*)::int from public.crm_whatsapp_templates), 0, 'quem nao tem o Comercial nao ve modelo');
select tests.clear_authentication();

select tests.authenticate_as('vendedorb@tpl.test');
select is(
  (select count(*)::int from public.crm_whatsapp_templates where tenant_id = (select a from f)),
  0,
  'a empresa B nao ve os modelos da A'
);
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- O lead que esfriou
-- ───────────────────────────────────────────────────────────────────────────
create temporary table s on commit drop as
select (select id from public.crm_pipeline_stages
         where tenant_id = (select a from f) and kind = 'open' order by position limit 1) as etapa,
       (select id from public.crm_pipeline_stages
         where tenant_id = (select b from f) and kind = 'open' order by position limit 1) as etapa_b,
       gen_random_uuid() as contato, gen_random_uuid() as contato_b,
       gen_random_uuid() as parado, gen_random_uuid() as recente,
       gen_random_uuid() as vivo, gen_random_uuid() as parado_b;
grant select on s to authenticated;

insert into public.crm_contacts (id, tenant_id, name) select contato, (select a from f), 'Cliente A' from s;
insert into public.crm_contacts (id, tenant_id, name) select contato_b, (select b from f), 'Cliente B' from s;

insert into public.crm_deals (id, tenant_id, contact_id, stage_id, title)
select parado,  (select a from f), contato, etapa, 'Sumiu mesmo' from s
union all select recente, (select a from f), contato, etapa, 'Mexido hoje' from s
union all select vivo,    (select a from f), contato, etapa, 'Negociacao viva' from s;
insert into public.crm_deals (id, tenant_id, contact_id, stage_id, title)
select parado_b, (select b from f), contato_b, etapa_b, 'Parado na empresa B' from s;

-- `updated_at` é mantido por trigger: o `update` que tentaria envelhecer é o
-- mesmo que rejuvenesce. Desligar o gatilho é a única forma de montar o cenário.
alter table public.crm_deals disable trigger handle_crm_deals_updated_at;
update public.crm_deals
   set updated_at = now() - interval '45 days', created_at = now() - interval '60 days'
 where id in (select parado from s union all select vivo from s union all select parado_b from s);
alter table public.crm_deals enable trigger handle_crm_deals_updated_at;

-- No "negociação viva" o vendedor anotou ontem. O registro está velho, mas o
-- negócio não está parado — e reengajar aqui é importunar cliente no meio de
-- uma conversa.
insert into public.crm_deal_activities (tenant_id, deal_id, kind, content, created_at)
select (select a from f), vivo, 'note', 'cliente pediu para ligar em marco', now() - interval '1 day' from s;

insert into public.automation_workflows (tenant_id, module, name, status, trigger, steps)
select (select a from f), 'crm', 'Reengajar quem sumiu', 'active',
       jsonb_build_object('kind', 'deal_idle', 'dias', 30, 'next', jsonb_build_array('s1')),
       jsonb_build_array(jsonb_build_object(
         'id', 's1', 'kind', 'add_note',
         'config', jsonb_build_object('text', 'reengajado'), 'next', jsonb_build_array()))
  from s;

create temporary table t1 on commit drop as select public.automation_tick() as res;
grant select on t1 to authenticated;

select is(((select res from t1)->>'deal_idle')::int, 1, 'o tique acha um negocio parado');
select is(
  (select count(*)::int from public.automation_runs
    where subject_id = (select parado from s)),
  1,
  'e abre o fluxo para quem sumiu de verdade'
);
select is(
  (select count(*)::int from public.automation_runs where subject_id = (select recente from s)),
  0,
  'nao mexe com o negocio de hoje'
);
-- A asserção que mais importa: registro velho com conversa nova **não** é lead
-- frio. Sem ela, o fluxo diário mandaria mensagem no meio de uma negociação.
select is(
  (select count(*)::int from public.automation_runs where subject_id = (select vivo from s)),
  0,
  'nem com o negocio que tem anotacao de ontem'
);
select is(
  (select count(*)::int from public.automation_runs where subject_id = (select parado_b from s)),
  0,
  'e nao varre a empresa B junto'
);

-- O tique roda todo minuto. Sem a marca de "já disparou", o mesmo cliente
-- receberia a mesma mensagem para sempre — que é como se queima um número.
select public.automation_tick();
select is(
  (select count(*)::int from public.automation_runs where subject_id = (select parado from s)),
  1,
  'o tique seguinte nao reengaja o mesmo negocio de novo'
);

-- ───────────────────────────────────────────────────────────────────────────
-- O motor conhece o passo e o gatilho novos
-- ───────────────────────────────────────────────────────────────────────────
select lives_ok(
  $$ select public.automation_validate_flow(
       jsonb_build_object('kind', 'deal_idle', 'dias', 15, 'next', jsonb_build_array('s1')),
       jsonb_build_array(jsonb_build_object(
         'id', 's1', 'kind', 'whatsapp_template',
         'config', jsonb_build_object('modelo', 'retomar_contato', 'idioma', 'pt_BR'),
         'next', jsonb_build_array()))) $$,
  'o motor aceita o gatilho do lead frio com o passo da mensagem-modelo'
);
select throws_ok(
  $$ select public.automation_validate_flow(
       jsonb_build_object('kind', 'inventado', 'next', jsonb_build_array()),
       jsonb_build_array()) $$,
  null, null,
  'e continua recusando gatilho que nao existe'
);

-- ───────────────────────────────────────────────────────────────────────────
-- A mensagem que saiu por modelo fica legível
-- ───────────────────────────────────────────────────────────────────────────
-- O modelo é uma forma; o que o cliente leu é a forma preenchida. Sem guardar
-- o texto final, a conversa mostraria "retomar_contato" para quem abrir depois.
insert into public.crm_messages
  (tenant_id, contact_id, deal_id, direction, body, status, template_name, template_language, template_vars)
select (select a from f), contato, parado, 'out',
       'Oi Joana, tudo bem? Vi que conversamos sobre o orcamento e ficou parado. Posso ajudar?',
       'sent', 'retomar_contato', 'pt_BR', jsonb_build_array('Joana', 'o orcamento')
  from s;

select tests.authenticate_as('vendedor@tpl.test');
select is(
  (select template_name from public.crm_messages where deal_id = (select parado from s)),
  'retomar_contato',
  'a conversa registra qual modelo saiu'
);
select is(
  (select body like 'Oi Joana%' from public.crm_messages where deal_id = (select parado from s)),
  true,
  'e guarda o texto ja preenchido, que e o que o cliente leu'
);
select is(
  (select jsonb_array_length(template_vars) from public.crm_messages where deal_id = (select parado from s)),
  2,
  'com as informacoes que preencheram as lacunas'
);
select tests.clear_authentication();

select * from finish();
rollback;

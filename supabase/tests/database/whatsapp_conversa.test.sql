-- CRM-4a: WhatsApp, a conversa dentro do negócio (migration 20261001010000).
-- Prova:
--   - mensagem de número desconhecido vira contato, negócio e conversa, juntos
--   - a **reentrega** da Meta não duplica nada — é o defeito que mais aparece
--     em integração de webhook, e o que a chave do id da mensagem impede
--   - cliente já cadastrado à mão, com telefone formatado, é reconhecido em vez
--     de virar um segundo contato
--   - a segunda mensagem cai no negócio que já estava aberto
--   - a credencial da empresa não é legível por ninguém logado, e a conversa é
--     de quem tem o Comercial
--   - outra empresa não vê conversa nem contato
begin;
\ir _helpers.psql

select plan(19);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-wa-a', 'Wa A') as a,
       tests.create_tenant('pgtap-wa-b', 'Wa B') as b;

create temporary table u on commit drop as
select tests.create_user('vendedor@wa.test',  (select a from f)) as vendedor,
       tests.create_user('semcrm@wa.test',    (select a from f)) as sem_crm,
       tests.create_user('vendedorb@wa.test', (select b from f)) as vendedor_b;
select tests.grant_module((select vendedor from u),   (select a from f), 'crm');
select tests.grant_module((select vendedor_b from u), (select b from f), 'crm');
grant select on f, u to authenticated, anon;

-- ───────────────────────────────────────────────────────────────────────────
-- A primeira mensagem de quem o sistema não conhece
-- ───────────────────────────────────────────────────────────────────────────
create temporary table m1 on commit drop as
select public.crm_whatsapp_receber(
  (select a from f), '5531988887777', 'Joana da Padaria', 'wamid.AAA',
  'Ola, tem pronta entrega?') as negocio;
grant select on m1 to authenticated, anon;

select isnt((select negocio from m1), null, 'a mensagem devolve o negocio onde caiu');
select is(
  (select count(*)::int from public.crm_contacts
    where tenant_id = (select a from f) and whatsapp_id = '5531988887777'),
  1,
  'o contato nasce com o numero do WhatsApp'
);
select is(
  (select source from public.crm_deals where id = (select negocio from m1)),
  'whatsapp',
  'e o negocio nasce sabendo de onde veio'
);
select is(
  (select st.kind from public.crm_deals d join public.crm_pipeline_stages st on st.id = d.stage_id
    where d.id = (select negocio from m1)),
  'open',
  'na primeira etapa do funil'
);
select is(
  (select body || '|' || direction || '|' || status from public.crm_messages
    where deal_id = (select negocio from m1)),
  'Ola, tem pronta entrega?|in|received',
  'e a mensagem fica guardada como recebida'
);

-- ───────────────────────────────────────────────────────────────────────────
-- A reentrega
-- ───────────────────────────────────────────────────────────────────────────
-- A Meta repete a mesma mensagem quando não recebe 200 rápido. Sem a chave do
-- `wa_message_id`, cada repetição viraria outra linha na conversa — e, pior,
-- outro negócio no funil se o contato ainda não existisse.
create temporary table m2 on commit drop as
select public.crm_whatsapp_receber(
  (select a from f), '5531988887777', 'Joana da Padaria', 'wamid.AAA',
  'Ola, tem pronta entrega?') as negocio;
grant select on m2 to authenticated;

select is(
  (select count(*)::int from public.crm_messages where deal_id = (select negocio from m1)),
  1,
  'a reentrega nao duplica a mensagem'
);
select is(
  (select negocio from m2), (select negocio from m1),
  'e devolve o mesmo negocio, em vez de abrir outro'
);
select is(
  (select count(*)::int from public.crm_deals where tenant_id = (select a from f)),
  1,
  'o funil continua com um negocio so'
);

-- ───────────────────────────────────────────────────────────────────────────
-- A segunda mensagem, de verdade
-- ───────────────────────────────────────────────────────────────────────────
select is(
  public.crm_whatsapp_receber((select a from f), '5531988887777', 'Joana', 'wamid.BBB', 'Alo?'),
  (select negocio from m1),
  'a mensagem seguinte cai no negocio que ja estava aberto'
);
select is(
  (select count(*)::int from public.crm_messages where deal_id = (select negocio from m1)),
  2,
  'e a conversa passa a ter duas'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Quem já era cliente não vira um segundo
-- ───────────────────────────────────────────────────────────────────────────
-- O telefone cadastrado à mão vem com parênteses, traço e sem DDI; a Meta manda
-- só dígitos com código do país. Sem casar os dois, o cliente de sempre
-- apareceria no funil como um desconhecido.
insert into public.crm_contacts (tenant_id, name, phone)
values ((select a from f), 'Mercado Central', '(31) 97777-6666');

select lives_ok(
  format($$ select public.crm_whatsapp_receber(%L::uuid, '5531977776666', 'Ze', 'wamid.CCC', 'Bom dia') $$,
         (select a from f)),
  'a mensagem de um cliente ja cadastrado entra'
);
select is(
  (select count(*)::int from public.crm_contacts
    where tenant_id = (select a from f) and (name = 'Mercado Central' or name = 'Ze')),
  1,
  'e nao cria um segundo contato para a mesma pessoa'
);
select is(
  (select whatsapp_id from public.crm_contacts
    where tenant_id = (select a from f) and name = 'Mercado Central'),
  '5531977776666',
  'o cadastro antigo e que ganha o numero do WhatsApp'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Quem vê o quê
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('vendedor@wa.test');
select is(
  (select count(*)::int from public.crm_messages),
  3,
  'quem tem o Comercial ve a conversa'
);
-- A credencial da empresa é fechada: nem quem está logado a lê. O token do
-- WhatsApp vale como uma senha — quem o tem fala pelo número da empresa.
select throws_ok(
  $$ select count(*) from public.tenant_whatsapp_connections $$,
  '42501', null,
  'nem quem tem o Comercial le a credencial do WhatsApp'
);
select tests.clear_authentication();

select tests.authenticate_as('semcrm@wa.test');
select is(
  (select count(*)::int from public.crm_messages),
  0,
  'quem nao tem o Comercial nao ve conversa nenhuma'
);
select tests.clear_authentication();

select tests.authenticate_as('vendedorb@wa.test');
select is(
  (select count(*)::int from public.crm_messages),
  0,
  'a empresa B nao ve a conversa da A'
);
select is(
  (select count(*)::int from public.crm_contacts where whatsapp_id is not null),
  0,
  'nem os contatos dela'
);
select tests.clear_authentication();

set local role anon;
select is(
  has_table_privilege('anon', 'public.crm_messages', 'select')::text
  || has_table_privilege('anon', 'public.tenant_whatsapp_connections', 'select')::text,
  'falsefalse',
  'e o visitante de fora nao tem porta para nenhuma das duas'
);
reset role;

select * from finish();
rollback;

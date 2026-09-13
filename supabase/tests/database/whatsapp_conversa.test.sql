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

select plan(26);

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

-- A função resolve a empresa pelo número de destino, e não pelo tenant que lhe
-- passam: assim nenhum chamador consegue gravar na empresa errada. Por isso as
-- duas empresas precisam de conexão antes de qualquer mensagem.
insert into public.tenant_whatsapp_connections (tenant_id, phone_number_id, waba_id, access_token, display_phone)
values ((select a from f), 'pn-empresa-a', 'waba-a', 'token-a', '+55 31 3333-0001'),
       ((select b from f), 'pn-empresa-b', 'waba-b', 'token-b', '+55 31 3333-0002');

-- ───────────────────────────────────────────────────────────────────────────
-- A primeira mensagem de quem o sistema não conhece
-- ───────────────────────────────────────────────────────────────────────────
create temporary table m1 on commit drop as
select public.crm_whatsapp_receber(
  'pn-empresa-a', '5531988887777', 'Joana da Padaria', 'wamid.AAA',
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
  'pn-empresa-a', '5531988887777', 'Joana da Padaria', 'wamid.AAA',
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
  public.crm_whatsapp_receber('pn-empresa-a', '5531988887777', 'Joana', 'wamid.BBB', 'Alo?'),
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
values ((select a from f), 'Mercado Central', '(31) 97777-6666'),
       -- Um fixo de Campinas, para provar que **não** casa com um celular de BH.
       ((select a from f), 'Fixo de Campinas', '(19) 8888-7777');

select lives_ok(
  $$ select public.crm_whatsapp_receber('pn-empresa-a', '5531977776666', 'Ze', 'wamid.CCC', 'Bom dia') $$,
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

-- A outra metade da mesma regra, e a que quase passou: comparar os **dez**
-- últimos dígitos corta o país e o primeiro algarismo do DDD. O fixo
-- `(19) 8888-7777` virava `1988887777`, e o celular de BH `5531988887777`
-- também — pessoas diferentes, mesmo cadastro. Pior que misturar conversa: a
-- resposta do vendedor passaria a ir para o número do estranho.
select is(
  public.crm_telefone_chave('(19) 8888-7777') = public.crm_telefone_chave('5531988887777'),
  false,
  'fixo de Campinas nao e celular de BH, mesmo terminando igual'
);
select is(
  (select count(*)::int from public.crm_contacts
    where tenant_id = (select a from f) and name = 'Fixo de Campinas' and whatsapp_id is not null),
  0,
  'e o cadastro dele nao foi sequestrado por uma conversa alheia'
);
-- De quebra: celular antigo, cadastrado antes do nono dígito, continua sendo a
-- mesma pessoa.
select is(
  public.crm_telefone_chave('(31) 7777-6666') = public.crm_telefone_chave('5531977776666'),
  true,
  'e o celular sem o nono digito ainda e reconhecido'
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
-- O que segurava a escrita da conversa era só a **ausência de policy** — o
-- privilégio continuava concedido. Uma policy `for all` acrescentada por engano
-- numa leva futura abriria a escrita sem reprovar teste nenhum. Agora o
-- privilégio não existe, e esta asserção acusa se ele voltar.
select throws_ok(
  format($$ insert into public.crm_messages (tenant_id, contact_id, direction, body)
            values (%L::uuid, %L::uuid, 'out', 'escrevi na mao') $$,
         (select a from f),
         (select id from public.crm_contacts where tenant_id = (select a from f) limit 1)),
  '42501', null,
  'ninguem escreve mensagem pela tela — quem grava e quem falou com a Meta'
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

-- ───────────────────────────────────────────────────────────────────────────
-- A empresa é resolvida pelo número de destino, não por quem chama
-- ───────────────────────────────────────────────────────────────────────────
-- A função é `security definer`. Enquanto recebia o tenant pronto, o isolamento
-- dependia de quem chamava ter acertado; agora ela mesma descobre a empresa
-- pelo `phone_number_id`, onde o índice único garante um dono só.
select is(
  (select tenant_id from public.crm_messages
    where id = (select id from public.crm_messages
                 where wa_message_id = 'wamid.CCC')),
  (select a from f),
  'a mensagem foi parar na empresa dona do numero de destino'
);
select throws_ok(
  $$ select public.crm_whatsapp_receber('pn-que-nao-existe', '5531900000000', 'Ninguem', 'wamid.XXX', 'Oi') $$,
  'P0002', null,
  'numero que nao e de empresa nenhuma nao grava em lugar nenhum'
);

-- O visitante de fora: exercitado **como** anon, e não perguntando ao catálogo.
-- A asserção anterior lia `has_table_privilege` com o papel no argumento, o que
-- responde igual de qualquer assento — era verdadeira sem provar o que dizia.
set local role anon;
select throws_ok(
  $$ select count(*) from public.crm_messages $$,
  '42501', null,
  'visitante de fora nao le a conversa'
);
select throws_ok(
  $$ select count(*) from public.tenant_whatsapp_connections $$,
  '42501', null,
  'nem a credencial'
);
reset role;

select * from finish();
rollback;

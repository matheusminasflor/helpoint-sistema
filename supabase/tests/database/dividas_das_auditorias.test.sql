-- As dívidas que as auditorias deixaram apontadas (migration 20261007010000).
--
-- Cada asserção aqui existe porque alguém achou o buraco e ele ficou aberto até
-- 2026-09-17. Sem prova, buraco fechado volta a abrir na leva seguinte.
--
-- Prova:
--   - o fluxo não escreve gente de outra empresa: avisar, dono de negócio,
--     dono de contato, atribuir chamado, autor de anotação e quem criou pedido
--     passaram todos a exigir a chave composta `(pessoa, tenant_id)`
--   - e a pessoa certa continua entrando, que é a metade que ninguém prova
--   - o Marketing volta a conseguir criar fornecedor e orçamento: `tenant_id`
--     obrigatório sem trigger nenhum fazia o INSERT falhar desde sempre
--   - a comparação do segredo do webhook não sai cedo
--   - `TRUNCATE`, que passa por cima de RLS, não é mais de quem está logado
begin;
\ir _helpers.psql

select plan(24);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-div-a', 'Dividas A') as a,
       tests.create_tenant('pgtap-div-b', 'Dividas B') as b;

create temporary table u on commit drop as
select tests.create_user('gente@div.test',  (select a from f)) as pa,
       tests.create_user('outro@div.test',  (select b from f)) as pb;
-- Cargo porque criar fornecedor do Marketing é de gestor: sem ele o teste
-- mediria a policy, e não o trigger de `tenant_id` que esta leva conserta.
select tests.grant_role((select pa from u), 'manager');
select tests.grant_module((select pa from u), (select a from f), 'marketing');
grant select on f, u to authenticated, anon;

create temporary table etapa on commit drop as
select s.id from public.crm_pipeline_stages s
 where s.tenant_id = (select a from f) order by s.position limit 1;
create temporary table contato on commit drop as
with ins as (
  insert into public.crm_contacts (tenant_id, name) select a, 'Cliente da prova' from f
  returning id
) select id from ins;
create temporary table negocio on commit drop as
with ins as (
  insert into public.crm_deals (tenant_id, title, contact_id, stage_id)
  select a, 'Negocio da prova', (select id from contato), (select id from etapa) from f
  returning id
) select id from ins;
grant select on etapa, contato, negocio to authenticated, anon;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. O fluxo guarda uuids na configuração; o banco é quem confere a empresa
-- ───────────────────────────────────────────────────────────────────────────
-- Só gerente edita fluxo, então o alcance era gerente de uma empresa mirando id
-- de outra: dado cruzado, não vazamento de leitura. A resposta é a chave
-- composta, e não um guard dentro da função de 16 KB que executa os passos —
-- assim vale para toda escrita, venha de onde vier.
select throws_ok(
  $$ insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
     select a, (select pb from u), 'automation', 'ticket', gen_random_uuid(), 'x', 'y' from f $$,
  '23503', null,
  'o passo "avisar" nao alcanca gente de outra empresa'
);
select throws_ok(
  $$ insert into public.crm_deals (tenant_id, title, contact_id, stage_id, owner_id)
     select a, 'negocio', (select id from contato), (select id from etapa), (select pb from u) from f $$,
  '23503', null,
  'negocio nao nasce com dono de outra empresa'
);
select throws_ok(
  $$ insert into public.crm_contacts (tenant_id, name, owner_id)
     select a, 'contato', (select pb from u) from f $$,
  '23503', null,
  'contato nao nasce com dono de outra empresa'
);
select throws_ok(
  $$ insert into public.tickets (tenant_id, title, description, module, requester_id, assigned_to)
     select a, 'chamado', 'x', 'tickets', (select pa from u), (select pb from u) from f $$,
  '23503', null,
  'chamado nao e atribuido a gente de outra empresa'
);
select throws_ok(
  $$ insert into public.crm_orders (tenant_id, contact_id, created_by)
     select a, (select id from contato), (select pb from u) from f $$,
  '23503', null,
  'pedido nao nasce criado por gente de outra empresa'
);

-- As outras cinco colunas da mesma leva. Provar duas e deixar oito na fé é o
-- que faz a metade de trás voltar a abrir na leva seguinte.
select throws_ok(
  $$ insert into public.tickets (tenant_id, title, description, module, requester_id)
     select a, 'chamado', 'x', 'tickets', (select pb from u) from f $$,
  '23503', null,
  'chamado nao e aberto em nome de gente de outra empresa'
);
select throws_ok(
  $$ insert into public.tickets (tenant_id, title, description, module, requester_id, created_by)
     select a, 'chamado', 'x', 'tickets', (select pa from u), (select pb from u) from f $$,
  '23503', null,
  'nem criado por gente de outra empresa'
);
select throws_ok(
  $$ insert into public.crm_deals (tenant_id, title, contact_id, stage_id, created_by)
     select a, 'negocio', (select id from contato), (select id from etapa), (select pb from u) from f $$,
  '23503', null,
  'negocio nao e criado por gente de outra empresa'
);
select throws_ok(
  $$ insert into public.crm_contacts (tenant_id, name, created_by)
     select a, 'contato', (select pb from u) from f $$,
  '23503', null,
  'contato nao e criado por gente de outra empresa'
);
select throws_ok(
  $$ insert into public.crm_deal_activities (tenant_id, deal_id, kind, content, author_id)
     select a, (select id from negocio), 'note', 'x', (select pb from u) from f $$,
  '23503', null,
  'anotacao nao e assinada por gente de outra empresa'
);

-- A metade que ninguém prova: fechar a porta não pode fechar o caminho normal.
select lives_ok(
  $$ insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
     select a, (select pa from u), 'automation', 'ticket', gen_random_uuid(), 'x', 'y' from f
     returning id $$,
  'avisar a pessoa da propria empresa continua funcionando'
);
select lives_ok(
  $$ insert into public.crm_deals (tenant_id, title, contact_id, stage_id, owner_id)
     select a, 'negocio bom', (select id from contato), (select id from etapa), (select pa from u) from f
     returning id $$,
  'e o negocio nasce com o dono certo'
);
-- **Pessoa nula continua entrando**, e isto é o que o formulário do site, o
-- WhatsApp e o Lead Ads dependem: eles escrevem sem ninguém logado, e
-- `author_id` nulo quer dizer "o sistema escreveu". A chave composta é MATCH
-- SIMPLE, então nulo passa — mas isso é fácil de perder numa leva futura.
select lives_ok(
  $$ insert into public.crm_deal_activities (tenant_id, deal_id, kind, content)
     select a, (select id from negocio), 'note', 'escrito pelo sistema' from f
     returning id $$,
  'anotacao sem autor (escrita pelo sistema) continua entrando'
);

-- As tres que a leva anterior deixou como `no action` sem querer: apagar quem
-- criou tem de **zerar** o campo, e nao travar o sistema inteiro.
create temporary table pc on commit drop as
select tests.create_user('some@div.test', (select a from f)) as id;
create temporary table contato_dele on commit drop as
with ins as (
  insert into public.crm_contacts (tenant_id, name, created_by)
  select a, 'Contato de quem saiu', (select id from pc) from f
  returning id
) select id from ins;
grant select on pc, contato_dele to authenticated, anon;

delete from public.profiles where id = (select id from pc);
select is(
  (select created_by from public.crm_contacts where id = (select id from contato_dele)),
  null,
  'apagar quem criou zera o campo, em vez de travar — era assim antes e voltou a ser'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. O Marketing não conseguia criar fornecedor
-- ───────────────────────────────────────────────────────────────────────────
-- `tenant_id NOT NULL` sem default e sem trigger, e nenhum hook manda a coluna:
-- o INSERT falhava com 23502 desde sempre. Provado do jeito que a tela faz —
-- logado, sem mandar o tenant.
select tests.authenticate_as('gente@div.test');

select lives_ok(
  $$ insert into public.mkt_suppliers (name) values ('Fornecedor pela tela') returning id $$,
  'criar fornecedor do Marketing volta a funcionar'
);
select is(
  (select tenant_id from public.mkt_suppliers where name = 'Fornecedor pela tela'),
  (select a from f),
  'e ele nasce na empresa de quem esta logado'
);
-- O cabeçalho promete fornecedor **e** orçamento; provar um só deixava três dos
-- quatro triggers na fé.
select lives_ok(
  $$ insert into public.mkt_quotations (supplier_id, title)
     select (select id from public.mkt_suppliers where name = 'Fornecedor pela tela'), 'Orcamento pela tela'
     returning id $$,
  'criar orcamento do Marketing volta a funcionar'
);

-- `TRUNCATE` passa por cima de RLS: o privilegio nao e de quem esta logado.
select throws_ok(
  $$ truncate public.notifications $$,
  '42501', null,
  'ninguem logado esvazia uma tabela inteira'
);

select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- 3. A comparação do segredo do webhook
-- ───────────────────────────────────────────────────────────────────────────
-- O que se compara são hashes, não segredos — o risco era teórico. Fechado
-- assim mesmo, porque custa quatro linhas e tira o assunto da lista.
select ok(public.hash_igual('abc', 'abc'), 'hashes iguais batem');
select ok(not public.hash_igual('abc', 'abd'), 'hashes diferentes nao batem');
select ok(not public.hash_igual('abc', 'abcd'), 'tamanhos diferentes nao batem');
select ok(not public.hash_igual('abc', null), 'nulo nao bate com nada');

-- E a **corrente**, não só o elo: a migration reescreveu `automation_webhook_fire`
-- inteira para trocar uma chamada, e nada travava se a próxima leva perdesse
-- uma das guardas no caminho. É a regra 8 do CLAUDE.md, do lado que ninguém vê.
create temporary table fluxo on commit drop as
with ins as (
  insert into public.automation_workflows (tenant_id, name, module, status, trigger, steps)
  select a, 'Fluxo do webhook', 'crm', 'active',
         jsonb_build_object('kind', 'webhook',
           'secret_hash', encode(extensions.digest('segredo-certo', 'sha256'), 'hex')),
         '[]'::jsonb
  from f returning id
) select id from ins;
create temporary table fluxo_sem_segredo on commit drop as
with ins as (
  insert into public.automation_workflows (tenant_id, name, module, status, trigger, steps)
  select a, 'Fluxo sem segredo', 'crm', 'active',
         jsonb_build_object('kind', 'webhook', 'secret_hash', ''), '[]'::jsonb
  from f returning id
) select id from ins;

select throws_ok(
  $$ select public.automation_webhook_fire((select id from fluxo), 'segredo-errado', '{}'::jsonb) $$,
  'P0003', 'segredo inválido',
  'webhook de fluxo recusa o segredo errado'
);
select throws_ok(
  $$ select public.automation_webhook_fire((select id from fluxo_sem_segredo), '', '{}'::jsonb) $$,
  'P0003', 'segredo inválido',
  'e fluxo sem segredo cadastrado nao dispara com segredo vazio'
);

select * from finish();
rollback;

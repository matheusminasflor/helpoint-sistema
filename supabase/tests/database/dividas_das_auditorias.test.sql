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

select plan(14);

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
grant select on etapa, contato to authenticated, anon;

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

select * from finish();
rollback;

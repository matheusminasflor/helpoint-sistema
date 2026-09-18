-- L11a: Chat interno — canais por setor e mensagens (migration 20261011010000).
-- Prova:
--   - canal aberto: todo mundo da empresa entra e le; canal fechado: so quem
--     foi convidado (decisao 1)
--   - a armadilha do `returning` (licao 11 do CLAUDE.md): criar canal ABERTO
--     e FECHADO tem que devolver a linha no INSERT, antes do trigger que poe
--     o autor em `chat_channel_members` rodar — e' por isso que
--     `chat_canal_visivel` precisa do `or created_by = auth.uid()`
--   - o realtime nao vaza: a policy de SELECT de `chat_messages` e' o unico
--     portao que o `postgres_changes` consulta
--   - dono/administrador VEEM que o canal fechado existe (para escolher qual
--     apagar numa lista, e para a faxina da decisao 6), mas NAO leem as
--     mensagens de dentro (decisao 11, revista em 2026-09-18 — apagar exige
--     visibilidade por SELECT no Postgres, e "apagar sem ver" nao se
--     expressa em RLS; a linha de privacidade passou do canal para a msg)
--   - mensagem so se apaga, nunca se edita; apagar zera o texto no banco
--   - apagar o canal leva as mensagens junto (decisao 6)
--   - outra empresa nao enxerga nem encosta
begin;
\ir _helpers.psql

select plan(25);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-chat-a', 'Chat A') as a,
       tests.create_tenant('pgtap-chat-b', 'Chat B') as b;

create temporary table u on commit drop as
select tests.create_user('ana@chat.test',     (select a from f)) as ana,
       tests.create_user('bruno@chat.test',   (select a from f)) as bruno,
       tests.create_user('dona@chat.test',    (select a from f)) as dona,
       tests.create_user('adm@chat.test',     (select a from f)) as adm,
       tests.create_user('carlosb@chat.test', (select b from f)) as carlos_b;
select tests.grant_role((select dona from u), 'owner');
select tests.grant_role((select adm  from u), 'admin');
grant select on f, u to authenticated, anon;

create temporary table s on commit drop as
select gen_random_uuid() as canal_aberto,
       gen_random_uuid() as canal_fechado,
       gen_random_uuid() as msg_bruno,
       gen_random_uuid() as msg_ana1,
       gen_random_uuid() as msg_ana2,
       gen_random_uuid() as msg_fechado;
grant select on s to authenticated, anon;

-- ───────────────────────────────────────────────────────────────────────────
-- Ana cria o canal aberto
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('ana@chat.test');

-- #1 — `returning` de proposito (regra 2 das cinco: e' assim que o PostgREST
-- insere). Prova que o INSERT devolve a linha mesmo no instante em que o
-- trigger que poe o autor em `chat_channel_members` ainda nao rodou.
create temporary table novo_aberto on commit drop as
with criado as (
  insert into public.chat_channels (id, tenant_id, nome, privado, created_by)
  select canal_aberto, (select a from f), 'geral', false, auth.uid() from s
  returning id
)
select id from criado;
grant select on novo_aberto to authenticated;
select is((select count(*)::int from novo_aberto), 1, 'Ana cria o canal aberto e o insert com returning devolve a linha');

-- #2
select is(
  (select count(*)::int from public.chat_channel_members where channel_id = (select canal_aberto from s)),
  1,
  'quem abre o canal ja entra nele, sem precisar se convidar'
);

insert into public.chat_messages (id, tenant_id, channel_id, author_id, conteudo)
select msg_ana1, (select a from f), canal_aberto, auth.uid(), 'primeira mensagem da ana' from s;
insert into public.chat_messages (id, tenant_id, channel_id, author_id, conteudo)
select msg_ana2, (select a from f), canal_aberto, auth.uid(), 'segunda mensagem da ana' from s;
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- Bruno, sem convite, ve e escreve no canal aberto
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('bruno@chat.test');

-- #3
select is(
  (select count(*)::int from public.chat_channels where id = (select canal_aberto from s)),
  1,
  'Bruno, que nao foi convidado, ve o canal aberto'
);

-- #4 — mesma prova de returning, do lado de quem nao e' o criador.
create temporary table novo_msg_bruno on commit drop as
with criada as (
  insert into public.chat_messages (id, tenant_id, channel_id, author_id, conteudo)
  select msg_bruno, (select a from f), canal_aberto, auth.uid(), 'oi, pessoal' from s
  returning id
)
select id from criada;
grant select on novo_msg_bruno to authenticated;
select is((select count(*)::int from novo_msg_bruno), 1, 'Bruno escreve no canal aberto e o insert com returning devolve a linha');
select tests.clear_authentication();

select tests.authenticate_as('ana@chat.test');
-- #5
select is(
  (select count(*)::int from public.chat_messages where id = (select msg_bruno from s)),
  1,
  'Ana ve a mensagem do Bruno no canal aberto'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Ana cria um canal FECHADO — a armadilha do returning outra vez
-- ───────────────────────────────────────────────────────────────────────────
-- #6 — a asserção que existe por causa da lição 11: sem
-- `or created_by = auth.uid()` em `chat_canal_visivel`, este INSERT levaria
-- 42501 para TODO MUNDO que não é dono/admin, porque no instante do
-- RETURNING o trigger que põe o autor em `chat_channel_members` ainda não
-- rodou.
create temporary table novo_fechado on commit drop as
with criado as (
  insert into public.chat_channels (id, tenant_id, nome, privado, created_by)
  select canal_fechado, (select a from f), 'diretoria', true, auth.uid() from s
  returning id
)
select id from criado;
grant select on novo_fechado to authenticated;
select is(
  (select count(*)::int from novo_fechado), 1,
  'Ana cria canal FECHADO e o insert com returning devolve a linha (a armadilha do returning)'
);

insert into public.chat_messages (id, tenant_id, channel_id, author_id, conteudo)
select msg_fechado, (select a from f), canal_fechado, auth.uid(), 'so entre nos' from s;
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- Bruno, sem convite, NAO ve o canal fechado nem a mensagem dele
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('bruno@chat.test');

-- #7
select is(
  (select count(*)::int from public.chat_channels where id = (select canal_fechado from s)),
  0,
  'Bruno, sem convite, nao ve o canal fechado'
);

-- #8 — a asserção mais importante do arquivo: e' esta mesma policy de SELECT
-- que o `postgres_changes` avalia por assinante. Se ela estivesse larga, a
-- mensagem do canal fechado apareceria na tela de quem nao e' do canal, ao
-- vivo, sem segundo portao para pegar o vazamento.
select is(
  (select count(*)::int from public.chat_messages where id = (select msg_fechado from s)),
  0,
  'Bruno, sem convite, nao ve a mensagem do canal fechado — prova que o realtime nao vaza'
);

-- #9
select throws_ok(
  format($$ insert into public.chat_messages (tenant_id, channel_id, author_id, conteudo)
            values (%L::uuid, %L::uuid, auth.uid(), 'tentando entrar') $$,
         (select a from f), (select canal_fechado from s)),
  '42501', null,
  'Bruno nao consegue escrever no canal fechado'
);

-- #10
select throws_ok(
  format($$ insert into public.chat_channel_members (tenant_id, channel_id, user_id)
            values (%L::uuid, %L::uuid, auth.uid()) $$,
         (select a from f), (select canal_fechado from s)),
  '42501', null,
  'Bruno nao consegue se inserir como membro do canal fechado'
);
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- Ana convida o Bruno — agora ele ve tudo
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('ana@chat.test');
insert into public.chat_channel_members (tenant_id, channel_id, user_id)
select (select a from f), canal_fechado, (select bruno from u) from s;
select tests.clear_authentication();

select tests.authenticate_as('bruno@chat.test');
-- #11
select is(
  (select count(*)::int from public.chat_channels where id = (select canal_fechado from s))::text
  || (select count(*)::int from public.chat_messages where id = (select msg_fechado from s))::text,
  '11',
  'convidado, Bruno passa a ver o canal fechado e a mensagem dele'
);
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- Decisao 11 (revista): administrador VE que o canal fechado existe, mas
-- NAO le as mensagens de dentro — e mesmo assim apaga o canal inteiro
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('adm@chat.test');

-- #12 — a metade que mudou: e' isto que resolve a asserção 13 (apagar sem
-- ver nao se expressa em RLS — DELETE exige achar a linha por SELECT antes).
-- Se alguem tirar `or is_admin_or_higher` de `chat_canal_visivel`, esta
-- asserção reprova.
select is(
  (select count(*)::int from public.chat_channels where id = (select canal_fechado from s)),
  1,
  'administrador ve que o canal fechado existe, mesmo sem participar (decisao 11, revista)'
);

-- #13 — a metade que NAO mudou, e e' a que carrega a privacidade de fato: a
-- visibilidade do CANAL nao vaza para a MENSAGEM. Se alguem trocar
-- `chat_sou_membro` por `chat_canal_visivel` na policy de SELECT de
-- `chat_messages` (tabela de carona), esta asserção reprova.
select is(
  (select count(*)::int from public.chat_messages where id = (select msg_fechado from s)),
  0,
  'mas administrador nao le a mensagem do canal fechado de que nao participa'
);

-- #14 — o poder de destruir sem ler, e o `on delete cascade` da decisao 6.
-- So passa a funcionar por causa da asserção 12: antes da revisão da decisão
-- 11, o `DELETE ... RETURNING` nao achava a linha (a mesma armadilha do
-- returning, agora do lado do apagar) e o administrador nao apagava nada.
create temporary table apagou_fechado on commit drop as
with apagado as (
  delete from public.chat_channels where id = (select canal_fechado from s)
  returning id
)
select id from apagado;
select is(
  (select count(*)::int from apagou_fechado)::text || '|'
  || (select count(*)::int from public.chat_messages where id = (select msg_fechado from s))::text,
  '1|0',
  'administrador apaga o canal fechado sem ler, e as mensagens somem junto (decisao 6)'
);
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- Mensagem so se apaga, nunca se edita
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('ana@chat.test');

-- #15
select throws_ok(
  format($$ update public.chat_messages set conteudo = 'editada' where id = %L::uuid $$,
         (select msg_ana1 from s)),
  'P0001', 'mensagem do chat nao se edita: so se apaga',
  'Ana nao consegue editar o texto da propria mensagem'
);

-- #16
create temporary table apagou_msg1 on commit drop as
with apagada as (
  update public.chat_messages set deleted_at = now()
   where id = (select msg_ana1 from s)
  returning id, conteudo
)
select id, conteudo from apagada;
select is(
  (select count(*)::int from apagou_msg1)::text || '|' || coalesce((select conteudo from apagou_msg1), '(nulo)'),
  '1|',
  'Ana apaga a propria mensagem: 1 linha afetada e o conteudo vira vazio no banco'
);
select tests.clear_authentication();

-- #17 — UPDATE barrado por policy nao levanta erro: a linha e' filtrada e o
-- comando afeta zero linhas (licao 12 do CLAUDE.md) — nao e' `throws_ok`.
select tests.authenticate_as('bruno@chat.test');
create temporary table tenta_bruno on commit drop as
with alterada as (
  update public.chat_messages set deleted_at = now()
   where id = (select msg_ana2 from s)
  returning id
)
select id from alterada;
select is(
  (select count(*)::int from tenta_bruno), 0,
  'Bruno apagando mensagem da Ana — update filtrado pela policy, zero linhas'
);
select tests.clear_authentication();

-- #18 — a faxina da decisao 6.
select tests.authenticate_as('adm@chat.test');
create temporary table apaga_adm on commit drop as
with alterada as (
  update public.chat_messages set deleted_at = now()
   where id = (select msg_ana2 from s)
  returning id
)
select id from alterada;
select is(
  (select count(*)::int from apaga_adm), 1,
  'administrador apaga mensagem alheia em canal aberto (a faxina da decisao 6)'
);
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- A outra empresa
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('carlosb@chat.test');

-- #19
select is(
  (select count(*)::int from public.chat_channels where id = (select canal_aberto from s))::text
  || (select count(*)::int from public.chat_messages where id = (select msg_ana2 from s))::text,
  '00',
  'carlos_b (empresa B) nao ve o canal nem a mensagem da empresa A'
);

-- #20 — `inject_tenant_id` levanta "tenant_id mismatch" antes de a RLS entrar
-- em cena (o trigger BEFORE roda antes do WITH CHECK ser avaliado).
select throws_ok(
  format($$ insert into public.chat_messages (tenant_id, channel_id, author_id, conteudo)
            values (%L::uuid, %L::uuid, auth.uid(), 'invadindo') $$,
         (select a from f), (select canal_aberto from s)),
  'P0001', 'tenant_id mismatch: cannot insert data for another tenant',
  'carlos_b inserindo mensagem com tenant_id da empresa A e recusado'
);
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- Tempo real e o visitante de fora
-- ───────────────────────────────────────────────────────────────────────────
-- #21
select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'),
  1,
  'chat_messages esta na publicacao de tempo real'
);

-- #22
set local role anon;
select is(
  has_table_privilege('anon', 'public.chat_messages', 'select')::text,
  'false',
  'anon nao tem select em chat_messages'
);
reset role;

-- ───────────────────────────────────────────────────────────────────────────
-- A porta lateral do marcador de leitura (achado da auditoria, 2026-09-18)
-- ───────────────────────────────────────────────────────────────────────────
-- A policy de UPDATE de `chat_channel_members` existe para mover `last_read_at`
-- e mais nada. Mas nada prendia o `channel_id`: o administrador entrava num
-- canal ABERTO (coisa que a propria tela faz) e mudava a linha de canal, virando
-- membro do FECHADO. Depois disso ele lia, escrevia e recebia o tempo real.
-- Nenhuma das 22 assercoes anteriores tocava nessa policy — era a unica das nove
-- sem cobertura, e era onde o furo estava.
--
-- ┌─ Por que este bloco monta canais PROPRIOS ─────────────────────────────┐
-- │ A primeira versao reusava `canal_aberto` e `canal_fechado` de `s`. Mas │
-- │ a assercao #14 ja APAGOU o `canal_fechado` (e' ela que prova a decisao │
-- │ 6, "apagar o canal leva as mensagens junto"). Com o canal apagado,     │
-- │ estas duas contavam zero de qualquer jeito — passariam verdes **com o  │
-- │ defeito presente**, que e' a definicao de assercao decorativa. Achado  │
-- │ do executor ao rodar a mutacao: ela nao ficava vermelha, ela derrubava │
-- │ a suite com 42501, e o 42501 vinha do canal inexistente, nao do        │
-- │ conserto. Fixture propria, entao, e independente do que #14 destroi.   │
-- └────────────────────────────────────────────────────────────────────────┘
select tests.authenticate_as('ana@chat.test');
create temporary table hop on commit drop as
with aberto as (
  insert into public.chat_channels (tenant_id, nome, privado, created_by)
  select (select a from f), 'corredor', false, auth.uid() returning id
), fechado as (
  insert into public.chat_channels (tenant_id, nome, privado, created_by)
  select (select a from f), 'sala fechada', true, auth.uid() returning id
) select (select id from aberto) as aberto, (select id from fechado) as fechado;
grant select on hop to authenticated;
insert into public.chat_messages (tenant_id, channel_id, author_id, conteudo)
select (select a from f), (select fechado from hop), auth.uid(), 'so entre nos, de novo';
select tests.clear_authentication();

select tests.authenticate_as('adm@chat.test');
-- O administrador entra no canal aberto — coisa que a propria tela faz ao abrir
-- o canal — e depois tenta arrastar essa linha para dentro do fechado.
insert into public.chat_channel_members (tenant_id, channel_id, user_id)
select (select a from f), (select aberto from hop), (select adm from u);
update public.chat_channel_members
   set channel_id = (select fechado from hop)
 where user_id = (select adm from u) and channel_id = (select aberto from hop);

-- #23 — o que importa nao e se o UPDATE afetou linha (ele afeta: o relogio
-- anda), e sim que a linha NAO saiu do canal aberto.
select is(
  (select count(*)::int from public.chat_channel_members
    where user_id = (select adm from u) and channel_id = (select fechado from hop)),
  0,
  'administrador nao move a propria participacao para dentro do canal fechado'
);

-- #24 — e a consequencia, que e o que o usuario sentiria: continua sem ler.
select is(
  (select count(*)::int from public.chat_messages where channel_id = (select fechado from hop)),
  0,
  'e por isso continua sem ler as mensagens do canal fechado'
);
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- Quem apagou nao se assina com o nome de outra pessoa
-- ───────────────────────────────────────────────────────────────────────────
-- Era `coalesce(new.deleted_by, auth.uid())`, e o `coalesce` respeita o que o
-- cliente mandar. Coluna de auditoria de dado de pessoa (LGPD) que mente e pior
-- do que coluna que nao existe.
select tests.authenticate_as('bruno@chat.test');
create temporary table msg_bruno on commit drop as
with ins as (
  insert into public.chat_messages (tenant_id, channel_id, author_id, conteudo)
  select (select a from f), (select canal_aberto from s), (select bruno from u), 'do bruno'
  returning id
) select id from ins;
update public.chat_messages
   set deleted_at = now(), deleted_by = (select ana from u)
 where id = (select id from msg_bruno);

-- #25
select is(
  (select deleted_by from public.chat_messages where id = (select id from msg_bruno)),
  (select bruno from u),
  'quem apagou e quem esta logado, nao o nome que o cliente mandou'
);
select tests.clear_authentication();

select * from finish();
rollback;

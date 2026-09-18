-- L11b: Chat interno — menção, não-lidas e conversa direta (migration
-- 20261013010000). Fixture própria, independente da de
-- `chat_canais_e_mensagens.test.sql` (lição do achado da auditoria da L11a:
-- reusar fixture de outro bloco pode fazer a asserção contar zero de
-- qualquer jeito, com ou sem o defeito — decorativa. Aqui cada bloco monta o
-- que precisa).
--
-- Prova:
--   - `@fulano` em canal aberto vira aviso no sino, com o tipo `mention` que
--     já existe no enum (decisão 8)
--   - autor não avisa a si mesmo, e o aviso não atravessa empresa
--   - mencionar alguém de um canal FECHADO de que ele não participa não
--     vaza o começo da mensagem no sino dele — o risco número um da leva
--   - `chat_nao_lidas()` conta certo: ignora mensagem própria, mensagem
--     apagada e canal de que não se participa; zera quando o marcador anda
--   - `chat_abrir_conversa` é find-or-create (mesmo id na segunda chamada),
--     valida a outra pessoa e nunca atravessa empresa
--   - conversa direta é privada de verdade: quem não é dos dois não lê
--
-- ┌─ Cuidado que quase virou assertiva decorativa ─────────────────────────┐
-- │ As quatro primeiras asserções conferem o aviso no sino de quem foi     │
-- │ mencionado. `notifications` tem a policy "Users can view their own     │
-- │ notifications" (`user_id = auth.uid()`) — então contar                │
-- │ `where user_id = (select bruno from u)` enquanto a sessão ainda está   │
-- │ autenticada como ANA (quem mandou a mensagem) devolve 0 por RLS,       │
-- │ não porque o aviso não nasceu. As três asserções que esperam 0 (carlos │
-- │ de outra empresa, e a própria Ana) passariam assim mesmo — decorativas │
-- │ — e só a que espera 1 (o aviso do Bruno) denunciaria o problema, com   │
-- │ a mensagem errada ("have 0, want 1"). Por isso cada verificação        │
-- │ autentica como o próprio destinatário antes de contar: é assim que a  │
-- │ tela de verdade também lê o próprio sino.                              │
-- └──────────────────────────────────────────────────────────────────────┘
begin;
\ir _helpers.psql

select plan(12);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-chat-mencao-a', 'Chat Mencao A') as a,
       tests.create_tenant('pgtap-chat-mencao-b', 'Chat Mencao B') as b;

create temporary table u on commit drop as
select tests.create_user('ana2@chat.test',      (select a from f)) as ana,
       tests.create_user('bruno2@chat.test',    (select a from f)) as bruno,
       tests.create_user('dona2@chat.test',     (select a from f)) as dona,
       tests.create_user('carlosb2@chat.test',  (select b from f)) as carlos_b;
select tests.grant_role((select dona from u), 'owner');
grant select on f, u to authenticated, anon;

-- ───────────────────────────────────────────────────────────────────────────
-- Canais desta fixture (próprios, não tocam nos de outro arquivo)
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('ana2@chat.test');

create temporary table c on commit drop as
with aberto_m as (
  insert into public.chat_channels (tenant_id, nome, privado, created_by)
  select (select a from f), 'geral-mencao', false, auth.uid() returning id
), fechado_m as (
  insert into public.chat_channels (tenant_id, nome, privado, created_by)
  select (select a from f), 'diretoria-mencao', true, auth.uid() returning id
), aberto_n as (
  insert into public.chat_channels (tenant_id, nome, privado, created_by)
  select (select a from f), 'geral-naolidas', false, auth.uid() returning id
)
select (select id from aberto_m) as aberto_m,
       (select id from fechado_m) as fechado_m,
       (select id from aberto_n) as aberto_n;
grant select on c to authenticated;

-- Bruno entra no canal de não-lidas (canal aberto: ele mesmo se insere).
-- Ele NÃO entra no fechado — é o canal de que ele "não participa".
select tests.clear_authentication();
select tests.authenticate_as('bruno2@chat.test');
insert into public.chat_channel_members (tenant_id, channel_id, user_id)
select (select a from f), (select aberto_n from c), auth.uid();
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- Menção — cai no sino de quem é do canal, nunca de quem não é
-- ───────────────────────────────────────────────────────────────────────────
-- As três mensagens saem todas como Ana; cada aviso é conferido depois,
-- autenticado como o próprio destinatário (ver o comentário no topo).
select tests.authenticate_as('ana2@chat.test');

-- #1
insert into public.chat_messages (tenant_id, channel_id, author_id, conteudo, mencionados)
select (select a from f), (select aberto_m from c), auth.uid(), 'oi @Bruno, olha isso', array[(select bruno from u)];

-- #3 (mandada aqui, o aviso é conferido mais abaixo, como a própria Ana)

-- #4 — a asserção do risco número um: mencionar alguém de um canal FECHADO
-- de que ele não participa não pode vazar o começo da mensagem no sino dele.
insert into public.chat_messages (tenant_id, channel_id, author_id, conteudo, mencionados)
select (select a from f), (select fechado_m from c), auth.uid(), 'so entre nos, @Bruno nem sabe', array[(select bruno from u)];

-- #2 (empresa B) — mandada aqui, conferida como carlos_b mais abaixo.
insert into public.chat_messages (tenant_id, channel_id, author_id, conteudo, mencionados)
select (select a from f), (select aberto_m from c), auth.uid(), 'oi @carlos, vc ai', array[(select carlos_b from u)];
select tests.clear_authentication();

select tests.authenticate_as('bruno2@chat.test');
select is(
  (select count(*)::int from public.notifications
    where user_id = auth.uid() and type = 'mention'
      and reference_type = 'chat_channel' and reference_id = (select aberto_m from c)),
  1,
  'Ana menciona Bruno em canal aberto: 1 aviso no sino dele, tipo mention'
);
select is(
  (select count(*)::int from public.notifications
    where user_id = auth.uid() and reference_id = (select fechado_m from c)),
  0,
  'Ana menciona Bruno num canal FECHADO de que ele nao participa: 0 avisos — nao vaza os 140 caracteres'
);
select tests.clear_authentication();

select tests.authenticate_as('ana2@chat.test');
select is(
  (select count(*)::int from public.notifications
    where user_id = auth.uid() and type = 'mention' and reference_id = (select aberto_m from c)),
  0,
  'nenhuma notificacao para a propria Ana'
);
select tests.clear_authentication();

select tests.authenticate_as('carlosb2@chat.test');
select is(
  (select count(*)::int from public.notifications where user_id = auth.uid() and type = 'mention'),
  0,
  'Ana menciona carlos_b (empresa B): 0 notificacoes, e a mensagem nao quebra'
);
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- Quantas não li
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('bruno2@chat.test');
-- Lição 9: `now()` é constante dentro da transação — empurrar o marcador
-- para "uma hora atrás" é o que separa "antes" de "depois" sem depender de
-- datas diferentes.
update public.chat_channel_members
   set last_read_at = now() - interval '1 hour'
 where channel_id = (select aberto_n from c) and user_id = auth.uid();
select tests.clear_authentication();

select tests.authenticate_as('ana2@chat.test');
insert into public.chat_messages (tenant_id, channel_id, author_id, conteudo)
select (select a from f), (select aberto_n from c), auth.uid(), 'mensagem nova para o Bruno';
select tests.clear_authentication();

-- #5
select tests.authenticate_as('bruno2@chat.test');
select is(
  (select coalesce((select qtd from public.chat_nao_lidas() where channel_id = (select aberto_n from c)), 0)),
  1,
  'chat_nao_lidas() conta 1 para Bruno depois de Ana escrever'
);

-- #6 — a propria mensagem do Bruno nao conta.
insert into public.chat_messages (tenant_id, channel_id, author_id, conteudo)
select (select a from f), (select aberto_n from c), auth.uid(), 'e essa aqui e minha';
select is(
  (select coalesce((select qtd from public.chat_nao_lidas() where channel_id = (select aberto_n from c)), 0)),
  1,
  'a propria mensagem do Bruno nao soma ao contador dele'
);
select tests.clear_authentication();

-- #7 — mensagem apagada nao conta.
select tests.authenticate_as('ana2@chat.test');
create temporary table msg_apagavel on commit drop as
with ins as (
  insert into public.chat_messages (tenant_id, channel_id, author_id, conteudo)
  select (select a from f), (select aberto_n from c), auth.uid(), 'esta vai ser apagada'
  returning id
) select id from ins;
update public.chat_messages set deleted_at = now() where id = (select id from msg_apagavel);
select tests.clear_authentication();

select tests.authenticate_as('bruno2@chat.test');
select is(
  (select coalesce((select qtd from public.chat_nao_lidas() where channel_id = (select aberto_n from c)), 0)),
  1,
  'mensagem apagada nao soma ao contador — continua 1, so a de #5'
);

-- #8 — Bruno marca "li até aqui": o contador zera.
update public.chat_channel_members
   set last_read_at = now()
 where channel_id = (select aberto_n from c) and user_id = auth.uid();
select is(
  (select coalesce((select qtd from public.chat_nao_lidas() where channel_id = (select aberto_n from c)), 0)),
  0,
  'Bruno move o marcador de leitura e o contador zera'
);

-- #9 — canal de que Bruno nao participa nao aparece, mesmo tendo mensagem
-- nao lida de sobra (reaproveita o `fechado_m`, que ja tem a mensagem da
-- assercao #4 e onde Bruno nunca entrou).
select is(
  (select count(*)::int from public.chat_nao_lidas() where channel_id = (select fechado_m from c)),
  0,
  'chat_nao_lidas() nao traz canal de que Bruno nao participa'
);
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- Conversa direta
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('ana2@chat.test');

-- #10 — find-or-create: chamar duas vezes devolve o MESMO id.
create temporary table dm on commit drop as
select public.chat_abrir_conversa((select bruno from u)) as primeira,
       public.chat_abrir_conversa((select bruno from u)) as segunda;
grant select on dm to authenticated;
select is(
  (select primeira from dm), (select segunda from dm),
  'chat_abrir_conversa chamada duas vezes devolve a mesma conversa'
);

-- #11 — conversa atravessando empresa.
select throws_ok(
  format($$ select public.chat_abrir_conversa(%L::uuid) $$, (select carlos_b from u)),
  'P0001', 'pessoa invalida para conversa direta',
  'Ana nao consegue abrir conversa direta com carlos_b (empresa B)'
);

insert into public.chat_messages (tenant_id, channel_id, author_id, conteudo)
select (select a from f), (select primeira from dm), auth.uid(), 'so eu e o bruno vemos isso';
select tests.clear_authentication();

-- #12 — dona, que nao e' dos dois, nao le a conversa direta.
select tests.authenticate_as('dona2@chat.test');
select is(
  (select count(*)::int from public.chat_messages where channel_id = (select primeira from dm)),
  0,
  'dona, que nao participa da conversa direta, ve 0 mensagens dela'
);
select tests.clear_authentication();

select * from finish();
rollback;

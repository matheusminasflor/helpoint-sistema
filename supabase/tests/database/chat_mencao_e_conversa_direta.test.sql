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

select plan(18);

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
--
-- O array leva **a própria autora, o Bruno duas vezes e um uuid que não existe**,
-- de propósito. A versão anterior deste teste mencionava só o carlos_b, e por
-- isso três asserções aqui embaixo **não podiam falhar**: a Ana não estava em
-- `mencionados` em lugar nenhum, então "nenhuma notificação para a própria Ana"
-- ficava verde mesmo com o guard do autor apagado. Achado da auditoria da L11b.
-- Agora o mesmo insert exercita quatro coisas: o autor se auto-mencionando, a
-- duplicata, o uuid fantasma e a pessoa de outra empresa.
insert into public.chat_messages (tenant_id, channel_id, author_id, conteudo, mencionados)
select (select a from f), (select aberto_m from c), auth.uid(), 'oi @carlos @Bruno @Bruno, vc ai',
       array[(select carlos_b from u), auth.uid(), (select bruno from u), (select bruno from u), gen_random_uuid()];
select tests.clear_authentication();

select tests.authenticate_as('bruno2@chat.test');
-- Duas mensagens mencionaram o Bruno no canal aberto, e a segunda o citou
-- **duas vezes**. São dois avisos, não três: o array vem do cliente e pode
-- repetir, e quem deduplica é o trigger. Sem o `distinct`, este número vira 3.
select is(
  (select count(*)::int from public.notifications
    where user_id = auth.uid() and type = 'mention'
      and reference_type = 'chat_channel' and reference_id = (select aberto_m from c)),
  2,
  'Bruno recebe um aviso por mensagem, e mencionar duas vezes na mesma nao gera dois'
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

-- ───────────────────────────────────────────────────────────────────────────
-- Os dois furos que a auditoria achou (2026-09-18)
-- ───────────────────────────────────────────────────────────────────────────
-- Fixture PRÓPRIA, de propósito: as asserções acima usam `dm` e os canais de
-- `c`, e reaproveitar fixture de outra asserção já tornou provas decorativas
-- duas vezes neste módulo.

-- ── Furo 1: a conversa direta vazava o trecho no sino ──────────────────────
-- `chat_abrir_conversa` cria a DM com `created_by = null`. O filtro do trigger
-- perguntava `created_by = mencionado`, que com nulo dá **NULL**, não `false`
-- — e `false or NULL or false` é NULL, que `not` não converte em "pula". Quem
-- estava fora da conversa recebia os 140 primeiros caracteres dela no sino.
select tests.authenticate_as('ana2@chat.test');
create temporary table dm2 on commit drop as
select public.chat_abrir_conversa((select dona from u)) as id;
grant select on dm2 to authenticated;
insert into public.chat_messages (tenant_id, channel_id, author_id, conteudo, mencionados)
select (select a from f), (select id from dm2), auth.uid(),
       'salario do bruno e 12 mil, nao conta @Bruno', array[(select bruno from u)];
select tests.clear_authentication();

-- #13
select tests.authenticate_as('bruno2@chat.test');
select is(
  (select count(*)::int from public.notifications
    where user_id = auth.uid() and reference_id = (select id from dm2)),
  0,
  'mencionar alguem de fora da conversa direta nao avisa ninguem — o sino nao vaza a DM'
);
select tests.clear_authentication();

-- #14 — e o conteúdo não chegou a NENHUM sino além do de quem participa.
-- Lido com o papel do runner de propósito: ler como outra pessoa devolve zero
-- por RLS, e foi assim que três asserções desta leva nasceram cegas.
select is(
  (select count(*)::int from public.notifications where message like '%12 mil%'),
  0,
  'o trecho da conversa direta nao aparece no sino de ninguem'
);

-- #15 — a MESMA falha, atacada pela raiz: `created_by` NULO.
--
-- As duas de cima não bastam, e descobri isso por mutação: o conserto mexeu em
-- **dois** lugares — tirou o ramo `created_by` do filtro e passou a gravar quem
-- abriu a conversa (antes ia nulo). Devolvendo só o ramo, elas continuam
-- verdes, porque `created_by` deixou de ser nulo. Ou seja: elas provam a
-- combinação, não o defeito.
--
-- E o nulo continua alcançável no mundo real: `chat_channels_autor_fkey` é
-- `on delete set null (created_by)`, então apagar o perfil de quem criou um
-- canal fechado zera a coluna — e, com o ramo de volta,
-- `false or NULL or false` viraria NULL outra vez. Esta asserção monta
-- exatamente esse estado, com o papel do runner (a policy de INSERT exige
-- `created_by = auth.uid()`, então pela tela não dá para nascer nulo).
update public.chat_channels set created_by = null where id = (select fechado_m from c);

select tests.authenticate_as('ana2@chat.test');
insert into public.chat_messages (tenant_id, channel_id, author_id, conteudo, mencionados)
select (select a from f), (select fechado_m from c), auth.uid(),
       'o autor deste canal foi apagado, e @Bruno segue fora', array[(select bruno from u)];
select tests.clear_authentication();

select is(
  (select count(*)::int from public.notifications
    where user_id = (select bruno from u) and reference_id = (select fechado_m from c)),
  0,
  'canal fechado com o autor apagado (created_by nulo) tambem nao vaza mencao'
);

-- ── Furo 2: "Conversar com Fulano" devolvia canal ABERTO forjado ───────────
-- Um canal comum aceitava qualquer `dm_key`, e a busca procurava só por ela.
-- Qualquer pessoa da empresa criava a isca com a `dm_key` de dois colegas, e a
-- conversa "privada" deles caía dentro de um canal que o terceiro lia. De
-- quebra, a dupla nunca mais conseguia abrir a conversa de verdade.
-- #15
select tests.authenticate_as('bruno2@chat.test');
select throws_ok(
  format($$ insert into public.chat_channels (tenant_id, nome, privado, created_by, tipo, dm_key)
            values (%L::uuid, 'isca', false, auth.uid(), 'canal', %L) $$,
         (select a from f),
         least((select ana from u)::text, (select dona from u)::text) || ':' ||
         greatest((select ana from u)::text, (select dona from u)::text)),
  '23514', null,
  'canal comum nao aceita dm_key: a isca da conversa direta forjada nao nasce'
);
select tests.clear_authentication();

-- #16 — e o que a função devolve é sempre uma conversa direta de verdade.
select is(
  (select tipo || '/' || privado::text from public.chat_channels where id = (select id from dm2)),
  'direta/true',
  'chat_abrir_conversa devolve canal do tipo direta e privado, nunca outra coisa'
);

-- ── Pessoa inativa não recebe menção ──────────────────────────────────────
-- `chat_abrir_conversa` já recusava conta desligada; o trigger de menção não
-- conferia, e as duas portas discordavam.
-- #17
update public.profiles set is_active = false where id = (select dona from u);
select tests.authenticate_as('ana2@chat.test');
insert into public.chat_messages (tenant_id, channel_id, author_id, conteudo, mencionados)
select (select a from f), (select aberto_m from c), auth.uid(), 'oi @Dona', array[(select dona from u)];
select tests.clear_authentication();
select is(
  (select count(*)::int from public.notifications
    where user_id = (select dona from u) and type = 'mention'),
  0,
  'conta desligada nao recebe mencao'
);

select * from finish();
rollback;

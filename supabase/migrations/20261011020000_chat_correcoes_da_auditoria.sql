-- L11a: Chat — correções da auditoria. 2026-09-18.
--
-- Três achados. O primeiro quebra a promessa central da leva.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. O marcador de leitura era uma porta lateral para dentro do canal fechado
-- ───────────────────────────────────────────────────────────────────────────
-- A policy de UPDATE de `chat_channel_members` existe para uma coisa só: mover
-- `last_read_at`. Mas nada prendia o `channel_id`, e o `with check` usava
-- `chat_canal_visivel` — que tem o ramo do administrador. O caminho, reproduzido
-- no banco de teste com o schema intacto:
--
--   1. o administrador lê o canal fechado ............... 0 mensagens
--   2. entra num canal ABERTO (a tela já faz isso) ...... ok
--   3. muda o `channel_id` da própria linha para o fechado  1 linha movida
--   4. lê o canal fechado ............................... "SEGREDO: demissão do fulano"
--
-- Depois do salto ele também escreve lá, e recebe as mensagens novas pelo tempo
-- real — que não tem segundo portão: quem filtra é a policy de SELECT.
--
-- A decisão 11 diz que dono e administrador **enxergam que o canal fechado
-- existe** e **não leem o que foi dito dentro**. A policy de INSERT foi escrita
-- com todo o cuidado para isso; o UPDATE desfazia o cuidado.
--
-- O conserto não é mexer na condição da policy: `with check` não enxerga o valor
-- **antigo** da linha, então ele não consegue dizer "o canal não pode mudar".
-- Quem sabe disso é um trigger.
create or replace function public.chat_marcador_so_move_o_relogio()
returns trigger
language plpgsql
as $$
begin
  -- A linha de participação só pode mover o próprio relógio. De quem ela é, e
  -- de que canal ela é, não mudam nunca — quem entra e quem sai passa por
  -- INSERT e DELETE, que têm policy própria.
  new.channel_id := old.channel_id;
  new.user_id    := old.user_id;
  new.tenant_id  := old.tenant_id;
  return new;
end;
$$;

drop trigger if exists trg_chat_marcador_so_move_o_relogio on public.chat_channel_members;
create trigger trg_chat_marcador_so_move_o_relogio
  before update on public.chat_channel_members
  for each row execute function public.chat_marcador_so_move_o_relogio();

-- E o `with check` perde a pergunta que abria a porta. Com o trigger acima, a
-- linha não sai do lugar; conferir de novo se o canal é "visível" só reintroduz
-- o ramo do administrador onde ele não deve estar.
drop policy if exists "Cada um move o proprio marcador de leitura" on public.chat_channel_members;
create policy "Cada um move o proprio marcador de leitura" on public.chat_channel_members
  for update to authenticated
  using (tenant_id = public.get_user_tenant_id() and user_id = auth.uid())
  with check (tenant_id = public.get_user_tenant_id() and user_id = auth.uid());

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Quem foi convidado para o canal fechado levava 42501 ao abri-lo
-- ───────────────────────────────────────────────────────────────────────────
-- `useEntrarNoCanal` usava `upsert`, que vira `INSERT ... ON CONFLICT DO
-- UPDATE`. O PostgreSQL avalia o **WITH CHECK do INSERT sobre a linha proposta
-- mesmo quando o caminho tomado é o do conflito** — e a policy de INSERT exige
-- canal aberto (ou ser o criador). Resultado: o convidado legítimo tomava
-- `42501` toda vez que abria o canal, e `last_read_at` nunca andava em canal
-- fechado, o que deixaria o contador de não-lidas da L11b errado justamente ali.
--
-- O conserto é do lado do front (`useEntrarNoCanal` deixa de fazer `upsert`:
-- atualiza o marcador se a linha existe e só insere quando é entrada de
-- verdade). Aqui fica o comentário, para quem ler a policy entender por que
-- ela **não** precisa de um ramo a mais — "entrar" e "marcar como lido" são
-- duas operações, e misturá-las numa só foi o defeito.
comment on table public.chat_channel_members is
  'Quem participa do canal, e até quando já leu. Entrar (INSERT) e marcar como lido (UPDATE) são operações diferentes de propósito: o `upsert` que as juntava dava 42501 para quem foi convidado a canal fechado. O UPDATE só move `last_read_at` — trigger `chat_marcador_so_move_o_relogio` prende o resto.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3. `deleted_by` era forjável
-- ───────────────────────────────────────────────────────────────────────────
-- O trigger fazia `coalesce(new.deleted_by, auth.uid())`, e o `coalesce`
-- respeita o que o cliente mandar: a Ana apagava a própria mensagem assinando
-- o nome do Bruno, e gravava. Nada na L11a lê a coluna, mas é coluna de
-- auditoria de dado de pessoa (decisão 6, LGPD) — e coluna de auditoria que
-- mente é pior do que coluna que não existe.
-- Cópia fiel do original, com **uma** linha mudada: `deleted_by`. Os guardas de
-- "já foi apagada", "não muda de canal, de autor nem de data" e "não se edita"
-- continuam exatamente como estavam.
create or replace function public.chat_mensagem_so_apaga()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.deleted_at is not null then
    raise exception 'esta mensagem ja foi apagada';
  end if;
  if new.channel_id is distinct from old.channel_id
     or new.author_id  is distinct from old.author_id
     or new.created_at is distinct from old.created_at then
    raise exception 'mensagem do chat nao muda de canal, de autor nem de data';
  end if;
  if new.deleted_at is not null then
    -- O texto some do banco, não só da tela: sem isto ele continua legível
    -- pela API para quem sabe pedir, e "apagado" vira mentira.
    new.conteudo  := '';
    -- Quem apagou é quem está logado, e ponto. Era
    -- `coalesce(new.deleted_by, auth.uid())`, e o `coalesce` respeita o que o
    -- cliente mandar: dava para apagar a própria mensagem assinando o nome de
    -- outra pessoa.
    new.deleted_by := auth.uid();
  elsif new.conteudo is distinct from old.conteudo then
    raise exception 'mensagem do chat nao se edita: so se apaga';
  end if;
  return new;
end;
$$;

-- L11b: Chat interno — menção, não-lidas e conversa direta. 2026-09-18.
--
-- Continuação de 20261011010000_chat_canais_e_mensagens.sql (L11a) e de
-- 20261011020000_chat_correcoes_da_auditoria.sql. Ver .scratch/plano-chat.md
-- §5 e §3 (decisões 2, 7 e 8) e docs/decisoes.md ADR-011.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Menção — `@fulano` cai no sino
-- ───────────────────────────────────────────────────────────────────────────
-- Quem resolve o `@` para uma pessoa é a tela, no momento de enviar — o banco
-- guarda identificadores, não texto a ser interpretado.
alter table public.chat_messages
  add column if not exists mencionados uuid[] not null default '{}';

-- `security definer` porque escreve em `notifications`, tabela que a pessoa
-- mencionada não tem por que poder escrever diretamente por esta via, e
-- porque precisa ler `chat_channels`/`chat_channel_members` sem estar sujeito
-- à RLS de quem enviou a mensagem (ver o comentário abaixo sobre de quem é a
-- pergunta).
create or replace function public.chat_avisa_mencionados()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_canal      public.chat_channels%rowtype;
  v_titulo     text;
  v_mencionado uuid;
  v_pode_ver   boolean;
begin
  select * into v_canal from public.chat_channels where id = new.channel_id;
  v_titulo := case when v_canal.tipo = 'direta' then 'Conversa direta' else '#' || v_canal.nome end;

  foreach v_mencionado in array new.mencionados loop
    continue when v_mencionado = new.author_id;

    -- Quem enxerga a MENSAGEM do lado do MENCIONADO, nunca do autor: dentro
    -- do trigger `auth.uid()` é quem escreveu — `chat_sou_membro` e
    -- `chat_canal_visivel` perguntam por `auth.uid()`, a pergunta errada
    -- aqui. A checagem lê as tabelas direto, com a mesma regra de
    -- `chat_sou_membro` (canal aberto, ou criador, ou membro).
    --
    -- E confere o tenant do PRÓPRIO mencionado antes de qualquer coisa:
    -- `mencionados` é `uuid[]` e array não aceita chave estrangeira — quem
    -- manda o array pode citar qualquer uuid, inclusive de outra empresa.
    -- Sem este filtro, mencionar alguém de fora ou tentaria vazar o começo
    -- da mensagem para quem não é do canal, ou — pior — quebraria o envio
    -- da mensagem inteira: `notifications_user_id_fkey` exige
    -- `(user_id, tenant_id)` casando com `profiles`, e um uuid de outra
    -- empresa com o tenant deste canal nunca casa.
    select exists (
      select 1 from public.profiles p
       where p.id = v_mencionado and p.tenant_id = v_canal.tenant_id
    ) and (
      not v_canal.privado
      or v_canal.created_by = v_mencionado
      or exists (
           select 1 from public.chat_channel_members m
            where m.channel_id = v_canal.id and m.user_id = v_mencionado
         )
    ) into v_pode_ver;

    continue when not v_pode_ver;

    insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
    values (v_canal.tenant_id, v_mencionado, 'mention', 'chat_channel', new.channel_id, v_titulo, left(new.conteudo, 140));
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_chat_avisa_mencionados on public.chat_messages;
create trigger trg_chat_avisa_mencionados after insert on public.chat_messages
  for each row when (array_length(new.mencionados, 1) > 0)
  execute function public.chat_avisa_mencionados();

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Conversa direta — o canal ganha tipo
-- ───────────────────────────────────────────────────────────────────────────
-- Cuidado de idempotência: os canais que já existem (todos `tipo` implícito
-- de setor) têm que continuar válidos depois desta migration. `not null
-- default 'canal'` preenche a coluna nova sem tocar nome nenhum, e o `nome`
-- deles já satisfaz o primeiro ramo do CHECK novo — ninguém precisa de
-- correção de dado.
alter table public.chat_channels
  add column if not exists tipo    text not null default 'canal',
  add column if not exists dm_key  text;

alter table public.chat_channels alter column nome drop not null;

alter table public.chat_channels drop constraint if exists chat_channels_nome_check;
alter table public.chat_channels add constraint chat_channels_nome_check
  check ((tipo = 'canal'  and nome is not null and length(btrim(nome)) between 1 and 60)
      or (tipo = 'direta' and nome is null and privado and dm_key is not null));

alter table public.chat_channels drop constraint if exists chat_channels_tipo_check;
alter table public.chat_channels add constraint chat_channels_tipo_check
  check (tipo in ('canal', 'direta'));

-- Troca do índice único de nome: o índice antigo cobria a tabela inteira; o
-- novo só cobre `tipo = 'canal'`, porque `nome` de conversa direta é sempre
-- nulo e `lower(btrim(nome))` de duas conversas diretas colidiria por nada.
-- Os canais existentes são todos `tipo = 'canal'` — a troca não os destrava.
drop index if exists public.chat_channels_nome_unico;
create unique index if not exists chat_channels_nome_unico
  on public.chat_channels (tenant_id, lower(btrim(nome))) where tipo = 'canal';

create unique index if not exists chat_channels_dm_unica
  on public.chat_channels (tenant_id, dm_key) where dm_key is not null;

-- Conversa direta é sempre fechada — a RLS da L11a já a trata certo sem
-- mudar uma linha, porque "fechada" já quer dizer "só os membros". O `or
-- created_by = auth.uid()` de `chat_sou_membro`/`chat_canal_visivel` não
-- entra em jogo aqui: esta função insere os dois membros ela mesma, como
-- `security definer`, então quando o `chat_channels` cai na tela de quem
-- abriu a conversa a linha de `chat_channel_members` já existe.
create or replace function public.chat_abrir_conversa(p_outro uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_eu     uuid := auth.uid();
  v_dm_key text;
  v_canal  uuid;
begin
  if p_outro is null or p_outro = v_eu then
    raise exception 'conversa direta precisa de duas pessoas diferentes';
  end if;

  if not exists (
    select 1 from public.profiles
     where id = p_outro and tenant_id = v_tenant and is_active
  ) then
    raise exception 'pessoa invalida para conversa direta';
  end if;

  v_dm_key := least(v_eu, p_outro)::text || ':' || greatest(v_eu, p_outro)::text;

  select id into v_canal from public.chat_channels
   where tenant_id = v_tenant and dm_key = v_dm_key;
  if v_canal is not null then
    return v_canal;
  end if;

  -- Find-or-create é do banco, não da tela: duas abas clicando junto podem
  -- cair aqui ao mesmo tempo, e é o índice único `chat_channels_dm_unica`
  -- quem garante que só uma conversa nasce — a outra transação recebe
  -- `unique_violation`, e busca de novo em vez de estourar erro pra tela.
  begin
    insert into public.chat_channels (tenant_id, nome, privado, tipo, dm_key, created_by)
    values (v_tenant, null, true, 'direta', v_dm_key, null)
    returning id into v_canal;

    insert into public.chat_channel_members (tenant_id, channel_id, user_id)
    values (v_tenant, v_canal, v_eu), (v_tenant, v_canal, p_outro);
  exception when unique_violation then
    select id into v_canal from public.chat_channels
     where tenant_id = v_tenant and dm_key = v_dm_key;
  end;

  return v_canal;
end;
$$;

revoke execute on function public.chat_abrir_conversa(uuid) from public, anon;
grant execute on function public.chat_abrir_conversa(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Quantas não li — nenhuma tabela nova
-- ───────────────────────────────────────────────────────────────────────────
-- O "não lido" é uma conta sobre o que já existe (decisão 7): é por isso que
-- esta leva não cria um segundo sistema de notificação. SEM `security
-- definer`, de propósito: a RLS de `chat_channel_members` e `chat_messages`
-- tem que valer para quem chama, senão o contador contaria mensagem de canal
-- alheio.
create or replace function public.chat_nao_lidas()
returns table (channel_id uuid, qtd integer)
language sql
stable
set search_path = public
as $$
  select m.channel_id, count(*)::int
    from public.chat_channel_members mem
    join public.chat_messages m
      on m.channel_id = mem.channel_id
     and m.created_at  > mem.last_read_at
     and m.author_id  <> auth.uid()
     and m.deleted_at is null
   where mem.user_id = auth.uid()
   group by m.channel_id;
$$;

revoke execute on function public.chat_nao_lidas() from public, anon;
grant execute on function public.chat_nao_lidas() to authenticated;

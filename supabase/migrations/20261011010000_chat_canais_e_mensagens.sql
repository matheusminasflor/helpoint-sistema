-- L11a: Chat interno — canais por setor e mensagens. 2026-09-18.
--
-- Onde o chat se encaixa (docs/decisoes.md ADR-011): é o corredor, não o
-- arquivo. Conversa que decide algo sobre um chamado tem que voltar para o
-- chamado — este banco não cria caminho nenhum entre `chat_messages` e
-- `ticket_comments`.
--
-- Decisões que valem para esta migration (ver .scratch/plano-chat.md §3):
--   1. Canal por setor: quem entra é quem foi posto lá — nunca quem tem o
--      módulo (hoje só há uma linha em `user_module_access` no banco inteiro).
--   5. Apagar sim, editar não. O texto some do banco de verdade ao apagar.
--   6. Retenção: guarda para sempre; apagar o canal leva as mensagens junto.
--   7. Mensagem nova não vira aviso no sino — só a menção (L11b) vira.
--  11. Dono/administrador ENXERGAM que o canal fechado existe (para poder
--      escolher qual apagar numa lista, e para a faxina da decisão 6), mas
--      NÃO leem as mensagens de dentro. Revista em 2026-09-18: a versão
--      original ("apaga sem ver") pedia uma combinação que o Postgres não
--      expressa — DELETE e UPDATE exigem visibilidade por SELECT para achar
--      a linha, e fingir que dava para apagar sem enxergar era teatro; quem
--      apaga já sabe que o canal existe, só escolheu na lista. A privacidade
--      que importa não é o nome do canal, é o que foi dito dentro dele — por
--      isso a linha se move para a MENSAGEM, não para o canal. Ver o
--      comentário de `chat_canal_visivel` e `chat_sou_membro`, abaixo.
--  12. Qualquer pessoa da empresa cria canal.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Os canais
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.chat_channels (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  nome         text not null,
  descricao    text,
  privado      boolean not null default false,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint chat_channels_id_tenant_key unique (id, tenant_id),
  constraint chat_channels_nome_check check (length(btrim(nome)) between 1 and 60),
  constraint chat_channels_autor_fkey foreign key (created_by, tenant_id)
    references public.profiles (id, tenant_id) on delete set null (created_by)
);

-- Dois `#financeiro` na mesma empresa é defeito, não recurso.
create unique index if not exists chat_channels_nome_unico
  on public.chat_channels (tenant_id, lower(btrim(nome)));

drop trigger if exists inject_tenant_id_chat_channels on public.chat_channels;
create trigger inject_tenant_id_chat_channels before insert on public.chat_channels
  for each row execute function public.inject_tenant_id();
drop trigger if exists handle_chat_channels_updated_at on public.chat_channels;
create trigger handle_chat_channels_updated_at before update on public.chat_channels
  for each row execute function public.handle_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Quem está no canal
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.chat_channel_members (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  channel_id    uuid not null,
  user_id       uuid not null,
  -- Escrita pela própria L11a toda vez que alguém abre o canal (`useEntrarNoCanal`).
  -- A L11b só lê, para calcular o "não lido" — adiar esta coluna custaria uma
  -- migration a mais sem economizar nada.
  last_read_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  constraint chat_channel_members_channel_fkey foreign key (channel_id, tenant_id)
    references public.chat_channels (id, tenant_id) on delete cascade,
  constraint chat_channel_members_user_fkey foreign key (user_id, tenant_id)
    references public.profiles (id, tenant_id) on delete cascade,
  constraint chat_channel_members_uma_vez unique (channel_id, user_id)
);

create index if not exists chat_channel_members_user_idx on public.chat_channel_members (user_id);

drop trigger if exists inject_tenant_id_chat_channel_members on public.chat_channel_members;
create trigger inject_tenant_id_chat_channel_members before insert on public.chat_channel_members
  for each row execute function public.inject_tenant_id();

-- ───────────────────────────────────────────────────────────────────────────
-- 3. As mensagens
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.chat_messages (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  channel_id   uuid not null,
  author_id    uuid not null,
  conteudo     text not null,
  deleted_at   timestamptz,
  deleted_by   uuid,
  created_at   timestamptz not null default now(),
  constraint chat_messages_id_tenant_key unique (id, tenant_id),
  -- É esta FK que faz "apagar o canal leva as mensagens junto" (decisão 6).
  constraint chat_messages_channel_fkey foreign key (channel_id, tenant_id)
    references public.chat_channels (id, tenant_id) on delete cascade,
  constraint chat_messages_author_fkey foreign key (author_id, tenant_id)
    references public.profiles (id, tenant_id) on delete cascade,
  -- O "ou apagada" é o que permite o texto virar '' ao apagar, sem violar o
  -- CHECK que também vale para toda mensagem viva.
  constraint chat_messages_conteudo_check
    check (deleted_at is not null or length(btrim(conteudo)) between 1 and 4000)
);

create index if not exists chat_messages_channel_idx
  on public.chat_messages (channel_id, created_at desc);

drop trigger if exists inject_tenant_id_chat_messages on public.chat_messages;
create trigger inject_tenant_id_chat_messages before insert on public.chat_messages
  for each row execute function public.inject_tenant_id();

-- ───────────────────────────────────────────────────────────────────────────
-- 4. As três perguntas que a RLS faz
-- ───────────────────────────────────────────────────────────────────────────
-- `security definer` pelo mesmo motivo de `project_participa`: são consultadas
-- de dentro de policies das próprias tabelas, e uma leitura sujeita à RLS ali
-- giraria em círculo.

-- Quem PARTICIPA do canal — sem ramo de administrador. É esta que
-- `chat_messages` usa nas três policies: o administrador pode saber que o
-- canal fechado existe (função seguinte), mas não é participante dele só por
-- ser administrador, e não lê o que foi dito lá dentro. "Enxergar o canal" e
-- "participar dele" deixaram de ser a mesma pergunta com a revisão da
-- decisão 11 (topo do arquivo).
--
-- ┌─ A armadilha do RETURNING, e o degrau que quase ninguém vê ────────────┐
-- │ `useCriarCanal` grava com `.insert({...}).select('id')` (regra 2 das   │
-- │ cinco), e isso vira `INSERT ... RETURNING`. Com RETURNING o PostgreSQL │
-- │ aplica a policy de SELECT já no insert, ANTES de qualquer trigger      │
-- │ AFTER — e o trigger que põe o autor em `chat_channel_members` roda     │
-- │ depois. Até aí é a lição 11 do CLAUDE.md.                              │
-- │                                                                        │
-- │ O degrau a mais: pôr `created_by = auth.uid()` **dentro desta função**  │
-- │ NÃO resolve. A função é `stable` e **reconsulta a própria tabela**, e   │
-- │ uma consulta feita dentro do mesmo comando que inseriu a linha usa o    │
-- │ snapshot de antes do insert: o `where c.id = p_channel` não acha        │
-- │ linha nenhuma, e todo ramo depois dele é irrelevante. Provado no banco: │
-- │ com o atalho aqui dentro, criar até um canal **aberto** dava 42501.     │
-- │                                                                        │
-- │ O atalho tem de ser **comparação direta de coluna, na própria policy**  │
-- │ — ali o Postgres avalia contra os valores da linha que está sendo       │
-- │ gravada, sem reconsultar nada. É como `projects` já resolve isto        │
-- │ (`projetos_correcoes_da_auditoria.sql`): `created_by = auth.uid() or    │
-- │ project_visivel(id)`. Ver a policy "Quem enxerga o canal", abaixo.      │
-- │                                                                        │
-- │ O MESMO degrau apareceu de novo em `DELETE ... RETURNING` (decisão 11,  │
-- │ revista): o administrador tinha permissão de apagar o canal fechado    │
-- │ pela policy de DELETE, mas o Postgres precisa achar a linha por uma     │
-- │ policy de SELECT antes de sequer tentar apagar — e essa policy dizia    │
-- │ que ele não enxergava. Provado isolando: alargar só o SELECT bastou     │
-- │ para o DELETE (que já estava certo) funcionar. A saída não é um         │
-- │ caminho novo (RPC) — é dar ao administrador o mesmo enxergar que        │
-- │ qualquer participante tem para o CANAL, na função `chat_canal_visivel`  │
-- │ abaixo, e manter esta função aqui (`chat_sou_membro`) fechada para a    │
-- │ MENSAGEM, que é onde a privacidade de fato mora.                        │
-- └────────────────────────────────────────────────────────────────────────┘
create or replace function public.chat_sou_membro(p_channel uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_channels c
     where c.id = p_channel
       and c.tenant_id = public.get_user_tenant_id()
       and (not c.privado
            or c.created_by = auth.uid()
            or exists (select 1 from public.chat_channel_members m
                        where m.channel_id = c.id and m.user_id = auth.uid()))
  );
$$;

-- Quem enxerga que o CANAL existe: participante (acima), ou dono/administrador
-- da empresa (decisão 11, revista). O tenant é checado aqui DENTRO também, e
-- não só na policy que chama esta função — a mesma cautela de
-- `project_visivel` (`projetos_correcoes_da_auditoria.sql`):
-- `is_admin_or_higher(auth.uid())` sozinho responde verdadeiro para
-- administrador de QUALQUER empresa, não só a de quem chama.
--
-- NÃO usar esta função em `chat_messages`. A mensagem de canal fechado
-- continua só para quem participa (`chat_sou_membro`, acima) — é aqui que a
-- privacidade da decisão 11 de fato mora.
create or replace function public.chat_canal_visivel(p_channel uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.chat_sou_membro(p_channel)
      or exists (
        select 1 from public.chat_channels c
         where c.id = p_channel
           and c.tenant_id = public.get_user_tenant_id()
           and public.is_admin_or_higher(auth.uid()));
$$;

-- O canal é aberto a todos da empresa?
create or replace function public.chat_canal_aberto(p_channel uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_channels c
     where c.id = p_channel
       and c.tenant_id = public.get_user_tenant_id()
       and not c.privado
  );
$$;

-- Quem manda no canal: o criador sempre; dono/administrador só em canal
-- aberto (decisão 11 — sem isso o administrador se adicionaria a um canal
-- fechado e passaria a lê-lo, que é exatamente o que a decisão 11 proíbe).
create or replace function public.chat_canal_admin(p_channel uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_channels c
     where c.id = p_channel
       and c.tenant_id = public.get_user_tenant_id()
       and (c.created_by = auth.uid()
            or (not c.privado and public.is_admin_or_higher(auth.uid())))
  );
$$;

revoke execute on function public.chat_sou_membro(uuid)   from public, anon;
revoke execute on function public.chat_canal_visivel(uuid) from public, anon;
revoke execute on function public.chat_canal_aberto(uuid)  from public, anon;
revoke execute on function public.chat_canal_admin(uuid)   from public, anon;
grant execute on function public.chat_sou_membro(uuid)   to authenticated;
grant execute on function public.chat_canal_visivel(uuid) to authenticated;
grant execute on function public.chat_canal_aberto(uuid)  to authenticated;
grant execute on function public.chat_canal_admin(uuid)   to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. O autor entra no canal que criou
-- ───────────────────────────────────────────────────────────────────────────
-- Cópia de `project_autor_participa`: sem isto o criador precisaria se
-- convidar, e perderia de vista o canal que acabou de criar.
create or replace function public.chat_autor_participa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.chat_channel_members (tenant_id, channel_id, user_id)
  values (new.tenant_id, new.id, new.created_by)
  on conflict (channel_id, user_id) do nothing;
  return null;
end;
$$;
drop trigger if exists trg_chat_autor_participa on public.chat_channels;
create trigger trg_chat_autor_participa after insert on public.chat_channels
  for each row when (new.created_by is not null)
  execute function public.chat_autor_participa();

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Mensagem não se edita — só se apaga
-- ───────────────────────────────────────────────────────────────────────────
-- Sem `security definer`: quem escreve aqui é o próprio usuário, através da
-- RLS de UPDATE — não há caminho privilegiado a proteger.
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
    new.deleted_by := coalesce(new.deleted_by, auth.uid());
  elsif new.conteudo is distinct from old.conteudo then
    raise exception 'mensagem do chat nao se edita: so se apaga';
  end if;
  return new;
end;
$$;
-- Não pôr exceção de `pg_trigger_depth()` aqui: este guard restringe todo
-- mundo, inclusive o sistema, e nenhum trigger deste sistema atualiza
-- `chat_messages` — abrir exceção por profundidade abriria a edição pela
-- porta dos fundos (lição 8 do CLAUDE.md é sobre guard que restringe
-- não-staff; este é mais largo de propósito).
drop trigger if exists trg_chat_mensagem_so_apaga on public.chat_messages;
create trigger trg_chat_mensagem_so_apaga before update on public.chat_messages
  for each row execute function public.chat_mensagem_so_apaga();

-- ───────────────────────────────────────────────────────────────────────────
-- 7. RLS
-- ───────────────────────────────────────────────────────────────────────────
alter table public.chat_channels        enable row level security;
alter table public.chat_channel_members enable row level security;
alter table public.chat_messages        enable row level security;

-- `created_by = auth.uid()` vem ANTES da função e é comparação direta de
-- coluna: é ele que deixa quem acabou de criar o canal receber o `id` de volta
-- no mesmo comando (ver o bloco da armadilha do RETURNING, acima). A função
-- cuida de todo o resto — canal aberto para a empresa, e canal fechado para
-- quem é membro.
drop policy if exists "Quem enxerga o canal" on public.chat_channels;
create policy "Quem enxerga o canal" on public.chat_channels
  for select using (
    tenant_id = public.get_user_tenant_id()
    and (created_by = auth.uid() or public.chat_canal_visivel(id)));

-- Qualquer pessoa da empresa cria canal (decisão 12) — com 5 pessoas,
-- portaria para criar canal é teatro.
drop policy if exists "Qualquer um da empresa cria canal" on public.chat_channels;
create policy "Qualquer um da empresa cria canal" on public.chat_channels
  for insert with check (
    tenant_id = public.get_user_tenant_id() and created_by = auth.uid());

drop policy if exists "Quem manda no canal edita" on public.chat_channels;
create policy "Quem manda no canal edita" on public.chat_channels
  for update using (
    tenant_id = public.get_user_tenant_id() and public.chat_canal_admin(id))
  with check (tenant_id = public.get_user_tenant_id());

-- De propósito mais largo que o update: é o poder de destruir sem ler
-- (decisão 11) — dono/administrador apagam canal fechado que não podem abrir.
drop policy if exists "Autor ou admin apaga o canal" on public.chat_channels;
create policy "Autor ou admin apaga o canal" on public.chat_channels
  for delete using (
    tenant_id = public.get_user_tenant_id()
    and (created_by = auth.uid() or public.is_admin_or_higher(auth.uid())));

drop policy if exists "Quem enxerga o canal ve quem participa" on public.chat_channel_members;
create policy "Quem enxerga o canal ve quem participa" on public.chat_channel_members
  for select using (
    tenant_id = public.get_user_tenant_id() and public.chat_canal_visivel(channel_id));

drop policy if exists "Entra em canal aberto ou e convidado por quem manda" on public.chat_channel_members;
create policy "Entra em canal aberto ou e convidado por quem manda" on public.chat_channel_members
  for insert with check (
    tenant_id = public.get_user_tenant_id()
    and ((user_id = auth.uid() and public.chat_canal_aberto(channel_id))
         or public.chat_canal_admin(channel_id)));

-- É só o "li até aqui": a própria pessoa move o seu `last_read_at`.
drop policy if exists "Cada um move o proprio marcador de leitura" on public.chat_channel_members;
create policy "Cada um move o proprio marcador de leitura" on public.chat_channel_members
  for update using (
    tenant_id = public.get_user_tenant_id() and user_id = auth.uid())
  with check (
    tenant_id = public.get_user_tenant_id()
    and user_id = auth.uid()
    and public.chat_canal_visivel(channel_id));

drop policy if exists "Sai por si ou e retirado por quem manda" on public.chat_channel_members;
create policy "Sai por si ou e retirado por quem manda" on public.chat_channel_members
  for delete using (
    tenant_id = public.get_user_tenant_id()
    and (user_id = auth.uid() or public.chat_canal_admin(channel_id)));

-- É esta que o tempo real consulta por assinante — não há segundo portão.
-- ATENÇÃO: `chat_sou_membro`, não `chat_canal_visivel`. A mensagem de canal
-- fechado não pode enxergar por tabela de carona a visibilidade que o
-- administrador ganhou para o CANAL (decisão 11, revista, topo do arquivo) —
-- senão o "não lê as mensagens" da decisão vira letra morta no primeiro
-- `SELECT`, e no primeiro evento de tempo real também.
drop policy if exists "Quem enxerga o canal ve as mensagens" on public.chat_messages;
drop policy if exists "Quem participa ve as mensagens" on public.chat_messages;
create policy "Quem participa ve as mensagens" on public.chat_messages
  for select using (
    tenant_id = public.get_user_tenant_id() and public.chat_sou_membro(channel_id));

drop policy if exists "Escreve como autor em canal que enxerga" on public.chat_messages;
drop policy if exists "Escreve como autor em canal que participa" on public.chat_messages;
create policy "Escreve como autor em canal que participa" on public.chat_messages
  for insert with check (
    tenant_id = public.get_user_tenant_id()
    and author_id = auth.uid()
    and deleted_at is null
    and public.chat_sou_membro(channel_id));

-- Sem policy de DELETE: apagar é este update (o texto vira '' pelo trigger).
-- A linha só some de verdade junto com o canal, pelo `on delete cascade`.
-- A faxina do administrador (decisão 6) continua no ramo `is_admin_or_higher`
-- abaixo, mas só alcança mensagem que ele PARTICIPA — em canal fechado de que
-- não participa, a faxina dele é apagar o canal inteiro (policy de DELETE de
-- `chat_channels`, que o cascade já esvazia), não vasculhar mensagem por
-- mensagem que ele não pode ler.
drop policy if exists "Autor ou quem manda no canal apaga a mensagem" on public.chat_messages;
create policy "Autor ou quem manda no canal apaga a mensagem" on public.chat_messages
  for update using (
    tenant_id = public.get_user_tenant_id()
    and public.chat_sou_membro(channel_id)
    and (author_id = auth.uid() or public.is_admin_or_higher(auth.uid())))
  with check (tenant_id = public.get_user_tenant_id());

-- Padrão 6 de docs/nao-funciona.md: tabela nova nasce com ALL para `anon`.
revoke all on public.chat_channels, public.chat_channel_members, public.chat_messages from anon;

-- ───────────────────────────────────────────────────────────────────────────
-- 8. Tempo real
-- ───────────────────────────────────────────────────────────────────────────
-- O `postgres_changes` do Supabase avalia a policy de SELECT desta tabela
-- para CADA assinante antes de entregar a linha. Não há segundo portão: se a
-- policy acima estiver larga, o tempo real entrega a mensagem do canal
-- fechado para quem não é do canal. É por isso que a prova de que "o realtime
-- não vaza" é uma asserção do pgTAP, e não um teste de socket.
--
-- `replica identity full` porque apagar mensagem é um UPDATE, e é o que
-- garante que o filtro por `channel_id` case no evento de update — mesmo
-- motivo de `sac_ticket_comments` (20260519142027). Com 5 pessoas o custo em
-- WAL é irrelevante.
alter table public.chat_messages replica identity full;
do $$ begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime'
                    and schemaname = 'public' and tablename = 'chat_messages') then
    execute 'alter publication supabase_realtime add table public.chat_messages';
  end if;
end $$;

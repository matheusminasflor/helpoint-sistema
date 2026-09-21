-- L11b: Chat — correções da auditoria. 2026-09-18.
--
-- Dois furos de confidencialidade, reproduzidos no banco de teste, mais duas
-- frestas menores. Os dois graves têm a mesma raiz de fundo: uma condição que
-- devia responder sim/não respondia **nulo**, e nulo não é falso.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. O sino vazava o trecho da conversa direta para quem não participa dela
-- ───────────────────────────────────────────────────────────────────────────
-- Reproduzido: a Ana abre conversa direta com o Zeca, escreve
-- "salario do bruno e 12 mil, nao conta @Eva" — e a **Eva**, fora da conversa,
-- sem cargo nenhum, recebia um aviso no sino com esse texto. Ela não lia as
-- mensagens e nem via o canal: o vazamento era só o sino, e o sino basta — são
-- os 140 primeiros caracteres da conversa privada, na tela dela.
--
-- A causa é lógica de três valores. `chat_abrir_conversa` cria a conversa
-- direta com `created_by = null`, e o filtro perguntava:
--
--   not privado              -> false   (conversa direta é sempre privada)
--   or created_by = mencionado -> NULL  (null = uuid dá NULL, não false)
--   or existe membro         -> false
--
-- `false or NULL or false` = **NULL**; `true and NULL` = NULL; e
-- `continue when not NULL` não continua — não pulava, e inseria o aviso.
--
-- A segunda porta para o mesmo defeito, fora da conversa direta:
-- `chat_channels_autor_fkey` é `on delete set null (created_by)`. No dia em que
-- o `profiles` de quem criou um canal fechado comum for apagado, `created_by`
-- vira null e aquele canal passa a vazar menção do mesmo jeito.
--
-- O conserto não é `coalesce` em cima do ramo torto: é **tirar o ramo**. Quem
-- criou o canal já está em `chat_channel_members` — o trigger
-- `chat_autor_participa` o põe lá na criação. Perguntar por `created_by` aqui
-- era redundante, e foi a redundância que abriu o buraco. Fica uma pergunta
-- só, que nunca é nula: **é canal aberto, ou a pessoa é membro?**
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
  v_lista      uuid[];
begin
  select * into v_canal from public.chat_channels where id = new.channel_id;
  v_titulo := case when v_canal.tipo = 'direta' then 'Conversa direta' else '#' || v_canal.nome end;

  -- `distinct` porque o array vem do cliente e pode repetir: mencionar
  -- "@Bruno @Bruno" gerava **dois** avisos da mesma mensagem. A tela já
  -- deduplica, mas o comentário desta migration diz que o filtro daqui é a
  -- única defesa — então ele tem de ser a única defesa de verdade.
  select array(select distinct unnest(new.mencionados)) into v_lista;

  foreach v_mencionado in array v_lista loop
    continue when v_mencionado = new.author_id;

    -- Quem enxerga a MENSAGEM do lado do MENCIONADO, nunca do autor: dentro
    -- do trigger `auth.uid()` é quem escreveu — `chat_sou_membro` e
    -- `chat_canal_visivel` perguntam por `auth.uid()`, a pergunta errada aqui.
    --
    -- `is_active` entra junto: `chat_abrir_conversa` já recusa pessoa inativa,
    -- e as duas portas discordavam — mencionar uma conta desligada gerava
    -- aviso para ela.
    select exists (
      select 1 from public.profiles p
       where p.id = v_mencionado
         and p.tenant_id = v_canal.tenant_id
         and p.is_active
    ) and (
      not v_canal.privado
      or exists (
           select 1 from public.chat_channel_members m
            where m.channel_id = v_canal.id and m.user_id = v_mencionado
         )
    ) into v_pode_ver;

    -- `coalesce` como cinto e suspensório: se algum dia uma coluna nova
    -- devolver nulo aqui, o padrão é **não avisar**, nunca avisar.
    continue when not coalesce(v_pode_ver, false);

    insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
    values (v_canal.tenant_id, v_mencionado, 'mention', 'chat_channel', new.channel_id, v_titulo, left(new.conteudo, 140));
  end loop;

  return new;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. "Conversar com Fulano" podia devolver um canal ABERTO forjado por terceiro
-- ───────────────────────────────────────────────────────────────────────────
-- Reproduzido: a Eva, funcionária comum, cria um canal **aberto** e põe nele a
-- `dm_key` da Ana com o Bruno (os uuid dos colegas chegam à tela por
-- `useProfiles`). Depois disso, a Ana clica em "Conversar com… Bruno", recebe
-- **o canal da Eva**, escreve achando que é privado — e o Zeca, que nunca foi
-- convidado, lê. De quebra, a Ana e o Bruno nunca mais conseguem abrir uma
-- conversa direta de verdade: a `dm_key` deles está ocupada para sempre.
--
-- Duas causas, e as duas se fecham:
--
--   a) a busca era só por `dm_key`, sem exigir que a linha achada fosse mesmo
--      uma conversa direta;
--   b) o CHECK só amarrava `dm_key` no ramo `tipo = 'direta'` — um canal comum
--      aceitava qualquer `dm_key`. A isca só existe porque isso era possível.

-- (b) primeiro: canal comum não tem `dm_key`, e ponto. Limpa o que houver antes
-- de amarrar, para a migration não falhar num banco que já tenha isca.
update public.chat_channels set dm_key = null where tipo <> 'direta' and dm_key is not null;

alter table public.chat_channels drop constraint if exists chat_channels_dm_key_check;
alter table public.chat_channels add constraint chat_channels_dm_key_check
  check ((tipo = 'direta' and dm_key is not null) or (tipo <> 'direta' and dm_key is null));

-- (a) a busca passa a exigir o que a função promete devolver.
create or replace function public.chat_abrir_conversa(p_outro uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eu      uuid := auth.uid();
  v_tenant  uuid := public.get_user_tenant_id();
  v_dm_key  text;
  v_canal   uuid;
begin
  if v_eu is null or v_tenant is null then
    raise exception 'sessao invalida' using errcode = 'P0001';
  end if;
  if p_outro is null or p_outro = v_eu then
    raise exception 'pessoa invalida para conversa direta' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.profiles p
     where p.id = p_outro and p.tenant_id = v_tenant and p.is_active
  ) then
    raise exception 'pessoa invalida para conversa direta' using errcode = 'P0001';
  end if;

  v_dm_key := least(v_eu::text, p_outro::text) || ':' || greatest(v_eu::text, p_outro::text);

  -- `tipo = 'direta' and privado` na busca: sem isso, um canal comum com a
  -- `dm_key` forjada era devolvido como se fosse a conversa privada dos dois.
  select id into v_canal
    from public.chat_channels
   where tenant_id = v_tenant and dm_key = v_dm_key
     and tipo = 'direta' and privado;
  if v_canal is not null then
    return v_canal;
  end if;

  begin
    insert into public.chat_channels (tenant_id, nome, privado, created_by, tipo, dm_key)
    values (v_tenant, null, true, v_eu, 'direta', v_dm_key)
    returning id into v_canal;

    insert into public.chat_channel_members (tenant_id, channel_id, user_id)
    values (v_tenant, v_canal, v_eu), (v_tenant, v_canal, p_outro)
    on conflict (channel_id, user_id) do nothing;
  exception when unique_violation then
    -- Duas abas clicando junto: quem perdeu a corrida busca de novo. A busca
    -- aqui leva os mesmos filtros da de cima, pelo mesmo motivo.
    select id into v_canal
      from public.chat_channels
     where tenant_id = v_tenant and dm_key = v_dm_key
       and tipo = 'direta' and privado;
    if v_canal is null then
      raise exception 'nao foi possivel abrir a conversa' using errcode = 'P0001';
    end if;
  end;

  return v_canal;
end;
$$;

revoke execute on function public.chat_abrir_conversa(uuid) from public, anon;
grant  execute on function public.chat_abrir_conversa(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. O comentário de `chat_nao_lidas` afirmava um mecanismo que não existe
-- ───────────────────────────────────────────────────────────────────────────
-- A migration anterior dizia que `security invoker` era o que impedia o
-- contador de contar canal alheio. Não é: quem impede é o
-- `where mem.user_id = auth.uid()` dentro do corpo. `security invoker`
-- continua certo como princípio — é defesa em profundidade, não a fechadura —,
-- mas afirmar o mecanismo errado faz a próxima pessoa confiar na coisa errada.
comment on function public.chat_nao_lidas() is
  'Quantas mensagens novas por canal, para quem chama. O que prende o resultado a quem pergunta é o `where mem.user_id = auth.uid()` do corpo — NAO a ausencia de `security definer`. `security invoker` fica como defesa em profundidade: se um dia o filtro do corpo cair, a RLS ainda barra. Nao conta mensagem propria nem apagada.';

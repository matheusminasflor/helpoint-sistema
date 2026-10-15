-- CHAT: ANEXOS, FOTOS E ÁUDIO (dono, 2026-10-15). Pedido: "colocar emoticons, Enter enviar, áudio com
-- transcrição, anexos até 10 MB, e ir sobrescrevendo como um DVR". Decisões (múltipla escolha):
--   * anexo até 10 MB por arquivo; foto comprimida no navegador (~300 KB) e voz em ~250 KB por minuto;
--   * a transcrição do áudio é do NAVEGADOR enquanto grava (Chrome/Edge) e vai como o texto da mensagem;
--   * o Supabase é o plano grátis (1 GB de arquivos): o chat guarda até 300 MB de anexos. Passou disso, os
--     MAIS ANTIGOS saem e a mensagem fica com "anexo apagado para liberar espaço" — o texto continua.
--
-- Como o DVR funciona: o Storage não deixa apagar arquivo por SQL (só pela API dele). Então o banco MARCA
-- (`anexo_apagado_em`) e devolve os caminhos; quem está enviando o próximo anexo os remove pela API, e a
-- policy de DELETE do bucket só aceita arquivo de mensagem já marcada. Apagar a mensagem também marca o anexo.

alter table public.chat_messages
  add column if not exists anexo_path text,
  add column if not exists anexo_nome text,
  add column if not exists anexo_tipo text,
  add column if not exists anexo_bytes integer check (anexo_bytes is null or anexo_bytes between 1 and 10485760),
  add column if not exists anexo_apagado_em timestamptz;

-- Mensagem só com anexo (a foto, o áudio sem fala reconhecida) pode vir sem texto.
alter table public.chat_messages drop constraint if exists chat_messages_conteudo_check;
alter table public.chat_messages add constraint chat_messages_conteudo_check
  check (deleted_at is not null
         or length(btrim(conteudo)) between 1 and 4000
         or (anexo_path is not null and length(conteudo) <= 4000));

create index if not exists chat_messages_anexos_vivos
  on public.chat_messages (tenant_id, created_at) where anexo_path is not null and anexo_apagado_em is null;

-- O guarda de "não se edita, só se apaga" passa a cuidar do anexo: não troca de arquivo, e apagar a mensagem
-- marca o anexo para sair do Storage. Cópia fiel de 20261011020000 mais as linhas do anexo.
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
  if new.anexo_path is distinct from old.anexo_path
     or new.anexo_nome is distinct from old.anexo_nome
     or new.anexo_tipo is distinct from old.anexo_tipo
     or new.anexo_bytes is distinct from old.anexo_bytes
     or (old.anexo_apagado_em is not null and new.anexo_apagado_em is distinct from old.anexo_apagado_em) then
    raise exception 'o anexo da mensagem do chat nao se troca';
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
    if new.anexo_path is not null then
      new.anexo_apagado_em := coalesce(old.anexo_apagado_em, now());
    end if;
  elsif new.conteudo is distinct from old.conteudo then
    raise exception 'mensagem do chat nao se edita: so se apaga';
  end if;
  return new;
end;
$$;

/**
 * O DVR: antes de subir um anexo de `p_bytes`, marca os anexos mais antigos da empresa até o total caber em
 * 300 MB, e devolve os caminhos marcados que ainda estão no Storage (os de agora e os que ficaram para trás),
 * para quem chamou removê-los pela API.
 */
create or replace function public.chat_liberar_espaco(p_bytes integer)
returns text[] language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_limite constant bigint := 300 * 1024 * 1024;
  v_total bigint;
  m record;
begin
  if v_tenant is null or auth.uid() is null then
    return '{}';
  end if;
  select coalesce(sum(anexo_bytes), 0) into v_total
    from public.chat_messages
   where tenant_id = v_tenant and anexo_path is not null and anexo_apagado_em is null;
  for m in
    select id, anexo_bytes from public.chat_messages
     where tenant_id = v_tenant and anexo_path is not null and anexo_apagado_em is null
     order by created_at, id
  loop
    exit when v_total + greatest(p_bytes, 0) <= v_limite;
    update public.chat_messages set anexo_apagado_em = now() where id = m.id;
    v_total := v_total - coalesce(m.anexo_bytes, 0);
  end loop;
  return coalesce((
    select array_agg(c.anexo_path)
      from public.chat_messages c
     where c.tenant_id = v_tenant and c.anexo_apagado_em is not null
       and exists (select 1 from storage.objects o where o.bucket_id = 'chat' and o.name = c.anexo_path)
  ), '{}');
end;
$$;
revoke all on function public.chat_liberar_espaco(integer) from public, anon;
grant execute on function public.chat_liberar_espaco(integer) to authenticated;

-- O bucket: privado, 10 MB por arquivo. Caminho `<empresa>/<canal>/<arquivo>`: lê e grava quem participa do
-- canal; apaga só o arquivo de mensagem já marcada (o DVR e a mensagem apagada).
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat', 'chat', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

create policy chat_arquivo_le on storage.objects for select to authenticated
  using (bucket_id = 'chat'
     and (storage.foldername(name))[1] = public.get_user_tenant_id()::text
     and public.chat_sou_membro(((storage.foldername(name))[2])::uuid));
create policy chat_arquivo_grava on storage.objects for insert to authenticated
  with check (bucket_id = 'chat'
     and (storage.foldername(name))[1] = public.get_user_tenant_id()::text
     and public.chat_sou_membro(((storage.foldername(name))[2])::uuid));
-- `security definer`: o DVR remove anexo de canal de que quem envia não participa, e o RLS de
-- `chat_messages` esconderia a mensagem dele.
create or replace function public.chat_anexo_marcado(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.chat_messages c
                  where c.tenant_id = public.get_user_tenant_id() and c.anexo_path = p_path and c.anexo_apagado_em is not null);
$$;
revoke all on function public.chat_anexo_marcado(text) from public, anon;
grant execute on function public.chat_anexo_marcado(text) to authenticated;

create policy chat_arquivo_apaga on storage.objects for delete to authenticated
  using (bucket_id = 'chat'
     and (storage.foldername(name))[1] = public.get_user_tenant_id()::text
     and public.chat_anexo_marcado(name));

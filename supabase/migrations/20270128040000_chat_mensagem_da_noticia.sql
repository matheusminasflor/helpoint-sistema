-- MENSAGEM AUTOMÁTICA DA NOTÍCIA NO CHAT (dono, 2026-10-19): "no chat, ao enviar comunicado da notícia, ter informativo de
-- mensagem automática e o link para o usuário clicar para ler a notícia". A mensagem que o Jornal manda
-- (`jornal_avisa_no_chat`, 20270128030000) passa a carregar a notícia: a tela mostra o selo "Mensagem automática" e o
-- botão "Ler a notícia", que abre o Jornal nela.
--   * só o sistema põe a notícia na mensagem: quem digita no chat não consegue fingir uma mensagem automática;
--   * a notícia da mensagem não se troca depois (a mesma trava do texto e do anexo).

alter table public.chat_messages
  add column if not exists noticia_id uuid references public.jornal_noticias(id) on delete set null;

/** Na mensagem que a pessoa manda (profundidade 1), `noticia_id` vem sempre vazio. Só um gatilho do sistema o preenche. */
create or replace function public.chat_noticia_so_do_sistema()
returns trigger language plpgsql set search_path = public as $$
begin
  if pg_trigger_depth() <= 1 then
    new.noticia_id := null;
  end if;
  return new;
end;
$$;
revoke all on function public.chat_noticia_so_do_sistema() from public, anon, authenticated;
drop trigger if exists trg_chat_noticia_so_do_sistema on public.chat_messages;
create trigger trg_chat_noticia_so_do_sistema before insert on public.chat_messages
  for each row execute function public.chat_noticia_so_do_sistema();

create or replace function public.chat_mensagem_so_apaga()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.deleted_at is not null then
    raise exception 'esta mensagem ja foi apagada';
  end if;
  if new.channel_id is distinct from old.channel_id
     or new.author_id  is distinct from old.author_id
     or new.created_at is distinct from old.created_at
     or new.noticia_id is distinct from old.noticia_id then
    raise exception 'mensagem do chat nao muda de canal, de autor, de data nem de noticia';
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

create or replace function public.jornal_avisa_no_chat()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_quem uuid := auth.uid();
  v_pessoa uuid;
  v_canal uuid;
begin
  if new.status <> 'publicada' or old.publicada_em is not null or not new.avisar_no_chat
     or new.publico <> 'setores' or v_quem is null then
    return null;
  end if;
  for v_pessoa in
    select distinct m.user_id
      from public.user_module_access m
      join public.profiles p on p.id = m.user_id and p.tenant_id = new.tenant_id and p.is_active  -- a mesma régua de chat_abrir_conversa
     where m.module = any (new.setores) and m.user_id <> v_quem
  loop
    v_canal := public.chat_abrir_conversa(v_pessoa);
    insert into public.chat_messages (tenant_id, channel_id, author_id, conteudo, noticia_id)
    values (new.tenant_id, v_canal, v_quem, 'Comunicado no Jornal: ' || new.titulo, new.id);
  end loop;
  return null;
end;
$$;

-- As 7 mensagens do comunicado da série 76 (enviadas antes desta mudança) ganham a notícia e o texto novo.
alter table public.chat_messages disable trigger user;
update public.chat_messages cm
   set noticia_id = n.id, conteudo = 'Comunicado no Jornal: ' || n.titulo
  from public.jornal_noticias n
 where cm.tenant_id = n.tenant_id and cm.noticia_id is null and cm.deleted_at is null
   and cm.conteudo = 'Comunicado no Jornal: ' || n.titulo || E'\nLeia no menu Jornal.';
alter table public.chat_messages enable trigger user;

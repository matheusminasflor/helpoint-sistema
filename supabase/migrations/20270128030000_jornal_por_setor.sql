-- JORNAL PARA SETORES ESCOLHIDOS (dono, 2026-10-19): o comunicado da série 76 (cashback) é só para o Comercial e o
-- Financeiro. Decisão (múltipla escolha): "Para quem" ganha "Setores escolhidos" + opção de avisar também pelo chat.
--   * publico = 'setores' com a lista `setores` (os módulos de `user_module_access`): só quem tem um deles lê a notícia
--     e os anexos dela — no banco, não só na tela; o administrador continua vendo tudo, como nas filiais;
--   * `avisar_no_chat`: ao publicar pela primeira vez, cada pessoa desses setores recebe uma mensagem direta de quem
--     publicou, com o título. Não há canal de chat por setor (os canais são criados pelas pessoas), por isso é direta.

alter table public.jornal_noticias
  add column if not exists setores text[],
  add column if not exists avisar_no_chat boolean not null default false;

alter table public.jornal_noticias drop constraint if exists jornal_noticias_publico_check;
alter table public.jornal_noticias add constraint jornal_noticias_publico_check
  check (publico in ('todos', 'INBRAS', 'MF', 'setores'));
alter table public.jornal_noticias add constraint jornal_noticias_setores_escolhidos
  check (publico <> 'setores' or coalesce(cardinality(setores), 0) > 0);

/** A notícia é para mim? Todos, a minha filial, um dos meus setores — ou sou administrador. */
create or replace function public.jornal_e_para_mim(p_publico text, p_setores text[])
returns boolean language sql stable security definer set search_path = public as $$
  select p_publico = 'todos'
      or p_publico = any (public.filiais_da_pessoa(auth.uid()))
      or (p_publico = 'setores' and exists (select 1 from public.user_module_access m
                                             where m.user_id = auth.uid() and m.module = any (p_setores)))
      or public.is_admin_or_higher(auth.uid());
$$;
revoke all on function public.jornal_e_para_mim(text, text[]) from public, anon;
grant execute on function public.jornal_e_para_mim(text, text[]) to authenticated;

drop policy if exists jornal_le on public.jornal_noticias;
create policy jornal_le on public.jornal_noticias for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((status = 'publicada'
               and (exibir_de is null or exibir_de <= (now() at time zone 'America/Sao_Paulo')::date)
               and public.jornal_e_para_mim(publico, setores))
              or public.pode_no_setor('marketing', 'jornal', 'edit')
              or public.pode_no_setor('marketing', 'jornal', 'publish')));

-- Os anexos seguem a notícia: antes, o anexo de notícia de filial abria para qualquer um que soubesse o id.
create or replace function public.jornal_noticia_visivel(p_noticia uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.jornal_noticias n
                  where n.id = p_noticia
                    and n.tenant_id = public.get_user_tenant_id()
                    and ((n.status = 'publicada'
                          and (n.exibir_de is null or n.exibir_de <= (now() at time zone 'America/Sao_Paulo')::date)
                          and public.jornal_e_para_mim(n.publico, n.setores))
                         or public.pode_no_setor('marketing', 'jornal', 'edit')
                         or public.pode_no_setor('marketing', 'jornal', 'publish')));
$$;

/** Ao publicar pela primeira vez com "avisar no chat": mensagem direta de quem publicou para cada pessoa dos setores. */
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
    insert into public.chat_messages (tenant_id, channel_id, author_id, conteudo)
    values (new.tenant_id, v_canal, v_quem,
            'Comunicado no Jornal: ' || new.titulo || E'\nLeia no menu Jornal.');
  end loop;
  return null;
end;
$$;
revoke all on function public.jornal_avisa_no_chat() from public, anon, authenticated;
drop trigger if exists trg_jornal_avisa_no_chat on public.jornal_noticias;
create trigger trg_jornal_avisa_no_chat after update of status on public.jornal_noticias
  for each row execute function public.jornal_avisa_no_chat();

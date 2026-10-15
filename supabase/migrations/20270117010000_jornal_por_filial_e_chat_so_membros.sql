-- JORNAL POR FILIAL E CHAT SÓ PARA MEMBROS (dono, 2026-10-15).
--
-- 1. "Sistema de Jornal ter opção de divulgar para colaboradores da filial INBRAS e MF. Setores da INBRAS: Produção,
--    Qualidade, Expedição; demais, MF." A notícia ganha "para quem": todos, INBRAS ou MF. A filial da pessoa sai dos
--    setores que ela tem: Produção/Qualidade/Expedição = INBRAS; qualquer outro setor (ou nenhum) = MF; quem tem dos
--    dois lados vê as duas. Quem cuida do Jornal e os administradores veem tudo.
-- 2. "No chat, as pessoas criam canal ou chat privado, aparece para mim criado porém não tenho acesso porque não fui
--    convidado; pra que aparecer?" O administrador enxergava TODO canal (`chat_canal_visivel`), mas as mensagens só
--    abrem para membro. Agora cada um vê só os canais de que participa (ou que criou) — o administrador também.

alter table public.jornal_noticias
  add column if not exists publico text not null default 'todos' check (publico in ('todos', 'INBRAS', 'MF'));

/** As filiais da pessoa, pelos setores que ela tem. */
create or replace function public.filiais_da_pessoa(p_user uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select array_remove(array[
    case when exists (select 1 from public.user_module_access m
                       where m.user_id = p_user and m.module in ('producao', 'qualidade', 'expedicao'))
         then 'INBRAS' end,
    case when exists (select 1 from public.user_module_access m
                       where m.user_id = p_user and m.module not in ('producao', 'qualidade', 'expedicao'))
           or not exists (select 1 from public.user_module_access m where m.user_id = p_user)
         then 'MF' end], null);
$$;
revoke all on function public.filiais_da_pessoa(uuid) from public, anon;
grant execute on function public.filiais_da_pessoa(uuid) to authenticated;

drop policy if exists jornal_le on public.jornal_noticias;
create policy jornal_le on public.jornal_noticias for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((status = 'publicada'
               and (exibir_de is null or exibir_de <= (now() at time zone 'America/Sao_Paulo')::date)
               and (publico = 'todos'
                    or publico = any (public.filiais_da_pessoa(auth.uid()))
                    or public.is_admin_or_higher(auth.uid())))
              or public.pode_no_setor('marketing', 'jornal', 'edit')
              or public.pode_no_setor('marketing', 'jornal', 'publish')));

create or replace function public.chat_canal_visivel(p_channel uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select public.chat_sou_membro(p_channel);
$function$;

-- A cópia da notícia que se repete leva o "para quem" da original (20261226010000).
do $$
declare
  v_def text := pg_get_functiondef('public.jornal_repetir()'::regprocedure);
  v_novo text;
begin
  v_novo := replace(v_def, 'autor_id, publicada_em, repeticao_de', 'autor_id, publicada_em, repeticao_de, publico');
  v_novo := replace(v_novo, 'n.autor_id, now(), n.id', 'n.autor_id, now(), n.id, n.publico');
  if v_novo = v_def or position('n.id, n.publico' in v_novo) = 0 then
    raise exception 'jornal_repetir mudou: revise a migration';
  end if;
  execute v_novo;
end;
$$;

-- Ligar o nome do Google não pode deixar a pessoa duas vezes na presença: "Silvana Melo" entrou na chamada e "Silvana
-- Moraes" estava no convite. A linha de quem entrou fica e herda o convite.
create or replace function public.reuniao_ligar_nome(p_nome text, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
begin
  if not public.is_admin_or_higher(auth.uid()) then
    raise exception 'Só o administrador liga os nomes.' using errcode = '42501';
  end if;
  if p_user is not null and not exists (select 1 from public.profiles where id = p_user and tenant_id = v_tenant) then
    raise exception 'Pessoa não encontrada.' using errcode = 'P0002';
  end if;

  update public.reuniao_nomes set user_id = p_user, ignorar = p_user is null
   where tenant_id = v_tenant and nome_google = p_nome;
  if not found then
    raise exception 'Nome não encontrado.' using errcode = 'P0002';
  end if;

  update public.reuniao_presencas set user_id = p_user where tenant_id = v_tenant and nome = p_nome;

  if p_user is not null then
    update public.reuniao_presencas entrou set convidado = true
     where entrou.tenant_id = v_tenant and entrou.nome = p_nome and exists (
       select 1 from public.reuniao_presencas outra
        where outra.reuniao_id = entrou.reuniao_id and outra.user_id = p_user and outra.id <> entrou.id and outra.convidado
     );
    delete from public.reuniao_presencas outra
     using public.reuniao_presencas entrou
     where entrou.tenant_id = v_tenant and entrou.nome = p_nome
       and outra.reuniao_id = entrou.reuniao_id and outra.user_id = p_user and outra.id <> entrou.id and not outra.entrou;

    insert into public.chat_channel_members (tenant_id, channel_id, user_id)
    select distinct v_tenant, s.canal_id, p_user
      from public.reuniao_presencas p
      join public.reunioes r on r.id = p.reuniao_id
      join public.reuniao_series s on s.id = r.serie_id
     where p.tenant_id = v_tenant and p.nome = p_nome
    on conflict (channel_id, user_id) do nothing;
  end if;
end;
$$;

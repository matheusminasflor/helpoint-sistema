-- CONVITE PARA ATENDER JUNTO: VER ANTES E MOTIVO DA RECUSA (dono, 2026-10-19). "Ao receber convite de um chamado, ter
-- como ver o chamado antes de aceitar, pois às vezes não se trata a mim aquele assunto." Decisões (múltipla escolha):
--   * "Ver o chamado" só leitura: título, categoria, quem pediu, descrição e a conversa com o solicitante — sem as notas
--     internas da equipe e sem poder responder. Só para quem tem o convite pendente (o chamado continua escondido dele
--     pela RLS até aceitar);
--   * recusar com motivo OPCIONAL; preenchido, vai na nota do chamado e no aviso de quem convidou.

/** O chamado do convite, só leitura, para quem foi convidado e ainda não respondeu. */
create or replace function public.convite_ver_chamado(p_ticket uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'numero', t.ticket_number, 'titulo', t.title, 'descricao', t.description,
    'categoria', t.category, 'subcategoria', t.subcategory, 'prioridade', t.priority, 'status', t.status,
    'setor', t.module, 'aberto_em', t.created_at,
    'solicitante', coalesce(sp.full_name, sp.email),
    'conversa', coalesce((
      select jsonb_agg(jsonb_build_object('autor', coalesce(ap.full_name, ap.email), 'texto', c.content, 'em', c.created_at)
                       order by c.created_at)
        from public.ticket_comments c
        left join public.profiles ap on ap.id = c.author_id
       where c.ticket_id = t.id and not coalesce(c.is_internal, false)), '[]'::jsonb))
    from public.ticket_convites cv
    join public.tickets t on t.id = cv.ticket_id
    left join public.profiles sp on sp.id = t.requester_id
   where cv.ticket_id = p_ticket and cv.user_id = auth.uid() and cv.tenant_id = public.get_user_tenant_id();
$$;
revoke all on function public.convite_ver_chamado(uuid) from public, anon;
grant execute on function public.convite_ver_chamado(uuid) to authenticated;

-- Responder ganha o motivo (opcional). `drop` + `create` porque a assinatura muda (regra 14: revoke/grant no fim).
drop function if exists public.responder_convite_atender_junto(uuid, boolean);
create function public.responder_convite_atender_junto(p_ticket uuid, p_aceita boolean, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c public.ticket_convites%rowtype; t public.tickets%rowtype; v_nome text; v_motivo text := nullif(btrim(p_motivo), '');
begin
  select * into c from public.ticket_convites where ticket_id = p_ticket and user_id = auth.uid();
  if c.ticket_id is null then
    raise exception 'Este convite não existe mais.' using errcode = '22023';
  end if;
  select * into t from public.tickets where id = p_ticket;
  delete from public.ticket_convites where ticket_id = p_ticket and user_id = auth.uid();
  select coalesce(full_name, email) into v_nome from public.profiles where id = auth.uid();
  if p_aceita then
    if t.status::text in ('resolved', 'closed', 'cancelled', 'rejected') then
      raise exception 'O chamado já foi encerrado.' using errcode = '22023';
    end if;
    insert into public.ticket_participantes (ticket_id, user_id, tenant_id, convidado_por)
    values (c.ticket_id, c.user_id, c.tenant_id, c.convidado_por) on conflict do nothing;
  end if;
  insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
  values (c.tenant_id, c.ticket_id, auth.uid(),
          coalesce(v_nome, 'Alguém') || case when p_aceita then ' aceitou atender junto.'
                                             else ' recusou o convite para atender junto.' || coalesce(' Motivo: ' || v_motivo, '') end,
          true);
  -- Marca o aviso do convite como lido, e avisa quem convidou.
  update public.notifications set is_read = true
   where user_id = auth.uid() and reference_id = p_ticket and type = 'ticket_assigned' and not is_read;
  if c.convidado_por is not null and c.convidado_por <> auth.uid() then
    perform public.notify_ticket(c.ticket_id, 'ticket_updated', array[c.convidado_por],
      coalesce(v_nome, 'Alguém') || case when p_aceita then ' aceitou' else ' recusou' end || ' atender junto o #' || t.ticket_number,
      coalesce(t.title, '') || case when not p_aceita and v_motivo is not null then ' — motivo: ' || v_motivo else '' end, false);
  end if;
end;
$$;
revoke all on function public.responder_convite_atender_junto(uuid, boolean, text) from public, anon;
grant execute on function public.responder_convite_atender_junto(uuid, boolean, text) to authenticated;

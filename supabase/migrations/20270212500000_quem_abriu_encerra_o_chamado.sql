-- Quem abriu o chamado pode cancelar ou marcar como resolvido, como nos sistemas de chamado do mercado (dono, 2026-11-06).
-- Resolvido sem nenhuma resposta da equipe não conta para ninguém (dono): o chamado termina como cancelado, status que já
-- fica fora de resolvidos e do prazo em todos os indicadores.

-- As mesmas etapas que os gatilhos exigem ao resolver. Cancelar não passa por eles, então este encerramento confere antes.
create or replace function public.chamado_tem_etapa_pendente(p_ticket uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.ticket_checklists tc
                   join public.ticket_checklist_items tci on tci.ticket_checklist_id = tc.id
                  where tc.ticket_id = t.id and tci.is_required and not tci.is_completed)
      or exists (select 1 from public.asset_maintenances m
                  where m.ticket_id = t.id and m.status not in ('completed', 'cancelled'))
      or exists (select 1 from public.ti_checagens c
                  where c.ticket_id = t.id
                    and (exists (select 1 from public.ti_checagem_itens i where i.checagem_id = c.id and i.situacao is null)
                         or (c.tipo = 'devolucao' and c.termo_path is null
                             and exists (select 1 from public.ti_checagem_itens i where i.checagem_id = c.id))))
    from public.tickets t
   where t.id = p_ticket and t.tenant_id = public.get_user_tenant_id();
$$;

create or replace function public.chamado_encerrar_como_solicitante(p_ticket uuid, p_acao text, p_motivo text, p_detalhe text default null)
returns text language plpgsql security definer set search_path to 'public' as $$
declare
  t public.tickets%rowtype;
  v_detalhe text := nullif(btrim(p_detalhe), '');
  v_status public.ticket_status;
  v_texto text;
begin
  select * into t from public.tickets where id = p_ticket and tenant_id = public.get_user_tenant_id() for update;
  if t.id is null or t.requester_id is distinct from auth.uid() then
    raise exception 'Só quem abriu o chamado pode encerrar por aqui.' using errcode = '42501';
  end if;
  if t.status::text in ('resolved', 'closed', 'cancelled', 'rejected') then
    raise exception 'Este chamado já foi encerrado.' using errcode = '23514';
  end if;
  if t.module = 'compras' then
    raise exception 'Chamado de compra segue a compra.' using errcode = '23514';
  end if;

  if p_acao = 'cancelar' then
    if p_motivo is null or p_motivo not in ('Abri errado', 'Não preciso mais', 'Abri repetido', 'Outro motivo') then
      raise exception 'Escolha o motivo do cancelamento.' using errcode = '23514';
    end if;
    v_status := 'cancelled';
    v_texto := 'Cancelado por quem abriu. Motivo: ' || p_motivo;
  elsif p_acao = 'resolver' then
    if public.chamado_tem_etapa_pendente(p_ticket) then
      raise exception 'Este chamado tem etapas que a equipe precisa concluir.' using errcode = '23514';
    end if;
    v_status := case when t.first_response_at is null then 'cancelled' else 'resolved' end::public.ticket_status;
    v_texto := case when t.first_response_at is null then 'Encerrado por quem abriu, sem atendimento: já estava resolvido'
                    else 'Marcado como resolvido por quem abriu' end;
  else
    raise exception 'Ação inválida.' using errcode = '22023';
  end if;
  v_texto := v_texto || case when v_detalhe is null then '.' else '. ' || v_detalhe end;

  update public.tickets
     set status = v_status,
         resolved_at = case when v_status = 'resolved' then now() else resolved_at end,
         resolution_notes = case when v_status = 'resolved' then v_texto else resolution_notes end
   where id = p_ticket;

  -- Chamado sem atendente só sai da fila: o registro não vira aviso para a equipe do setor.
  perform set_config('helpoint.comentario_sem_aviso', case when t.assigned_to is null then p_ticket::text else '' end, true);
  insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
  values (t.tenant_id, p_ticket, auth.uid(), v_texto, false);
  perform set_config('helpoint.comentario_sem_aviso', '', true);

  return v_status::text;
end;
$$;

do $$
declare
  v_def text := pg_get_functiondef('public.notify_on_ticket_comment()'::regprocedure);
  v_de text := $x$  if t.id is null then
    return new;
  end if;
$x$;
begin
  if position(v_de in v_def) = 0 then
    raise exception 'trecho não encontrado em notify_on_ticket_comment';
  end if;
  execute replace(v_def, v_de, $x$  if t.id is null or current_setting('helpoint.comentario_sem_aviso', true) = new.ticket_id::text then
    return new;
  end if;
$x$);
end;
$$;

revoke all on function public.chamado_tem_etapa_pendente(uuid) from public, anon;
revoke all on function public.chamado_encerrar_como_solicitante(uuid, text, text, text) from public, anon;
grant execute on function public.chamado_tem_etapa_pendente(uuid) to authenticated;
grant execute on function public.chamado_encerrar_como_solicitante(uuid, text, text, text) to authenticated;

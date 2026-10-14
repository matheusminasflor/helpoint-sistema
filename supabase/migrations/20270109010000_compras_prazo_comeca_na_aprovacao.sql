-- PRAZO DE COMPRAS COMEÇA NA APROVAÇÃO (dono, 2026-10-14): "o Mairon não precisa de prazo de SLA para aprovar, e
-- quem aprova depende dele; o ideal é que, depois de aprovado, aí sim ter o prazo para quem compra seguir, e ter
-- como agendar quando será concluído".
--
-- Antes: o chamado de compra nascia com prazo; a espera da aprovação PAUSAVA o prazo de resolução (20261221010000),
-- mas o da 1ª resposta corria (o #89 venceu a 1ª resposta antes de ser aprovado) e, aprovada, quem compra herdava
-- o que sobrava. Agora:
--   * aguardando aprovação ou ajuste: o chamado fica SEM prazo (nem de 1ª resposta, nem de resolução);
--   * aprovada: os dois prazos começam cheios naquele momento, para quem compra (o atendente que a aprovação pôs);
--   * Agendar (já existente: data + motivo, o prazo pausa até lá) passa a valer no chamado de compra aprovada — é
--     tela (`TicketActionsBar`).
-- O resto é igual a 20270106010000.

create or replace function public.compras_chamado_segue_a_compra()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return null; end if;
  if new.ticket_id is null then return null; end if;
  v_status := case new.status
    when 'pending_approval' then 'waiting_parts'
    when 'adjustment_requested' then 'waiting_user'
    when 'approved' then 'in_progress'
    when 'completed' then 'resolved'
    when 'rejected' then 'resolved'
  end;
  if v_status is null then return null; end if;
  -- O aviso é o da decisão (`compras_registra_decisao`); o genérico da mudança de status não repete.
  perform set_config('helpoint.status_pela_resposta', new.ticket_id::text, true);
  update public.tickets t
     set status = v_status::public.ticket_status,
         resolution_notes = case new.status
           when 'completed' then coalesce(nullif(btrim(new.purchase_report), ''), t.resolution_notes)
           when 'rejected' then 'Compra recusada: ' || coalesce(new.rejection_reason, '')
           else t.resolution_notes end,
         resolved_at = case when new.status in ('completed', 'rejected') then now() else t.resolved_at end,
         -- Esperando quem aprova (ou o ajuste de quem pediu): sem prazo.
         sla_due_at = case when new.status in ('pending_approval', 'adjustment_requested') then null else t.sla_due_at end,
         first_response_due_at = case when new.status in ('pending_approval', 'adjustment_requested') then null else t.first_response_due_at end
   where t.id = new.ticket_id and t.status::text is distinct from v_status;

  -- Aprovada: os prazos começam cheios agora. Numa segunda escrita, depois de a troca de status fechar a pausa
  -- (`chamado_pausa_em_pendente`): o recomeço guarda os minutos já pausados, como na transferência (20261229010000).
  if new.status = 'approved' then
    update public.tickets t
       set prazo_desde = now(),
           pausado_antes_do_recomeco = t.minutos_pausados,
           sla_due_at = public.prazo_padrao_do_chamado(t.tenant_id, t.module, t.priority::text, now(), t.assigned_to, t.due_date),
           first_response_due_at = case when t.first_response_at is null
             then public.prazo_da_primeira_resposta(t.tenant_id, t.module, t.priority::text, now(), t.assigned_to)
             else t.first_response_due_at end
     where t.id = new.ticket_id;
  end if;
  perform set_config('helpoint.status_pela_resposta', '', true);
  return null;
end;
$$;

-- Os chamados de compra de hoje: esperando aprovação ou ajuste ficam sem prazo; os aprovados ainda por comprar
-- passam a contar da aprovação.
update public.tickets t
   set sla_due_at = null, first_response_due_at = null
  from public.compras_solicitacoes s
 where s.ticket_id = t.id and s.status in ('pending_approval', 'adjustment_requested')
   and t.status::text in ('waiting_parts', 'waiting_user');

update public.tickets t
   set prazo_desde = s.approved_at,
       pausado_antes_do_recomeco = t.minutos_pausados,
       sla_due_at = public.prazo_padrao_do_chamado(t.tenant_id, t.module, t.priority::text, s.approved_at, t.assigned_to, t.due_date)
  from public.compras_solicitacoes s
 where s.ticket_id = t.id and s.status = 'approved' and s.approved_at is not null and t.status::text = 'in_progress';

-- COMPRA RECUSADA FINALIZA O CHAMADO (dono, 2026-10-14: "quando uma compra for recusada, já finalizar o chamado
-- automaticamente. Exemplo chamado 79"). Até aqui a recusa punha o chamado em `rejected` — um status fora dos
-- quatro do dia a dia (aberto, em andamento, pendente, resolvido; 2026-10-04) e sem `resolved_at`: o #79 ficou
-- parado na fila de Compras. Agora a recusa RESOLVE o chamado, com o motivo como solução.
-- O resto é igual a 20261221010000.

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
         resolved_at = case when new.status in ('completed', 'rejected') then now() else t.resolved_at end
   where t.id = new.ticket_id and t.status::text is distinct from v_status;
  perform set_config('helpoint.status_pela_resposta', '', true);
  return null;
end;
$$;

-- As recusadas antes desta migration (o #79): o chamado fica resolvido, na data da recusa.
update public.tickets t
   set status = 'resolved',
       resolved_at = coalesce(s.rejected_at, now()),
       resolution_notes = 'Compra recusada: ' || coalesce(s.rejection_reason, '')
  from public.compras_solicitacoes s
 where s.ticket_id = t.id and s.status = 'rejected' and t.status = 'rejected';

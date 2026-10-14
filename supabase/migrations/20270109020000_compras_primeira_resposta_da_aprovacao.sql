-- Complemento de 20270109010000: os chamados de compra já aprovados e ainda sem 1ª resposta (#80, #88, #89, #90 em
-- 2026-10-14) contam a 1ª resposta também da aprovação — senão ficariam "1ª resposta atrasada" pelo prazo antigo.
update public.tickets t
   set first_response_due_at = public.prazo_da_primeira_resposta(t.tenant_id, t.module, t.priority::text, s.approved_at, t.assigned_to)
  from public.compras_solicitacoes s
 where s.ticket_id = t.id and s.status = 'approved' and s.approved_at is not null
   and t.status::text = 'in_progress' and t.first_response_at is null;

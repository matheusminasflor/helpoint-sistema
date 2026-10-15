-- BOLETO: "COMPRA PAGA" SÓ DEPOIS QUE O FINANCEIRO PAGA (dono, 2026-10-15, #89 e #90). Ao enviar o boleto ao
-- Financeiro, quem pediu recebia "Compra paga — aguardando a entrega", com o boleto ainda pendente. O certo: no envio,
-- só o Financeiro é avisado ("Boleto para pagar", que já acontecia); quando ele dá baixa, quem pediu recebe "Compra
-- paga" e quem enviou recebe "Boleto pago — anexe a nota". Nas outras formas (cartão, Pix, Caixinha) a compra já sai
-- paga, e o aviso continua no pagamento.

create or replace function pg_temp.troca(p_funcao regprocedure, p_de text, p_para text)
returns void language plpgsql as $$
declare
  v_def text := pg_get_functiondef(p_funcao);
begin
  if position(p_de in v_def) = 0 then
    raise exception 'trecho não encontrado em %: %', p_funcao, left(p_de, 80);
  end if;
  execute replace(v_def, p_de, p_para);
end;
$$;

select pg_temp.troca('public.compras_vira_conta_a_pagar()'::regprocedure,
$$  if v_pagamento and new.created_by is not null then$$,
$$  if v_pagamento and new.created_by is not null and new.forma_pagamento is distinct from 'boleto' then$$);

select pg_temp.troca('public.compras_boleto_pago_avisa()'::regprocedure,
$$  update public.compras_solicitacoes s set boleto_pago_em = now()$$,
$$  -- E quem pediu cada compra do boleto: agora, sim, está paga.
  insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message, email_sent)
  select s.tenant_id, s.created_by, 'purchase_decided', 'ticket', s.ticket_id,
         'Compra paga — aguardando a entrega: ' || coalesce(s.product_name, ''),
         'A compra foi paga. Quando o produto e a nota chegarem, o pedido é encerrado e você é avisado.', false
    from public.compras_solicitacoes p
    join public.compras_solicitacoes s on s.id = p.id or s.pago_junto_com = p.id
   where p.id = new.purchase_request_id and p.pagamento_em is not null and p.forma_pagamento = 'boleto'
     and s.created_by is not null and s.status::text <> 'completed';
  update public.compras_solicitacoes s set boleto_pago_em = now()$$);

-- Os avisos errados de hoje: "Compra paga" de boleto ainda não pago.
delete from public.notifications n
 using public.compras_solicitacoes s
 where n.reference_type = 'ticket' and n.reference_id = s.ticket_id
   and n.title like 'Compra paga — aguardando a entrega%'
   and s.forma_pagamento = 'boleto' and s.pagamento_em is not null and s.boleto_pago_em is null;

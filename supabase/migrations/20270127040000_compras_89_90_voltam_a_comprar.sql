-- #89 e #90 VOLTAM A "APROVADA · COMPRAR", NO CARTÃO (dono, 2026-10-16): "não foi pago ainda, só quero que volte para
-- cartão em vez de boleto". O pagamento registrado era o boleto, que não existe mais; no cartão a compra ainda não foi
-- feita. Tira o pagamento e as duas contas em aberto; quando o comprador clicar "Comprei no cartão", a conta nasce de novo.
-- Os gatilhos ficam desligados só nestas linhas: "pagamento já registrado" e "conta de compra não se exclui" barrariam o
-- conserto, que é exatamente desfazer as duas coisas. Em outro banco não acha nada.
do $$
declare
  v_ids uuid[] := array['38f71805-01ff-4339-8ca1-e5a78d29e852', 'b78cd0c6-844f-4ea3-a7c2-2eb3723433dc']::uuid[];
begin
  if (select count(*) from public.compras_solicitacoes
       where id = any(v_ids) and status::text = 'approved' and forma_pagamento = 'cartao' and pagamento_em is not null) <> 2
     or exists (select 1 from public.fin_entries where purchase_request_id = any(v_ids) and status <> 'pending') then
    return;
  end if;
  alter table public.fin_entries disable trigger trg_fin_conta_da_compra_nao_se_exclui;
  delete from public.fin_entries where purchase_request_id = any(v_ids);
  alter table public.fin_entries enable trigger trg_fin_conta_da_compra_nao_se_exclui;

  alter table public.compras_solicitacoes disable trigger trg_compras_pagamento_confere;
  alter table public.compras_solicitacoes disable trigger trg_compras_vira_conta_a_pagar;
  update public.compras_solicitacoes
     set pagamento_em = null, pagamento_por = null, pagamento_path = null, payment_due_date = null, boleto_pago_em = null
   where id = any(v_ids);
  alter table public.compras_solicitacoes enable trigger trg_compras_vira_conta_a_pagar;
  alter table public.compras_solicitacoes enable trigger trg_compras_pagamento_confere;
end;
$$;

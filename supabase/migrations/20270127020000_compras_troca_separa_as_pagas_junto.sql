-- COMPRAS: A TROCA DEPOIS DE PAGA SEPARA AS COMPRAS PAGAS JUNTO (dono, 2026-10-16). Depois de 20270127010000 o #89
-- seguia o #90 no cartão, ainda numa conta só. O dono: "por voltar a ser cartão eles deveriam se separar, pois não vou
-- pagar junto igual boleto". Agora, trocada a forma da principal, cada compra que entrou no pagamento dela sai dele e
-- ganha a sua própria conta, na forma nova. O aviso "não pague o boleto" ao Financeiro continua saindo uma vez só.
--
-- E o #89/#90 de hoje: a conta única foi liquidada sem querer e depois excluída (audit_logs, 12:48), o que marcou as
-- duas compras como "boleto pago". Nada foi pago: volta a "não pago" e cada uma ganha a sua conta no cartão.
--
-- De carona: a baixa de uma conta que não é boleto marcava `boleto_pago_em` (a liquidação do cartão fez isso). Só boleto.

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
$$    -- As que entraram neste pagamento seguem a principal (a troca delas sozinha é barrada).
    update public.compras_solicitacoes
       set forma_pagamento = new.forma_pagamento, parcelas = new.parcelas, payment_due_date = new.payment_due_date,
           troca_motivo = 'Segue a compra principal: ' || coalesce(btrim(new.troca_motivo), '')
     where pago_junto_com = new.id;$$,
$$    -- As que entraram neste pagamento saem dele, na forma nova, cada uma com a sua conta (o gatilho delas a cria).
    update public.compras_solicitacoes
       set forma_pagamento = new.forma_pagamento, parcelas = new.parcelas, payment_due_date = new.payment_due_date,
           pago_junto_com = null,
           troca_motivo = 'Separada do pagamento do chamado #' || (select ticket_number from public.tickets where id = new.ticket_id)
             || ': ' || coalesce(btrim(new.troca_motivo), '')
     where pago_junto_com = new.id;$$);

-- A separada não tinha conta: nada a dizer "era" e nenhum boleto a cancelar.
select pg_temp.troca('public.compras_vira_conta_a_pagar()'::regprocedure,
$$  if v_refaz then
    v_notas := trim($$,
$$  if v_refaz and v_era is not null then
    v_notas := trim($$);

select pg_temp.troca('public.compras_boleto_pago_avisa()'::regprocedure,
$$     and s.pagamento_em is not null and s.boleto_pago_em is null;$$,
$$     and s.pagamento_em is not null and s.boleto_pago_em is null and s.forma_pagamento = 'boleto';$$);

-- ─── O #89/#90 de hoje ───────────────────────────────────────────────────────────────────────────
-- Volta as duas ao boleto de antes, sem gatilho e sem a marca de pago, e troca a principal de novo pelo caminho novo.
-- Em outro banco não acha nada.
do $$
declare
  v_90 uuid := '38f71805-01ff-4339-8ca1-e5a78d29e852';
  v_89 uuid := 'b78cd0c6-844f-4ea3-a7c2-2eb3723433dc';
begin
  if not exists (select 1 from public.compras_solicitacoes where id = v_89 and pago_junto_com = v_90 and forma_pagamento = 'cartao')
     or exists (select 1 from public.fin_entries where purchase_request_id in (v_89, v_90)) then
    return;
  end if;
  alter table public.compras_solicitacoes disable trigger trg_compras_troca_a_forma;
  alter table public.compras_solicitacoes disable trigger trg_compras_vira_conta_a_pagar;
  update public.compras_solicitacoes set forma_pagamento = 'boleto', boleto_pago_em = null where id in (v_89, v_90);
  update public.compras_solicitacoes set forma_pagamento_2 = 'cartao' where id = v_90;
  alter table public.compras_solicitacoes enable trigger trg_compras_vira_conta_a_pagar;
  update public.compras_solicitacoes set forma_pagamento = 'cartao', forma_pagamento_2 = 'boleto' where id = v_90;
  alter table public.compras_solicitacoes enable trigger trg_compras_troca_a_forma;
end;
$$;

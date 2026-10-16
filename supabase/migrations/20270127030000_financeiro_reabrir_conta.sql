-- FINANCEIRO: REABRIR A CONTA LIQUIDADA SEM QUERER (dono, 2026-10-16). A conta do #89/#90 foi liquidada por engano e,
-- sem um "desfazer", foi excluída — a compra ficou sem conta. Agora:
--   1. a tela tem "Reabrir" na conta paga (volta a "em aberto", sem a data da baixa — `fin_conta_paga_tem_data` já
--      tira a data quando a paga volta a aberta);
--   2. reabrir a conta de um boleto de compra tira a marca "boleto pago" das compras dele (senão elas seguiriam em
--      "Paga · aguardando a nota" com o boleto ainda por pagar);
--   3. a conta que nasceu de uma compra não se exclui à mão: reabra, ou cancele pela própria compra.

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

-- ─── 2. Reabrir tira o "boleto pago" ─────────────────────────────────────────────────────────────
select pg_temp.troca('public.compras_boleto_pago_avisa()'::regprocedure,
$$begin
  if new.status <> 'paid' or old.status = 'paid' or new.purchase_request_id is null then$$,
$$begin
  if old.status = 'paid' and new.status in ('pending', 'overdue') and new.purchase_request_id is not null then
    update public.compras_solicitacoes s set boleto_pago_em = null
     where (s.id = new.purchase_request_id or s.pago_junto_com = new.purchase_request_id)
       and s.boleto_pago_em is not null and s.status::text = 'approved';
    return new;
  end if;
  if new.status <> 'paid' or old.status = 'paid' or new.purchase_request_id is null then$$);

-- ─── 3. Conta de compra não se exclui à mão ──────────────────────────────────────────────────────
create or replace function public.fin_conta_da_compra_nao_se_exclui()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Escrita de gatilho (pg_trigger_depth() > 1) é do sistema: a reposição da Caixinha apaga a sua conta assim.
  if old.purchase_request_id is not null and pg_trigger_depth() = 1 then
    raise exception 'Esta conta veio de uma compra e não se exclui. Liquidou por engano? Use "Reabrir".'
      using errcode = '23514';
  end if;
  return old;
end;
$$;
revoke all on function public.fin_conta_da_compra_nao_se_exclui() from public, anon, authenticated;
drop trigger if exists trg_fin_conta_da_compra_nao_se_exclui on public.fin_entries;
create trigger trg_fin_conta_da_compra_nao_se_exclui before delete on public.fin_entries
  for each row execute function public.fin_conta_da_compra_nao_se_exclui();

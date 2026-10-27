-- COMPRAS: AGUARDANDO FORNECEDOR (dono, 2026-10-27). O Kit Tigela e Pincel foi aprovado em 14/10, mas o fornecedor
-- precisa produzir antes de gerar o boleto: a compra ficava em "Aprovada · comprar", vermelha de "parada", sem nada que
-- Compras pudesse fazer. Decisões (as quatro = recomendadas):
--   1. Coluna própria, entre "Aprovada · comprar" e "Boleto no Financeiro"; quando o boleto chega, o pagamento segue
--      o caminho de sempre (20270121010000);
--   2. Previsão OBRIGATÓRIA (observação opcional). Antes dela a compra não fica vermelha; passou, fica vermelha e quem
--      marcou é avisado (uma vez por previsão) para cobrar o fornecedor;
--   3. Qualquer forma de pagamento;
--   4. Quem pediu vê "Aguardando o fornecedor · previsão dd/mm" (na tela) e a linha no histórico do pedido.
-- Não é status novo: é um passo da aprovada ainda não paga, como "paga" e "boleto no Financeiro" (as colunas saem das
-- datas). Assim nenhuma regra que olha `status = 'approved'` (conta a pagar, estoque, relatórios) muda.

alter table public.compras_solicitacoes
  add column if not exists fornecedor_previsao date,
  add column if not exists fornecedor_obs text,
  add column if not exists fornecedor_desde timestamptz,
  add column if not exists fornecedor_por uuid references public.profiles(id) on delete set null,
  add column if not exists aviso_fornecedor_em timestamptz;

-- ─── 1. Quem marca, e quando ─────────────────────────────────────────────────────────────────────
create or replace function public.compras_fornecedor_confere()
returns trigger language plpgsql set search_path = public as $$
begin
  if (new.fornecedor_previsao, new.fornecedor_obs) is not distinct from (old.fornecedor_previsao, old.fornecedor_obs) then
    return new;
  end if;
  if pg_trigger_depth() = 1 and current_user = 'authenticated'
     and not (public.pode_no_setor('compras', 'solicitacoes', 'execute') or public.pode_no_financeiro('payable', 'settle')
              or public.pode_decidir_compra(old.caixinha, old.caixinha_id)) then
    raise exception 'Marcar "Aguardando fornecedor" pede a permissão "Executar compra" de Compras.' using errcode = '42501';
  end if;
  if old.status::text <> 'approved' or old.pagamento_em is not null then
    raise exception 'Só a compra aprovada e ainda não paga espera o fornecedor.' using errcode = '23514';
  end if;
  if new.fornecedor_previsao is null then
    raise exception 'Diga a previsão do fornecedor.' using errcode = '23514';
  end if;
  if current_user = 'authenticated' and new.fornecedor_previsao is distinct from old.fornecedor_previsao
     and new.fornecedor_previsao <(now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A previsão não pode ser antes de hoje.' using errcode = '23514';
  end if;
  new.fornecedor_obs := nullif(btrim(new.fornecedor_obs), '');
  new.fornecedor_desde := coalesce(old.fornecedor_desde, now());
  new.fornecedor_por := coalesce(auth.uid(), old.fornecedor_por);
  -- Previsão nova, aviso novo quando ela passar.
  if new.fornecedor_previsao is distinct from old.fornecedor_previsao then
    new.aviso_fornecedor_em := null;
  end if;
  return new;
end;
$$;
revoke all on function public.compras_fornecedor_confere() from public, anon, authenticated;
drop trigger if exists trg_compras_fornecedor_confere on public.compras_solicitacoes;
create trigger trg_compras_fornecedor_confere before update of fornecedor_previsao, fornecedor_obs
  on public.compras_solicitacoes for each row execute function public.compras_fornecedor_confere();

-- ─── 2. O histórico do pedido ganha a linha ──────────────────────────────────────────────────────
create or replace function public.compra_anda_no_pedido()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_etapa text := public.etapa_do_pedido_de_compra(new.status, new.pagamento_em is not null);
  v_acao text;
  v_texto text;
begin
  if new.solicitacao_id is null then return null; end if;
  if new.status is distinct from old.status then
    v_acao := case new.status when 'approved' then 'aprovar' when 'rejected' then 'recusar'
      when 'adjustment_requested' then 'ajustar' when 'completed' then 'comprar' when 'pending_approval' then 'reenviar' end;
    v_texto := case new.status when 'approved' then new.approval_notes when 'rejected' then new.rejection_reason
      when 'adjustment_requested' then new.adjustment_reason
      when 'completed' then concat_ws(E'\n', nullif(btrim(new.purchase_report), ''),
                                      'Sem nota fiscal (recibo anexado): ' || nullif(btrim(new.sem_nota_motivo), ''))
      when 'pending_approval' then new.adjustment_response end;
  elsif new.pago_junto_com is not null and old.pago_junto_com is distinct from new.pago_junto_com then
    v_acao := 'pagar';
    v_texto := 'Paga junto com a compra #' || (select s.numero from public.compras_solicitacoes j
                 join public.solicitacoes s on s.id = j.solicitacao_id where j.id = new.pago_junto_com) || ' (uma conta só).';
  elsif new.pagamento_em is not null and old.pagamento_em is null and new.pago_junto_com is null then
    -- A paga junto já ganhou a linha acima; o pagamento dela vem logo depois e não repete.
    v_acao := 'pagar';
    v_texto := case when new.forma_pagamento = 'boleto'
      then 'Boleto enviado ao Financeiro, vence em ' || coalesce(to_char(new.payment_due_date, 'DD/MM/YYYY'), '—') || '.' end;
  elsif new.forma_pagamento is distinct from old.forma_pagamento then
    v_acao := 'trocar_forma';
    v_texto := 'De ' || public.rotulo_da_forma(old.forma_pagamento) || ' para ' || public.rotulo_da_forma(new.forma_pagamento)
               || coalesce('. Motivo: ' || nullif(btrim(new.troca_motivo), ''), '') || '.';
  elsif new.fornecedor_previsao is distinct from old.fornecedor_previsao then
    v_acao := 'aguardar_fornecedor';
    v_texto := 'Aguardando o fornecedor, previsão ' || to_char(new.fornecedor_previsao, 'DD/MM/YYYY') || '.'
               || coalesce(' ' || new.fornecedor_obs, '');
  end if;
  if v_acao is not null then
    insert into public.solicitacoes_eventos (tenant_id, solicitacao_id, quem, acao, etapa, texto)
    values (new.tenant_id, new.solicitacao_id, auth.uid(), v_acao, v_etapa, nullif(btrim(coalesce(v_texto, '')), ''));
  end if;
  -- O motivo da recusa vai junto: a página do pedido o mostra como em todo pedido recusado.
  update public.solicitacoes
     set etapa = v_etapa, atualizada_em = now(),
         motivo_recusa = case when v_etapa = 'recusada' then nullif(btrim(new.rejection_reason), '') end
   where id = new.solicitacao_id and etapa is distinct from v_etapa;
  return null;
end;
$$;
drop trigger if exists trg_compra_anda_no_pedido on public.compras_solicitacoes;
create trigger trg_compra_anda_no_pedido after update of status, pagamento_em, pago_junto_com, forma_pagamento, fornecedor_previsao
  on public.compras_solicitacoes for each row execute function public.compra_anda_no_pedido();

-- ─── 3. A previsão passou ────────────────────────────────────────────────────────────────────────
/** Previsão do fornecedor vencida e a compra ainda sem pagamento: quem marcou é avisado, uma vez por previsão. */
create or replace function public.compras_lembra_o_fornecedor()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  with vencidas as (
    update public.compras_solicitacoes s set aviso_fornecedor_em = now()
     where s.status::text = 'approved' and s.pagamento_em is null and s.aviso_fornecedor_em is null
       and s.fornecedor_previsao < (now() at time zone 'America/Sao_Paulo')::date
    returning s.*
  )
  insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message, email_sent)
  select v.tenant_id, coalesce(v.fornecedor_por, c.comprador_id), 'reminder', 'solicitacao', v.solicitacao_id,
         'Fornecedor passou da previsão: ' || coalesce(v.product_name, ''),
         'A previsão era ' || to_char(v.fornecedor_previsao, 'DD/MM') || ' e a compra segue sem pagamento. '
           || 'Cobre o fornecedor e, se mudou, atualize a previsão na compra.',
         false
    from vencidas v
    left join public.compras_config c on c.tenant_id = v.tenant_id
   where coalesce(v.fornecedor_por, c.comprador_id) is not null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.compras_lembra_o_fornecedor() from public, anon, authenticated;
-- 09:00 no Brasil (12:00 UTC), junto do lembrete da nota.
select cron.unschedule('compras-lembra-o-fornecedor') where exists (select 1 from cron.job where jobname = 'compras-lembra-o-fornecedor');
select cron.schedule('compras-lembra-o-fornecedor', '0 12 * * *', $cron$select public.compras_lembra_o_fornecedor()$cron$);

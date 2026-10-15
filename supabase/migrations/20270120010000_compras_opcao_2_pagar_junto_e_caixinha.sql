-- COMPRAS: OPÇÃO 2 DE PAGAMENTO, PAGAR JUNTO, AVISO DE ESTOQUE E CAIXINHA PELO CATÁLOGO (dono, 2026-10-15).
-- Decisões (múltipla escolha, as recomendadas):
--   1. OPÇÃO 2: quem aprova escolhe também uma 2ª forma de pagamento, obrigatória ("se a 1ª não der certo, o
--      comprador usa esta"). Depois de aprovada, o comprador troca entre a 1 e a 2 sozinho, com o motivo; quem
--      aprovou é avisado. Uma 3ª forma que não foi aprovada não entra;
--   2. PAGAR JUNTO: #89 e #90 no mesmo boleto do Mercado Livre viravam duas contas e o Financeiro pagaria duas
--      vezes. Ao registrar, o comprador marca as outras compras aprovadas que entram no mesmo pagamento: elas
--      apontam para a principal (`pago_junto_com`), e só a principal gera conta — com a soma, e um aviso só;
--   3. AVISO DE ESTOQUE MÍNIMO: ia para todos com acesso a Compras. Passa a ir para o comprador configurado
--      (Compras › Configurações › Quem compra) e para quem tiver no perfil "Recebe o aviso de estoque mínimo";
--      sem nenhum dos dois, para os administradores. Trocar o comprador na configuração troca o aviso junto;
--   4. CAIXINHA: o recibo da saída passa a ser opcional, e a saída solta diz O QUE foi comprado escolhendo no
--      Catálogo de Produtos (não mais texto livre): o que não está lá, se cadastra antes.

-- ─── 1. Opção 2 de pagamento ─────────────────────────────────────────────────────────────────────
alter table public.compras_solicitacoes
  add column if not exists forma_pagamento_2 text check (forma_pagamento_2 in ('cartao', 'boleto', 'pix', 'caixinha')),
  add column if not exists parcelas_2 smallint check (parcelas_2 between 1 and 24),
  add column if not exists troca_motivo text;

-- Aprovar: a 1ª e a 2ª forma, diferentes; cartão diz à vista ou em quantas vezes (20270105010000 + a opção 2).
create or replace function public.compras_aprovar_exige_pagamento_e_filial()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.status::text = 'pending_approval' then
    new.forma_pagamento := null;
    new.filial := null;
    new.parcelas := null;
    new.forma_pagamento_2 := null;
    new.parcelas_2 := null;
    new.troca_motivo := null;
  elsif new.status::text = 'approved' and old.status::text <> 'approved' and not new.caixinha then
    if new.forma_pagamento is null or new.filial is null then
      raise exception 'Para aprovar, escolha a forma de pagamento (cartão, boleto, pix ou caixinha) e a filial (INBRAS ou MF).'
        using errcode = '23514';
    end if;
    if new.forma_pagamento_2 is null or new.forma_pagamento_2 = new.forma_pagamento then
      raise exception 'Escolha também a 2ª forma de pagamento, diferente da 1ª: é a que o comprador usa se a 1ª não der certo.'
        using errcode = '23514';
    end if;
    if new.forma_pagamento = 'cartao' and new.parcelas is null then
      raise exception 'No cartão, diga se é à vista ou em quantas vezes.' using errcode = '23514';
    end if;
    if new.forma_pagamento_2 = 'cartao' and new.parcelas_2 is null then
      raise exception 'Na 2ª forma (cartão), diga se é à vista ou em quantas vezes.' using errcode = '23514';
    end if;
    if new.forma_pagamento <> 'cartao' then new.parcelas := null; end if;
    if new.forma_pagamento_2 <> 'cartao' then new.parcelas_2 := null; end if;
    new.troca_motivo := null;
  end if;
  return new;
end;
$$;

/**
 * Trocar a forma depois de aprovada: só entre a 1 e a 2 (as duas que quem aprovou escolheu), com o motivo, por
 * quem executa a compra ou quem decide. Fora da aprovada, a forma não muda (registrada, a conta já nasceu).
 */
create or replace function public.compras_troca_a_forma()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 or new.status is distinct from old.status
     or (new.forma_pagamento, new.parcelas, new.forma_pagamento_2, new.parcelas_2)
        is not distinct from (old.forma_pagamento, old.parcelas, old.forma_pagamento_2, old.parcelas_2) then
    return new;
  end if;
  if old.status::text <> 'approved' then
    raise exception 'A forma de pagamento só se troca com a compra aprovada e ainda não registrada.' using errcode = '23514';
  end if;
  if not (public.pode_no_setor('compras', 'solicitacoes', 'execute') or public.pode_decidir_compra(old.caixinha)) then
    raise exception 'Trocar a forma de pagamento pede a permissão "Executar compra" de Compras.' using errcode = '42501';
  end if;
  if old.forma_pagamento_2 is null
     or (new.forma_pagamento, new.parcelas, new.forma_pagamento_2, new.parcelas_2)
        is distinct from (old.forma_pagamento_2, old.parcelas_2, old.forma_pagamento, old.parcelas) then
    raise exception 'Só dá para trocar pela 2ª forma que foi aprovada. Outra forma: peça a quem aprova.' using errcode = '23514';
  end if;
  if nullif(btrim(new.troca_motivo), '') is null then
    raise exception 'Diga por que a forma de pagamento mudou.' using errcode = '23514';
  end if;
  if old.approved_by is not null and old.approved_by is distinct from auth.uid() then
    -- Direto, sem `notify_ticket`: ele filtra quem não enxerga o chamado, e quem aprova nem sempre enxerga.
    insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message, email_sent)
    values (new.tenant_id, old.approved_by, 'purchase_decided', 'ticket', new.ticket_id,
            'Forma de pagamento trocada — ' || coalesce(new.product_name, ''),
            'Passou de ' || old.forma_pagamento || ' para a 2ª forma aprovada (' || new.forma_pagamento || '). Motivo: '
              || btrim(new.troca_motivo), false);
  end if;
  return new;
end;
$$;
revoke all on function public.compras_troca_a_forma() from public, anon, authenticated;
drop trigger if exists trg_compras_troca_a_forma on public.compras_solicitacoes;
create trigger trg_compras_troca_a_forma before update of forma_pagamento, parcelas, forma_pagamento_2, parcelas_2
  on public.compras_solicitacoes for each row execute function public.compras_troca_a_forma();

-- ─── 2. Pagar junto ──────────────────────────────────────────────────────────────────────────────
alter table public.compras_solicitacoes
  add column if not exists pago_junto_com uuid references public.compras_solicitacoes(id) on delete set null;
create index if not exists compras_pago_junto_com on public.compras_solicitacoes (pago_junto_com) where pago_junto_com is not null;

/** Quanto a compra vale: o unitário do orçamento aprovado × a quantidade aprovada + o frete (ou a estimativa). */
create or replace function public.valor_da_compra(p_compra uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(
    (select round(coalesce(q.valor_unitario, (q.amount - q.frete) / nullif(s.quantidade, 0))
                  * coalesce(s.quantidade_aprovada, s.quantidade) + q.frete, 2)
       from public.compras_orcamentos q where q.id = s.approved_quote_id and q.tenant_id = s.tenant_id),
    s.estimated_amount)
  from public.compras_solicitacoes s where s.id = p_compra;
$$;
revoke all on function public.valor_da_compra(uuid) from public, anon;
grant execute on function public.valor_da_compra(uuid) to authenticated;

/** Quem entra no pagamento de outra: aprovada, da mesma empresa, fora da Caixinha, e a principal não é parceira. */
create or replace function public.compras_pago_junto_confere()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  p public.compras_solicitacoes%rowtype;
begin
  if new.pago_junto_com is null or new.pago_junto_com is not distinct from old.pago_junto_com then
    return new;
  end if;
  select * into p from public.compras_solicitacoes where id = new.pago_junto_com;
  if p.id is null or p.tenant_id <> new.tenant_id or p.id = new.id then
    raise exception 'Pagar junto: a compra principal não foi encontrada.' using errcode = '23514';
  end if;
  if p.pago_junto_com is not null then
    raise exception 'Pagar junto: a compra principal já é paga junto com outra.' using errcode = '23514';
  end if;
  if old.status::text <> 'approved' or p.status::text <> 'approved' then
    raise exception 'Pagar junto: as compras precisam estar aprovadas e ainda não registradas.' using errcode = '23514';
  end if;
  if new.caixinha or p.caixinha or new.forma_pagamento = 'caixinha' then
    raise exception 'Pagar junto não vale para compra da Caixinha.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.compras_pago_junto_confere() from public, anon, authenticated;
drop trigger if exists trg_compras_pago_junto_confere on public.compras_solicitacoes;
create trigger trg_compras_pago_junto_confere before update of pago_junto_com on public.compras_solicitacoes
  for each row execute function public.compras_pago_junto_confere();

-- A conta a pagar da compra (20270107010000) com o "pagar junto": a parceira não gera conta; a principal soma as
-- parceiras e avisa uma vez.
-- ponytail: a parceira reaberta depois de a principal virar conta não refaz a soma — o Financeiro acerta o valor
-- à mão na conta da principal. Se acontecer com frequência, recalcular a conta aberta da principal aqui.
create or replace function public.compras_vira_conta_a_pagar()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_valor numeric(14,2);
  v_fornecedor text;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_vencimento date;
  v_antes text := case when tg_op = 'UPDATE' then old.status::text else null end;
  v_pago numeric(14,2);
  v_vale numeric(14,2);
  v_notas text := nullif(trim(both E'\n' from
    coalesce('Filial: ' || new.filial, '') || E'\n' || coalesce(trim(new.purchase_report), '')), '');
  v_do_caixa boolean := new.caixinha or new.forma_pagamento = 'caixinha';
  v_n int := case when new.forma_pagamento = 'cartao' then coalesce(new.parcelas, 1) else 1 end;
  v_parcela numeric(14,2);
  v_metodo text := case new.forma_pagamento
    when 'cartao' then case when coalesce(new.parcelas, 1) > 1 then 'Cartão ' || new.parcelas || 'x' else 'Cartão à vista' end
    when 'boleto' then 'Boleto' when 'pix' then 'Pix' end;
  v_descricao text := coalesce(new.product_name, 'sem descrição');
  v_juntas text;
  v_valor_juntas numeric(14,2);
begin
  if v_antes = 'completed' and new.status::text <> 'completed' then
    if v_do_caixa then
      delete from public.caixinha_movimentos where purchase_request_id = new.id;
      return new;
    end if;
    update public.fin_entries
       set status = 'cancelled',
           notes = trim(both E'\n' from coalesce(notes, '') || E'\n' || 'Cancelada: a compra deixou de estar concluída.')
     where purchase_request_id = new.id and status in ('pending', 'overdue');
    return new;
  end if;
  if new.status::text <> 'completed' or v_antes = 'completed' then
    return new;
  end if;
  -- Paga junto com outra: a conta é da principal.
  if new.pago_junto_com is not null and not v_do_caixa then
    return new;
  end if;
  select coalesce(nullif(trim(s.name), ''), nullif(trim(q.supplier), ''))
    into v_fornecedor
    from public.compras_orcamentos q
    left join public.suppliers s on s.id = q.supplier_id and s.tenant_id = q.tenant_id
   where q.id = new.approved_quote_id and q.tenant_id = new.tenant_id;
  v_valor := public.valor_da_compra(new.id);
  if v_valor is null or v_valor <= 0 then
    return new;
  end if;
  if v_do_caixa then
    insert into public.caixinha_movimentos (tenant_id, tipo, valor, descricao, recibo_path, purchase_request_id, created_by)
    values (new.tenant_id, 'saida', v_valor,
            left('Compra: ' || coalesce(new.product_name, 'sem descrição') || coalesce(' (' || v_fornecedor || ')', ''), 200),
            new.purchase_file_path, new.id, new.executed_by)
    on conflict (purchase_request_id) do nothing;
    return new;
  end if;

  -- As que entram neste pagamento.
  select string_agg(coalesce(j.product_name, '?') || ' (#' || t.ticket_number || ')', ' + ' order by t.ticket_number),
         coalesce(sum(public.valor_da_compra(j.id)), 0)
    into v_juntas, v_valor_juntas
    from public.compras_solicitacoes j
    join public.tickets t on t.id = j.ticket_id
   where j.pago_junto_com = new.id;
  if v_juntas is not null then
    v_valor := v_valor + v_valor_juntas;
    v_descricao := v_descricao || ' + ' || v_juntas;
    v_notas := trim(both E'\n' from coalesce(v_notas, '') || E'\n' || 'Pago junto: ' || v_juntas);
  end if;

  select coalesce(sum(amount) filter (where status = 'paid'), 0), coalesce(sum(amount) filter (where status <> 'cancelled'), 0)
    into v_pago, v_vale from public.fin_entries where purchase_request_id = new.id;
  if v_pago > 0 then
    if v_vale = v_valor then return new; end if;
    raise exception 'esta compra já tem conta paga de R$ % e agora vale R$ %: acerte a diferença no Financeiro antes de concluir de novo',
      to_char(v_pago, 'FM999G999G990D00'), to_char(v_valor, 'FM999G999G990D00') using errcode = '23514';
  end if;

  v_parcela := round(v_valor / v_n, 2);
  for i in 1..v_n loop
    -- Cartão: a fatura de cada parcela, em aberto até a baixa; pix: pago hoje; boleto: o vencimento informado.
    v_vencimento := case
      when new.forma_pagamento = 'cartao' then public.vencimento_da_fatura(new.tenant_id, v_hoje, i)
      when new.forma_pagamento = 'pix' then v_hoje
      else coalesce(new.payment_due_date, v_hoje) end;
    insert into public.fin_entries (
      tenant_id, kind, description, category, counterparty, amount, due_date, status, payment_method,
      cost_center, competence, source, notes, purchase_request_id, parcela, filial, created_by
    ) values (
      new.tenant_id, 'payable',
      'Compra: ' || left(v_descricao, 200) || case when v_n > 1 then ' (' || i || '/' || v_n || ')' else '' end,
      'compras', v_fornecedor,
      case when i = v_n then v_valor - v_parcela * (v_n - 1) else v_parcela end,
      v_vencimento,
      case when new.forma_pagamento = 'pix' then 'paid' else 'pending' end::public.fin_entry_status,
      v_metodo,
      nullif(trim(new.department), ''), date_trunc('month', v_vencimento)::date, 'compra',
      v_notas, new.id, i, new.filial, new.executed_by
    )
    on conflict (purchase_request_id, parcela) where purchase_request_id is not null do update
       set status = excluded.status, amount = excluded.amount, counterparty = excluded.counterparty,
           description = excluded.description, due_date = excluded.due_date, competence = excluded.competence,
           cost_center = excluded.cost_center, notes = excluded.notes, payment_method = excluded.payment_method,
           filial = excluded.filial
     where public.fin_entries.status = 'cancelled';
  end loop;

  if new.forma_pagamento = 'boleto' then
    perform public.notify_ticket(new.ticket_id, 'purchase_decided', public.notification_team(new.tenant_id, 'financeiro'),
      'Boleto para pagar — ' || left(v_descricao, 120),
      'R$ ' || to_char(v_valor, 'FM999G999G990D00') || ', vence em ' || to_char(coalesce(new.payment_due_date, v_hoje), 'DD/MM/YYYY')
        || coalesce(' · ' || v_fornecedor, '')
        || case when v_juntas is not null then '. Um boleto só para ' || (1 + (select count(*) from public.compras_solicitacoes where pago_junto_com = new.id)) || ' compras' else '' end
        || '. Está em Contas a Pagar; a nota está no chamado da compra.',
      true, new.executed_by);
  end if;
  return new;
end;
$$;

-- ─── 3. Quem recebe o aviso de estoque mínimo ────────────────────────────────────────────────────
create or replace function public.quem_recebe_aviso_de_estoque(p_tenant uuid)
returns uuid[] language sql stable security definer set search_path = public as $$
  with escolhidos as (
    select c.comprador_id as id from public.compras_config c where c.tenant_id = p_tenant and c.comprador_id is not null
    union
    select p.id from public.profiles p
     where p.tenant_id = p_tenant and coalesce(p.is_active, true)
       and coalesce(public.tem_permissao(p.id, 'compras', 'estoque', 'aviso'), false)
  )
  select coalesce(
    (select array_agg(distinct id) from escolhidos),
    (select array_agg(distinct p.id) from public.profiles p
       join public.user_roles r on r.user_id = p.id and r.role in ('owner', 'admin')
      where p.tenant_id = p_tenant and coalesce(p.is_active, true)),
    '{}'::uuid[]);
$$;
revoke all on function public.quem_recebe_aviso_de_estoque(uuid) from public, anon;
grant execute on function public.quem_recebe_aviso_de_estoque(uuid) to authenticated;

/** A saída não deixa o saldo negativo; cruzar o mínimo avisa quem compra (20270118010000 + o destinatário). */
create or replace function public.estoque_confere_saida()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_saldo numeric := public.saldo_do_estoque(new.produto_id);
  p public.compras_produtos%rowtype;
begin
  select * into p from public.compras_produtos where id = new.produto_id;
  if not p.suprimento then
    raise exception '"%" não é suprimento: marque "controla estoque" no Catálogo de Produtos.', p.name using errcode = '23514';
  end if;
  if new.tipo = 'saida' and v_saldo - new.quantidade < 0 then
    raise exception 'O estoque de "%" tem % %: não dá para tirar %.', p.name, v_saldo, p.unidade, new.quantidade using errcode = '23514';
  end if;
  if new.tipo = 'saida' and p.estoque_minimo > 0 and v_saldo >= p.estoque_minimo and v_saldo - new.quantidade < p.estoque_minimo then
    insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message, email_sent)
    select new.tenant_id, u, 'reminder', 'estoque', new.produto_id,
           'Repor ' || p.name,
           'O estoque de ' || p.name || ' ficou em ' || (v_saldo - new.quantidade) || ' ' || p.unidade
             || ' (mínimo ' || p.estoque_minimo || '). Abra o pedido de compra em Nova solicitação › Compras.',
           false
      from unnest(public.quem_recebe_aviso_de_estoque(new.tenant_id)) u;
  end if;
  return new;
end;
$$;

-- O Gestor de Compras recebe o aviso de saída (a caixinha nova do perfil).
update public.access_profiles
   set permissions = jsonb_set(permissions, '{estoque,aviso}', 'true'::jsonb, true)
 where department = 'compras' and name = 'Gestor' and permissions ? 'estoque';

-- ─── 4. Caixinha: recibo opcional, e a saída solta escolhe no Catálogo ──────────────────────────
alter table public.caixinha_movimentos drop constraint if exists caixinha_saida_tem_recibo;
-- `not valid`: as saídas antigas, de texto livre, ficam como estão; vale daqui para a frente.
alter table public.caixinha_movimentos drop constraint if exists caixinha_saida_do_catalogo;
alter table public.caixinha_movimentos add constraint caixinha_saida_do_catalogo
  check (tipo = 'entrada' or purchase_request_id is not null or produto_id is not null) not valid;

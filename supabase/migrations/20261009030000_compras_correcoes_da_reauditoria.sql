-- L8: Compras — o que a reauditoria achou nas correções. 2026-09-18.
--
-- A primeira rodada de correções fechou seis buracos e abriu três. Estes são
-- os do banco; os da tela estão no mesmo commit.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Compra não nasce concluída
-- ───────────────────────────────────────────────────────────────────────────
-- A correção anterior fechou a porta do INSERT **só para `approved`**. Um POST
-- direto com `status = 'completed'` continuava entrando: sem orçamento, sem
-- motivo e sem nunca ter passado pela aprovação — que é o assunto inteiro
-- desta leva. A policy de INSERT confere o tenant e mais nada.
--
-- Concluída é para onde a compra **chega**, não de onde ela parte.

-- ───────────────────────────────────────────────────────────────────────────
-- 2. A conta cancelada era só a pendente
-- ───────────────────────────────────────────────────────────────────────────
-- `where status = 'pending'` deixava viva a conta em **atraso** — e "Atrasado"
-- é um status que se escolhe à mão no lançamento. Desfazer a compra deixava o
-- Financeiro com uma conta vencida de um pedido reprovado.

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Conta já paga: refazer a compra com outro valor saía em silêncio
-- ───────────────────────────────────────────────────────────────────────────
-- `on conflict … do update … where status = 'cancelled'` transforma o INSERT
-- em nada quando a conta está paga. Concluir → pagar → desfazer → renegociar →
-- concluir de novo deixava o pedido dizendo R$ 1.200 e o Financeiro com R$ 850
-- pagos, sem erro, sem aviso e sem linha nova.
--
-- Dinheiro que saiu não se corrige por trigger. O que o banco pode fazer é
-- **parar e dizer**: divergiu, e alguém tem de acertar no Financeiro. Quando o
-- valor é o mesmo, não há nada a acertar e a conclusão passa.

create or replace function public.fin_compra_exige_tres_orcamentos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quantos integer;
  v_antes   text := case when tg_op = 'UPDATE' then old.status::text else null end;
begin
  if tg_op = 'INSERT' and new.status::text = 'completed' then
    raise exception
      'compra não nasce concluída: ela é aberta para análise e passa pela aprovação'
      using errcode = '23514';
  end if;

  -- Desfazer a aprovação apaga o motivo: ele explicava *aquela* decisão.
  -- Concluída não entra aqui — lá o motivo é o histórico da compra que foi.
  if new.status::text in ('pending_approval', 'rejected') then
    new.few_quotes_reason := null;
    return new;
  end if;

  if new.status::text <> 'approved' or v_antes = 'approved' then
    return new;
  end if;

  select count(*) into v_quantos
    from public.fin_purchase_quotes q
   where q.request_id = new.id and q.tenant_id = new.tenant_id;

  -- Com três, o campo não faz sentido: apaga, para a tela não continuar
  -- dizendo "aprovada com menos de três orçamentos" numa compra bem cotada.
  if v_quantos >= 3 then
    new.few_quotes_reason := null;
    return new;
  end if;

  if coalesce(trim(new.few_quotes_reason), '') = '' then
    raise exception
      'esta compra tem % orçamento(s): para aprovar com menos de três, escreva o motivo (fornecedor exclusivo, urgência…)',
      v_quantos
      using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_fin_compra_exige_tres_orcamentos on public.fin_purchase_requests;
create trigger trg_fin_compra_exige_tres_orcamentos
  before insert or update of status on public.fin_purchase_requests
  for each row execute function public.fin_compra_exige_tres_orcamentos();

create or replace function public.fin_compra_vira_conta_a_pagar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_valor       numeric(14,2);
  v_fornecedor  text;
  v_vencimento  date;
  v_antes       text := case when tg_op = 'UPDATE' then old.status::text else null end;
  v_conta       public.fin_entries%rowtype;
begin
  if v_antes = 'completed' and new.status::text <> 'completed' then
    -- Em atraso também é conta viva. Paga não: o dinheiro saiu.
    update public.fin_entries
       set status = 'cancelled',
           notes = trim(both E'\n' from
             coalesce(notes, '') || E'\n' || 'Cancelada: a compra deixou de estar concluída.')
     where purchase_request_id = new.id and status in ('pending', 'overdue');
    return new;
  end if;

  if new.status::text <> 'completed' or v_antes = 'completed' then
    return new;
  end if;

  select q.amount, coalesce(nullif(trim(s.name), ''), nullif(trim(q.supplier), ''))
    into v_valor, v_fornecedor
    from public.fin_purchase_quotes q
    left join public.fin_suppliers s
      on s.id = q.supplier_id and s.tenant_id = q.tenant_id
   where q.id = new.approved_quote_id and q.tenant_id = new.tenant_id;

  v_valor := coalesce(v_valor, new.estimated_amount);
  if v_valor is null or v_valor <= 0 then
    return new;
  end if;

  -- Conta já paga é dinheiro que saiu, e trigger nenhum o traz de volta.
  -- Mesmo valor: nada a fazer. Valor diferente: para aqui, porque seguir em
  -- silêncio deixava o pedido e o Financeiro contando histórias diferentes.
  select * into v_conta from public.fin_entries
   where purchase_request_id = new.id and status = 'paid';
  if found then
    if v_conta.amount = v_valor then
      return new;
    end if;
    raise exception
      'esta compra já tem conta paga de R$ % e agora vale R$ %: acerte a diferença no Financeiro antes de concluir de novo',
      to_char(v_conta.amount, 'FM999G999G990D00'), to_char(v_valor, 'FM999G999G990D00')
      using errcode = '23514';
  end if;

  -- ponytail: teto conhecido — o vencimento nasce como **hoje**, porque não há
  -- onde informar o prazo real ao concluir a compra. Quem comprou sabe, e hoje
  -- corrige no Financeiro. Saída: um campo de vencimento no laudo de compra.
  -- Está registrado em `nao-funciona.md` como pendência do dono.
  v_vencimento := (now() at time zone 'America/Sao_Paulo')::date;

  insert into public.fin_entries (
    tenant_id, kind, description, category, counterparty, amount,
    due_date, status, cost_center, competence, source, notes,
    purchase_request_id, created_by
  ) values (
    new.tenant_id, 'payable',
    'Compra: ' || left(coalesce(new.product_name, 'sem descrição'), 140),
    'compras', v_fornecedor, v_valor,
    v_vencimento, 'pending',
    -- O centro de custo é o setor que pediu: é assim que o teto de gasto por
    -- setor e a conta a pagar falam do mesmo dinheiro. Setor em branco deixa a
    -- conta **sem** centro de custo, e ela fica fora do teto — pendência
    -- registrada, porque inventar um setor seria pior do que não ter.
    nullif(trim(new.department), ''),
    -- Competência é o **primeiro dia do mês**, como em toda a importação
    -- (`competenceOf`).
    date_trunc('month', v_vencimento)::date, 'compra',
    nullif(trim(new.purchase_report), ''),
    new.id, new.executed_by
  )
  on conflict (purchase_request_id) where purchase_request_id is not null
  do update set
       status       = 'pending',
       amount       = excluded.amount,
       counterparty = excluded.counterparty,
       description  = excluded.description,
       due_date     = excluded.due_date,
       competence   = excluded.competence,
       cost_center  = excluded.cost_center,
       notes        = excluded.notes
     -- Só a conta que **foi cancelada** volta: concluir duas vezes seguidas
     -- continua não mexendo na conta que já está lá. A conta paga nem chega
     -- aqui — o bloco acima já parou ou já devolveu.
     where public.fin_entries.status = 'cancelled';

  return new;
end;
$$;
drop trigger if exists trg_fin_compra_vira_conta_a_pagar on public.fin_purchase_requests;
create trigger trg_fin_compra_vira_conta_a_pagar
  after update of status on public.fin_purchase_requests
  for each row execute function public.fin_compra_vira_conta_a_pagar();

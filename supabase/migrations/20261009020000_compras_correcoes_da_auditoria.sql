-- L8: Compras — correções da auditoria da leva. 2026-09-18.
--
-- Seis achados, todos reproduzidos no banco de teste antes de escrever isto.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. A conta a pagar nascia com o dinheiro de outra empresa
-- ───────────────────────────────────────────────────────────────────────────
-- A leva deu chave composta a `supplier_id` e a `purchase_request_id` e
-- **esqueceu o `approved_quote_id`**, que continuou apontando só para
-- `fin_purchase_quotes (id)`. A policy de UPDATE confere o tenant da linha
-- alterada, não o do orçamento apontado: um pedido da empresa A aprovado com
-- o `id` de um orçamento da empresa B virava conta a pagar da A **com o valor
-- negociado e o nome do fornecedor da B**. Reproduzido no teste.
--
-- A resposta é a mesma de sempre nesta casa: chave composta, e não um guard
-- dentro da função — assim vale para toda escrita, venha de onde vier.
do $uk$
begin
  alter table public.fin_purchase_quotes
    add constraint fin_purchase_quotes_id_tenant_key unique (id, tenant_id);
exception when duplicate_object or duplicate_table then null;
end $uk$;

alter table public.fin_purchase_requests
  drop constraint if exists fin_purchase_requests_approved_quote_fkey;

do $fk$
begin
  alter table public.fin_purchase_requests
    add constraint fin_purchase_requests_approved_quote_fkey
      foreign key (approved_quote_id, tenant_id)
      references public.fin_purchase_quotes (id, tenant_id) on delete set null (approved_quote_id);
exception when duplicate_object or duplicate_table then null;
end $fk$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Os três orçamentos: pela porta do INSERT não passava ninguém, e o motivo
--    valia para sempre
-- ───────────────────────────────────────────────────────────────────────────
-- Dois furos no trigger anterior:
--
--   a) ele era `before update of status`. Um POST direto em
--      `fin_purchase_requests` com `status = 'approved'` entrava sem orçamento
--      nenhum e sem motivo — e o próprio teste da leva usava esse desvio sem
--      perceber.
--   b) `few_quotes_reason` nunca era limpo. Aprovar com um orçamento e o
--      motivo escrito, reprovar, e aprovar de novo: o motivo velho satisfazia
--      a regra, e a segunda aprovação passava sem ninguém escrever nada.
--      Justificativa é de uma decisão, não do registro.
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

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Compra que deixa de estar concluída deixava a conta a pagar viva
-- ───────────────────────────────────────────────────────────────────────────
-- `completed` → `rejected` deixava a conta em aberto no Financeiro: alguém
-- pagaria uma compra cujo pedido diz "reprovada".
--
-- Cancela, não apaga: conta que existiu e foi desfeita é informação. E conta
-- **já paga** não se mexe — o dinheiro saiu, e desfazer no sistema não o traz
-- de volta; quem acerta isso é o Financeiro, à mão.
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
begin
  if v_antes = 'completed' and new.status::text <> 'completed' then
    update public.fin_entries
       set status = 'cancelled',
           notes = trim(both E'\n' from
             coalesce(notes, '') || E'\n' || 'Cancelada: a compra deixou de estar concluída.')
     where purchase_request_id = new.id and status = 'pending';
    return new;
  end if;

  if new.status::text <> 'completed' or v_antes = 'completed' then
    return new;
  end if;

  -- `q.tenant_id = new.tenant_id` é cinto e suspensório junto com a chave
  -- composta do item 1: a chave impede a linha existir, isto impede a leitura.
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
    -- (`competenceOf`). Gravar o dia corrente fazia o filtro de Competência
    -- mostrar duas opções "09/2026" idênticas, cada uma filtrando um pedaço.
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
     -- continua não mexendo na conta que já está lá, paga ou a pagar.
     where public.fin_entries.status = 'cancelled';

  return new;
end;
$$;
drop trigger if exists trg_fin_compra_vira_conta_a_pagar on public.fin_purchase_requests;
create trigger trg_fin_compra_vira_conta_a_pagar
  after update of status on public.fin_purchase_requests
  for each row execute function public.fin_compra_vira_conta_a_pagar();

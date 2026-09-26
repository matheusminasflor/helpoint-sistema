-- A conta a pagar nascia vencendo HOJE, sempre — e no dia seguinte estava em atraso
--
-- Leva I (Compras), 2026-09-26. Decisão do dono: quem executa a compra informa
-- o prazo, no laudo.
--
-- ══ O QUE ACONTECIA ═════════════════════════════════════════════════════════
--
-- `fin_compra_vira_conta_a_pagar` fazia:
--
--   v_vencimento := (now() at time zone 'America/Sao_Paulo')::date;
--
-- Não por escolha: não havia onde informar o prazo. A L8 registrou isso com um
-- `ponytail:` no trigger — "quem comprou sabe o prazo e corrige a conta no
-- Financeiro". Na prática toda compra a prazo nasce com a data errada, aparece
-- como vencida no dia seguinte, e alguém tem de saber de cor qual era o prazo
-- para corrigir. O relatório de contas vencidas mente até lá.
--
-- ══ A CORREÇÃO ══════════════════════════════════════════════════════════════
--
-- `payment_due_date` no laudo de compra — quem executa é a última pessoa a
-- tocar na compra e a única que tem a nota na mão. O trigger passa a usar
-- `coalesce(payment_due_date, hoje)`, então compra à vista continua funcionando
-- sem ninguém preencher nada, e a competência da conta acompanha o vencimento
-- informado (é o mês em que a despesa cai no caixa).
--
-- Data no PASSADO é permitida de propósito: compra lançada depois de paga
-- existe, e recusá-la obrigaria a mentir a data para o sistema aceitar.
--
-- Data absurda é barrada por um CHECK de janela FIXA (2020–2100). Fixa porque
-- CHECK não aceita `now()` nem `current_date` — não são imutáveis, e o Postgres
-- recusa a constraint. O que ela pega é o dedo escorregando: `0226` ou `2226`
-- em vez de `2026`. O ano vizinho errado (`2035`) ela não pega, e essa é a
-- limitação — uma conta que vence em nove anos não aparece em lista de vencidas
-- nem de a vencer, e ninguém percebe. Quem pega esse é o olho de quem confere
-- o laudo, porque a data aparece na tela ao lado do valor.

begin;

alter table public.fin_purchase_requests
  add column if not exists payment_due_date date;

comment on column public.fin_purchase_requests.payment_due_date is
  'Vencimento informado no laudo de compra. Nulo = à vista: a conta a pagar '
  'vence no dia da conclusão. É daqui que sai `fin_entries.due_date`.';

alter table public.fin_purchase_requests
  drop constraint if exists fin_purchase_requests_vencimento_plausivel;
alter table public.fin_purchase_requests
  add constraint fin_purchase_requests_vencimento_plausivel
  check (
    payment_due_date is null
    or payment_due_date between date '2020-01-01' and date '2100-01-01'
  );

-- `create or replace`: a ACL se preserva e a regra 14 não se aplica.
-- Muda DUAS linhas em relação à versão da migration anterior — o `coalesce` do
-- vencimento. O resto é o que a L8 e as duas reauditorias deixaram.
create or replace function public.fin_compra_vira_conta_a_pagar()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_valor       numeric(14,2);
  v_fornecedor  text;
  v_vencimento  date;
  v_antes       text := case when tg_op = 'UPDATE' then old.status::text else null end;
  v_conta       public.fin_entries%rowtype;
begin
  if v_antes = 'completed' and new.status::text <> 'completed' then
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
    left join public.suppliers s on s.id = q.supplier_id and s.tenant_id = q.tenant_id
   where q.id = new.approved_quote_id and q.tenant_id = new.tenant_id;

  v_valor := coalesce(v_valor, new.estimated_amount);
  if v_valor is null or v_valor <= 0 then
    return new;
  end if;

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

  -- O prazo que o executor informou; sem ele, à vista. `current_date` seria o
  -- dia do servidor (UTC): depois das 21h no Brasil já é amanhã — regra 10 do
  -- pgTAP e regra 4 das cinco, do lado do banco.
  v_vencimento := coalesce(
    new.payment_due_date,
    (now() at time zone 'America/Sao_Paulo')::date
  );

  insert into public.fin_entries (
    tenant_id, kind, description, category, counterparty, amount,
    due_date, status, cost_center, competence, source, notes,
    purchase_request_id, created_by
  ) values (
    new.tenant_id, 'payable',
    'Compra: ' || left(coalesce(new.product_name, 'sem descrição'), 140),
    'compras', v_fornecedor, v_valor,
    v_vencimento, 'pending',
    nullif(trim(new.department), ''),
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
     where public.fin_entries.status = 'cancelled';

  return new;
end;
$function$;

commit;

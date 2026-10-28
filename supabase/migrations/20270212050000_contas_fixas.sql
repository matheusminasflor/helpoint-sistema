-- CONTAS FIXAS E A CONTA NO CARTÃO (decisões do dono, 2026-10-28; memória `contas-fixas-e-forma-de-pagamento`).
--
-- "Em contas a pagar ter como lançar um pagamento fixo, mensal ou anual e a forma de pagamento, pois tem uma conta
-- atualmente que foi paga no cartão e ela é mensal."
--
-- 1. CONTA FIXA (`fin_contas_fixas`): o modelo. Gera SOZINHA o lançamento de cada período — mensal ou anual —, 10 dias
--    antes do dia, até ser encerrada ou até a data final. O primeiro sai na hora do cadastro. O valor do modelo é a
--    previsão: quem dá baixa corrige o daquele mês; mudar o modelo vale dali para a frente (o que já saiu não muda).
-- 2. A CONTA NO CARTÃO (`fin_entries.data_no_cartao`): lançada à mão no cartão de crédito, a conta vence no dia da
--    fatura do cartão da filial (`vencimento_da_fatura`, o mesmo cálculo das compras) e entra em "Faturas do cartão".

-- ─── 1. O modelo ──────────────────────────────────────────────────────────────────────────────────────────────────
create table public.fin_contas_fixas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id(),
  kind public.fin_entry_kind not null default 'payable',
  description text not null check (btrim(description) <> ''),
  counterparty text,
  category text,
  cost_center text,
  notes text,
  amount numeric(14, 2) not null check (amount > 0),
  payment_method text,
  filial text check (filial in ('INBRAS', 'MF', 'BY.MF')),
  frequencia text not null check (frequencia in ('mensal', 'anual')),
  -- O dia da 1ª ocorrência: o vencimento, ou o dia da cobrança no cartão. As seguintes contam a partir dele (dia 31
  -- vira o último dia dos meses curtos, sem "escorregar" para o 28 nos meses depois).
  primeiro_dia date not null,
  ate date,
  geradas integer not null default 0,
  encerrada_em timestamptz,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint fin_contas_fixas_ate_depois check (ate is null or ate >= primeiro_dia),
  constraint fin_contas_fixas_cartao_tem_filial check (payment_method is distinct from 'Cartão de crédito' or filial is not null)
);

comment on table public.fin_contas_fixas is
  'Conta fixa (mensal/anual) que gera sozinha o lançamento de cada período 10 dias antes (dono, 2026-10-28).';

create index fin_contas_fixas_tenant on public.fin_contas_fixas (tenant_id) where encerrada_em is null;

alter table public.fin_contas_fixas enable row level security;

-- As mesmas portas de `fin_entries`.
create policy fin_contas_fixas_select on public.fin_contas_fixas for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_financeiro(kind::text, 'view'));
create policy fin_contas_fixas_insert on public.fin_contas_fixas for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_financeiro(kind::text, 'create'));
create policy fin_contas_fixas_update on public.fin_contas_fixas for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_financeiro(kind::text, 'edit'))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_financeiro(kind::text, 'edit'));
create policy fin_contas_fixas_delete on public.fin_contas_fixas for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_financeiro(kind::text, 'delete'));

grant select, insert, update, delete on public.fin_contas_fixas to authenticated;

-- ─── 2. O lançamento sabe de onde veio, e o dia no cartão ─────────────────────────────────────────────────────────
alter table public.fin_entries
  add column if not exists conta_fixa_id uuid references public.fin_contas_fixas(id) on delete set null,
  add column if not exists data_no_cartao date;

comment on column public.fin_entries.conta_fixa_id is 'A conta fixa que gerou este lançamento (2026-10-28).';
comment on column public.fin_entries.data_no_cartao is
  'Dia da cobrança no cartão de crédito: o vencimento vira o dia da fatura da filial (2026-10-28).';

-- Uma ocorrência por período: rodar o gerador duas vezes não duplica.
create unique index fin_entries_uma_por_periodo on public.fin_entries (conta_fixa_id, competence)
  where conta_fixa_id is not null;

-- ─── 3. O cartão: vence na fatura ─────────────────────────────────────────────────────────────────────────────────
create or replace function public.fin_conta_no_cartao_vence_na_fatura()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.data_no_cartao is not null and new.payment_method = 'Cartão de crédito' and new.filial is not null then
    -- Só o vencimento muda: a competência continua o mês da cobrança (é quando a despesa aconteceu).
    new.due_date := public.vencimento_da_fatura(new.tenant_id, new.data_no_cartao, 1, new.filial);
  end if;
  return new;
end;
$$;
revoke all on function public.fin_conta_no_cartao_vence_na_fatura() from public, anon, authenticated;

create trigger fin_conta_no_cartao_vence_na_fatura
  before insert or update of data_no_cartao, payment_method, filial on public.fin_entries
  for each row execute function public.fin_conta_no_cartao_vence_na_fatura();

-- ─── 4. O gerador ─────────────────────────────────────────────────────────────────────────────────────────────────
-- Para cada conta fixa aberta, cria as ocorrências cujo dia já está a 10 dias ou menos (a 1ª sai sempre). Roda como o
-- dono do banco: pelo cron (todo dia) e pelo gatilho do cadastro. `competence` é o mês do DIA (a cobrança), e o
-- gatilho do cartão não a mexe: duas cobranças do mesmo período nunca saem, mesmo com o vencimento na fatura seguinte.
create or replace function public.fin_gerar_contas_fixas(p_conta uuid default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  c record;
  v_dia date;
  v_n integer := 0;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_cartao boolean;
begin
  for c in select * from public.fin_contas_fixas
            where encerrada_em is null and (p_conta is null or id = p_conta)
            for update loop
    v_cartao := c.payment_method = 'Cartão de crédito' and c.filial is not null;
    loop
      v_dia := c.primeiro_dia + case c.frequencia when 'anual' then make_interval(years => c.geradas)
                                                  else make_interval(months => c.geradas) end;
      exit when c.ate is not null and v_dia > c.ate;
      exit when c.geradas > 0 and v_dia > v_hoje + 10;
      insert into public.fin_entries (tenant_id, kind, description, category, counterparty, cost_center, notes, amount,
                                      due_date, competence, status, payment_method, filial, source, created_by,
                                      conta_fixa_id, data_no_cartao)
      values (c.tenant_id, c.kind, c.description, c.category, c.counterparty, c.cost_center, c.notes, c.amount,
              v_dia, date_trunc('month', v_dia)::date, 'pending', c.payment_method, c.filial, 'conta_fixa', c.created_by,
              c.id, case when v_cartao then v_dia end)
      on conflict (conta_fixa_id, competence) where conta_fixa_id is not null do nothing;
      c.geradas := c.geradas + 1;
      v_n := v_n + 1;
    end loop;
    update public.fin_contas_fixas set geradas = c.geradas where id = c.id and geradas <> c.geradas;
  end loop;
  return v_n;
end;
$$;

comment on function public.fin_gerar_contas_fixas(uuid) is
  'Gera os lançamentos das contas fixas cujo dia está a 10 dias ou menos (cron diário + cadastro; 2026-10-28).';
revoke all on function public.fin_gerar_contas_fixas(uuid) from public, anon, authenticated;

create or replace function public.fin_conta_fixa_gera_a_primeira()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.fin_gerar_contas_fixas(new.id);
  return null;
end;
$$;
revoke all on function public.fin_conta_fixa_gera_a_primeira() from public, anon, authenticated;

create trigger fin_conta_fixa_gera_a_primeira
  after insert on public.fin_contas_fixas
  for each row execute function public.fin_conta_fixa_gera_a_primeira();

select cron.schedule('contas-fixas-do-dia', '0 9 * * *', $cron$select public.fin_gerar_contas_fixas()$cron$);

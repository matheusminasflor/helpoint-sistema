-- L8: Compras — fechar as lacunas onde ela já está. 2026-09-18.
--
-- Opção A do plano: o fluxo de compra continua dentro do Financeiro, como
-- chamado. O que muda é o que estava frouxo.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. "É compra" vira marcação, e não o nome da categoria
-- ───────────────────────────────────────────────────────────────────────────
-- `CreateTicketForm` decide se o chamado é de compra com `/compra/i` sobre o
-- **nome** da categoria. Renomear "Compra de material" para "Aquisição de
-- material" desliga o formulário de compra inteiro, e ninguém liga uma coisa à
-- outra — some o produto, some o orçamento, some a aprovação, e o chamado vira
-- um chamado comum sem que nada acuse.
-- O que já existe e funciona hoje pelo nome continua funcionando: a marcação
-- nasce ligada em quem o `/compra/i` pegaria.
--
-- O bloco inteiro é **de uma vez só**, e não `add column if not exists` seguido
-- de um `update`. O `db push` pula a migration cuja versão já está no histórico
-- — mas no `test-helpoint` **22 arquivos foram aplicados por outro caminho**
-- (`apply_migration` do MCP, que carimba a data do momento em vez do prefixo do
-- arquivo), e para essas o push é uma reaplicação. Com o `update` solto, toda
-- categoria com "compra" no nome que o administrador tivesse **desmarcado de
-- propósito** voltava marcada — o formulário de compra reaparecendo sozinho,
-- que é o mesmo defeito que esta migration existe para consertar, invertido.
--
-- O conserto do histórico é `supabase migration repair` e é comando do dono
-- (registrado em `nao-funciona.md`); enquanto ele não roda, migration que
-- corrige dado tem de poder rodar duas vezes.
do $marcacao$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'ti_categories'
       and column_name = 'is_purchase'
  ) then
    alter table public.ti_categories
      add column is_purchase boolean not null default false;

    update public.ti_categories
       set is_purchase = true
     where module = 'financeiro' and name ~* 'compra';
  end if;
end $marcacao$;

comment on column public.ti_categories.is_purchase is
  'Chamado desta categoria abre o formulário de compra (produto, orçamentos, aprovação). Marcação explícita: antes isso era adivinhado pelo nome da categoria.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Fornecedor vira cadastro
-- ───────────────────────────────────────────────────────────────────────────
-- `fin_purchase_quotes.supplier` é texto livre. Duas consequências que já
-- existem: "Kalunga", "kalunga" e "Kalunga LTDA" são três fornecedores para
-- qualquer comparação, e não há onde guardar CNPJ ou contato de quem a empresa
-- compra sempre.
--
-- Tabela nova e não `mkt_suppliers`: aquela é do Marketing e tem o formato de
-- lá (categoria de agência/gráfica, serviços, nota de 0 a 5). Que a empresa
-- acabe com **dois cadastros de fornecedor** está registrado em
-- `docs/nao-funciona.md` como pendência — juntar os dois é decisão do dono.
create table if not exists public.fin_suppliers (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  name          text not null,
  cnpj          text,
  contact_name  text,
  contact_email text,
  contact_phone text,
  notes         text,
  is_active     boolean not null default true,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint fin_suppliers_name_check check (length(trim(name)) between 1 and 160),
  constraint fin_suppliers_id_tenant_key unique (id, tenant_id),
  -- O mesmo fornecedor não entra duas vezes na mesma empresa. Sem acento nem
  -- caixa: é justamente "Kalunga" vs "kalunga" que o cadastro veio resolver.
  constraint fin_suppliers_unico unique (tenant_id, name)
);

create index if not exists fin_suppliers_ativos_idx
  on public.fin_suppliers (tenant_id, is_active, name);

drop trigger if exists inject_tenant_id_fin_suppliers on public.fin_suppliers;
create trigger inject_tenant_id_fin_suppliers before insert on public.fin_suppliers
  for each row execute function public.inject_tenant_id();
drop trigger if exists handle_fin_suppliers_updated_at on public.fin_suppliers;
create trigger handle_fin_suppliers_updated_at before update on public.fin_suppliers
  for each row execute function public.handle_updated_at();

alter table public.fin_suppliers enable row level security;

drop policy if exists "Quem tem o Financeiro ve os fornecedores" on public.fin_suppliers;
create policy "Quem tem o Financeiro ve os fornecedores" on public.fin_suppliers
  for select to authenticated using (
    tenant_id = public.get_user_tenant_id() and public.has_fin_access(auth.uid()));
drop policy if exists "Quem tem o Financeiro cadastra fornecedor" on public.fin_suppliers;
create policy "Quem tem o Financeiro cadastra fornecedor" on public.fin_suppliers
  for all to authenticated using (
    tenant_id = public.get_user_tenant_id() and public.has_fin_access(auth.uid()))
  with check (tenant_id = public.get_user_tenant_id() and public.has_fin_access(auth.uid()));

revoke all on public.fin_suppliers from anon;

-- O orçamento passa a poder apontar para o cadastro. `supplier` (texto) fica:
-- é o que os orçamentos de hoje têm, e apagá-lo perderia histórico.
alter table public.fin_purchase_quotes
  add column if not exists supplier_id uuid;

do $fk$
begin
  alter table public.fin_purchase_quotes
    add constraint fin_purchase_quotes_supplier_fkey foreign key (supplier_id, tenant_id)
      references public.fin_suppliers (id, tenant_id) on delete set null (supplier_id);
exception when duplicate_object or duplicate_table then null;
end $fk$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Os três orçamentos deixam de ser combinado e viram regra
-- ───────────────────────────────────────────────────────────────────────────
-- A política de três orçamentos existe na cabeça de quem aprova. O banco
-- aceitava aprovar com um só, e o registro ficava indistinguível de uma compra
-- bem cotada.
--
-- Não é proibição: é **exigir a justificativa**. Compra de urgência e
-- fornecedor exclusivo existem, e o que não pode é passarem despercebidas.
alter table public.fin_purchase_requests
  add column if not exists few_quotes_reason text;

comment on column public.fin_purchase_requests.few_quotes_reason is
  'Por que esta compra foi aprovada com menos de três orçamentos. Obrigatório nesse caso — fornecedor exclusivo e urgência existem, o que não pode é passarem despercebidos.';

create or replace function public.fin_compra_exige_tres_orcamentos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quantos integer;
begin
  -- Só na passagem para aprovado. Reprovar, concluir e editar não perguntam.
  if new.status <> 'approved' or old.status = 'approved' then
    return new;
  end if;

  select count(*) into v_quantos
    from public.fin_purchase_quotes q
   where q.request_id = new.id;

  if v_quantos < 3 and coalesce(trim(new.few_quotes_reason), '') = '' then
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
  before update of status on public.fin_purchase_requests
  for each row execute function public.fin_compra_exige_tres_orcamentos();

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Compra concluída vira conta a pagar (D8)
-- ───────────────────────────────────────────────────────────────────────────
-- Hoje a compra acaba no laudo e o dinheiro nunca chega ao Financeiro: alguém
-- lança a conta à mão, ou ninguém lança. É o encaixe que faltava entre os dois
-- lados do mesmo módulo.
--
-- O vínculo é coluna, e não texto na descrição: é ele que deixa responder
-- "esta conta veio de qual compra?" e impede a conta nascer duas vezes se
-- alguém concluir de novo.
alter table public.fin_entries
  add column if not exists purchase_request_id uuid;

do $fk2$
begin
  alter table public.fin_entries
    add constraint fin_entries_purchase_fkey foreign key (purchase_request_id, tenant_id)
      references public.fin_purchase_requests (id, tenant_id) on delete set null (purchase_request_id);
exception when duplicate_object or duplicate_table then null;
end $fk2$;

do $uk$
begin
  alter table public.fin_purchase_requests
    add constraint fin_purchase_requests_id_tenant_key unique (id, tenant_id);
exception when duplicate_object or duplicate_table then null;
end $uk$;

-- Uma conta por compra: concluir duas vezes não lança duas contas.
create unique index if not exists fin_entries_por_compra_idx
  on public.fin_entries (purchase_request_id) where purchase_request_id is not null;

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
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;

  -- O valor é o do orçamento aprovado. Sem orçamento aprovado cai na
  -- estimativa; sem as duas coisas, não há conta a lançar — e inventar zero
  -- seria pior do que não lançar.
  select q.amount, coalesce(nullif(trim(s.name), ''), nullif(trim(q.supplier), ''))
    into v_valor, v_fornecedor
    from public.fin_purchase_quotes q
    left join public.fin_suppliers s on s.id = q.supplier_id
   where q.id = new.approved_quote_id;

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
    -- setor e a conta a pagar falam do mesmo dinheiro.
    new.department, v_vencimento, 'compra',
    nullif(trim(new.purchase_report), ''),
    new.id, new.executed_by
  )
  on conflict (purchase_request_id) where purchase_request_id is not null do nothing;

  return new;
end;
$$;
drop trigger if exists trg_fin_compra_vira_conta_a_pagar on public.fin_purchase_requests;
create trigger trg_fin_compra_vira_conta_a_pagar
  after update of status on public.fin_purchase_requests
  for each row execute function public.fin_compra_vira_conta_a_pagar();

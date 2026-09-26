-- Duas listas de fornecedor, e a do Financeiro sem tela nenhuma
--
-- Leva I (Compras), 2026-09-26. Decisão do dono: **uma lista só** para a
-- empresa toda.
--
-- ══ O QUE EXISTIA ═══════════════════════════════════════════════════════════
--
--   mkt_suppliers   tela (MKTSuppliers.tsx), categoria, nota de 1 a 5, status,
--                   serviços, contatos. Lido por mkt_quotations.
--   fin_suppliers   RLS no lugar, FK do orçamento de compra apontando para ela,
--                   e NENHUMA TELA — ninguém consegue cadastrar um fornecedor
--                   pela interface. `supplier_id` do orçamento é sempre nulo, e
--                   o fornecedor continua sendo o texto digitado à mão.
--
-- As duas estavam VAZIAS (0 linhas cada, medido hoje). Juntar agora custa uma
-- migration; juntar depois de a empresa cadastrar em dois lugares custa decidir
-- qual dos dois cadastros da mesma gráfica é o verdadeiro.
--
-- ══ QUAL SOBREVIVE ══════════════════════════════════════════════════════════
--
-- `mkt_suppliers`, porque é superconjunto: tem tudo que `fin_suppliers` tem e
-- mais categoria, nota, status e serviços. E tem tela.
--
-- Mas o nome não pode ficar: uma tabela chamada `mkt_` que o Financeiro escreve
-- é o tipo de meia-verdade que faz a próxima pessoa duplicar a tabela de novo.
-- Com 0 linhas, renomear é uma linha. Vira `suppliers` — da empresa, não de um
-- módulo. Os dois tipos enumerados vêm junto, senão a coluna de uma tabela da
-- empresa é do tipo `mkt_supplier_category`, e a meia-verdade volta pelo tipo.
--
-- ══ O QUE VEM DE `fin_suppliers` (e não se perde) ═══════════════════════════
--
-- - `unique (tenant_id, name)`: é o que impede "Gráfica Silva" e "Gráfica
--   Silva" virarem dois fornecedores na mesma empresa. `mkt_suppliers` não
--   tinha, e sem isso "uma lista só" não resolve nada — a lista teria o mesmo
--   fornecedor duas vezes;
-- - o CHECK de tamanho do nome;
-- - a chave `unique (id, tenant_id)`, que é o que permite a FK COMPOSTA do
--   orçamento. É a primeira lição da auditoria da L8: FK só por `id` deixa o
--   orçamento de uma empresa apontar para o fornecedor de outra, e foi assim
--   que uma conta a pagar nasceu com o nome do fornecedor da empresa errada.
--
-- E de passagem: `mkt_quotations.supplier_id` apontava só para `id`. É o mesmo
-- buraco, na tabela vizinha, e ninguém o havia fechado. Vira composta também.

begin;

-- ── 1. A tabela e os tipos passam a ter o nome do que são ───────────────────
alter table public.mkt_suppliers rename to suppliers;

alter type public.mkt_supplier_category rename to supplier_category;
alter type public.mkt_supplier_status   rename to supplier_status;

alter index public.mkt_suppliers_pkey rename to suppliers_pkey;
alter table public.suppliers rename constraint mkt_suppliers_tenant_id_fkey  to suppliers_tenant_id_fkey;
alter table public.suppliers rename constraint mkt_suppliers_created_by_fkey to suppliers_created_by_fkey;
alter table public.suppliers rename constraint mkt_suppliers_rating_check    to suppliers_rating_check;

-- ── 2. O que vinha da tabela do Financeiro ───────────────────────────────────
-- O trim é obrigação de quem escreve; o CHECK é o que garante que ninguém
-- gravou um nome vazio nem um parágrafo pelo PostgREST.
alter table public.suppliers
  drop constraint if exists suppliers_name_check;
alter table public.suppliers
  add constraint suppliers_name_check
  check (length(trim(name)) between 1 and 160);

-- Um fornecedor por nome, por empresa. Case-insensitive, porque "GRAFICA
-- SILVA" e "Gráfica Silva" não são dois fornecedores — e é por digitação livre
-- que a duplicata nasce. (Sem acentos a comparação não resolve tudo; resolve o
-- caso que o texto livre produz todo dia, que é a caixa.)
drop index if exists public.suppliers_nome_unico;
create unique index suppliers_nome_unico
  on public.suppliers (tenant_id, lower(trim(name)));

alter table public.suppliers
  drop constraint if exists suppliers_id_tenant_key;
alter table public.suppliers
  add constraint suppliers_id_tenant_key unique (id, tenant_id);

-- ── 3. As duas FKs, as duas compostas ───────────────────────────────────────
alter table public.mkt_quotations
  drop constraint if exists mkt_quotations_supplier_id_fkey;
alter table public.mkt_quotations
  add constraint mkt_quotations_supplier_fkey
  foreign key (supplier_id, tenant_id) references public.suppliers (id, tenant_id)
  on delete cascade;

alter table public.fin_purchase_quotes
  drop constraint if exists fin_purchase_quotes_supplier_fkey;
alter table public.fin_purchase_quotes
  add constraint fin_purchase_quotes_supplier_fkey
  foreign key (supplier_id, tenant_id) references public.suppliers (id, tenant_id)
  on delete set null (supplier_id);

-- ── 4. A tabela sem tela sai ─────────────────────────────────────────────────
-- Sem `cascade`: se sobrar alguma dependência que este arquivo não listou, o
-- drop falha e diz qual. `cascade` a apagaria em silêncio.
drop table public.fin_suppliers;

-- ── 4b. O `anon` que a tabela sobrevivente tinha e a morta não ──────────────
--
-- `fin_suppliers` nascia com `revoke all ... from anon` (migration
-- `20261009010000`); `mkt_suppliers` não. Juntar na tabela do Marketing sem isto
-- **perderia** a proteção — é o padrão "corrigir abre buraco novo" que a
-- reauditoria da L8 registrou, e o teste `compras_lacunas` teria acusado.
--
-- Não é porta aberta: a policy pede `tenant_id = get_user_tenant_id()`, e o
-- anônimo não tem empresa. É a segunda fechadura, e ela existia.
--
-- (De passagem, medido hoje: **128 das 153 tabelas** do schema `public` dão
-- privilégio ao `anon` — o padrão do Supabase para tabela nova. É o irmão do
-- buraco das 185 funções que a leva B fechou, e fica registrado para ela.)
revoke all on public.suppliers from anon;

-- ── 5. As policies passam a falar da empresa, não do Marketing ──────────────
--
-- A de SELECT é a da tabela do Marketing: **toda a empresa** vê o cadastro. É
-- mais largo que a de `fin_suppliers` ("quem tem o Financeiro"), e é de
-- propósito: quem abre uma solicitação de compra é qualquer pessoa, e é no
-- formulário de compra que se escolhe o fornecedor. Com a policy do Financeiro,
-- o seletor de fornecedor ficaria vazio para quem mais o usa.
--
-- O que se perde: CNPJ e contato do fornecedor passam a ser visíveis a todo o
-- staff da empresa, e não só a quem tem o Financeiro. Registrado em
-- `nao-funciona.md` — se o dono quiser estreitar, a saída é uma policy por
-- módulo (`has_fin_access or has_mkt_access`) e um seletor que leia uma função
-- `security definer` devolvendo só id e nome.
alter policy "Users can view suppliers in their tenant" on public.suppliers
  rename to "Quem entra no sistema ve os fornecedores da empresa";
alter policy "Members can create suppliers" on public.suppliers
  rename to "Quem trabalha aqui cadastra fornecedor";
alter policy "Members can update suppliers" on public.suppliers
  rename to "Quem trabalha aqui corrige fornecedor";
alter policy "Managers can delete suppliers" on public.suppliers
  rename to "Gestor apaga fornecedor";

-- ── 6. O trigger da conta a pagar lê a lista nova ───────────────────────────
-- `create or replace` preserva o privilégio (regra 14 não se aplica).
-- Muda UMA linha: `fin_suppliers` → `suppliers`. O resto é o que a L8 e as duas
-- reauditorias deixaram, e não se reescreve de memória.
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

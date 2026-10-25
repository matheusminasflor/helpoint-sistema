-- RELATÓRIOS NOVOS (proposta "Helpoint no dia a dia", etapa 5). Todos usam o que já é gravado; nenhum pede digitação
-- nova — a não ser o saldo de hoje da previsão de caixa, que o Financeiro informa no próprio relatório.
--
-- Quem vê: quem já vê os números do setor ("Indicadores" do setor), e a Diretoria pelos "Indicadores dos setores".
-- Nenhuma opção nova no perfil. As funções são `security definer` porque leem tabelas de outro setor (a Diretoria não
-- lê `compras_solicitacoes` nem `fin_entries`), e por isso cada uma confere a permissão antes de devolver.
-- Venda por família e região é `security invoker`: a vendedora que só vê a carteira dela continua vendo só a dela.

create or replace function public.rel_pode(p_setor text, p_secao text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_or_higher(auth.uid())
      or public.pode_no_setor(p_setor, p_secao, 'view')
      or public.dir_pode_ver('indicadores')
$$;
revoke all on function public.rel_pode(text, text) from public, anon;
grant execute on function public.rel_pode(text, text) to authenticated;

-- ─── 1. Ciclo da compra ────────────────────────────────────────────────────────────────────────────────────
-- Cada compra pedida no período: quantos dias de pedido até aprovação, até o pagamento, até a nota; quem aprovou; e,
-- se ainda não terminou, há quantos dias está parada na etapa de agora.
create or replace function public.rel_ciclo_da_compra(p_de date, p_ate date)
returns table (id uuid, numero int, produto text, setor text, caixinha boolean, pedida_em date, aprovador text,
               dias_ate_aprovar numeric, dias_ate_pagar numeric, dias_ate_nota numeric, etapa text, parada_ha numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.rel_pode('compras', 'reports') then
    raise exception 'O ciclo da compra pede "Indicadores de Compras" ou os indicadores da Diretoria.' using errcode = '42501';
  end if;
  return query
  select c.id, t.ticket_number, c.product_name, c.department, c.caixinha,
         (c.created_at at time zone 'America/Sao_Paulo')::date,
         (select coalesce(p.full_name, p.email) from public.compras_decisoes d join public.profiles p on p.id = d.user_id
           where d.request_id = c.id and d.decisao = 'aprovada' order by d.created_at desc limit 1),
         round(extract(epoch from (c.approved_at - c.created_at)) / 86400.0, 1),
         round(extract(epoch from (c.pagamento_em - c.created_at)) / 86400.0, 1),
         round(extract(epoch from (c.executed_at - c.created_at)) / 86400.0, 1),
         case
           when c.status::text in ('rejected', 'cancelled') then 'Recusada'
           when c.status::text = 'completed' then 'Concluída'
           when c.approved_at is null then 'Esperando aprovação'
           when not c.caixinha and c.pagamento_em is null then 'Esperando pagamento'
           else 'Esperando a nota' end,
         case when c.status::text in ('completed', 'rejected', 'cancelled') then null
              else round(extract(epoch from (now() - greatest(c.created_at, coalesce(c.approved_at, c.created_at),
                                                               coalesce(c.pagamento_em, c.created_at)))) / 86400.0, 1) end
    from public.compras_solicitacoes c
    left join public.tickets t on t.id = c.ticket_id
   where c.tenant_id = public.get_user_tenant_id()
     and (c.created_at at time zone 'America/Sao_Paulo')::date between p_de and p_ate
   order by c.created_at;
end;
$$;
revoke all on function public.rel_ciclo_da_compra(date, date) from public, anon;
grant execute on function public.rel_ciclo_da_compra(date, date) to authenticated;

-- ─── 2. Economia na cotação ────────────────────────────────────────────────────────────────────────────────
-- As compras aprovadas no período com dois orçamentos ou mais: o escolhido contra o mais caro e o mais barato.
create or replace function public.rel_economia_na_cotacao(p_de date, p_ate date)
returns table (id uuid, numero int, produto text, setor text, aprovada_em date, orcamentos int,
               escolhido numeric, mais_barato numeric, mais_caro numeric, economia numeric, fornecedor text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.rel_pode('compras', 'reports') then
    raise exception 'A economia na cotação pede "Indicadores de Compras" ou os indicadores da Diretoria.' using errcode = '42501';
  end if;
  return query
  select c.id, t.ticket_number, c.product_name, c.department, (c.approved_at at time zone 'America/Sao_Paulo')::date,
         count(q.id)::int, e.amount, min(q.amount), max(q.amount), max(q.amount) - e.amount, e.supplier
    from public.compras_solicitacoes c
    join public.compras_orcamentos e on e.id = c.approved_quote_id
    join public.compras_orcamentos q on q.request_id = c.id
    left join public.tickets t on t.id = c.ticket_id
   where c.tenant_id = public.get_user_tenant_id()
     and c.approved_at is not null
     and (c.approved_at at time zone 'America/Sao_Paulo')::date between p_de and p_ate
   group by c.id, t.ticket_number, e.amount, e.supplier
  having count(q.id) >= 2
   order by c.approved_at;
end;
$$;
revoke all on function public.rel_economia_na_cotacao(date, date) from public, anon;
grant execute on function public.rel_economia_na_cotacao(date, date) to authenticated;

-- ─── 3. Gasto por fornecedor e por setor ───────────────────────────────────────────────────────────────────
-- As contas a pagar do período (pela competência), sem as canceladas: com quem e em que a empresa gasta, mês a mês.
create or replace function public.rel_gasto_por_fornecedor(p_de date, p_ate date)
returns table (mes date, fornecedor text, setor text, categoria text, valor numeric, contas int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.rel_pode('financeiro', 'reports') then
    raise exception 'O gasto por fornecedor pede "Indicadores" do Financeiro ou os indicadores da Diretoria.' using errcode = '42501';
  end if;
  return query
  select date_trunc('month', f.competence)::date,
         coalesce(nullif(btrim(f.counterparty), ''), '(sem fornecedor)'),
         coalesce(nullif(btrim(f.cost_center), ''), '(sem setor)'),
         coalesce(nullif(btrim(f.category), ''), '(sem categoria)'),
         sum(f.amount), count(*)::int
    from public.fin_entries f
   where f.tenant_id = public.get_user_tenant_id()
     and f.kind = 'payable' and f.status <> 'cancelled'
     and f.competence between date_trunc('month', p_de)::date and p_ate
   group by 1, 2, 3, 4
   order by 1, 5 desc;
end;
$$;
revoke all on function public.rel_gasto_por_fornecedor(date, date) from public, anon;
grant execute on function public.rel_gasto_por_fornecedor(date, date) to authenticated;

-- ─── 4. Previsão de caixa semanal ──────────────────────────────────────────────────────────────────────────
-- O saldo de hoje, informado pelo Financeiro (não há extrato no sistema), guardado com quem e quando.
create table if not exists public.fin_saldo_informado (
  tenant_id uuid primary key default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  valor numeric not null,
  informado_em timestamptz not null default now(),
  informado_por uuid default auth.uid() references public.profiles(id) on delete set null
);
alter table public.fin_saldo_informado enable row level security;
create policy fin_saldo_le on public.fin_saldo_informado for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.rel_pode('financeiro', 'cashflow'));

create or replace function public.fin_informar_saldo(p_valor numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin_or_higher(auth.uid()) or public.pode_no_setor('financeiro', 'cashflow', 'view')) then
    raise exception 'Informar o saldo pede o Fluxo de Caixa do Financeiro.' using errcode = '42501';
  end if;
  if p_valor is null then raise exception 'Informe o saldo.' using errcode = '23514'; end if;
  insert into public.fin_saldo_informado (tenant_id, valor, informado_em, informado_por)
  values (public.get_user_tenant_id(), p_valor, now(), auth.uid())
  on conflict (tenant_id) do update set valor = excluded.valor, informado_em = now(), informado_por = auth.uid();
end;
$$;
revoke all on function public.fin_informar_saldo(numeric) from public, anon;
grant execute on function public.fin_informar_saldo(numeric) to authenticated;

-- As próximas semanas (segunda a domingo), a partir da atual: o que entra e o que sai em aberto. O vencido (antes desta
-- semana, ainda em aberto) entra na primeira, que é quando ele pesa.
create or replace function public.rel_previsao_de_caixa(p_semanas int default 8)
returns table (semana date, entra numeric, sai numeric, entra_vencido numeric, sai_vencido numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_inicio date := v_hoje - ((extract(isodow from v_hoje)::int) - 1);
begin
  if not public.rel_pode('financeiro', 'cashflow') then
    raise exception 'A previsão de caixa pede o Fluxo de Caixa do Financeiro ou os indicadores da Diretoria.' using errcode = '42501';
  end if;
  return query
  with semanas as (select (v_inicio + (i * 7))::date as s from generate_series(0, greatest(p_semanas, 1) - 1) i),
  abertas as (
    select f.kind, f.amount, f.due_date from public.fin_entries f
     where f.tenant_id = public.get_user_tenant_id() and f.status in ('pending', 'overdue')
  )
  select w.s,
         coalesce(sum(a.amount) filter (where a.kind = 'receivable' and a.due_date between w.s and w.s + 6), 0),
         coalesce(sum(a.amount) filter (where a.kind = 'payable' and a.due_date between w.s and w.s + 6), 0),
         case when w.s = v_inicio then coalesce((select sum(x.amount) from abertas x where x.kind = 'receivable' and x.due_date < v_inicio), 0) else 0 end,
         case when w.s = v_inicio then coalesce((select sum(x.amount) from abertas x where x.kind = 'payable' and x.due_date < v_inicio), 0) else 0 end
    from semanas w left join abertas a on a.due_date between w.s and w.s + 6
   group by w.s
   order by w.s;
end;
$$;
revoke all on function public.rel_previsao_de_caixa(int) from public, anon;
grant execute on function public.rel_previsao_de_caixa(int) to authenticated;

-- ─── 5. Venda por família e por região ─────────────────────────────────────────────────────────────────────
-- Do faturado (Forteplus): venda e devolução por família do produto, estado e cidade do cliente. `security invoker`:
-- quem lê é a policy de `com_vendas_itens` (a vendedora com "só a minha carteira" continua vendo só a dela).
create or replace function public.rel_venda_por_familia_e_regiao(p_de date, p_ate date, p_filial text default null)
returns table (familia text, estado text, cidade text, venda numeric, devolucao numeric, clientes int)
language sql stable security invoker set search_path = public as $$
  select coalesce(fa.nome, '(sem família)'), coalesce(nullif(btrim(cl.estado), ''), '—'), coalesce(nullif(btrim(cl.cidade), ''), '—'),
         coalesce(sum(abs(v.valor_nota)) filter (where v.classe = 'venda'), 0),
         coalesce(sum(abs(v.valor_nota)) filter (where v.classe = 'devolucao'), 0),
         count(distinct v.cliente_codigo) filter (where v.classe = 'venda')::int
    from public.com_vendas_itens v
    left join public.com_produtos pr on pr.tenant_id = v.tenant_id and pr.codigo = v.produto_codigo
    left join public.com_familias fa on fa.id = pr.familia_id
    left join public.com_clientes cl on cl.tenant_id = v.tenant_id and cl.codigo = v.cliente_codigo
   where v.emissao between p_de and p_ate
     and v.classe in ('venda', 'devolucao')
     and (p_filial is null or v.filial = p_filial)
   group by 1, 2, 3
   order by 4 desc;
$$;
revoke all on function public.rel_venda_por_familia_e_regiao(date, date, text) from public, anon;
grant execute on function public.rel_venda_por_familia_e_regiao(date, date, text) to authenticated;

-- ─── 6. Calendário de ausências ────────────────────────────────────────────────────────────────────────────
-- Decisão do dono (2026-10-25): o RH vê tudo, com o tipo; o gestor vê da própria equipe as férias e "Ausente" (sem
-- dizer se foi atestado ou falta, nem o motivo) — basta para planejar sem expor saúde.
create or replace function public.ausencias_no_periodo(p_de date, p_ate date)
returns table (user_id uuid, nome text, tipo text, de date, ate date)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_rh boolean := public.is_admin_or_higher(auth.uid()) or public.pode_no_rh('absences', 'view') or public.pode_no_rh('vacations', 'view');
begin
  return query
  with todas as (
    select v.user_id, 'Férias'::text as tipo_rh, 'Férias'::text as tipo_gestor, v.start_date as de, v.end_date as ate
      from public.rh_vacation_requests v
     where v.tenant_id = public.get_user_tenant_id() and v.status = 'aprovada'
    union all
    select m.user_id, 'Atestado', 'Ausente', m.issue_date, (m.issue_date + greatest(coalesce(m.days_off, 1), 1) - 1)
      from public.rh_medical_certificates m
     where m.tenant_id = public.get_user_tenant_id() and coalesce(m.status, '') not in ('recusado', 'rejeitado')
    union all
    select e.user_id, case when a.justified then 'Falta justificada' else 'Falta' end, 'Ausente',
           a.date, (a.date + greatest(ceil(coalesce(a.days, 1))::int, 1) - 1)
      from public.rh_absences a join public.rh_employee_profiles e on e.id = a.employee_id
     where a.tenant_id = public.get_user_tenant_id() and e.user_id is not null
  )
  select t.user_id, coalesce(p.full_name, p.email),
         case when v_rh then t.tipo_rh else t.tipo_gestor end, t.de, t.ate
    from todas t join public.profiles p on p.id = t.user_id
   where t.de <= p_ate and t.ate >= p_de
     and (v_rh or auth.uid() in (select public.gestores_da_pessoa(t.user_id)))
   order by t.de, 2;
end;
$$;
revoke all on function public.ausencias_no_periodo(date, date) from public, anon;
grant execute on function public.ausencias_no_periodo(date, date) to authenticated;

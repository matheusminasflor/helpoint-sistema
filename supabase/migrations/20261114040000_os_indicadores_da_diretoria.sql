-- LEVA O, parte 4 — Diretoria › Indicadores de todos os setores.
--
-- Decisão do dono (2026-09-28): "Todos, só em totais". A Diretoria vê o número de
-- cada setor, e Financeiro e RH NUNCA linha a linha. Quem tem só o módulo Diretoria
-- é barrado pelo RLS em `fin_entries`, `rh_*` e `compras_*` — e deve continuar
-- barrado. Por isso as duas funções são `security definer` com a porta em
-- `has_diretoria_access` e devolvem **só agregados**: nenhuma coluna aqui identifica
-- pessoa, conta ou fornecedor.
--
-- As definições são as que as telas dos setores já usam, para o mesmo nome não ter
-- dois números:
--   * Financeiro — `FinIndicators.tsx`: "a pagar/a receber" por vencimento, sem
--     cancelado; "saldo realizado" por `settled_at` e status `paid`; "vencido" é o
--     `effectiveStatus` (pendente com vencimento antes de hoje, ou já marcado
--     `overdue`); inadimplência = vencido ÷ (vencido + pendente) a receber.
--   * RH — `DetailedRHTable.tsx` e `@/lib/rh-status`: headcount = status `ativo`.
--   * Compras — `usePurchaseIndicators`: aprovado = `approved`/`completed`, na data de
--     aprovação (ou de criação, quando não há).
--   * SAC — `QualidadeDashboard.tsx`: aberto = open/in_analysis/awaiting_customer.
--   * Chamados — `useDiretoria.ts`, que esta migration substitui: ENCERRADOS =
--     resolved/closed/cancelled/rejected; abertos e atrasados são do AGORA, resolvidos,
--     SLA e horas são do PERÍODO.
--
-- "O mês" é o mês do Brasil (regra 10): timestamps viram data em America/Sao_Paulo.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Chamados por setor, contados no banco
-- ─────────────────────────────────────────────────────────────────────────────
-- Era `useChamadosPorSetor`, que somava no navegador sobre `tickets` sem `limit`: o
-- PostgREST corta em 1.000 linhas SEM erro, e todas as colunas encolhiam juntas. E a
-- lista de setores no front não tinha Compras. Aqui a lista é o CHECK de
-- `tickets.module` — o setor novo aparece sozinho, com zero se não tiver chamado.
create or replace function public.dir_chamados_por_setor(p_inicio timestamptz)
returns table (
  modulo text,
  abertos bigint,
  resolvidos bigint,
  sla integer,
  horas_medias numeric,
  estourados bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
begin
  if not public.has_diretoria_access(auth.uid()) then
    raise exception 'Só a Diretoria vê os chamados de todos os setores.' using errcode = '42501';
  end if;

  return query
  with setores(modulo) as (
    values ('tickets'), ('compras'), ('marketing'), ('qualidade'), ('rh'),
           ('financeiro'), ('comercial'), ('educacional')
  ),
  t as (
    select tk.module, tk.status, tk.created_at, tk.resolved_at, tk.sla_due_at
      from public.tickets tk
     where tk.tenant_id = v_tenant
  )
  select s.modulo,
         (select count(*) from t
           where t.module = s.modulo
             and t.status not in ('resolved', 'closed', 'cancelled', 'rejected')),
         (select count(*) from t
           where t.module = s.modulo and t.created_at >= p_inicio
             and t.status in ('resolved', 'closed') and t.resolved_at is not null),
         -- SLA só se mede em quem tinha prazo (mesma regra do front que isto substitui).
         (select round(100.0 * count(*) filter (where t.resolved_at <= t.sla_due_at)
                       / nullif(count(*), 0))::int
            from t
           where t.module = s.modulo and t.created_at >= p_inicio
             and t.status in ('resolved', 'closed') and t.resolved_at is not null
             and t.sla_due_at is not null),
         (select round(avg(extract(epoch from (t.resolved_at - t.created_at)) / 3600)::numeric, 1)
            from t
           where t.module = s.modulo and t.created_at >= p_inicio
             and t.status in ('resolved', 'closed') and t.resolved_at is not null),
         (select count(*) from t
           where t.module = s.modulo
             and t.status not in ('resolved', 'closed', 'cancelled', 'rejected')
             and t.sla_due_at < now())
    from setores s;
end;
$$;

revoke all on function public.dir_chamados_por_setor(timestamptz) from public, anon;
grant execute on function public.dir_chamados_por_setor(timestamptz) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Os totais de cada setor no mês
-- ─────────────────────────────────────────────────────────────────────────────
-- Uma linha por número, com o formato para a tela saber desenhar. `ordem` é a ordem
-- dentro do setor. O Comercial não está aqui: ele já tem `com_painel_do_gestor`, que
-- a Diretoria lê inteiro.
create or replace function public.dir_indicadores_dos_setores(p_competencia date)
returns table (
  setor text,
  ordem integer,
  indicador text,
  rotulo text,
  valor numeric,
  formato text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_ini date := date_trunc('month', p_competencia)::date;
  v_fim date := (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_vencido numeric;
  v_aberto numeric;
begin
  if not public.has_diretoria_access(auth.uid()) then
    raise exception 'Só a Diretoria vê os indicadores de todos os setores.' using errcode = '42501';
  end if;

  -- Financeiro ───────────────────────────────────────────────────────────────
  select coalesce(sum(e.amount) filter (where e.status = 'overdue'
                                          or (e.status = 'pending' and e.due_date < v_hoje)), 0),
         coalesce(sum(e.amount) filter (where e.status in ('overdue', 'pending')), 0)
    into v_vencido, v_aberto
    from public.fin_entries e
   where e.tenant_id = v_tenant and e.kind = 'receivable';

  return query
  select 'financeiro', 1, 'a_pagar', 'A pagar no mês',
         coalesce(sum(e.amount), 0), 'moeda'
    from public.fin_entries e
   where e.tenant_id = v_tenant and e.kind = 'payable' and e.status <> 'cancelled'
     and e.due_date between v_ini and v_fim
  union all
  select 'financeiro', 2, 'a_receber', 'A receber no mês',
         coalesce(sum(e.amount), 0), 'moeda'
    from public.fin_entries e
   where e.tenant_id = v_tenant and e.kind = 'receivable' and e.status <> 'cancelled'
     and e.due_date between v_ini and v_fim
  union all
  select 'financeiro', 3, 'saldo_realizado', 'Saldo realizado no mês',
         coalesce(sum(case when e.kind = 'receivable' then e.amount else -e.amount end), 0), 'moeda'
    from public.fin_entries e
   where e.tenant_id = v_tenant and e.status = 'paid'
     and e.settled_at between v_ini and v_fim
  union all
  select 'financeiro', 4, 'recebiveis_vencidos', 'Recebíveis vencidos (hoje)', v_vencido, 'moeda'
  union all
  select 'financeiro', 5, 'inadimplencia', 'Inadimplência (hoje)',
         case when v_aberto > 0 then round(100 * v_vencido / v_aberto) else 0 end, 'percentual';

  -- RH ───────────────────────────────────────────────────────────────────────
  return query
  select 'rh', 1, 'headcount', 'Headcount ativo (hoje)', count(*)::numeric, 'numero'
    from public.rh_employee_profiles p
   where p.tenant_id = v_tenant and p.status = 'ativo'
  union all
  select 'rh', 2, 'admissoes', 'Admissões no mês', count(*)::numeric, 'numero'
    from public.rh_employee_profiles p
   where p.tenant_id = v_tenant and p.admission_date between v_ini and v_fim
  union all
  select 'rh', 3, 'desligamentos', 'Desligamentos no mês', count(*)::numeric, 'numero'
    from public.rh_employee_profiles p
   where p.tenant_id = v_tenant and p.termination_date between v_ini and v_fim
  union all
  select 'rh', 4, 'ausencias', 'Faltas, atestados e atrasos no mês', count(*)::numeric, 'numero'
    from public.rh_absences a
   where a.tenant_id = v_tenant and a.date between v_ini and v_fim
  union all
  select 'rh', 5, 'folha_bruta', 'Folha bruta do mês', coalesce(sum(f.gross_salary), 0), 'moeda'
    from public.rh_payroll_entries f
   where f.tenant_id = v_tenant and f.reference_month between v_ini and v_fim;

  -- Compras ──────────────────────────────────────────────────────────────────
  return query
  select 'compras', 1, 'aprovado', 'Aprovado no mês', coalesce(sum(c.estimated_amount), 0), 'moeda'
    from public.compras_solicitacoes c
   where c.tenant_id = v_tenant and c.status in ('approved', 'completed')
     and (coalesce(c.approved_at, c.created_at) at time zone 'America/Sao_Paulo')::date
         between v_ini and v_fim
  union all
  select 'compras', 2, 'aguardando', 'Aguardando aprovação (hoje)', count(*)::numeric, 'numero'
    from public.compras_solicitacoes c
   where c.tenant_id = v_tenant and c.status = 'pending_approval'
  union all
  select 'compras', 3, 'tempo_aprovacao', 'Tempo médio até aprovar',
         round(avg(extract(epoch from (c.approved_at - c.created_at)) / 3600)::numeric, 1), 'horas'
    from public.compras_solicitacoes c
   where c.tenant_id = v_tenant and c.status in ('approved', 'completed')
     and c.approved_at >= c.created_at
     and (c.approved_at at time zone 'America/Sao_Paulo')::date between v_ini and v_fim;

  -- SAC ──────────────────────────────────────────────────────────────────────
  return query
  with s as (
    select * from public.sac_tickets t
     where t.tenant_id = v_tenant
       and (t.created_at at time zone 'America/Sao_Paulo')::date between v_ini and v_fim
  )
  select 'sac', 1, 'abertos_no_mes', 'SACs abertos no mês', count(*)::numeric, 'numero' from s
  union all
  select 'sac', 2, 'em_aberto', 'Ainda em aberto',
         count(*) filter (where s.status in ('open', 'in_analysis', 'awaiting_customer'))::numeric,
         'numero' from s
  union all
  select 'sac', 3, 'taxa_resolucao', 'Taxa de resolução',
         coalesce(round(100.0 * count(*) filter (where s.status in ('resolved', 'closed'))
                        / nullif(count(*), 0)), 0), 'percentual' from s
  union all
  select 'sac', 4, 'primeira_resposta', '1ª resposta média',
         round(avg(extract(epoch from (s.first_response_at - s.created_at)) / 3600)::numeric, 1),
         'horas' from s where s.first_response_at is not null;

  -- Marketing ────────────────────────────────────────────────────────────────
  return query
  select 'marketing', 1, 'publicados', 'Posts publicados no mês', count(*)::numeric, 'numero'
    from public.mkt_social_posts m
   where m.tenant_id = v_tenant and m.status = 'published'
     and (coalesce(m.published_at, m.scheduled_at, m.created_at) at time zone 'America/Sao_Paulo')::date
         between v_ini and v_fim
  union all
  select 'marketing', 2, 'agendados', 'Agendados (hoje)', count(*)::numeric, 'numero'
    from public.mkt_social_posts m
   where m.tenant_id = v_tenant and m.status = 'scheduled'
  union all
  select 'marketing', 3, 'rascunhos', 'Em rascunho (hoje)', count(*)::numeric, 'numero'
    from public.mkt_social_posts m
   where m.tenant_id = v_tenant and m.status = 'draft';
end;
$$;

revoke all on function public.dir_indicadores_dos_setores(date) from public, anon;
grant execute on function public.dir_indicadores_dos_setores(date) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Confere no próprio banco
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare v_aberta text;
begin
  select string_agg(p.proname, ', ') into v_aberta
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
     and p.proname in ('dir_chamados_por_setor', 'dir_indicadores_dos_setores')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_aberta is not null then
    raise exception 'funções abertas para anon: %', v_aberta;
  end if;
end $$;

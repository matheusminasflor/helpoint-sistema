-- DIRETORIA RESPONDE AO PERÍODO — "Este mês", "Este trimestre", "Este ano" e "Personalizado"
-- (pedido do dono, 2026-10-03).
--
-- Duas funções que só recebiam o mês ou o ano ganham `p_de`/`p_ate` (date, default null) no
-- fim. Sem eles, a conta é a de sempre.
--
--   * `dir_indicadores_dos_setores` (Diretoria › Indicadores dos setores) — tudo o que tem
--     data de verdade usa os DIAS EXATOS do intervalo: contas a pagar/receber pelo
--     vencimento, saldo pela baixa, admissões, desligamentos, ausências, compras aprovadas,
--     SACs, posts. A FOLHA é mensal por natureza (`reference_month`): entram os MESES
--     INTEIROS que o intervalo toca, nunca rateio (decisão do dono, 2026-10-03). Os números
--     "(hoje)" continuam fotografia do agora. O rótulo diz "no período" em vez de "no mês".
--   * `com_conciliacao` (Diretoria › Metas e carteiras, e o Resumo) — compara o realizado
--     que o diretor informa MÊS A MÊS (`metas_ano`) com a venda do ERP por competência. É
--     mensal dos dois lados: com intervalo, entram os meses inteiros que ele toca.
--
-- `drop` + `create` (parâmetro novo cria outra função e deixa a chamada antiga ambígua) e,
-- no fim, o `revoke` que o `drop` exige (lição 14 do pgTAP). Permissões de dentro de cada
-- função — `has_diretoria_access`; Comercial ou Diretoria — ficam exatamente como estavam.
--
-- Corpos copiados de:
--   dir_indicadores_dos_setores ... 20261114040000
--   com_conciliacao ................ 20261026050000

drop function if exists public.dir_indicadores_dos_setores(date);
drop function if exists public.com_conciliacao(integer);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Os totais de cada setor no mês — ou no intervalo
-- ─────────────────────────────────────────────────────────────────────────────
create function public.dir_indicadores_dos_setores(
  p_competencia date, p_de date default null, p_ate date default null
)
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
  v_intervalo boolean := p_de is not null and p_ate is not null;
  v_ini date := case when p_de is not null and p_ate is not null then p_de
                     else date_trunc('month', p_competencia)::date end;
  v_fim date := case when p_de is not null and p_ate is not null then p_ate
                     else (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date end;
  -- "no mês" ou "no período": o rótulo diz qual recorte o número é.
  v_no text := case when p_de is not null and p_ate is not null then 'no período' else 'no mês' end;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_vencido numeric;
  v_aberto numeric;
begin
  if not public.has_diretoria_access(auth.uid()) then
    raise exception 'Só a Diretoria vê os indicadores de todos os setores.' using errcode = '42501';
  end if;

  if v_intervalo and p_ate < p_de then
    raise exception 'A data final não pode ser antes da inicial.' using errcode = '22023';
  end if;

  -- Financeiro ───────────────────────────────────────────────────────────────
  select coalesce(sum(e.amount) filter (where e.status = 'overdue'
                                          or (e.status = 'pending' and e.due_date < v_hoje)), 0),
         coalesce(sum(e.amount) filter (where e.status in ('overdue', 'pending')), 0)
    into v_vencido, v_aberto
    from public.fin_entries e
   where e.tenant_id = v_tenant and e.kind = 'receivable';

  return query
  select 'financeiro', 1, 'a_pagar', 'A pagar ' || v_no,
         coalesce(sum(e.amount), 0), 'moeda'
    from public.fin_entries e
   where e.tenant_id = v_tenant and e.kind = 'payable' and e.status <> 'cancelled'
     and e.due_date between v_ini and v_fim
  union all
  select 'financeiro', 2, 'a_receber', 'A receber ' || v_no,
         coalesce(sum(e.amount), 0), 'moeda'
    from public.fin_entries e
   where e.tenant_id = v_tenant and e.kind = 'receivable' and e.status <> 'cancelled'
     and e.due_date between v_ini and v_fim
  union all
  select 'financeiro', 3, 'saldo_realizado', 'Saldo realizado ' || v_no,
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
  select 'rh', 2, 'admissoes', 'Admissões ' || v_no, count(*)::numeric, 'numero'
    from public.rh_employee_profiles p
   where p.tenant_id = v_tenant and p.admission_date between v_ini and v_fim
  union all
  select 'rh', 3, 'desligamentos', 'Desligamentos ' || v_no, count(*)::numeric, 'numero'
    from public.rh_employee_profiles p
   where p.tenant_id = v_tenant and p.termination_date between v_ini and v_fim
  union all
  select 'rh', 4, 'ausencias', 'Faltas, atestados e atrasos ' || v_no, count(*)::numeric, 'numero'
    from public.rh_absences a
   where a.tenant_id = v_tenant and a.date between v_ini and v_fim
  union all
  -- A folha é MENSAL: os meses inteiros que o recorte toca (sem intervalo, é o mês — a
  -- conta de antes). Nunca rateio.
  select 'rh', 5, 'folha_bruta',
         case when v_intervalo then 'Folha bruta dos meses do período' else 'Folha bruta do mês' end,
         coalesce(sum(f.gross_salary), 0), 'moeda'
    from public.rh_payroll_entries f
   where f.tenant_id = v_tenant
     and date_trunc('month', f.reference_month)::date
         between date_trunc('month', v_ini)::date and date_trunc('month', v_fim)::date;

  -- Compras ──────────────────────────────────────────────────────────────────
  return query
  select 'compras', 1, 'aprovado', 'Aprovado ' || v_no, coalesce(sum(c.estimated_amount), 0), 'moeda'
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
  select 'sac', 1, 'abertos_no_mes', 'SACs abertos ' || v_no, count(*)::numeric, 'numero' from s
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
  select 'marketing', 1, 'publicados', 'Posts publicados ' || v_no, count(*)::numeric, 'numero'
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. A conciliação: o informado pelo diretor × o ERP, nos mesmos meses
-- ─────────────────────────────────────────────────────────────────────────────
-- O mês informado é a chave dos dois lados: `make_date(ano, mes, 1)` é a competência do
-- ERP (dia 1, coluna gerada). Sem intervalo, os meses informados do ano — a conta de antes,
-- escrita com `ano = p_ano` e o mês casado pela competência.
create function public.com_conciliacao(
  p_ano integer, p_de date default null, p_ate date default null
)
returns table (
  informado numeric,
  venda_com_nota numeric,
  venda_sem_nota numeric,
  venda_total numeric,
  bonificacao numeric,
  diferenca_com_nota numeric,
  diferenca_total numeric,
  meses_comparados int
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not (public.has_comercial_access(auth.uid()) or public.has_diretoria_access(auth.uid())) then
    raise exception 'Sem acesso ao Comercial nem à Diretoria.';
  end if;

  return query
  with meses_informados as (
    select ma.ano, ma.mes, ma.total_realizado
    from public.metas_ano ma
    where ma.tenant_id = (select public.get_user_tenant_id())
      and (
        case
          when p_de is not null and p_ate is not null
            -- Os MESES INTEIROS que o intervalo toca (o informado é mensal; nunca rateio).
            then make_date(ma.ano, ma.mes, 1)
                 between date_trunc('month', p_de)::date and date_trunc('month', p_ate)::date
          else ma.ano = p_ano
        end
      )
      and ma.total_realizado is not null
  ),
  totais as (
    select
      sum(mi.total_realizado) as informado,
      count(*) as meses_comparados
    from meses_informados mi
  ),
  erp as (
    select
      coalesce(sum(i.valor_curva) filter (where i.classe in ('venda', 'devolucao') and i.serie = '1'), 0) as venda_com_nota,
      coalesce(sum(i.valor_curva) filter (where i.classe in ('venda', 'devolucao') and i.serie <> '1'), 0) as venda_sem_nota,
      -- Uma coluna só: a série não separa bonificação de publicidade, e o
      -- CFOP também não (5910 e 6910 estão nas duas séries; a diferença
      -- entre eles é dentro/fora do estado). O cashback também mora aqui.
      coalesce(sum(i.valor_nota) filter (where i.classe = 'bonificacao'), 0) as bonificacao
    from public.com_vendas_itens i
    -- Cada mês informado casa com a competência do mesmo ano e mês. Sem intervalo,
    -- `mi.ano` é sempre `p_ano`: é o `extract(month) = mi.mes and extract(year) = p_ano`
    -- de antes.
    join meses_informados mi on i.competencia = make_date(mi.ano, mi.mes, 1)
    where i.tenant_id = (select public.get_user_tenant_id())
  ),
  totais_erp as (
    select
      erp.venda_com_nota, erp.venda_sem_nota, erp.bonificacao,
      erp.venda_com_nota + erp.venda_sem_nota as venda_total
    from erp
  )
  select
    t.informado,
    x.venda_com_nota,
    x.venda_sem_nota,
    x.venda_total,
    x.bonificacao,
    case when t.informado is null then null else t.informado - x.venda_com_nota end as diferenca_com_nota,
    case when t.informado is null then null else t.informado - x.venda_total end as diferenca_total,
    t.meses_comparados::int as meses_comparados
  from totais t, totais_erp x;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Quem executa: `drop` + `create` reabriu as duas para PUBLIC (lição 14)
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on function public.dir_indicadores_dos_setores(date, date, date) from public, anon;
grant execute on function public.dir_indicadores_dos_setores(date, date, date) to authenticated;

revoke all on function public.com_conciliacao(integer, date, date) from public, anon;
grant execute on function public.com_conciliacao(integer, date, date) to authenticated;

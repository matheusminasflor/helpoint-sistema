-- DIRETORIA VIRA SETOR (proposta "Helpoint no dia a dia", decisão 5 do dono, 2026-10-24).
--
-- Até aqui a Diretoria era uma caixa de marcar ("Outros acessos"): quem a tinha via todas as telas dela. Agora ela é
-- setor como os outros, com perfil e "Ver" por tela: Resumo, Indicadores dos setores, Metas e carteiras, Clientes,
-- Produtos e Diretrizes.
--
-- NINGUÉM PERDE ACESSO: o perfil "Diretor" nasce com as seis telas ligadas e é dado a todo mundo que já tem a
-- Diretoria. A porta de entrada continua `has_diretoria_access` (o módulo ou gestor para cima), e o "Ver" de cada tela
-- é perguntado por `dir_pode_ver` — dono e administrador passam, como em `pode_no_setor` e na tela.
--
-- ponytail: o "Ver" vale no banco nas funções que são só da Diretoria (chamados por setor no Resumo, indicadores dos
-- setores, diretrizes de todos os setores). Clientes, Produtos e Metas leem as tabelas do Comercial, cujas regras abrem
-- para quem entra na Diretoria (`has_diretoria_access`, ~25 regras e funções do Comercial); lá o "Ver" da tela vale no
-- menu e na guarda da rota. Saída quando alguém precisar de um diretor que entra e NÃO pode ver clientes: trocar
-- `has_diretoria_access` por `dir_pode_ver('clientes')` nas regras de `com_clientes`/`com_vendas_itens`.

alter table public.access_profiles drop constraint access_profiles_department_check;
alter table public.access_profiles add constraint access_profiles_department_check
  check (department = any (array['ti', 'marketing', 'rh', 'qualidade', 'financeiro', 'compras', 'comercial',
                                 'educacional', 'expedicao', 'producao', 'diretoria']));
alter table public.user_access_profiles drop constraint user_access_profiles_department_check;
alter table public.user_access_profiles add constraint user_access_profiles_department_check
  check (department = any (array['ti', 'marketing', 'rh', 'qualidade', 'financeiro', 'compras', 'comercial',
                                 'educacional', 'expedicao', 'producao', 'diretoria']));

-- "Ver" de uma tela da Diretoria: entra na Diretoria e (dono/admin, ou a caixinha da tela no perfil).
create or replace function public.dir_pode_ver(p_tela text)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select public.has_diretoria_access(auth.uid())
     and (public.is_admin_or_higher(auth.uid())
          or public.tem_permissao(auth.uid(), 'diretoria', p_tela, 'view'));
$$;
revoke all on function public.dir_pode_ver(text) from public, anon;
grant execute on function public.dir_pode_ver(text) to authenticated;

-- O perfil que nasce com tudo ligado, em cada empresa.
insert into public.access_profiles (tenant_id, department, name, description, is_default, permissions)
select t.id, 'diretoria', 'Diretor', 'Vê todas as telas da Diretoria', true,
       '{"resumo": {"view": true}, "indicadores": {"view": true}, "metas": {"view": true},
         "clientes": {"view": true}, "produtos": {"view": true}, "diretrizes": {"view": true}}'::jsonb
  from public.tenants t
on conflict (tenant_id, department, name) do nothing;

-- Quem já entra na Diretoria fica com o "Diretor" (escolher o perfil é dar o módulo, como nos outros setores).
insert into public.user_access_profiles (tenant_id, user_id, department, profile_id)
select uma.tenant_id, uma.user_id, 'diretoria', ap.id
  from public.user_module_access uma
  join public.access_profiles ap
    on ap.tenant_id = uma.tenant_id and ap.department = 'diretoria' and ap.name = 'Diretor'
 where uma.module = 'diretoria'
   and exists (select 1 from auth.users u where u.id = uma.user_id)
on conflict (tenant_id, user_id, department) do nothing;

-- As três funções que são só da Diretoria passam a perguntar a tela. `create or replace` preserva a ACL.
CREATE OR REPLACE FUNCTION public.dir_chamados_por_setor(p_inicio timestamp with time zone, p_fim timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(modulo text, abertos bigint, resolvidos bigint, sla integer, horas_medias numeric, estourados bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant uuid := public.get_user_tenant_id();
begin
  if not public.dir_pode_ver('resumo') then
    raise exception 'Só a Diretoria vê os chamados de todos os setores.' using errcode = '42501';
  end if;

  return query
  with setores(modulo) as (
    values ('tickets'), ('compras'), ('marketing'), ('qualidade'), ('rh'),
           ('financeiro'), ('comercial'), ('educacional'), ('expedicao'), ('producao')
  ),
  t as (
    select tk.module, tk.status, tk.created_at, tk.resolved_at, tk.sla_due_at, tk.agendou_vencido
      from public.tickets tk
     where tk.tenant_id = v_tenant
  ),
  p as (
    select * from t where t.created_at >= p_inicio and (p_fim is null or t.created_at <= p_fim)
  )
  select s.modulo,
         (select count(*) from t
           where t.module = s.modulo
             and t.status not in ('resolved', 'closed', 'cancelled', 'rejected')),
         (select count(*) from p
           where p.module = s.modulo
             and p.status in ('resolved', 'closed') and p.resolved_at is not null),
         (select round(100.0 * count(*) filter (where p.resolved_at <= p.sla_due_at)
                       / nullif(count(*), 0))::int
            from p
           where p.module = s.modulo
             and p.status in ('resolved', 'closed') and p.resolved_at is not null
             and p.sla_due_at is not null),
         (select round(avg(extract(epoch from (p.resolved_at - p.created_at)) / 3600)::numeric, 1)
            from p
           where p.module = s.modulo
             and p.status in ('resolved', 'closed') and p.resolved_at is not null),
         (select count(*) from t
           where t.module = s.modulo
             and t.status not in ('resolved', 'closed', 'cancelled', 'rejected')
             and t.sla_due_at < now()
             and (t.status not in ('waiting_user', 'waiting_parts', 'scheduled')
                  or (t.status = 'scheduled' and t.agendou_vencido)))
    from setores s;
end;
$function$;

CREATE OR REPLACE FUNCTION public.dir_indicadores_dos_setores(p_competencia date, p_de date DEFAULT NULL::date, p_ate date DEFAULT NULL::date)
 RETURNS TABLE(setor text, ordem integer, indicador text, rotulo text, valor numeric, formato text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_intervalo boolean := p_de is not null and p_ate is not null;
  v_ini date := case when p_de is not null and p_ate is not null then p_de
                     else date_trunc('month', p_competencia)::date end;
  v_fim date := case when p_de is not null and p_ate is not null then p_ate
                     else (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date end;
  v_no text := case when p_de is not null and p_ate is not null then 'no período' else 'no mês' end;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_vencido numeric;
  v_aberto numeric;
begin
  if not public.dir_pode_ver('indicadores') then
    raise exception 'Só a Diretoria vê os indicadores de todos os setores.' using errcode = '42501';
  end if;
  if v_intervalo and p_ate < p_de then
    raise exception 'A data final não pode ser antes da inicial.' using errcode = '22023';
  end if;

  select coalesce(sum(e.amount) filter (where e.status = 'overdue'
                                          or (e.status = 'pending' and e.due_date < v_hoje)), 0),
         coalesce(sum(e.amount) filter (where e.status in ('overdue', 'pending')), 0)
    into v_vencido, v_aberto
    from public.fin_entries e
   where e.tenant_id = v_tenant and e.kind = 'receivable';

  return query
  select 'financeiro', 1, 'a_pagar', 'A pagar ' || v_no, coalesce(sum(e.amount), 0), 'moeda'
    from public.fin_entries e
   where e.tenant_id = v_tenant and e.kind = 'payable' and e.status <> 'cancelled'
     and e.due_date between v_ini and v_fim
  union all
  select 'financeiro', 2, 'a_receber', 'A receber ' || v_no, coalesce(sum(e.amount), 0), 'moeda'
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
  select 'rh', 5, 'folha_bruta',
         case when v_intervalo then 'Folha bruta dos meses do período' else 'Folha bruta do mês' end,
         coalesce(sum(f.gross_salary), 0), 'moeda'
    from public.rh_payroll_entries f
   where f.tenant_id = v_tenant
     and date_trunc('month', f.reference_month)::date
         between date_trunc('month', v_ini)::date and date_trunc('month', v_fim)::date;

  return query
  select 'compras', 1, 'aprovado', 'Aprovado ' || v_no, coalesce(sum(c.estimated_amount), 0), 'moeda'
    from public.compras_solicitacoes c
   where c.tenant_id = v_tenant and c.status in ('approved', 'completed')
     and (coalesce(c.approved_at, c.created_at) at time zone 'America/Sao_Paulo')::date between v_ini and v_fim
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

  return query
  with s as (
    select * from public.sac_tickets t
     where t.tenant_id = v_tenant
       and (t.created_at at time zone 'America/Sao_Paulo')::date between v_ini and v_fim
  )
  select 'sac', 1, 'abertos_no_mes', 'SACs abertos ' || v_no, count(*)::numeric, 'numero' from s
  union all
  select 'sac', 2, 'em_aberto', 'Ainda em aberto',
         count(*) filter (where s.status in ('open', 'in_analysis', 'awaiting_customer'))::numeric, 'numero' from s
  union all
  select 'sac', 3, 'taxa_resolucao', 'Taxa de resolução',
         coalesce(round(100.0 * count(*) filter (where s.status in ('resolved', 'closed')) / nullif(count(*), 0)), 0),
         'percentual' from s
  union all
  select 'sac', 4, 'primeira_resposta', '1ª resposta média',
         round(avg(extract(epoch from (s.first_response_at - s.created_at)) / 3600)::numeric, 1),
         'horas' from s where s.first_response_at is not null;

  return query
  select 'marketing', 1, 'publicados', 'Posts publicados ' || v_no, count(*)::numeric, 'numero'
    from public.mkt_social_posts m
   where m.tenant_id = v_tenant and m.status = 'published'
     and (coalesce(m.published_at, m.scheduled_at, m.created_at) at time zone 'America/Sao_Paulo')::date between v_ini and v_fim
  union all
  select 'marketing', 2, 'agendados', 'Agendados (hoje)', count(*)::numeric, 'numero'
    from public.mkt_social_posts m
   where m.tenant_id = v_tenant and m.status = 'scheduled'
  union all
  select 'marketing', 3, 'rascunhos', 'Em rascunho (hoje)', count(*)::numeric, 'numero'
    from public.mkt_social_posts m
   where m.tenant_id = v_tenant and m.status = 'draft';
end;
$function$;

CREATE OR REPLACE FUNCTION public.diretriz_pode_ler(p_setor text, p_status text, p_visibilidade text, p_setores text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.pode_no_setor(p_setor, 'diretrizes', 'edit')
      or public.pode_no_setor(p_setor, 'diretrizes', 'publish')
      or (p_status in ('publicada', 'arquivada') and public.dir_pode_ver('diretrizes'))
      or (p_status = 'publicada' and (
            p_visibilidade = 'empresa'
         or public.eh_do_setor(p_setor)
         or public.pode_no_setor(p_setor, 'diretrizes', 'view')
         or (p_visibilidade = 'setores'
             and exists (select 1 from unnest(coalesce(p_setores, '{}')) s where public.eh_do_setor(s)))));
$function$;

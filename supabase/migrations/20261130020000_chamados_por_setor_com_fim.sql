-- Chamados por setor com FIM do período (pedido do dono, 2026-10-03: "período personalizado nos
-- relatórios da Diretoria e demais"). A conta contava do início escolhido até agora; o período
-- personalizado precisa de um fim. `p_fim` nulo = até agora, então quem chama com um argumento só
-- continua igual. Abertos e atrasados seguem sendo de agora (são situação, não período).
-- A assinatura muda, então é `drop` + `create` e a ACL é refeita no fim (regra 14 do pgTAP).
drop function if exists public.dir_chamados_por_setor(timestamptz);
create function public.dir_chamados_por_setor(p_inicio timestamptz, p_fim timestamptz default null)
returns table (modulo text, abertos bigint, resolvidos bigint, sla integer, horas_medias numeric, estourados bigint)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_tenant uuid := public.get_user_tenant_id();
begin
  if not public.has_diretoria_access(auth.uid()) then
    raise exception 'Só a Diretoria vê os chamados de todos os setores.' using errcode = '42501';
  end if;

  return query
  with setores(modulo) as (
    values ('tickets'), ('compras'), ('marketing'), ('qualidade'), ('rh'),
           ('financeiro'), ('comercial'), ('educacional'), ('expedicao'), ('producao')
  ),
  t as (
    select tk.module, tk.status, tk.created_at, tk.resolved_at, tk.sla_due_at
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
         -- SLA só se mede em quem tinha prazo (mesma regra do front que isto substitui).
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
             and t.sla_due_at < now())
    from setores s;
end;
$function$;
revoke all on function public.dir_chamados_por_setor(timestamptz, timestamptz) from public, anon;
grant execute on function public.dir_chamados_por_setor(timestamptz, timestamptz) to authenticated;

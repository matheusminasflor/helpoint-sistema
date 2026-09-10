-- Leva E4 (ADR-007): indicadores de venda. 2026-09-11.
--
-- Referência de produto: no Twenty as agregações por grupo (soma, contagem,
-- média por etapa) são calculadas no servidor e a tela só mostra. Aqui é uma
-- função SQL só, `security invoker` (o RLS do vendedor filtra a empresa; a
-- função ainda assim amarra tudo em `get_user_tenant_id()` para não depender
-- de policy nenhuma).
--
-- ponytail: uma função devolvendo um jsonb. Sete views virariam sete
-- consultas; o teto é "quando um indicador precisar de paginação, vira view
-- própria". Datas em America/Sao_Paulo fixo, como o tick das automações
-- (vira coluna do tenant no primeiro cliente fora do Brasil).
--
-- Devolve:
--   pipeline        [{stage_id, name, color, position, count, value}]  foto de agora, etapas abertas
--   won / lost      {count, value}                                     fechados no período (won_at / lost_at)
--   created         n                                                 negócios criados no período
--   cycle_days      média de (won_at - created_at) dos ganhos no período, em dias
--   by_owner        [{owner_id, name, won_count, won_value, open_count, open_value}]
--   by_source       [{source, count}]                                  criados no período
--   created_by_week [{week, count}]                                    criados no período, por semana

create or replace function public.crm_sales_metrics(p_from date, p_to date, p_pipeline uuid default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_from   timestamptz := (p_from::timestamp) at time zone 'America/Sao_Paulo';
  v_to     timestamptz := ((p_to + 1)::timestamp) at time zone 'America/Sao_Paulo';
begin
  return jsonb_build_object(
    'pipeline', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'stage_id', s.id, 'name', s.name, 'color', s.color, 'position', s.position,
               'count', c.n, 'value', c.v) order by s.position), '[]'::jsonb)
        from public.crm_pipeline_stages s
        left join lateral (
          select count(*) as n, coalesce(sum(d.value), 0) as v
            from public.crm_deals d
           where d.stage_id = s.id and d.won_at is null and d.lost_at is null
        ) c on true
       where s.tenant_id = v_tenant and s.kind = 'open'
         and (p_pipeline is null or s.pipeline_id = p_pipeline)
    ),
    'won', (
      select jsonb_build_object('count', count(*), 'value', coalesce(sum(d.value), 0))
        from public.crm_deals d join public.crm_pipeline_stages s on s.id = d.stage_id
       where d.tenant_id = v_tenant and d.won_at >= v_from and d.won_at < v_to
         and (p_pipeline is null or s.pipeline_id = p_pipeline)
    ),
    'lost', (
      select jsonb_build_object('count', count(*), 'value', coalesce(sum(d.value), 0))
        from public.crm_deals d join public.crm_pipeline_stages s on s.id = d.stage_id
       where d.tenant_id = v_tenant and d.lost_at >= v_from and d.lost_at < v_to
         and (p_pipeline is null or s.pipeline_id = p_pipeline)
    ),
    'created', (
      select count(*)
        from public.crm_deals d join public.crm_pipeline_stages s on s.id = d.stage_id
       where d.tenant_id = v_tenant and d.created_at >= v_from and d.created_at < v_to
         and (p_pipeline is null or s.pipeline_id = p_pipeline)
    ),
    'cycle_days', (
      select round((avg(extract(epoch from (d.won_at - d.created_at)) / 86400))::numeric, 1)
        from public.crm_deals d join public.crm_pipeline_stages s on s.id = d.stage_id
       where d.tenant_id = v_tenant and d.won_at >= v_from and d.won_at < v_to
         and (p_pipeline is null or s.pipeline_id = p_pipeline)
    ),
    'by_owner', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'owner_id', q.owner_id, 'name', q.name,
               'won_count', q.won_count, 'won_value', q.won_value,
               'open_count', q.open_count, 'open_value', q.open_value)
               order by q.won_value desc, q.open_value desc), '[]'::jsonb)
        from (
          select d.owner_id, coalesce(pr.full_name, pr.email, 'Sem dono') as name,
                 count(*) filter (where d.won_at >= v_from and d.won_at < v_to) as won_count,
                 coalesce(sum(d.value) filter (where d.won_at >= v_from and d.won_at < v_to), 0) as won_value,
                 count(*) filter (where d.won_at is null and d.lost_at is null) as open_count,
                 coalesce(sum(d.value) filter (where d.won_at is null and d.lost_at is null), 0) as open_value
            from public.crm_deals d
            join public.crm_pipeline_stages s on s.id = d.stage_id
            left join public.profiles pr on pr.id = d.owner_id
           where d.tenant_id = v_tenant
             and (p_pipeline is null or s.pipeline_id = p_pipeline)
             and ((d.won_at >= v_from and d.won_at < v_to) or (d.won_at is null and d.lost_at is null))
           group by d.owner_id, pr.full_name, pr.email
        ) q
    ),
    'by_source', (
      select coalesce(jsonb_agg(jsonb_build_object('source', q.source, 'count', q.n) order by q.n desc), '[]'::jsonb)
        from (
          select d.source, count(*) as n
            from public.crm_deals d join public.crm_pipeline_stages s on s.id = d.stage_id
           where d.tenant_id = v_tenant and d.created_at >= v_from and d.created_at < v_to
             and (p_pipeline is null or s.pipeline_id = p_pipeline)
           group by d.source
        ) q
    ),
    'created_by_week', (
      select coalesce(jsonb_agg(jsonb_build_object('week', q.w, 'count', q.n) order by q.w), '[]'::jsonb)
        from (
          select to_char(date_trunc('week', d.created_at at time zone 'America/Sao_Paulo'), 'YYYY-MM-DD') as w, count(*) as n
            from public.crm_deals d join public.crm_pipeline_stages s on s.id = d.stage_id
           where d.tenant_id = v_tenant and d.created_at >= v_from and d.created_at < v_to
             and (p_pipeline is null or s.pipeline_id = p_pipeline)
           group by 1
        ) q
    )
  );
end;
$$;

revoke all on function public.crm_sales_metrics(date, date, uuid) from public, anon;

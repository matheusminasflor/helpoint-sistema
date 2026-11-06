-- O prazo na tela em horas de expediente do setor (dono, 2026-11-06, #337). O vencimento gravado já respeita o expediente,
-- mas a tela subtraía "agora" do vencimento e contava a noite: mostrava 17h quando faltavam 2h59. A conta é a mesma que gravou
-- o vencimento (`minutos_uteis_do_chamado`), para a regra morar em um lugar só.
create or replace function public.chamados_tempo_util(p_ids uuid[])
returns table (ticket_id uuid, restantes integer, total integer, usados integer, volta_em timestamptz)
language sql stable security definer set search_path to 'public' as $$
  with a as (
    select t.id, t.tenant_id, t.module, t.assigned_to, t.sla_due_at, now() as agora,
           coalesce(t.prazo_desde, t.created_at) as inicio, coalesce(t.resolved_at, now()) as fim
      from public.tickets t
     where t.id = any (p_ids[1:1000]) and t.tenant_id = public.get_user_tenant_id() and t.sla_due_at is not null
  )
  select a.id,
         case when a.agora <= a.sla_due_at
              then public.minutos_uteis_do_chamado(a.tenant_id, a.module, a.agora, a.sla_due_at, a.assigned_to)
              else -public.minutos_uteis_do_chamado(a.tenant_id, a.module, a.sla_due_at, a.agora, a.assigned_to) end,
         public.minutos_uteis_do_chamado(a.tenant_id, a.module, a.inicio, a.sla_due_at, a.assigned_to),
         public.minutos_uteis_do_chamado(a.tenant_id, a.module, a.inicio, a.fim, a.assigned_to),
         -- Somar zero minutos devolve a próxima abertura do expediente; dentro dele, devolve agora.
         case when p.proxima > a.agora + interval '1 minute' then p.proxima end
    from a
    cross join lateral (select public.prazo_do_chamado(a.tenant_id, a.module, a.agora, 0, a.assigned_to) as proxima) p;
$$;

revoke all on function public.chamados_tempo_util(uuid[]) from public, anon;
grant execute on function public.chamados_tempo_util(uuid[]) to authenticated;

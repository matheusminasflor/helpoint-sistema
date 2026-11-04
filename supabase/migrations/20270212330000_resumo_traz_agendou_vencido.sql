-- O Início dizia "0 atrasados" com o aviso do topo e a Performance dizendo 1: o chamado agendado com o prazo já vencido
-- continua atrasado (20270115010000), e o resumo não trazia essa marca, então a tela o tratava como prazo pausado.
drop function if exists public.chamados_do_meu_resumo();
create function public.chamados_do_meu_resumo()
returns table(id uuid, ticket_number integer, title text, priority text, status text, sla_due_at timestamptz, due_date timestamptz,
              category text, module text, created_at timestamptz, meu boolean, atendente uuid, agendou_vencido boolean)
language sql
stable security definer
set search_path to 'public'
as $function$
  with eu as (select auth.uid() as uid, public.setores_de_aviso(auth.uid()) as setores,
                     auth.uid() = any (public.donos_da_empresa(public.get_user_tenant_id())) as dono)
  select t.id, t.ticket_number, t.title, t.priority::text, t.status::text, t.sla_due_at, t.due_date,
         t.category, t.module, t.created_at,
         -- `coalesce`: sem atendente, `assigned_to = eu` é nulo, e nulo OR falso é nulo — não "não é meu".
         (coalesce(t.assigned_to = eu.uid, false)
          or exists (select 1 from public.ticket_participantes p where p.ticket_id = t.id and p.user_id = eu.uid)) as meu,
         t.assigned_to as atendente,
         t.agendou_vencido
    from public.tickets t, eu
   where t.tenant_id = public.get_user_tenant_id()
     and t.status::text not in ('resolved', 'closed', 'cancelled', 'rejected')
     and (t.assigned_to = eu.uid
          or exists (select 1 from public.ticket_participantes p where p.ticket_id = t.id and p.user_id = eu.uid)
          or (t.module = any (eu.setores)
              and (t.assigned_to is null or public.gere_a_fila(eu.uid, t.module))
              and public.pode_ver_chamado(eu.uid, t.tenant_id, t.module, t.requester_id, t.assigned_to))
          or (eu.dono and t.assigned_to is null
              and cardinality(public.membros_do_aviso(t.tenant_id, t.module)) = 0))
   order by t.priority, t.sla_due_at nulls last
   limit 50;
$function$;
revoke all on function public.chamados_do_meu_resumo() from public, anon;
grant execute on function public.chamados_do_meu_resumo() to authenticated, service_role;

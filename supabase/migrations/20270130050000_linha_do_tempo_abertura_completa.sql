-- A abertura já diz com quem e em que situação o chamado nasceu (o chamado que vai direto ao responsável da
-- categoria nasce "Em andamento" com ele — a linha do tempo mostrava só "abriu").
create or replace function public.linha_do_tempo_do_chamado(p_ticket uuid)
returns table (quando timestamptz, autor text, tipo text, de text, para text, de_nome text, para_nome text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.tickets t
     where t.id = p_ticket and t.tenant_id = public.get_user_tenant_id()
       and (t.requester_id = auth.uid() or t.assigned_to = auth.uid() or t.created_by = auth.uid()
            or public.atende_junto(t.id) or public.is_supervisor_or_higher(auth.uid())
            or t.module = any (coalesce(public.modulos_de_chamado_visiveis(), array[]::text[]))
            or (t.assigned_to is null and t.module = any (coalesce(public.modulos_de_chamado_que_atendo(), array[]::text[]))))
  ) then
    raise exception 'Chamado não encontrado.' using errcode = '42501';
  end if;

  return query
  with l as (
    select a.created_at, a.action, a.old_data o, a.new_data n, p.full_name as quem
      from public.audit_logs a
      left join public.profiles p on p.id = a.user_id
     where a.table_name = 'tickets' and a.record_id = p_ticket
  ),
  ev as (
    select l.created_at, l.quem, 'abriu'::text as tipo, (l.n ->> 'status') as de, (l.n ->> 'module') as para,
           (l.n ->> 'assigned_to') as quem_atende
      from l where l.action = 'INSERT'
    union all
    select l.created_at, l.quem, 'status', l.o ->> 'status', l.n ->> 'status', null
      from l where l.action = 'UPDATE' and l.o ->> 'status' is distinct from l.n ->> 'status'
    union all
    select l.created_at, l.quem, 'atendente', l.o ->> 'assigned_to', l.n ->> 'assigned_to', null
      from l where l.action = 'UPDATE' and l.o ->> 'assigned_to' is distinct from l.n ->> 'assigned_to'
    union all
    select l.created_at, l.quem, 'setor', l.o ->> 'module', l.n ->> 'module', null
      from l where l.action = 'UPDATE' and l.o ->> 'module' is distinct from l.n ->> 'module'
    union all
    select l.created_at, l.quem, 'prioridade', l.o ->> 'priority', l.n ->> 'priority', null
      from l where l.action = 'UPDATE' and l.o ->> 'priority' is distinct from l.n ->> 'priority'
  )
  select ev.created_at, ev.quem, ev.tipo, ev.de, ev.para,
         case when ev.tipo = 'atendente' then (select full_name from public.profiles where id::text = ev.de) end,
         case when ev.tipo = 'atendente' then (select full_name from public.profiles where id::text = ev.para)
              when ev.tipo = 'abriu' then (select full_name from public.profiles where id::text = ev.quem_atende) end
    from ev
   order by ev.created_at, ev.tipo;
end;
$$;
revoke all on function public.linha_do_tempo_do_chamado(uuid) from public, anon;
grant execute on function public.linha_do_tempo_do_chamado(uuid) to authenticated;

-- INÍCIO: "MEUS" × "DA MINHA EQUIPE" (dono, 2026-10-20, a partir do #140: "por que está atrasado para mim, que não
-- sou responsável? eu abri para o Yuri"). Quem gerencia a fila recebe no resumo os chamados do setor que não são
-- dele (`gere_a_fila`), e o topo do Início contava o atraso deles como dele — a Performance, não. Agora o resumo diz
-- de cada chamado se é MEU (atribuído a mim ou que atendo junto) e quem atende; a tela conta só os meus e mostra o
-- resto em "Da minha equipe". A lista de chamados é a mesma da versão no ar (20261230010000).
-- Mudar as colunas pede `drop` + `create`: a função renasce aberta a PUBLIC (regra 14), daí o revoke no fim.
drop function if exists public.chamados_do_meu_resumo();
create function public.chamados_do_meu_resumo()
returns table (id uuid, ticket_number integer, title text, priority text, status text, sla_due_at timestamptz,
               due_date timestamptz, category text, module text, created_at timestamptz, meu boolean, atendente uuid)
language sql stable security definer set search_path = public as $$
  with eu as (select auth.uid() as uid, public.setores_de_aviso(auth.uid()) as setores,
                     auth.uid() = any (public.donos_da_empresa(public.get_user_tenant_id())) as dono)
  select t.id, t.ticket_number, t.title, t.priority::text, t.status::text, t.sla_due_at, t.due_date,
         t.category, t.module, t.created_at,
         -- `coalesce`: sem atendente, `assigned_to = eu` é nulo, e nulo OR falso é nulo — não "não é meu".
         (coalesce(t.assigned_to = eu.uid, false)
          or exists (select 1 from public.ticket_participantes p where p.ticket_id = t.id and p.user_id = eu.uid)) as meu,
         t.assigned_to as atendente
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
$$;
comment on function public.chamados_do_meu_resumo() is
  'Os chamados do resumo do Início: os meus (atribuídos ou que atendo junto, `meu`) e os do setor que vejo na fila.';
revoke all on function public.chamados_do_meu_resumo() from public, anon;
grant execute on function public.chamados_do_meu_resumo() to authenticated;

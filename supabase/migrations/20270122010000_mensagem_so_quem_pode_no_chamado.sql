-- MENSAGEM NO CHAMADO SÓ PARA QUEM PODE (dono, 2026-10-15). "No compras os chamados #89 #90 o Matheus Freitas
-- conseguiu responder; a ideia seria apenas leitura do que foi aprovado, recusado, em ajuste, não ter permissão para
-- mandar mensagem." Medido: a única regra para criar mensagem em chamado era "mesma empresa e você é o autor" — nem
-- pedia enxergar o chamado. Ele tem o perfil "Somente leitura" de Compras.
--   1. em qualquer chamado: só manda mensagem quem enxerga o chamado;
--   2. em Compras: só quem pediu, quem atende, quem executa a compra ("Executar compra"), quem aprova ("Aprovar /
--      reprovar compra" ou o aprovador da Caixinha) e o administrador. "Somente leitura" lê e não escreve.
-- Mensagem escrita pelo sistema (trigger `security definer`) não passa por aqui.

create or replace function public.pode_comentar_no_chamado(p_ticket uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case when t.module is distinct from 'compras' then true
    else public.is_admin_or_higher(auth.uid())
      or auth.uid() in (t.created_by, t.requester_id, t.assigned_to)
      or coalesce(public.pode_no_setor('compras', 'solicitacoes', 'execute'), false)
      or coalesce(public.pode_no_setor('compras', 'solicitacoes', 'approve'), false)
      or exists (select 1 from public.compras_solicitacoes s
                  where s.ticket_id = t.id and s.caixinha and public.pode_decidir_compra(true))
    end
  from public.tickets t where t.id = p_ticket;
$$;
revoke all on function public.pode_comentar_no_chamado(uuid) from public, anon;
grant execute on function public.pode_comentar_no_chamado(uuid) to authenticated;

drop policy if exists "Users can create comments" on public.ticket_comments;
create policy "Users can create comments" on public.ticket_comments for insert to authenticated
  with check (
    tenant_id = public.get_user_tenant_id()
    and author_id = auth.uid()
    -- Enxerga o chamado: a subconsulta passa pelo RLS de `tickets`.
    and exists (select 1 from public.tickets t where t.id = ticket_comments.ticket_id)
    and coalesce(public.pode_comentar_no_chamado(ticket_id), false)
  );

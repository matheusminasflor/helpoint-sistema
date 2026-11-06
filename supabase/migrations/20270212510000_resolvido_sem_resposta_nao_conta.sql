-- Resolvido por quem abriu só conta para a equipe se ela respondeu de verdade (dono, 2026-11-06). `first_response_at` não
-- prova resposta: a tela o preenche ao abrir o chamado com atendente escolhido, e medimos 186 de 338 chamados assim. Aqui
-- vale o comentário público de outra pessoa, que é o que quem abriu viu.
create or replace function public.chamado_equipe_respondeu(p_ticket uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.ticket_comments c
                  where c.ticket_id = t.id and not c.is_internal
                    and c.author_id is not null and c.author_id <> t.requester_id)
    from public.tickets t
   where t.id = p_ticket and t.tenant_id = public.get_user_tenant_id();
$$;

do $$
declare
  v_def text := pg_get_functiondef('public.chamado_encerrar_como_solicitante(uuid, text, text, text)'::regprocedure);
  v_de1 text := $x$  v_status public.ticket_status;
$x$;
  v_de2 text := $x$    v_status := case when t.first_response_at is null then 'cancelled' else 'resolved' end::public.ticket_status;
    v_texto := case when t.first_response_at is null then 'Encerrado por quem abriu, sem atendimento: já estava resolvido'
$x$;
begin
  if position(v_de1 in v_def) = 0 or position(v_de2 in v_def) = 0 then
    raise exception 'trecho não encontrado em chamado_encerrar_como_solicitante';
  end if;
  v_def := replace(v_def, v_de1, v_de1 || $x$  v_respondeu boolean := public.chamado_equipe_respondeu(p_ticket);
$x$);
  execute replace(v_def, v_de2, $x$    v_status := case when v_respondeu then 'resolved' else 'cancelled' end::public.ticket_status;
    v_texto := case when not v_respondeu then 'Encerrado por quem abriu, sem atendimento: já estava resolvido'
$x$);
end;
$$;

revoke all on function public.chamado_equipe_respondeu(uuid) from public, anon;
grant execute on function public.chamado_equipe_respondeu(uuid) to authenticated;

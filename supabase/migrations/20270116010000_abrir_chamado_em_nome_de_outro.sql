-- ABRIR CHAMADO EM NOME DE OUTRA PESSOA (dono, 2026-10-15: "sou do TI, uma pessoa do Financeiro me ligou no ramal
-- pedindo ajuda porque o computador não liga, ela não consegue abrir o chamado; eu abro para ela, coloco ela como
-- solicitante e eu ou outro atendente como responsável; ela depois consegue avaliar e seguir o processo normal. Vale
-- para todos os setores."). Decisão (múltipla escolha, a recomendada): pode quem atende algum setor.
--   * INSERT: o solicitante pode ser outra pessoa da empresa quando quem grava é atendente (`created_by` = quem abriu);
--   * quem abriu continua vendo o chamado que abriu (SELECT);
--   * a pessoa é avisada, e o chamado registra "aberto por X em nome de Y".
-- Comparação direta de coluna na policy (lição 13 do CLAUDE.md): nada aqui reconsulta `tickets`.

drop policy if exists "Users can create tickets" on public.tickets;
create policy "Users can create tickets" on public.tickets for insert to authenticated
  with check (tenant_id = public.get_user_tenant_id()
              and (requester_id = auth.uid()
                   or (created_by = auth.uid()
                       and cardinality(coalesce(public.modulos_de_chamado_que_atendo(), array[]::text[])) > 0
                       and exists (select 1 from public.profiles p
                                    where p.id = requester_id and p.tenant_id = public.get_user_tenant_id()))));

alter policy "Users can view their own tickets" on public.tickets
  using ((tenant_id = (select get_user_tenant_id())) and ((requester_id = auth.uid()) or (assigned_to = auth.uid())
         or (created_by = auth.uid())
         or public.atende_junto(id)
         or (select is_supervisor_or_higher(auth.uid()))
         or (module = any (coalesce((select modulos_de_chamado_visiveis()), array[]::text[])))
         or ((assigned_to is null) and (module = any (coalesce((select modulos_de_chamado_que_atendo()), array[]::text[]))))));

create or replace function public.chamado_aberto_em_nome_de_outro()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_quem text;
begin
  if new.created_by is null or new.created_by = new.requester_id then
    return null;
  end if;
  select coalesce(full_name, email) into v_quem from public.profiles where id = new.created_by;
  insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
  values (new.tenant_id, new.id, new.created_by,
          'Chamado aberto por ' || coalesce(v_quem, 'um atendente') || ' em nome de quem pediu.', true);  -- interno: comentário de fora mudaria o status (chamado_status_pela_resposta)
  perform public.notify_ticket(new.id, 'ticket_created', array[new.requester_id],
    'Chamado #' || new.ticket_number || ' aberto em seu nome',
    coalesce(v_quem, 'Um atendente') || ' abriu este chamado para você: "' || coalesce(new.title, '') || '". Acompanhe e avalie por Meus chamados.',
    true, new.created_by);
  return null;
end;
$$;
revoke all on function public.chamado_aberto_em_nome_de_outro() from public, anon, authenticated;
drop trigger if exists trg_chamado_aberto_em_nome_de_outro on public.tickets;
create trigger trg_chamado_aberto_em_nome_de_outro after insert on public.tickets
  for each row execute function public.chamado_aberto_em_nome_de_outro();

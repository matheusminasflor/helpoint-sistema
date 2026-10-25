-- TROCA DE EQUIPAMENTO NUMA GRAVAÇÃO SÓ (proposta "Helpoint no dia a dia", aprovada em 2026-10-24, defeito 6).
--
-- A tela do chamado fazia quatro gravações separadas: o equipamento antigo para manutenção, o novo para o
-- solicitante, o chamado apontando para o novo e a nota interna. Se uma falhava no meio, o antigo ficava sem dono e o
-- novo continuava no estoque. Agora é uma função: ou tudo acontece, ou nada.
--
-- Quem pode: quem edita o Inventário da TI (a mesma caixinha de `assets`). O solicitante vem do chamado, não da tela.
create or replace function public.trocar_equipamento_do_chamado(p_ticket uuid, p_antigo uuid, p_novo uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_solicitante uuid;
  v_nome_antigo text;
  v_nome_novo text;
begin
  if not (public.is_admin_or_higher(auth.uid()) or public.pode_no_setor('ti', 'inventory', 'edit')) then
    raise exception 'Você não pode trocar equipamento: falta "Inventário · editar" no seu perfil da TI.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Escreva o motivo da troca.' using errcode = '23514';
  end if;
  if p_antigo = p_novo then
    raise exception 'O equipamento novo é o mesmo que o antigo.' using errcode = '23514';
  end if;

  select t.requester_id into v_solicitante from public.tickets t where t.id = p_ticket and t.tenant_id = v_tenant;
  if not found then raise exception 'Chamado não encontrado.' using errcode = 'P0002'; end if;
  select a.name into v_nome_antigo from public.assets a where a.id = p_antigo and a.tenant_id = v_tenant;
  if not found then raise exception 'Equipamento antigo não encontrado.' using errcode = 'P0002'; end if;
  select a.name into v_nome_novo from public.assets a
   where a.id = p_novo and a.tenant_id = v_tenant and a.status not in ('maintenance', 'decommissioned');
  if not found then raise exception 'O equipamento novo não está disponível.' using errcode = 'P0002'; end if;

  update public.assets set status = 'maintenance', assigned_to = null where id = p_antigo;
  update public.assets set status = 'in_use', assigned_to = v_solicitante where id = p_novo;
  update public.tickets set asset_id = p_novo where id = p_ticket;
  insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
  values (v_tenant, p_ticket, auth.uid(),
          format('Equipamento trocado: %s → %s. Motivo: %s', v_nome_antigo, v_nome_novo, btrim(p_motivo)), true);
end;
$$;

revoke all on function public.trocar_equipamento_do_chamado(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.trocar_equipamento_do_chamado(uuid, uuid, uuid, text) to authenticated;

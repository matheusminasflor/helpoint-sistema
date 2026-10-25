-- Trocar equipamento também pelo Inventário (proposta "Helpoint no dia a dia", etapa 4 · TI, 2026-10-25), numa gravação
-- só: a mesma regra de `trocar_equipamento_do_chamado` (20270129170000), sem chamado. O antigo vai para manutenção e sai
-- do nome da pessoa; o novo entra em uso, no nome dela.
create or replace function public.trocar_equipamento(p_antigo uuid, p_novo uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_dono uuid;
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
  select a.assigned_to into v_dono from public.assets a where a.id = p_antigo and a.tenant_id = v_tenant for update;
  if not found then raise exception 'Equipamento antigo não encontrado.' using errcode = 'P0002'; end if;
  if v_dono is null then
    raise exception 'Este equipamento não está no nome de ninguém: use "Entregar a alguém".' using errcode = '23514';
  end if;
  perform 1 from public.assets a
   where a.id = p_novo and a.tenant_id = v_tenant and a.assigned_to is null and a.status not in ('maintenance', 'decommissioned')
     for update;
  if not found then raise exception 'O equipamento novo não está livre no estoque.' using errcode = 'P0002'; end if;

  update public.assets set status = 'maintenance', assigned_to = null where id = p_antigo;
  update public.assets set status = 'in_use', assigned_to = v_dono where id = p_novo;
end;
$$;
revoke all on function public.trocar_equipamento(uuid, uuid, text) from public, anon;
grant execute on function public.trocar_equipamento(uuid, uuid, text) to authenticated;

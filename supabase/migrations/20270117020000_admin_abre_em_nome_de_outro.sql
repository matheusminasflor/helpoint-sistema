-- Complemento de 20270116010000 (achado no print do mural, 2026-10-15): o dono não tem perfil de atendente em setor
-- nenhum, então o campo "Abrir em nome de" não aparecia para ele. Dono e administradores também abrem em nome de outro.
drop policy if exists "Users can create tickets" on public.tickets;
create policy "Users can create tickets" on public.tickets for insert to authenticated
  with check (tenant_id = public.get_user_tenant_id()
              and (requester_id = auth.uid()
                   or (created_by = auth.uid()
                       and (public.is_admin_or_higher(auth.uid())
                            or cardinality(coalesce(public.modulos_de_chamado_que_atendo(), array[]::text[])) > 0)
                       and exists (select 1 from public.profiles p
                                    where p.id = requester_id and p.tenant_id = public.get_user_tenant_id()))));

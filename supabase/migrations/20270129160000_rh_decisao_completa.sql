-- RH › APROVAÇÕES: A DECISÃO FICA COMPLETA (proposta "Helpoint no dia a dia", aprovada em 2026-10-24, defeitos 1 e 14).
--
-- 1. Quem decidiu. As colunas `decided_by` (férias) e `validated_by` (atestado) existiam desde a primeira migration e
--    nunca foram preenchidas: a tela só gravava o status. Agora o banco grava quem decidiu (auth.uid()), sem depender
--    de a tela mandar — e sem a tela poder mandar outro nome.
-- 2. O motivo da recusa. Recusar férias ou rejeitar atestado sem escrever o motivo é recusado aqui (23514); a pessoa
--    recebia "foi recusada" sem saber por quê.
-- 3. O chamado que nasceu junto (`create_rh_ticket_from_request`) acompanha a decisão: aprovar, recusar, validar,
--    rejeitar ou cancelar RESOLVE o chamado, com a decisão como solução. Antes ele ficava na fila do RH para sempre.
--    Mesmo desenho de `compras_chamado_segue_a_compra` (20270106010000), inclusive o aviso: o da decisão já sai pela
--    tela, e o genérico da mudança de status não repete.

create or replace function public.rh_ferias_registra_decisao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status = 'recusada' and btrim(coalesce(new.decision_notes, '')) = '' then
    raise exception 'Escreva o motivo da recusa.' using errcode = '23514';
  end if;
  if new.status in ('aprovada', 'recusada') then
    new.decided_by := coalesce(auth.uid(), new.decided_by);
    new.decided_at := coalesce(new.decided_at, now());
  end if;
  return new;
end;
$$;

create or replace function public.rh_atestado_registra_decisao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status = 'rejeitado' and btrim(coalesce(new.validation_notes, '')) = '' then
    raise exception 'Escreva o motivo da rejeição.' using errcode = '23514';
  end if;
  if new.status in ('validado', 'rejeitado') then
    new.validated_by := coalesce(auth.uid(), new.validated_by);
    new.validated_at := coalesce(new.validated_at, now());
  end if;
  return new;
end;
$$;

create or replace function public.rh_chamado_segue_a_decisao()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_solucao text;
begin
  if new.status is not distinct from old.status or new.ticket_id is null then return null; end if;
  if tg_table_name = 'rh_vacation_requests' then
    v_solucao := case new.status
      when 'aprovada' then 'Aprovada pelo RH.'
      when 'recusada' then 'Recusada pelo RH: ' || coalesce(new.decision_notes, '')
      when 'cancelada' then 'Cancelada por quem pediu.'
    end;
  else
    v_solucao := case new.status
      when 'validado' then 'Atestado validado pelo RH.'
      when 'rejeitado' then 'Atestado rejeitado pelo RH: ' || coalesce(new.validation_notes, '')
    end;
  end if;
  if v_solucao is null then return null; end if;
  perform set_config('helpoint.status_pela_resposta', new.ticket_id::text, true);
  update public.tickets t
     set status = 'resolved', resolved_at = now(), resolution_notes = v_solucao
   where t.id = new.ticket_id and t.status <> 'resolved';
  perform set_config('helpoint.status_pela_resposta', '', true);
  return null;
end;
$$;

create trigger rh_ferias_registra_decisao before update of status on public.rh_vacation_requests
  for each row execute function public.rh_ferias_registra_decisao();
create trigger rh_atestado_registra_decisao before update of status on public.rh_medical_certificates
  for each row execute function public.rh_atestado_registra_decisao();
create trigger rh_ferias_chamado_segue after update of status on public.rh_vacation_requests
  for each row execute function public.rh_chamado_segue_a_decisao();
create trigger rh_atestado_chamado_segue after update of status on public.rh_medical_certificates
  for each row execute function public.rh_chamado_segue_a_decisao();

-- Funções de gatilho não são chamadas por ninguém; fechadas para anon como as outras (regra 14).
revoke all on function public.rh_ferias_registra_decisao() from public, anon;
revoke all on function public.rh_atestado_registra_decisao() from public, anon;
revoke all on function public.rh_chamado_segue_a_decisao() from public, anon;

-- Os que já foram decididos antes desta migration: o chamado deles fica resolvido, na data da decisão.
update public.tickets t
   set status = 'resolved', resolved_at = coalesce(v.decided_at, now()),
       resolution_notes = case v.status when 'aprovada' then 'Aprovada pelo RH.'
                                        when 'recusada' then 'Recusada pelo RH.' else 'Cancelada por quem pediu.' end
  from public.rh_vacation_requests v
 where v.ticket_id = t.id and v.status in ('aprovada', 'recusada', 'cancelada') and t.status <> 'resolved';
update public.tickets t
   set status = 'resolved', resolved_at = coalesce(c.validated_at, now()),
       resolution_notes = case c.status when 'validado' then 'Atestado validado pelo RH.' else 'Atestado rejeitado pelo RH.' end
  from public.rh_medical_certificates c
 where c.ticket_id = t.id and c.status in ('validado', 'rejeitado') and t.status <> 'resolved';

-- AGENDAR CONTA COMO A 1ª RESPOSTA (dono, 2026-10-07: "chamado agendado não está pausando o SLA").
--
-- Medido no #34: agendado às 11:29 para 08/10 16:00, prazo de RESOLUÇÃO pausado (pendente_desde
-- gravado) — mas a 1ª resposta nunca foi registrada e o prazo dela venceu em 06/10 14:48. A tela
-- mostrava "1ª resposta com atraso" no chamado agendado, e parecia que nada tinha pausado.
-- Agendar avisa o solicitante de QUANDO vai ser atendido (`ticket_scheduled`): é uma resposta a ele.
-- Então a passagem para Agendado grava a 1ª resposta, se ainda não houver.

create or replace function public.agendar_registra_primeira_resposta()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.status = 'scheduled' and old.status is distinct from 'scheduled' and new.first_response_at is null then
    new.first_response_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.agendar_registra_primeira_resposta() from public, anon, authenticated;

drop trigger if exists trg_agendar_registra_primeira_resposta on public.tickets;
create trigger trg_agendar_registra_primeira_resposta
  before update of status on public.tickets
  for each row execute function public.agendar_registra_primeira_resposta();

-- Quem já está agendado sem 1ª resposta: a resposta foi quando agendou (o pendente_desde marca isso).
update public.tickets
   set first_response_at = coalesce(pendente_desde, updated_at)
 where status = 'scheduled' and first_response_at is null;

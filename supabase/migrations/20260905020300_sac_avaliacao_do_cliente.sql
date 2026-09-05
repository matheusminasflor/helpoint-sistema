-- SAC: a avaliação do cliente passa a gravar de verdade.
--
-- O QUE ESTAVA QUEBRADO
-- ─────────────────────
-- `sac_tickets` tinha policy de UPDATE só para staff. O cliente não tinha
-- nenhuma. O `RatingDialog` manda o UPDATE, o PostgREST responde 200 com zero
-- linhas afetadas — não é erro, é "nenhuma linha casou" — e o front comemora:
-- mostra "Obrigado pela sua avaliação" e não grava nada.
--
-- Provado no banco em 2026-09-04 assumindo a identidade do dono do chamado:
-- `visible_rows = 1, updated_rows = 0`.
--
-- Três coisas quebram juntas por causa disso:
--   · o diálogo de avaliação reabre a cada visita, porque o ticket continua
--     sem nota;
--   · o badge "N novas respostas" nunca zera (`customer_last_seen_at` também
--     não grava);
--   · `SatisfactionBlock` e o NPS do dashboard de Qualidade ficam
--     permanentemente vazios — não por falta de clientes, por falta de
--     permissão.
--
-- POR QUE POLICY E TRIGGER, E NÃO SÓ POLICY
-- ─────────────────────────────────────────
-- A policy libera a LINHA; ela não sabe distinguir coluna. Sozinha, ela
-- deixaria o cliente reabrir o próprio chamado, trocar o título, mudar a
-- prioridade ou reatribuir o responsável. O trigger é o que restringe ao
-- punhado de colunas que são dele.

create policy "Cliente avalia o proprio chamado"
  on public.sac_tickets
  for update
  to authenticated
  using      (customer_user_id = auth.uid())
  with check (customer_user_id = auth.uid());

create or replace function public.sac_tickets_guard_cliente()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_is_staff boolean;
begin
  -- Staff do tenant do chamado passa direto: é a policy dele que autoriza, e
  -- é ele quem muda status, responsável, laudo e o resto.
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.tenant_id = new.tenant_id
  ) into v_is_staff;

  if v_is_staff then
    return new;
  end if;

  -- Para o cliente, só estas colunas podem diferir. Comparar o registro
  -- inteiro menos as permitidas, em vez de listar as proibidas, faz com que
  -- uma coluna nova criada no futuro já nasça protegida.
  if (to_jsonb(new)
        - 'satisfaction_rating'
        - 'satisfaction_resolved'
        - 'satisfaction_comment'
        - 'satisfaction_rated_at'
        - 'customer_last_seen_at'
        - 'updated_at')
     is distinct from
     (to_jsonb(old)
        - 'satisfaction_rating'
        - 'satisfaction_resolved'
        - 'satisfaction_comment'
        - 'satisfaction_rated_at'
        - 'customer_last_seen_at'
        - 'updated_at')
  then
    raise exception 'cliente so pode avaliar o chamado e marcar como visto'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists sac_tickets_guard_cliente on public.sac_tickets;

create trigger sac_tickets_guard_cliente
  before update on public.sac_tickets
  for each row
  execute function public.sac_tickets_guard_cliente();

-- Nota para quem revisa: `updated_at` entra na lista de ignorados porque é
-- escrito por outro trigger, não pelo cliente — se ficasse de fora, toda
-- avaliação seria recusada pelo próprio carimbo de hora.
--
-- Outra propriedade que vale conhecer, descoberta escrevendo o pgTAP: o guard
-- compara o registro velho com o novo, então gravar numa coluna proibida o
-- MESMO valor que já estava lá passa — não há diferença para detectar. É
-- correto (nada mudou), mas engana quem escreve teste: `set status = 'open'`
-- num chamado que já está 'open' não é bloqueado, e o teste dá verde falso.
-- Por isso o teste abre o chamado como 'resolved' antes de tentar reabrir.
--
-- O que esta migration NÃO faz: o front continua sem checar se a gravação
-- funcionou. `RatingDialog.tsx:36-46` precisa de `.select('id')` e tratar
-- zero linhas como erro, senão o próximo bloqueio volta a ser silencioso.
-- Isso é trabalho de front e sai numa leva de código.

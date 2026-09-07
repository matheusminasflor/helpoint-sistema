-- SAC: a tranca do cliente deixa passar o que outro trigger faz por ele.
--
-- O DEFEITO (meu, de 2026-09-06)
-- ──────────────────────────────
-- `sac_tickets_guard_cliente` (migration 20260905020300) barra qualquer
-- UPDATE em `sac_tickets` feito por não-staff fora das colunas de avaliação.
-- Mas quando o cliente responde, o trigger `trg_sac_auto_status_on_reply`
-- (função `sac_auto_status_on_reply`) faz `UPDATE sac_tickets SET status =
-- 'in_analysis'` — dentro da transação do cliente, com o `auth.uid()` dele.
-- A tranca via um não-staff mexendo em `status` e recusava:
--   42501: cliente so pode avaliar o chamado e marcar como visto
-- Resultado: desde 2026-09-06, no test-helpoint, **toda resposta de cliente
-- no portal falhava**. O pgTAP da época testou o UPDATE direto, não a
-- corrente comentário → trigger → status. O teste
-- `notificacoes_todos_os_modulos.test.sql` pegou.
--
-- A CORREÇÃO
-- ──────────
-- A tranca vale para o que o cliente faz DIRETAMENTE. O que um trigger faz em
-- consequência é regra do sistema, não ação do cliente. `pg_trigger_depth()`
-- distingue os dois: 1 = o UPDATE veio do cliente (PostgREST); > 1 = veio de
-- dentro de outro trigger. Um cliente não consegue forjar profundidade.
--
-- Mesmo princípio vale para as outras duas trancas (holerite e
-- customer_profiles) se um dia um trigger passar a escrever nelas — hoje
-- nenhum escreve, então ficam como estão.

create or replace function public.sac_tickets_guard_cliente()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_is_staff boolean;
begin
  -- Escrita feita por outro trigger (ex.: status vai para 'in_analysis'
  -- quando o cliente responde) é do sistema, não do cliente.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.tenant_id = new.tenant_id
  ) into v_is_staff;

  if v_is_staff then
    return new;
  end if;

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

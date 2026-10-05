-- CHAMADO RESOLVIDO NÃO "FECHA" (decisão do dono, 2026-10-04).
--
-- O dono: "está resolvido, está resolvido". Os status que a pessoa vê são só Aberto, Em andamento,
-- Pendente (aguardando) e Resolvido. A avaliação do solicitante é OPCIONAL e nunca muda o status.
--
-- MEDIDO NA PRODUÇÃO ANTES: 7 chamados da TI, todos `closed`, nenhum `resolved` — e os Indicadores
-- da TI mostravam "Resolvidos = 0", porque o painel conta `resolved` e `closed` em casas separadas.
-- Três coisas punham o chamado em `closed`:
--   1. a avaliação do solicitante (`evaluateTicket`, na tela) — passa a gravar só a nota;
--   2. a compra concluída (`useCompletePurchase`, na tela) — passa a gravar `resolved`;
--   3. a edge function `check-alerts`, que fechava sozinho o resolvido havia 7 dias sem avaliação
--      — o trecho sai da função (precisa de deploy da função, à parte desta migration).
--
-- O valor `closed` NÃO sai do enum `ticket_status`: avisos antigos, auditoria e o SAC (que tem os
-- próprios status) ainda o citam, e tirar valor de enum no Postgres é recriar o tipo. Ele só deixa
-- de ser escrito; a tela trata qualquer `closed` que sobrar como Resolvido.

-- ─── A correção dos dados: o que está `closed` vira `resolved` ─────────────────────────────────
-- Uma função, e não um UPDATE solto, para o pgTAP provar exatamente o que roda aqui
-- (`chamado_resolvido_e_sla_sem_fim_de_semana.test.sql`).
--
-- POR QUE DESLIGAR TRIGGERS. Trocar o status de 7 chamados não é uma movimentação que alguém fez:
-- é arrumação de dado. Sem cuidado, o UPDATE dispararia:
--   * `trg_notify_on_ticket_change` → "Chamado #N foi resolvido.", com E-MAIL, para solicitante e
--     atendente de chamados já entregues há dias. Não há porta de "escrita do sistema" nessa
--     função (ela avisa mesmo com `auth.uid()` nulo), então o trigger é desligado só durante o
--     UPDATE — `alter table … disable trigger` é transacional: se algo falhar, volta tudo;
--   * `trg_tickets_enforce_checklist_before_closing` e `trg_enforce_maintenance_before_closing`
--     → barram a passagem para `resolved` se houver checklist pendente ou manutenção aberta. Um
--     chamado já fechado nessas condições derrubaria a migration inteira; a regra vale para quem
--     RESOLVE, não para o dado que só muda de nome;
--   * `trg_zz_automation_ticket` → fluxos com gatilho "status mudou" (ex.: entrega ao ERP quando
--     resolvido) rodariam de novo. Esse não precisa ser desligado: a própria função tem a porta
--     `helpoint.automation = '1'` (a mesma que impede fluxo de disparar fluxo), ligada só nesta
--     transação.
-- Continuam ligados, de propósito: a auditoria (`audit_tickets_trigger` — a mudança fica
-- registrada), `updated_at`, a guarda do perfil (passa sozinha: `auth.uid()` é nulo na migration)
-- e `trg_chamado_fecha_tarefa` (a tarefa de um chamado `closed` já está concluída; não muda nada).
create or replace function public.chamados_fechados_viram_resolvidos()
returns integer
language plpgsql
set search_path to 'public'
as $$
declare
  v_n integer;
begin
  perform set_config('helpoint.automation', '1', true);
  alter table public.tickets disable trigger trg_notify_on_ticket_change;
  alter table public.tickets disable trigger trg_tickets_enforce_checklist_before_closing;
  alter table public.tickets disable trigger trg_enforce_maintenance_before_closing;

  -- `resolved_at` é o marco do SLA e do "Resolvidos" por período: o que já existe fica. Sem ele,
  -- o melhor que se sabe de quando foi entregue: quando fechou, senão a última alteração.
  -- (No SET, `closed_at` e `updated_at` são os valores de ANTES deste UPDATE.)
  update public.tickets
     set status = 'resolved',
         resolved_at = coalesce(resolved_at, closed_at, updated_at)
   where status = 'closed';
  get diagnostics v_n = row_count;

  alter table public.tickets enable trigger trg_notify_on_ticket_change;
  alter table public.tickets enable trigger trg_tickets_enforce_checklist_before_closing;
  alter table public.tickets enable trigger trg_enforce_maintenance_before_closing;
  perform set_config('helpoint.automation', '0', true);
  return v_n;
end;
$$;

comment on function public.chamados_fechados_viram_resolvidos() is
  'Arrumação de 2026-10-04: chamado closed vira resolved sem avisar ninguém nem rodar fluxo. Só para a migration e o pgTAP.';

-- Ninguém de fora chama: nem anon, nem quem está logado. Roda com o papel da migration.
revoke all on function public.chamados_fechados_viram_resolvidos() from public, anon, authenticated;

select public.chamados_fechados_viram_resolvidos();

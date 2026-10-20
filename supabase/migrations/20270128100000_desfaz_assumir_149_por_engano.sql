-- CORREÇÃO PONTUAL: o #149 (Marketing) foi ASSUMIDO POR ENGANO em 2026-10-19 às 18:21 (Brasília), num clique de print
-- numa página ainda na versão antiga do botão "Atribuir". O dono autorizou desfazer: o chamado volta a aberto, sem
-- responsável e sem 1ª resposta (como estava, conforme `audit_logs`), e saem o comentário "Chamado assumido por…" e o
-- aviso "agora é atendido por…" que o clique criou. Os gatilhos que reagiriam à troca (guarda do perfil, avisos,
-- prazo que segue o atendente, automações, tarefa e 1ª resposta do agendamento) ficam desligados só durante o update;
-- o histórico (`audit_tickets_trigger`) continua gravando. Em outro banco, ou se alguém já mexeu no chamado, não faz nada.
do $$
declare
  v_chamado uuid := '72133fc0-5377-408d-833b-49c56c4e5bfc';
begin
  if not exists (select 1 from public.tickets
                  where id = v_chamado and status = 'in_progress'
                    and assigned_to = 'a30e44b6-18cc-47a3-81c0-5f7b89bd3359'
                    and first_response_at = '2026-10-19 21:21:23.685+00') then
    return;
  end if;

  alter table public.tickets disable trigger chamado_guarda_o_perfil;
  alter table public.tickets disable trigger trg_notify_on_ticket_change;
  alter table public.tickets disable trigger trg_sla_segue_o_atendente;
  alter table public.tickets disable trigger trg_zz_automation_ticket;
  alter table public.tickets disable trigger trg_chamado_fecha_tarefa;
  alter table public.tickets disable trigger trg_agendar_registra_primeira_resposta;
  update public.tickets
     set status = 'open', assigned_to = null, first_response_at = null,
         first_response_due_at = '2026-10-19 18:15:40.232327+00', sla_due_at = '2026-10-20 17:15:40.232327+00'
   where id = v_chamado;
  alter table public.tickets enable trigger trg_agendar_registra_primeira_resposta;
  alter table public.tickets enable trigger trg_chamado_fecha_tarefa;
  alter table public.tickets enable trigger trg_zz_automation_ticket;
  alter table public.tickets enable trigger trg_sla_segue_o_atendente;
  alter table public.tickets enable trigger trg_notify_on_ticket_change;
  alter table public.tickets enable trigger chamado_guarda_o_perfil;

  delete from public.ticket_comments where id = 'df0f035f-c5c6-4827-9a23-d88a1be78ca8' and ticket_id = v_chamado;
  delete from public.notifications where id = '7a4d8898-3632-4222-8316-171bf3233fb2' and reference_id = v_chamado;
end;
$$;

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireServiceRole } from '../_shared/require-service-role.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TenantSettings {
  alerts?: {
    slaWarningPercentage?: number;
    contractAlertDays?: number;
    licenseAlertDays?: number;
    emailNotifications?: boolean;
  };
}

// Conta a pagar avisa a equipe do Financeiro com esta antecedencia. Nao ha
// ajuste por tenant ainda (os outros alertas tem: contractAlertDays etc.).
const BILL_DUE_DAYS = 3

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const denied = requireServiceRole(req, corsHeaders)
  if (denied) return denied

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: tenants, error: tenantError } = await supabase
      .from('tenants')
      .select('id, settings')

    if (tenantError) throw tenantError

    const results = {
      slaWarnings: 0,
      contractAlerts: 0,
      licenseAlerts: 0,
      ticketsCreated: 0,
      deadlineExpired: 0,
      remindersSent: 0,
      billsDue: 0,
    }

    // ============= REMINDERS (calendar_events with reminder_offsets) =============
    // Runs across all tenants — not gated by per-tenant alert settings.
    const nowMs = Date.now()
    const { data: upcomingEvents } = await supabase
      .from('calendar_events')
      .select('id, tenant_id, user_id, title, description, start_at, reminder_offsets, reminders_sent, event_type')
      .gte('start_at', new Date(nowMs - 60_000).toISOString())            // include events that just passed (catch the 0-min mark)
      .lte('start_at', new Date(nowMs + 25 * 60 * 60 * 1000).toISOString()) // up to 25h ahead (covers 1-day reminder)

    for (const ev of upcomingEvents || []) {
      const offsets: number[] = ev.reminder_offsets || []
      if (offsets.length === 0) continue

      const sent: number[] = ev.reminders_sent || []
      const startMs = new Date(ev.start_at).getTime()
      const minutesUntil = Math.round((startMs - nowMs) / 60_000)
      const newlySent: number[] = []

      for (const offset of offsets) {
        if (sent.includes(offset)) continue
        // Trigger window: from `offset` minutes before start until event starts
        // (so we don't lose the notification if the cron runs slightly late).
        if (minutesUntil <= offset && minutesUntil >= -1) {
          const startDate = new Date(ev.start_at)
          const timeStr = startDate.toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
            timeZone: 'America/Sao_Paulo',
          })

          let when = ''
          if (offset >= 1440) when = 'amanhã'
          else if (offset >= 60) when = `em ${Math.round(offset / 60)}h`
          else if (offset > 0) when = `em ${offset} min`
          else when = 'agora'

          const baseMsg = ev.description?.trim()
            ? `${ev.description.trim()}\n\n📅 ${timeStr}`
            : `📅 ${timeStr}`

          await supabase.from('notifications').insert({
            tenant_id: ev.tenant_id,
            user_id: ev.user_id,
            type: 'reminder',
            reference_type: 'calendar_event',
            reference_id: ev.id,
            title: `🔔 Lembrete ${when}: ${ev.title}`,
            message: baseMsg,
          })

          newlySent.push(offset)
          results.remindersSent++
        }
      }

      if (newlySent.length > 0) {
        await supabase
          .from('calendar_events')
          .update({ reminders_sent: [...sent, ...newlySent] })
          .eq('id', ev.id)
      }
    }

    for (const tenant of tenants || []) {
      const settings = (tenant.settings as TenantSettings) || {}
      const slaWarningPercentage = settings.alerts?.slaWarningPercentage || 75
      const contractAlertDays = settings.alerts?.contractAlertDays || 30
      const licenseAlertDays = settings.alerts?.licenseAlertDays || 30

      // Get supervisors for this tenant
      // `user_roles` tem duas FKs para `profiles` (user_id e granted_by); sem
      // dizer qual, o PostgREST responde PGRST201 e a funcao inteira pulava o
      // tenant em silencio. Foi assim que nenhum alerta saiu ate 2026-09-07.
      const { data: supervisors, error: supervisorsError } = await supabase
        .from('profiles')
        .select('id, email, user_roles!user_roles_user_id_fkey(role)')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
      if (supervisorsError) throw supervisorsError

      const supervisorIds = supervisors?.filter(s => {
        const roles = s.user_roles as { role: string }[]
        return roles.some(r => ['owner', 'admin', 'manager'].includes(r.role))
      }).map(s => s.id) || []

      if (supervisorIds.length === 0) continue

      const firstSupervisorId = supervisorIds[0]

      // --- SLA Warnings ---
      const now = new Date()
      const { data: tickets } = await supabase
        .from('tickets')
        .select('id, title, sla_due_at, created_at, ticket_number, assigned_to')
        .eq('tenant_id', tenant.id)
        // Pendente (`waiting_user`) e Agendado (`scheduled`) são prazo PAUSADO (dono, 2026-10-06/07).
        .not('status', 'in', '("resolved","closed","cancelled","rejected","waiting_user","scheduled")')
        .not('sla_due_at', 'is', null)

      for (const ticket of tickets || []) {
        if (!ticket.sla_due_at) continue
        const slaDue = new Date(ticket.sla_due_at)
        const created = new Date(ticket.created_at)
        const totalTime = slaDue.getTime() - created.getTime()
        const elapsed = now.getTime() - created.getTime()
        const percentUsed = (elapsed / totalTime) * 100

        if (percentUsed >= slaWarningPercentage && percentUsed < 100) {
          const { data: existingAlert } = await supabase
            .from('notifications')
            .select('id')
            .eq('reference_id', ticket.id)
            .eq('type', 'sla_warning')
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .limit(1)

          if (!existingAlert || existingAlert.length === 0) {
            // Em risco: com atendente, so ele; sem atendente, o setor (decisao do dono, 2026-10-06).
            // Era todo owner/admin/manager de todo setor: o dono recebia SLA do Marketing.
            const { data: slaTargets, error: slaTargetsError } = await supabase
              .rpc('avisados_do_prazo', { p_ticket: ticket.id, p_vencido: false })
            if (slaTargetsError) throw slaTargetsError
            for (const userId of (slaTargets as string[] | null) ?? []) {
              await supabase.from('notifications').insert({
                tenant_id: tenant.id,
                user_id: userId,
                type: 'sla_warning',
                reference_type: 'ticket',
                reference_id: ticket.id,
                title: `SLA em risco - Chamado #${ticket.ticket_number}`,
                message: `O chamado "${ticket.title}" está com ${Math.round(percentUsed)}% do tempo de SLA consumido.`,
              })
            }
            results.slaWarnings++
          }
        }
      }

      // --- Deadline Expired Notifications ---
      const { data: expiredTickets } = await supabase
        .from('tickets')
        .select('id, title, ticket_number, assigned_to, module, due_date, sla_due_at')
        .eq('tenant_id', tenant.id)
        // Pendente e Agendado não vencem (o banco também recusa: `avisar_prazo_vencido`).
        .not('status', 'in', '("resolved","closed","cancelled","rejected","waiting_user","scheduled")')

      for (const ticket of expiredTickets || []) {
        const deadline = ticket.due_date || ticket.sla_due_at
        if (!deadline) continue
        const dueDate = new Date(deadline)
        if (dueDate > now) continue // not expired yet

        // Vencido: atendente + quem gere a fila; sem atendente, o setor. UMA vez por pessoa e
        // chamado — antes repetia todo dia (o #11 avisou em 03/10 e 04/10). Quem decide e grava
        // e o banco (`avisar_prazo_vencido`, 20261208010000), onde o pgTAP prova.
        const { data: avisados, error: vencidoError } = await supabase
          .rpc('avisar_prazo_vencido', { p_ticket: ticket.id })
        if (vencidoError) throw vencidoError
        if (((avisados as number | null) ?? 0) > 0) results.deadlineExpired++
      }

      // --- Expiring Contracts ---
      const contractAlertDate = new Date()
      contractAlertDate.setDate(contractAlertDate.getDate() + contractAlertDays)

      const { data: contracts } = await supabase
        .from('software_contracts')
        .select('id, name, end_date, auto_create_ticket, value')
        .eq('tenant_id', tenant.id)
        .eq('status', 'active')
        .lte('end_date', contractAlertDate.toISOString())
        .gte('end_date', now.toISOString())

      for (const contract of contracts || []) {
        const daysUntilExpiry = Math.ceil((new Date(contract.end_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

        const { data: existingAlert } = await supabase
          .from('notifications')
          .select('id')
          .eq('reference_id', contract.id)
          .eq('type', 'contract_expiring')
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .limit(1)

        if (!existingAlert || existingAlert.length === 0) {
          for (const supervisorId of supervisorIds) {
            await supabase.from('notifications').insert({
              tenant_id: tenant.id,
              user_id: supervisorId,
              type: 'contract_expiring',
              reference_type: 'contract',
              reference_id: contract.id,
              title: `Contrato expirando - ${contract.name}`,
              message: `O contrato "${contract.name}" expira em ${daysUntilExpiry} dias.`,
            })
          }
          results.contractAlerts++
        }

        // Auto-create ticket if enabled
        if (contract.auto_create_ticket) {
          const { data: existingTicket } = await supabase
            .from('tickets')
            .select('id')
            .eq('tenant_id', tenant.id)
            .ilike('title', `%Renovação pendente - ${contract.name}%`)
            .not('status', 'in', '("resolved","closed","cancelled")')
            .limit(1)

          if (!existingTicket || existingTicket.length === 0) {
            const { data: newTicket } = await supabase.from('tickets').insert({
              tenant_id: tenant.id,
              title: `Renovação pendente - ${contract.name}`,
              description: `O contrato "${contract.name}" expira em ${daysUntilExpiry} dias (${contract.end_date}).${contract.value ? ` Valor: R$ ${contract.value}` : ''}\n\nChamado criado automaticamente pelo sistema de alertas.`,
              priority: 'high',
              status: 'open',
              module: 'tickets',
              requester_id: firstSupervisorId,
              created_by: firstSupervisorId,
            }).select('id').single()

            // Quem e avisado decide o trigger trg_notify_on_ticket_created
            // (equipe de TI, senao owner/admin/manager).
            if (newTicket) results.ticketsCreated++
          }
        }
      }

      // --- Expiring Licenses (próximos N dias) ---
      const licenseAlertDate = new Date()
      licenseAlertDate.setDate(licenseAlertDate.getDate() + licenseAlertDays)

      const { data: licenses } = await supabase
        .from('software_licenses')
        .select('id, name, expiry_date, auto_create_ticket, purchase_value')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .lte('expiry_date', licenseAlertDate.toISOString())
        .gte('expiry_date', now.toISOString())

      // --- OVERDUE Licenses (vencidas) — gera chamado crítico ---
      const { data: overdueLicenses } = await supabase
        .from('software_licenses')
        .select('id, name, expiry_date, auto_create_ticket, purchase_value')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .eq('auto_create_ticket', true)
        .lt('expiry_date', now.toISOString())

      for (const lic of overdueLicenses || []) {
        const { data: existing } = await supabase
          .from('tickets')
          .select('id')
          .eq('tenant_id', tenant.id)
          .ilike('title', `%VENCIDO - ${lic.name}%`)
          .not('status', 'in', '("resolved","closed","cancelled")')
          .limit(1)
        if (existing && existing.length > 0) continue
        const daysOver = Math.ceil((now.getTime() - new Date(lic.expiry_date!).getTime()) / (1000 * 60 * 60 * 24))
        const { data: newTicket } = await supabase.from('tickets').insert({
          tenant_id: tenant.id,
          title: `VENCIDO - ${lic.name}`,
          description: `A licença/domínio "${lic.name}" venceu há ${daysOver} dia(s) (${lic.expiry_date}). Renovação urgente.${lic.purchase_value ? ` Valor referência: R$ ${lic.purchase_value}` : ''}`,
          priority: 'critical',
          status: 'open',
          module: 'tickets',
          requester_id: firstSupervisorId,
          created_by: firstSupervisorId,
        }).select('id').single()
        if (newTicket) {
          results.ticketsCreated++
          for (const sid of supervisorIds) {
            await supabase.from('notifications').insert({
              tenant_id: tenant.id, user_id: sid, type: 'license_expiring',
              reference_type: 'ticket', reference_id: newTicket.id,
              title: `🚨 VENCIDO: ${lic.name}`,
              message: `A licença/domínio "${lic.name}" venceu há ${daysOver} dia(s). Chamado crítico aberto automaticamente.`,
            })
          }
        }
      }

      // --- OVERDUE Contracts ---
      const { data: overdueContracts } = await supabase
        .from('software_contracts')
        .select('id, name, end_date, auto_create_ticket, value')
        .eq('tenant_id', tenant.id)
        .eq('status', 'active')
        .eq('auto_create_ticket', true)
        .lt('end_date', now.toISOString())

      for (const c of overdueContracts || []) {
        const { data: existing } = await supabase
          .from('tickets').select('id').eq('tenant_id', tenant.id)
          .ilike('title', `%VENCIDO - ${c.name}%`)
          .not('status', 'in', '("resolved","closed","cancelled")').limit(1)
        if (existing && existing.length > 0) continue
        const daysOver = Math.ceil((now.getTime() - new Date(c.end_date).getTime()) / (1000 * 60 * 60 * 24))
        const { data: newTicket } = await supabase.from('tickets').insert({
          tenant_id: tenant.id,
          title: `VENCIDO - ${c.name}`,
          description: `O contrato "${c.name}" venceu há ${daysOver} dia(s) (${c.end_date}). Renovação urgente.${c.value ? ` Valor: R$ ${c.value}` : ''}`,
          priority: 'critical', status: 'open', module: 'tickets',
          requester_id: firstSupervisorId, created_by: firstSupervisorId,
        }).select('id').single()
        if (newTicket) {
          results.ticketsCreated++
          for (const sid of supervisorIds) {
            await supabase.from('notifications').insert({
              tenant_id: tenant.id, user_id: sid, type: 'contract_expiring',
              reference_type: 'ticket', reference_id: newTicket.id,
              title: `🚨 VENCIDO: ${c.name}`,
              message: `O contrato "${c.name}" venceu há ${daysOver} dia(s). Chamado crítico aberto automaticamente.`,
            })
          }
        }
      }

      for (const license of licenses || []) {
        const daysUntilExpiry = Math.ceil((new Date(license.expiry_date!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

        const { data: existingAlert } = await supabase
          .from('notifications')
          .select('id')
          .eq('reference_id', license.id)
          .eq('type', 'license_expiring')
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .limit(1)

        if (!existingAlert || existingAlert.length === 0) {
          for (const supervisorId of supervisorIds) {
            await supabase.from('notifications').insert({
              tenant_id: tenant.id,
              user_id: supervisorId,
              type: 'license_expiring',
              reference_type: 'license',
              reference_id: license.id,
              title: `Licença expirando - ${license.name}`,
              message: `A licença "${license.name}" expira em ${daysUntilExpiry} dias.`,
            })
          }
          results.licenseAlerts++
        }

        // Auto-create ticket if enabled
        if (license.auto_create_ticket) {
          const { data: existingTicket } = await supabase
            .from('tickets')
            .select('id')
            .eq('tenant_id', tenant.id)
            .ilike('title', `%Renovação pendente - ${license.name}%`)
            .not('status', 'in', '("resolved","closed","cancelled")')
            .limit(1)

          if (!existingTicket || existingTicket.length === 0) {
            const { data: newTicket } = await supabase.from('tickets').insert({
              tenant_id: tenant.id,
              title: `Renovação pendente - ${license.name}`,
              description: `A licença "${license.name}" expira em ${daysUntilExpiry} dias (${license.expiry_date}).${license.purchase_value ? ` Valor: R$ ${license.purchase_value}` : ''}\n\nChamado criado automaticamente pelo sistema de alertas.`,
              priority: 'high',
              status: 'open',
              module: 'tickets',
              requester_id: firstSupervisorId,
              created_by: firstSupervisorId,
            }).select('id').single()

            if (newTicket) results.ticketsCreated++
          }
        }
      }

      // --- Expiring Maintenances (scheduled ones) ---
      const { data: maintenances } = await supabase
        .from('asset_maintenances')
        .select('id, title, scheduled_date, auto_create_ticket, cost')
        .eq('tenant_id', tenant.id)
        .eq('status', 'scheduled')
        .eq('auto_create_ticket', true)
        .lte('scheduled_date', licenseAlertDate.toISOString())
        .gte('scheduled_date', now.toISOString())

      for (const maint of maintenances || []) {
        if (!maint.scheduled_date) continue
        const daysUntil = Math.ceil((new Date(maint.scheduled_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

        const { data: existingTicket } = await supabase
          .from('tickets')
          .select('id')
          .eq('tenant_id', tenant.id)
          .ilike('title', `%Manutenção pendente - ${maint.title}%`)
          .not('status', 'in', '("resolved","closed","cancelled")')
          .limit(1)

        if (!existingTicket || existingTicket.length === 0) {
          const { data: newTicket } = await supabase.from('tickets').insert({
            tenant_id: tenant.id,
            title: `Manutenção pendente - ${maint.title}`,
            description: `A manutenção "${maint.title}" está agendada para ${daysUntil} dias (${maint.scheduled_date}).${maint.cost ? ` Custo estimado: R$ ${maint.cost}` : ''}\n\nChamado criado automaticamente pelo sistema de alertas.`,
            priority: 'high',
            status: 'open',
            module: 'tickets',
            requester_id: firstSupervisorId,
            created_by: firstSupervisorId,
          }).select('id').single()

          if (newTicket) results.ticketsCreated++
        }
      }

      // --- Contas a pagar vencendo (proximos 3 dias) ou vencidas → equipe do Financeiro ---
      const billHorizon = new Date()
      billHorizon.setDate(billHorizon.getDate() + BILL_DUE_DAYS)
      const { data: bills, error: billsError } = await supabase
        .from('fin_entries')
        .select('id, description, counterparty, amount, due_date')
        .eq('tenant_id', tenant.id)
        .eq('kind', 'payable')
        .in('status', ['pending', 'overdue'])
        .lte('due_date', billHorizon.toISOString().slice(0, 10))
      if (billsError) throw billsError

      if (bills && bills.length > 0) {
        const { data: finTeam, error: finTeamError } = await supabase
          .from('user_module_access')
          .select('user_id')
          .eq('tenant_id', tenant.id)
          .eq('module', 'financeiro')
        if (finTeamError) throw finTeamError
        let finTargets = (finTeam || []).map((m: { user_id: string }) => m.user_id)
        if (finTargets.length === 0) finTargets = supervisorIds

        for (const bill of bills) {
          const { data: existingBillAlert } = await supabase
            .from('notifications')
            .select('id')
            .eq('reference_id', bill.id)
            .eq('type', 'bill_due')
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .limit(1)
          if (existingBillAlert && existingBillAlert.length > 0) continue

          const overdue = bill.due_date < new Date().toISOString().slice(0, 10)
          const [y, m, d] = String(bill.due_date).split('-')
          for (const userId of finTargets) {
            await supabase.from('notifications').insert({
              tenant_id: tenant.id,
              user_id: userId,
              type: 'bill_due',
              reference_type: 'fin_entry',
              reference_id: bill.id,
              title: overdue ? `Conta vencida - ${bill.description}` : `Conta vence em ${d}/${m}/${y} - ${bill.description}`,
              message: `${bill.counterparty ? bill.counterparty + ' · ' : ''}R$ ${Number(bill.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
            })
          }
          results.billsDue++
        }
      }
    }

    // O auto-encerramento (resolvido há 7 dias sem avaliação → `closed`) SAIU em 2026-10-04.
    // Decisão do dono: "está resolvido, está resolvido" — a avaliação é opcional e nada fecha o
    // chamado. Era este trecho que punha em `closed` os chamados que o painel deixava de contar
    // como resolvidos. Ver a migration 20261203020000_chamado_resolvido_nao_fecha.sql.

    return new Response(
      JSON.stringify({
        success: true,
        results,
        message: `Checked alerts: ${results.slaWarnings} SLA warnings, ${results.contractAlerts} contract alerts, ${results.licenseAlerts} license alerts, ${results.ticketsCreated} tickets created, ${results.deadlineExpired} deadline expired`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error checking alerts:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

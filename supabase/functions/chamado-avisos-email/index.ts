// O e-mail das movimentações do chamado (decisão do dono, 2026-10-02).
//
// Roda a cada minuto pelo cron `chamado-emails-1min` (migration 20261121020000). O banco decide
// tudo — quem recebe, se pode ver, se desligou o e-mail no perfil, e o agrupamento: avisos da
// mesma pessoa no mesmo chamado em ~1 minuto chegam num e-mail só (`chamado_emails_pendentes`).
// Esta função só monta o texto e envia pelo `sendEmail` de sempre.
//
// Só marca como enviado o que saiu; o que falhou volta no próximo minuto, e o banco desiste
// depois de 24h. Só o cron chama: `requireServiceRole` + `verify_jwt = true` em config.toml.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireServiceRole } from '../_shared/require-service-role.ts'
import { escapeHtml, sendEmail } from '../_shared/email.ts'
import { appBaseUrl, REMETENTE_PADRAO } from '../_shared/app-hosts.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const REMETENTE = `Helpoint <${Deno.env.get('AUTH_FROM_EMAIL') || Deno.env.get('INVITE_FROM_EMAIL') || REMETENTE_PADRAO}>`

interface Grupo {
  user_id: string
  email: string
  nome: string | null
  ticket_id: string
  ticket_number: number
  ticket_title: string | null
  ids: string[]
  titulos: string[]
  tipos: string[]
}

// O texto do e-mail é o do dono ("O chamado #1234 recebeu uma nova resposta."); o aviso do sino
// e da Home tem o seu ("Chamado #1234 foi respondido."). Tipo sem frase aqui usa o do sino.
const FRASE: Record<string, (n: number) => string> = {
  ticket_reply: (n) => `O chamado #${n} recebeu uma nova resposta.`,
  ticket_assigned: (n) => `O chamado #${n} foi atribuído a você.`,
  ticket_transferred: (n) => `O chamado #${n} foi transferido para você.`,
  ticket_waiting: (n) => `O chamado #${n} aguarda seu retorno.`,
  ticket_resolved: (n) => `O chamado #${n} foi resolvido.`,
  ticket_closed: (n) => `O chamado #${n} foi encerrado.`,
}

/** Uma frase por movimento, sem repetir (duas respostas no mesmo minuto = uma linha). */
function frases(g: Grupo): string[] {
  return [...new Set(g.tipos.map((tipo, i) => FRASE[tipo]?.(g.ticket_number) ?? g.titulos[i]))]
}

function corpo(g: Grupo, link: string): string {
  const linhas = frases(g).map((t) => `<li style="margin:4px 0">${escapeHtml(t)}</li>`).join('')
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#f6f7fb;margin:0;padding:32px;color:#111">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e6e9ef;border-radius:12px;overflow:hidden">
    <tr><td style="padding:28px 32px 8px">
      <h1 style="margin:0 0 8px;font-size:18px">Chamado #${g.ticket_number}${g.ticket_title ? ` — ${escapeHtml(g.ticket_title)}` : ''}</h1>
      <p style="margin:0;color:#555;font-size:14px">${g.nome ? `Olá, ${escapeHtml(g.nome)}. ` : ''}Houve movimentação no seu chamado:</p>
    </td></tr>
    <tr><td style="padding:8px 32px"><ul style="padding-left:18px;font-size:14px;color:#333">${linhas}</ul></td></tr>
    <tr><td style="padding:8px 32px 32px">
      <a href="${link}" style="display:inline-block;background:#0073ea;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:14px">Abrir o chamado</a>
      <p style="margin:16px 0 0;font-size:12px;color:#888">Não quer receber estes e-mails? Desligue em Meu perfil › "Receber e-mail das movimentações dos meus chamados". Os avisos continuam na tela inicial do Helpoint.</p>
    </td></tr>
  </table>
  <p style="text-align:center;color:#9aa0a6;font-size:11px;margin-top:16px">© Helpoint — mensagem automática, não responda.</p>
  </body></html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  const denied = requireServiceRole(req, corsHeaders)
  if (denied) return denied

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data, error } = await supabase.rpc('chamado_emails_pendentes', { p_limit: 50 })
  if (error) {
    console.error('[chamado-avisos-email] fila', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const grupos = (data ?? []) as Grupo[]
  let enviados = 0
  const falhas: string[] = []
  for (const g of grupos) {
    const link = `${appBaseUrl()}/helpdesk/${g.ticket_id}`
    // O assunto é a própria frase quando é uma só ("O chamado #1234 recebeu uma nova resposta.");
    // várias, resume.
    const lista = frases(g)
    const assunto = lista.length === 1 ? lista[0] : `Chamado #${g.ticket_number}: ${lista.length} movimentações`
    const res = await sendEmail({ from: REMETENTE, to: g.email, subject: assunto, html: corpo(g, link) })
    if (!res.ok) {
      falhas.push(`#${g.ticket_number}: ${res.error}`)
      continue
    }
    const marcar = await supabase.rpc('chamado_emails_enviados', { p_ids: g.ids })
    if (marcar.error) {
      // Saiu e não marcou: no próximo minuto sairia de novo. Melhor parar aqui e avisar no log.
      console.error('[chamado-avisos-email] marcar enviado', marcar.error.message)
      return new Response(JSON.stringify({ error: marcar.error.message, enviados }), { status: 500, headers: corsHeaders })
    }
    enviados++
  }
  if (falhas.length) console.error('[chamado-avisos-email] falhas', falhas)
  return new Response(JSON.stringify({ grupos: grupos.length, enviados, falhas: falhas.length }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})

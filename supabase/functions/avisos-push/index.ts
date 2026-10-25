// O aviso no celular (Web Push; etapa 4b, migration 20270201030000). Roda a cada minuto pelo cron `avisos-push-1min`.
// O banco diz o que mandar (`avisos_push_pendentes`: os avisos dos últimos 30 minutos de quem tem aparelho inscrito);
// esta função cifra e entrega a cada aparelho e devolve o que saiu e as inscrições mortas (404/410: a pessoa
// desinstalou ou tirou a permissão). Só o cron chama: `requireServiceRole` + `verify_jwt = true` em config.toml.
//
// As chaves VAPID: VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY nos secrets das edge functions (a pública também mora no front,
// em src/lib/aviso-no-celular.ts — ela não é segredo).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { requireServiceRole } from '../_shared/require-service-role.ts'
import { appBaseUrl } from '../_shared/app-hosts.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Pendente {
  aviso_id: string
  titulo: string | null
  mensagem: string | null
  reference_type: string | null
  reference_id: string | null
  inscricao_id: string
  endpoint: string
  p256dh: string
  auth: string
}

// O mesmo destino da "Lyra avisa" (src/lib/destino-do-aviso.ts) para o que tem tela própria; o resto, Todos os avisos.
function destino(p: Pendente): string {
  if (p.reference_id && p.reference_type === 'ticket') return `/helpdesk/${p.reference_id}`
  if (p.reference_id && p.reference_type === 'solicitacao') return `/solicitacoes/${p.reference_id}`
  if (p.reference_id && p.reference_type === 'ferias') return `/ferias/${p.reference_id}/repassar`
  if (p.reference_id && p.reference_type === 'chat_channel') return `/chat/${p.reference_id}`
  if (p.reference_id && p.reference_type === 'project') return `/projetos/${p.reference_id}`
  if (p.reference_type === 'jornal') return '/jornal?aba=atualizacoes'
  return '/avisos'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const negado = requireServiceRole(req, corsHeaders)
  if (negado) return negado

  const publica = Deno.env.get('VAPID_PUBLIC_KEY')
  const privada = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!publica || !privada) {
    return new Response(JSON.stringify({ ok: false, motivo: 'sem chaves VAPID' }), { status: 200, headers: corsHeaders })
  }
  webpush.setVapidDetails(appBaseUrl(), publica, privada)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data, error } = await supabase.rpc('avisos_push_pendentes')
  if (error) return new Response(JSON.stringify({ ok: false, erro: error.message }), { status: 500, headers: corsHeaders })

  const pendentes = (data ?? []) as Pendente[]
  const enviados = new Set<string>()
  const mortas = new Set<string>()
  const base = appBaseUrl().replace(/\/$/, '')
  for (const p of pendentes) {
    const corpo = JSON.stringify({ titulo: p.titulo ?? 'Helpoint', texto: p.mensagem ?? '', url: `${base}${destino(p)}`, tag: p.aviso_id })
    try {
      await webpush.sendNotification({ endpoint: p.endpoint, keys: { p256dh: p.p256dh, auth: p.auth } }, corpo, { TTL: 3600 })
      enviados.add(p.aviso_id)
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) { mortas.add(p.inscricao_id); enviados.add(p.aviso_id) }
      else console.error('push falhou', status, (e as Error).message)
    }
  }
  if (enviados.size || mortas.size) {
    const { error: erroMarca } = await supabase.rpc('avisos_push_enviados', { p_avisos: [...enviados], p_inscricoes_mortas: [...mortas] })
    if (erroMarca) console.error('não marcou', erroMarca.message)
  }
  return new Response(JSON.stringify({ ok: true, pendentes: pendentes.length, enviados: enviados.size, mortas: mortas.size }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})

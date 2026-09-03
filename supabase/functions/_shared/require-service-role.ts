// Guarda para funções acionadas por pg_cron: só o service_role entra.
//
// METADE DE UM PAR. Isto lê as claims, não verifica a assinatura do JWT — quem
// verifica é o gateway, e só quando a função está com `verify_jwt = true` no
// `supabase/config.toml`. Quem importar este módulo importa as duas metades ou
// nenhuma. Consumidores hoje: check-alerts e mkt-publish-due — os dois com
// verify_jwt = true.

function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length < 2) {
    return null
  }

  try {
    const payload = parts[1]
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=')

    return JSON.parse(atob(payload)) as Record<string, unknown>
  } catch {
    return null
  }
}

// Defesa em profundidade: com verify_jwt=true o gateway já exige um JWT válido.
// Isto acrescenta a checagem explícita do papel, para que só quem tem a chave
// service_role dispare o worker. Devolve a resposta de recusa, ou null se passou.
export function requireServiceRole(
  req: Request,
  corsHeaders: Record<string, string> = {}
): Response | null {
  const headers = { ...corsHeaders, 'Content-Type': 'application/json' }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers })
  }

  const claims = parseJwtClaims(authHeader.slice('Bearer '.length).trim())
  if (claims?.role !== 'service_role') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers })
  }

  return null
}

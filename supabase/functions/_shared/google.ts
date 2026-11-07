// Conta de serviço do Google com delegação em todo o domínio (docs/google-workspace-autorizacao.md): entra como cada
// pessoa da empresa, só com escopos de leitura. A chave fica em GOOGLE_SERVICE_ACCOUNT_JSON e nunca sai desta função.
const ESCOPOS = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/meetings.space.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
].join(' ')

const base64url = (b: ArrayBuffer | string) => {
  const bytes = typeof b === 'string' ? new TextEncoder().encode(b) : new Uint8Array(b)
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

async function assinar(texto: string, pem: string) {
  const corpo = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
  const der = Uint8Array.from(atob(corpo), (c) => c.charCodeAt(0))
  const chave = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  return base64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(texto)))
}

export class FalhaDoGoogle extends Error {
  constructor(readonly codigo: string, mensagem: string) {
    super(mensagem)
  }
}

/** O token para agir como `pessoa`. `invalid_grant` quer dizer que o e-mail não é conta do Workspace. */
export async function tokenDoGoogle(pessoa: string): Promise<string> {
  const bruto = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  if (!bruto) throw new FalhaDoGoogle('sem_chave', 'GOOGLE_SERVICE_ACCOUNT_JSON não está no cofre.')
  const conta = JSON.parse(bruto) as { client_email: string; private_key: string }
  const agora = Math.floor(Date.now() / 1000)
  const cabeca = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const pedido = base64url(JSON.stringify({
    iss: conta.client_email, sub: pessoa, scope: ESCOPOS, aud: 'https://oauth2.googleapis.com/token', iat: agora, exp: agora + 3000,
  }))
  const assinatura = await assinar(`${cabeca}.${pedido}`, conta.private_key)
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${cabeca}.${pedido}.${assinatura}`,
    }),
  })
  const j = await r.json()
  if (!r.ok) throw new FalhaDoGoogle(j.error ?? 'erro', j.error_description ?? 'O Google recusou o token.')
  return j.access_token
}

export async function lerDoGoogle<T>(token: string, url: string): Promise<T> {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new FalhaDoGoogle(String(r.status), (await r.text()).slice(0, 300))
  return await r.json() as T
}

/** Um documento ou planilha do Google como texto puro, sem mudar o conteúdo. */
export async function textoDoArquivo(token: string, id: string, formato: 'text/plain' | 'text/csv'): Promise<string> {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent(formato)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!r.ok) throw new FalhaDoGoogle(String(r.status), (await r.text()).slice(0, 300))
  return await r.text()
}

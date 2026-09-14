// O que é da Meta e não de um produto dela.
//
// O WhatsApp (CRM-4a) e o Lead Ads (CRM-4c) falam com a mesma Graph API, provam
// que são a Meta do mesmo jeito e são cadastrados no mesmo painel. Antes isto
// morava em `whatsapp.ts`, e o Lead Ads teria de importar de lá — o que faria
// parecer que um depende do outro. Dependem os dois é da Meta.
import { timingSafeEqual } from './payment-credentials.ts';

/** Versão da Graph API. Subir isto é decisão consciente, não efeito colateral. */
export const GRAPH = 'https://graph.facebook.com/v21.0';

/**
 * Chamada à Graph API. O erro da Meta vem em `error.message`, e é ele que
 * interessa a quem está na tela — "(#100) Tried accessing nonexisting field"
 * diz o que fazer; "erro 400" não.
 */
export async function graphFetch<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${GRAPH}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    let motivo = text.slice(0, 400);
    try {
      motivo = JSON.parse(text)?.error?.message ?? motivo;
    } catch { /* corpo não-JSON: fica o texto cru */ }
    throw new Error(`meta: ${motivo}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

/** HMAC-SHA256 cru. Cada produto formata o resultado do seu jeito. */
export async function hmacSha256(secret: string, body: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
}

/**
 * Confere que a chamada veio mesmo da Meta: `X-Hub-Signature-256` é o HMAC-SHA256
 * do corpo **cru** com o segredo do app. Sem isto, qualquer um que descubra o
 * endereço do webhook escreve dado no CRM de um cliente.
 */
export async function assinaturaConfere(
  appSecret: string,
  rawBody: string,
  header: string | null,
): Promise<boolean> {
  if (!header?.startsWith('sha256=')) return false;
  const sig = await hmacSha256(appSecret, rawBody);
  const esperado = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(esperado, header.slice('sha256='.length));
}

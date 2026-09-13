// O WhatsApp oficial da Meta, num lugar só (CRM-4a, ADR-006).
//
// A conexão é **por empresa**: cada tenant registra o próprio número na Meta e
// guarda aqui o `phone_number_id`, o `waba_id` e o token. A tabela é fechada —
// nem `authenticated` lê — então tudo passa pela chave de serviço.
//
// Nada de conexão por QR code: num produto vendido a terceiros, banimento do
// número de um cliente não é risco aceitável (ADR-006).
import { adminClient, timingSafeEqual } from './payment-credentials.ts';

/** Versão da Graph API. Subir isto é decisão consciente, não efeito colateral. */
const GRAPH = 'https://graph.facebook.com/v21.0';

export interface WhatsAppConnection {
  tenant_id: string;
  phone_number_id: string;
  waba_id: string;
  access_token: string;
  display_phone: string | null;
  verify_token: string;
  app_secret: string | null;
  is_active: boolean;
}

export async function getConnectionByPhoneNumberId(
  admin: ReturnType<typeof adminClient>,
  phoneNumberId: string,
): Promise<WhatsAppConnection | null> {
  const { data, error } = await admin
    .from('tenant_whatsapp_connections').select('*')
    .eq('phone_number_id', phoneNumberId).maybeSingle();
  if (error) throw error;
  return (data as WhatsAppConnection | null) ?? null;
}

export async function getConnectionByTenant(
  admin: ReturnType<typeof adminClient>,
  tenantId: string,
): Promise<WhatsAppConnection | null> {
  const { data, error } = await admin
    .from('tenant_whatsapp_connections').select('*')
    .eq('tenant_id', tenantId).maybeSingle();
  if (error) throw error;
  return (data as WhatsAppConnection | null) ?? null;
}

/**
 * Chamada à Graph API com o token da empresa. O erro da Meta vem em
 * `error.message`, e é ele que interessa a quem está na tela — "(#131030)
 * Recipient phone number not in allowed list" diz o que fazer; "erro 400" não.
 */
export async function metaFetch<T>(
  cred: Pick<WhatsAppConnection, 'access_token'>,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${GRAPH}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cred.access_token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    let motivo = text.slice(0, 400);
    try {
      const j = JSON.parse(text);
      motivo = j?.error?.message ?? motivo;
    } catch { /* corpo não-JSON: fica o texto cru mesmo */ }
    throw new Error(`whatsapp: ${motivo}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

/** Manda um texto simples. Só vale dentro das 24h desde a última mensagem do cliente. */
export async function enviarTexto(
  cred: WhatsAppConnection,
  para: string,
  texto: string,
): Promise<string | null> {
  const r = await metaFetch<{ messages?: { id: string }[] }>(
    cred,
    `${cred.phone_number_id}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: para,
        type: 'text',
        text: { preview_url: false, body: texto },
      }),
    },
  );
  return r?.messages?.[0]?.id ?? null;
}

/**
 * Confere que a chamada veio mesmo da Meta: `X-Hub-Signature-256` é o HMAC-SHA256
 * do corpo **cru** com o segredo do app. Sem isto, qualquer um que descubra o
 * endereço do webhook escreve mensagem na conversa de um cliente.
 */
export async function assinaturaConfere(
  appSecret: string,
  rawBody: string,
  header: string | null,
): Promise<boolean> {
  if (!header?.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const esperado = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(esperado, header.slice('sha256='.length));
}

/** Só dígitos, como a Meta escreve (`5531988887777`). */
export function soDigitos(v: string): string {
  return (v ?? '').replace(/\D/g, '');
}

export { adminClient };

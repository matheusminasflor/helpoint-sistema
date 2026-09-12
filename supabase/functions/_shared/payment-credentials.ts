// Credenciais de pagamento por empresa (CRM-2a, ADR-008): leitura só com
// service_role, chamadas à Yampi com os cabeçalhos da empresa, e a
// verificação do HMAC do webhook da Yampi. Sem estado; cada função importa.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

export type PaymentProvider = 'stripe' | 'yampi';

export interface PaymentCredential {
  id: string;
  tenant_id: string;
  provider: PaymentProvider;
  is_default: boolean;
  alias: string | null;
  key_last4: string | null;
  secret_key: string;
  secret_key_2: string | null;
  webhook_secret: string | null;
  webhook_id: string | null;
}

export function adminClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string | null | undefined): s is string => !!s && UUID_RE.test(s);

/** A credencial de um provedor da empresa; null = não configurado. */
export async function getPaymentCredential(
  admin: ReturnType<typeof adminClient>,
  tenantId: string,
  provider: PaymentProvider,
): Promise<PaymentCredential | null> {
  const { data, error } = await admin
    .from('tenant_payment_credentials')
    .select('id, tenant_id, provider, is_default, alias, key_last4, secret_key, secret_key_2, webhook_secret, webhook_id')
    .eq('tenant_id', tenantId)
    .eq('provider', provider)
    .maybeSingle();
  if (error) throw error;
  return (data as PaymentCredential | null) ?? null;
}

/** Desfaz o registro de dedupe quando o processamento falhou, para o provedor poder tentar de novo. */
export async function forgetPaymentEvent(admin: ReturnType<typeof adminClient>, provider: PaymentProvider, eventId: string) {
  const { error } = await admin.from('crm_payment_events').delete().eq('provider', provider).eq('event_id', eventId);
  if (error) console.error('crm_payment_events delete', error);
}

export const YAMPI_API = 'https://api.dooki.com.br/v2';

/** `GET /{alias}/webhooks` etc. com os cabeçalhos da empresa. Lança em HTTP ≥ 400 com o corpo. */
export async function yampiFetch<T = unknown>(
  cred: Pick<PaymentCredential, 'alias' | 'secret_key' | 'secret_key_2'>,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!cred.alias || !cred.secret_key_2) throw new Error('credencial da Yampi incompleta (alias e User-Token)');
  const res = await fetch(`${YAMPI_API}/${cred.alias}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Token': cred.secret_key_2,
      'User-Secret-Key': cred.secret_key,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Yampi ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}

/** HMAC-SHA256 do corpo em base64 — é o que a Yampi manda em `X-Yampi-Hmac-SHA256`. */
export async function yampiSignature(secret: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/** Comparação em tempo constante (o auditor pediu isto no webhook das automações). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

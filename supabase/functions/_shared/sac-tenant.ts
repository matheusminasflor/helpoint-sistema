// Resolução confiável do tenant nos fluxos públicos do SAC.
// Regra: NUNCA "chutar" um tenant. A origem de verdade é, nesta ordem:
//  1. host da requisição, quando for domínio próprio do tenant (Origin/Referer/x-forwarded-host);
//  2. slug/tenant_id enviado, sempre validado contra a tabela tenants;
//  3. tenant do cliente autenticado (quando a ação exige login).
// A checagem vive na camada de aplicação (portável para outro banco no futuro).

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export interface SacTenant {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
}

export interface TenantResolutionError {
  error: string;
  status: number;
}

const DEFAULT_HOSTS = [
  'localhost',
  '127.0.0.1',
  'helpoint.com.br',
  'www.helpoint.com.br',
];

function isDefaultHost(host: string) {
  if (!host) return true;
  const h = host.toLowerCase().split(':')[0];
  return (
    DEFAULT_HOSTS.includes(h) ||
    h.endsWith('.lovable.app') ||
    h.endsWith('.lovable.dev')
  );
}

export function requestHostname(req: Request): string {
  const origin = req.headers.get('origin') || req.headers.get('referer') || '';
  if (origin) {
    try {
      return new URL(origin).hostname.toLowerCase();
    } catch { /* ignore */ }
  }
  return (req.headers.get('x-forwarded-host') || '').toLowerCase().split(':')[0];
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/**
 * Retorna o tenant resolvido ou um erro. Nunca retorna "o primeiro tenant do banco".
 */
export async function resolveSacTenant(
  admin: SupabaseClient,
  req: Request,
  body: { tenant_id?: string | null; tenant_slug?: string | null },
): Promise<{ tenant: SacTenant } | TenantResolutionError> {
  const hostname = requestHostname(req);

  // 1. Domínio próprio do tenant → fonte de verdade
  if (hostname && !isDefaultHost(hostname)) {
    const { data } = await admin.rpc('get_tenant_by_hostname', { _hostname: hostname });
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.id) return { error: 'tenant_not_found_for_host', status: 400 };
    // Se o corpo tentou apontar outro tenant, rejeita (anti tenant-hopping)
    if (body.tenant_id && body.tenant_id !== row.id) {
      return { error: 'tenant_mismatch', status: 403 };
    }
    if (body.tenant_slug && row.slug && body.tenant_slug !== row.slug) {
      return { error: 'tenant_mismatch', status: 403 };
    }
    return {
      tenant: {
        id: row.id,
        name: row.name,
        slug: row.slug ?? null,
        logo_url: row.logo_url ?? null,
      },
    };
  }

  // 2. Host padrão → exige identificação explícita e validada
  const rawId = (body.tenant_id || '').toString().trim();
  const rawSlug = (body.tenant_slug || '').toString().trim().toLowerCase();

  if (rawId) {
    if (!isUuid(rawId)) return { error: 'invalid_tenant', status: 400 };
    const { data } = await admin
      .from('tenants')
      .select('id, name, slug, logo_url')
      .eq('id', rawId)
      .maybeSingle();
    if (!data) return { error: 'tenant_not_found', status: 404 };
    return { tenant: data as SacTenant };
  }

  if (rawSlug) {
    if (!/^[a-z0-9-]{2,64}$/.test(rawSlug)) return { error: 'invalid_tenant', status: 400 };
    const { data } = await admin
      .from('tenants')
      .select('id, name, slug, logo_url')
      .eq('slug', rawSlug)
      .maybeSingle();
    if (!data) return { error: 'tenant_not_found', status: 404 };
    return { tenant: data as SacTenant };
  }

  return { error: 'missing_tenant', status: 400 };
}

/** Tenant do cliente autenticado — usado quando a ação exige login. */
export async function tenantOfCustomer(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await admin
    .from('customer_profiles')
    .select('tenant_id')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.tenant_id ?? null;
}

export function isTenantError(
  r: { tenant: SacTenant } | TenantResolutionError,
): r is TenantResolutionError {
  return (r as TenantResolutionError).error !== undefined;
}

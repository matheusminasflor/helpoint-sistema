// Bling API v3 com o token da empresa (CRM-2b, ADR-008): conexão OAuth guardada
// em `tenant_bling_connections` (só service_role), renovação do access token
// pelo refresh token, chamadas com respeito ao limite (3 req/s → 429 com
// nova tentativa) e a rotina "pedido do Helpoint → pedido no Bling → NF-e".
//
// Endpoints confirmados no OpenAPI público do Bling (scripts/bling-openapi-resumo.mjs):
//   POST /contatos, GET /contatos?numeroDocumento=, POST /pedidos/vendas,
//   POST /pedidos/vendas/{id}/gerar-nfe, POST /nfe/{id}/enviar, GET /nfe/{id}.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

export const BLING_API = 'https://api.bling.com.br/Api/v3';
export const BLING_AUTHORIZE = 'https://bling.com.br/Api/v3/oauth/authorize';
export const BLING_TOKEN = 'https://bling.com.br/Api/v3/oauth/token';

type Admin = ReturnType<typeof createClient>;

export interface BlingSettings {
  forma_pagamento_id?: number;
  forma_pagamento_nome?: string;
  gerar_nfe?: boolean;
  enviar_nfe?: boolean;
}

export interface BlingConnection {
  tenant_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  company_name: string | null;
  settings: BlingSettings;
}

export function blingClientCredentials(): { id: string; secret: string } | null {
  const id = Deno.env.get('BLING_CLIENT_ID');
  const secret = Deno.env.get('BLING_CLIENT_SECRET');
  return id && secret ? { id, secret } : null;
}

/** Troca `code` (ou renova por `refresh_token`) no endpoint de token do Bling (Basic client_id:client_secret). */
export async function blingTokenRequest(params: Record<string, string>): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const creds = blingClientCredentials();
  if (!creds) throw new Error('bling_not_configured');
  const res = await fetch(BLING_TOKEN, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${creds.id}:${creds.secret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams(params).toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Bling token ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

export async function getBlingConnection(admin: Admin, tenantId: string): Promise<BlingConnection | null> {
  const { data, error } = await admin
    .from('tenant_bling_connections')
    .select('tenant_id, access_token, refresh_token, expires_at, company_name, settings')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw error;
  return (data as BlingConnection | null) ?? null;
}

/** Access token válido: renova pelo refresh token quando faltam menos de 5 minutos. */
export async function blingAccessToken(admin: Admin, conn: BlingConnection): Promise<string> {
  if (new Date(conn.expires_at).getTime() - Date.now() > 5 * 60_000) return conn.access_token;
  const tok = await blingTokenRequest({ grant_type: 'refresh_token', refresh_token: conn.refresh_token });
  const expiresAt = new Date(Date.now() + tok.expires_in * 1000).toISOString();
  const { data, error } = await admin
    .from('tenant_bling_connections')
    .update({ access_token: tok.access_token, refresh_token: tok.refresh_token, expires_at: expiresAt })
    .eq('tenant_id', conn.tenant_id)
    .select('tenant_id');
  if (error) throw error;
  if (!data?.length) throw new Error('conexão do Bling não gravada');
  conn.access_token = tok.access_token;
  conn.refresh_token = tok.refresh_token;
  conn.expires_at = expiresAt;
  return tok.access_token;
}

/** Chamada ao Bling com o token; 429 (3 req/s) espera e tenta de novo até 3 vezes. Lança em ≥ 400 com o corpo. */
export async function blingFetch<T = unknown>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BLING_API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json', ...(init.headers ?? {}) },
    });
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      continue;
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`Bling ${res.status}: ${text.slice(0, 300)}`);
    return (text ? JSON.parse(text) : null) as T;
  }
}

interface OrderRow {
  id: string; tenant_id: string; number: number; subtotal: number; discount: number; shipping: number; total: number; notes: string | null;
  bling_order_id: string | null; bling_nfe_id: string | null; nfe_status: string | null;
  contact: { id: string; name: string; email: string | null; phone: string | null; document: string | null; company: string | null; city: string | null; state: string | null; bling_contact_id: string | null } | null;
  items: { description: string; quantity: number; unit_price: number; product: { sku: string | null } | null }[];
}

export interface BlingOrderResult {
  bling_order_id: string;
  bling_nfe_id: string | null;
  nfe_key: string | null;
  danfe_url: string | null;
  nfe_status: string;
}

const todayBR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const idOf = (r: unknown): string | null => {
  const d = (r as { data?: { id?: number | string }; id?: number | string }) ?? {};
  const id = d.data?.id ?? d.id;
  return id == null ? null : String(id);
};

/**
 * Pedido do Helpoint → pedido de venda no Bling (+ NF-e conforme as escolhas).
 * Idempotente: pedido já lançado não é lançado de novo; nota já gerada não é gerada de novo.
 * `opts` do passo do fluxo se sobrepõem às escolhas da empresa.
 */
export async function pushOrderToBling(admin: Admin, tenantId: string, orderId: string, opts: { gerar_nfe?: boolean; enviar_nfe?: boolean } = {}): Promise<BlingOrderResult> {
  const conn = await getBlingConnection(admin, tenantId);
  if (!conn) throw new Error('a empresa não está conectada ao Bling (Configurações do Comercial → Nota fiscal)');
  const settings = conn.settings ?? {};
  const gerarNfe = opts.gerar_nfe ?? settings.gerar_nfe ?? false;
  const enviarNfe = opts.enviar_nfe ?? settings.enviar_nfe ?? false;

  const { data: order, error: orderError } = await admin
    .from('crm_orders')
    .select('id, tenant_id, number, subtotal, discount, shipping, total, notes, bling_order_id, bling_nfe_id, nfe_status, contact:crm_contacts(id, name, email, phone, document, company, city, state, bling_contact_id), items:crm_order_items(description, quantity, unit_price, product:crm_products(sku))')
    .eq('id', orderId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (orderError) throw orderError;
  const o = order as unknown as OrderRow | null;
  if (!o) throw new Error('pedido não encontrado');
  if (!o.contact) throw new Error('pedido sem cliente');
  if (!o.items.length) throw new Error('pedido sem itens');

  const token = await blingAccessToken(admin, conn);
  const fail = async (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    await admin.from('crm_orders').update({ nfe_status: 'error', bling_error: msg.slice(0, 500) }).eq('id', o.id);
    throw e;
  };

  try {
    // 1. Contato no Bling: o já conhecido, senão pelo CPF/CNPJ, senão cria.
    let contactId = o.contact.bling_contact_id;
    if (!contactId) {
      const doc = (o.contact.document ?? '').replace(/\D/g, '');
      if (doc) {
        const found = await blingFetch<{ data?: { id: number }[] }>(token, `/contatos?numeroDocumento=${doc}&limite=1`);
        contactId = found?.data?.[0]?.id != null ? String(found.data[0].id) : null;
      }
      if (!contactId) {
        const created = await blingFetch(token, '/contatos', {
          method: 'POST',
          body: JSON.stringify({
            nome: o.contact.name, situacao: 'A',
            tipo: doc.length === 14 ? 'J' : 'F',
            ...(doc ? { numeroDocumento: doc } : {}),
            ...(o.contact.email ? { email: o.contact.email } : {}),
            ...(o.contact.phone ? { telefone: o.contact.phone } : {}),
            ...(o.contact.company && doc.length === 14 ? { fantasia: o.contact.company } : {}),
            ...(o.contact.city || o.contact.state ? { endereco: { geral: { municipio: o.contact.city ?? '', uf: o.contact.state ?? '' } } } : {}),
          }),
        });
        contactId = idOf(created);
        if (!contactId) throw new Error('o Bling não devolveu o id do contato');
      }
      const { error } = await admin.from('crm_contacts').update({ bling_contact_id: contactId }).eq('id', o.contact.id).select('id');
      if (error) console.warn('bling_contact_id nao gravado', error);
    }

    // 2. Pedido de venda (uma vez só).
    let blingOrderId = o.bling_order_id;
    if (!blingOrderId) {
      if (!settings.forma_pagamento_id) throw new Error('escolha a forma de pagamento do Bling em Configurações do Comercial → Nota fiscal');
      const created = await blingFetch(token, '/pedidos/vendas', {
        method: 'POST',
        body: JSON.stringify({
          data: todayBR(),
          numeroLoja: `HP-${o.number}`,
          contato: { id: Number(contactId) },
          itens: o.items.map((i) => ({
            ...(i.product?.sku ? { codigo: i.product.sku } : {}),
            descricao: i.description, quantidade: Number(i.quantity), valor: Number(i.unit_price),
          })),
          parcelas: [{ dataVencimento: todayBR(), valor: Number(o.total), formaPagamento: { id: settings.forma_pagamento_id } }],
          ...(Number(o.discount) > 0 ? { desconto: { valor: Number(o.discount), unidade: 'REAL' } } : {}),
          ...(Number(o.shipping) > 0 ? { transporte: { frete: Number(o.shipping) } } : {}),
          observacoes: `Helpoint — pedido #${o.number}${o.notes ? `. ${o.notes}` : ''}`,
        }),
      });
      blingOrderId = idOf(created);
      if (!blingOrderId) throw new Error('o Bling não devolveu o id do pedido');
      const { error } = await admin.from('crm_orders').update({ bling_order_id: blingOrderId, nfe_status: 'order_created', bling_error: null }).eq('id', o.id).select('id');
      if (error) throw error;
    }

    const result: BlingOrderResult = { bling_order_id: blingOrderId, bling_nfe_id: o.bling_nfe_id, nfe_key: null, danfe_url: null, nfe_status: o.nfe_status ?? 'order_created' };
    if (!gerarNfe) return result;

    // 3. NF-e a partir do pedido (uma vez só) e, se pedido, transmissão à SEFAZ.
    if (!result.bling_nfe_id) {
      const nfe = await blingFetch(token, `/pedidos/vendas/${blingOrderId}/gerar-nfe`, { method: 'POST' });
      result.bling_nfe_id = idOf(nfe);
      if (!result.bling_nfe_id) throw new Error('o Bling não devolveu o id da nota');
      result.nfe_status = 'nfe_generated';
    }
    if (enviarNfe && result.nfe_status !== 'nfe_sent') {
      await blingFetch(token, `/nfe/${result.bling_nfe_id}/enviar`, { method: 'POST' });
      result.nfe_status = 'nfe_sent';
    }
    const full = await blingFetch<{ data?: { chaveAcesso?: string; linkDanfe?: string; linkPDF?: string } }>(token, `/nfe/${result.bling_nfe_id}`).catch(() => null);
    result.nfe_key = full?.data?.chaveAcesso ?? null;
    result.danfe_url = full?.data?.linkDanfe ?? full?.data?.linkPDF ?? null;

    const { data: saved, error } = await admin.from('crm_orders')
      .update({ bling_nfe_id: result.bling_nfe_id, nfe_key: result.nfe_key, danfe_url: result.danfe_url, nfe_status: result.nfe_status, bling_error: null })
      .eq('id', o.id).select('id');
    if (error) throw error;
    if (!saved?.length) throw new Error('pedido não atualizado');
    return result;
  } catch (e) {
    return await fail(e);
  }
}

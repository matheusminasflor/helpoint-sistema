// "Conectar com Bling" (CRM-2b, ADR-008): OAuth 2.0 authorization-code por empresa.
//
// O app "Helpoint" é registrado UMA vez no portal do Bling pelo dono do produto
// (BLING_CLIENT_ID / BLING_CLIENT_SECRET nos segredos das edge functions), com o
// redirect URI  https://<ref>.supabase.co/functions/v1/bling-oauth . Cada empresa
// autoriza a própria conta; os tokens ficam em `tenant_bling_connections`.
//
// GET  ?code=&state=            ← o Bling volta aqui (sem JWT); o `state` assinado diz a empresa
//                                 e para onde voltar no app.
// POST { action }  (JWT, owner/admin):
//   start      { return_to }     → { auth_url }
//   options                      → { formas_pagamento: [{ id, descricao }] }
//   save       { settings }      → { ok }   (forma_pagamento_id, gerar_nfe, enviar_nfe)
//   disconnect                   → { ok }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { adminClient, timingSafeEqual } from '../_shared/payment-credentials.ts';
import { BLING_AUTHORIZE, blingAccessToken, blingClientCredentials, blingFetch, blingTokenRequest, getBlingConnection } from '../_shared/bling.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// ── state assinado (mesmo molde de mkt-meta-oauth) ───────────────────────────
const STATE_TTL_MS = 10 * 60 * 1000;
async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
const b64url = (v: string) => btoa(v).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (v: string) => atob(v.replace(/-/g, '+').replace(/_/g, '/'));
async function signState(data: Record<string, unknown>): Promise<string> {
  const payload = b64url(JSON.stringify(data));
  return `${payload}.${await hmac(payload)}`;
}
async function readState(state: string | null): Promise<{ tenant_id: string; user_id: string; return_to: string } | null> {
  if (!state || !state.includes('.')) return null;
  const [payload, sig] = state.split('.');
  if (!timingSafeEqual(sig, await hmac(payload))) return null;
  try {
    const data = JSON.parse(unb64url(payload));
    if (typeof data.ts !== 'number' || Date.now() - data.ts > STATE_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

/** Só volta para o próprio app (localhost, helpoint.com.br e prévias da Vercel). */
function isAllowedReturn(raw: string): boolean {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    const okHost = host === 'localhost' || host === 'helpoint.com.br' || host.endsWith('.helpoint.com.br') || (host.startsWith('helpoint-') && host.endsWith('.vercel.app'));
    return okHost && (u.protocol === 'https:' || host === 'localhost');
  } catch {
    return false;
  }
}

const redirectUri = () => `${Deno.env.get('SUPABASE_URL')}/functions/v1/bling-oauth`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // ── Volta do Bling ──────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const st = await readState(url.searchParams.get('state'));
    if (!st) return json({ error: 'state inválido ou vencido — comece de novo em Configurações do Comercial → Nota fiscal' }, 400);
    const back = (q: string) => Response.redirect(`${st.return_to}${st.return_to.includes('?') ? '&' : '?'}${q}`, 302);
    const code = url.searchParams.get('code');
    if (!code) return back(`bling=erro&motivo=${encodeURIComponent(url.searchParams.get('error') ?? 'autorizacao negada')}`);
    try {
      const tok = await blingTokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() });
      const admin = adminClient();
      const existing = await getBlingConnection(admin, st.tenant_id);
      const row = {
        tenant_id: st.tenant_id, access_token: tok.access_token, refresh_token: tok.refresh_token,
        expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(), connected_by: st.user_id,
        settings: existing?.settings ?? {},
      };
      const { error } = await admin.from('tenant_bling_connections').upsert(row, { onConflict: 'tenant_id' });
      if (error) throw error;
      return back('bling=ok');
    } catch (e) {
      console.error('bling-oauth callback', e);
      return back(`bling=erro&motivo=${encodeURIComponent(e instanceof Error ? e.message : 'erro desconhecido')}`);
    }
  }

  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // ── Ações do app (JWT; só owner/admin) ─────────────────────────────────────
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);
    const userId = userData.user.id;

    const admin = adminClient();
    const { data: profile, error: profileError } = await admin.from('profiles').select('tenant_id').eq('id', userId).maybeSingle();
    if (profileError) throw profileError;
    const tenantId = profile?.tenant_id as string | undefined;
    if (!tenantId) return json({ error: 'no_tenant' }, 403);
    const { data: isAdmin, error: adminError } = await admin.rpc('is_admin_or_higher', { _user_id: userId });
    if (adminError) throw adminError;
    if (!isAdmin) return json({ error: 'forbidden' }, 403);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? '');

    if (action === 'start') {
      const creds = blingClientCredentials();
      if (!creds) return json({ error: 'bling_not_configured', message: 'O app Helpoint ainda não foi registrado no Bling (BLING_CLIENT_ID/SECRET).' }, 503);
      const returnTo = String(body.return_to ?? '');
      if (!isAllowedReturn(returnTo)) return json({ error: 'return_to inválido' }, 400);
      const state = await signState({ tenant_id: tenantId, user_id: userId, return_to: returnTo, nonce: crypto.randomUUID(), ts: Date.now() });
      const auth = new URL(BLING_AUTHORIZE);
      auth.searchParams.set('response_type', 'code');
      auth.searchParams.set('client_id', creds.id);
      auth.searchParams.set('state', state);
      auth.searchParams.set('redirect_uri', redirectUri());
      return json({ auth_url: auth.toString() });
    }

    if (action === 'disconnect') {
      const { error } = await admin.from('tenant_bling_connections').delete().eq('tenant_id', tenantId);
      if (error) throw error;
      return json({ ok: true });
    }

    const conn = await getBlingConnection(admin, tenantId);
    if (!conn) return json({ error: 'bling_not_connected' }, 409);

    if (action === 'options') {
      const token = await blingAccessToken(admin, conn);
      const res = await blingFetch<{ data?: { id: number; descricao: string; situacao?: number; finalidade?: number }[] }>(token, '/formas-pagamentos?situacao=1&limite=100');
      const formas = (res?.data ?? []).filter((f) => f.finalidade == null || f.finalidade === 2 || f.finalidade === 3).map((f) => ({ id: f.id, descricao: f.descricao }));
      return json({ formas_pagamento: formas });
    }

    if (action === 'save') {
      const s = (body.settings ?? {}) as Record<string, unknown>;
      const settings = {
        ...(conn.settings ?? {}),
        ...(typeof s.forma_pagamento_id === 'number' ? { forma_pagamento_id: s.forma_pagamento_id } : {}),
        ...(typeof s.forma_pagamento_nome === 'string' ? { forma_pagamento_nome: s.forma_pagamento_nome } : {}),
        ...(typeof s.gerar_nfe === 'boolean' ? { gerar_nfe: s.gerar_nfe } : {}),
        ...(typeof s.enviar_nfe === 'boolean' ? { enviar_nfe: s.enviar_nfe } : {}),
      };
      const { data, error } = await admin.from('tenant_bling_connections').update({ settings }).eq('tenant_id', tenantId).select('tenant_id');
      if (error) throw error;
      if (!data?.length) throw new Error('conexão não gravada');
      return json({ ok: true, settings });
    }

    return json({ error: 'invalid_action' }, 400);
  } catch (e) {
    console.error('bling-oauth', e);
    return json({ error: e instanceof Error ? e.message : 'erro desconhecido' }, 500);
  }
});

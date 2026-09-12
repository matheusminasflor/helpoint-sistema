// Worker dos passos externos das automações (E5-A2, ADR-007): e-mail,
// requisição HTTP e texto por IA. O executor no banco deixa o run em
// `waiting` com `pending_kind`; o cron `automation-worker-1min` chama esta
// função com a chave service_role (mesmo molde de check-alerts), que pega os
// passos pendentes já com a configuração renderizada
// (`automation_claim_external`), executa e devolve o resultado ou o erro
// (`automation_complete_external`) — e o fluxo segue no banco.
//
// Nasce sob as cinco regras de escrita: nenhum `const { data } = await` sem
// tratar o `error`.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireServiceRole } from '../_shared/require-service-role.ts';
import { sendEmail } from '../_shared/email.ts';
import { callTenantAI } from '../_shared/ai.ts';
import { pushOrderToBling } from '../_shared/bling.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const FROM_ADDRESS = Deno.env.get('AUTH_FROM_EMAIL') || Deno.env.get('INVITE_FROM_EMAIL') || 'noreply@helpoint.com.br';
const HTTP_TIMEOUT_MS = 5000;
const MAX_BODY_CHARS = 10_000;

interface Claimed {
  run_id: string;
  step_id: string;
  kind: 'send_email' | 'http_request' | 'ai_text' | 'bling_order' | string;
  config: Record<string, unknown>;
  tenant_id: string;
  subject_type: string | null;
  subject_id: string | null;
  workflow_name: string | null;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const str = (v: unknown) => (typeof v === 'string' ? v : '');

// ── SSRF: nada de rede interna. Nome, IP literal e o IP resolvido são conferidos.
function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) {
    const low = ip.toLowerCase();
    return low === '::1' || low.startsWith('fc') || low.startsWith('fd') || low.startsWith('fe80') || low.startsWith('::ffff:');
  }
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  return p[0] === 10 || p[0] === 127 || p[0] === 0
    || (p[0] === 172 && p[1] >= 16 && p[1] <= 31)
    || (p[0] === 192 && p[1] === 168)
    || (p[0] === 169 && p[1] === 254)
    || (p[0] === 100 && p[1] >= 64 && p[1] <= 127);
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('URL inválida'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('só http(s)');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) {
    throw new Error('endereço interno não permitido');
  }
  if (/^[\d.]+$/.test(host) || host.includes(':')) {
    if (isPrivateIp(host.replace(/^\[|\]$/g, ''))) throw new Error('endereço interno não permitido');
    return url;
  }
  try {
    const addrs = await Deno.resolveDns(host, 'A');
    if (addrs.some(isPrivateIp)) throw new Error('endereço interno não permitido');
  } catch (e) {
    if (e instanceof Error && e.message === 'endereço interno não permitido') throw e;
    // sem resolução A (ex.: só AAAA): deixa o fetch decidir
  }
  return url;
}

function parseHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

async function runStep(c: Claimed, admin: ReturnType<typeof createClient>): Promise<Record<string, unknown>> {
  const cfg = c.config ?? {};
  switch (c.kind) {
    case 'bling_order': {
      // CRM-2b: pedido (e NF-e) no Bling com o token da empresa; o banco já garantiu que o gatilho é um pedido.
      if (c.subject_type !== 'crm_order' || !c.subject_id) throw new Error('o passo "pedido no Bling" exige um pedido');
      const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined);
      const r = await pushOrderToBling(admin, c.tenant_id, c.subject_id, { gerar_nfe: bool(cfg.gerar_nfe), enviar_nfe: bool(cfg.enviar_nfe) });
      return { ...r };
    }
    case 'send_email': {
      const to = str(cfg.to).trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new Error(`destinatário inválido: "${to || '(vazio)'}"`);
      const subject = str(cfg.subject).trim() || (c.workflow_name ?? 'Helpoint');
      const html = str(cfg.html) || `<p>${escapeHtml(str(cfg.body)).replace(/\n/g, '<br>')}</p>`;
      const res = await sendEmail({ to, subject, html, from: `Helpoint <${FROM_ADDRESS}>` });
      if (!res.ok) throw new Error(res.error);
      return { to, id: res.id ?? null };
    }
    case 'http_request': {
      const url = await assertPublicUrl(str(cfg.url).trim());
      const method = (str(cfg.method) || 'POST').toUpperCase();
      const headers = { 'Content-Type': 'application/json', ...parseHeaders(str(cfg.headers)) };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          method, headers, signal: controller.signal, redirect: 'manual',
          body: method === 'GET' || method === 'DELETE' ? undefined : str(cfg.body) || '{}',
        });
        const text = (await res.text()).slice(0, MAX_BODY_CHARS);
        let body: unknown = text;
        try { body = JSON.parse(text); } catch { /* texto mesmo */ }
        if (res.status >= 400) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        return { status: res.status, body };
      } finally {
        clearTimeout(timer);
      }
    }
    case 'ai_text': {
      const prompt = str(cfg.prompt).trim();
      if (!prompt) throw new Error('pedido para a IA vazio');
      const ai = await callTenantAI(c.tenant_id, { messages: [{ role: 'user', content: prompt }], maxTokens: 800 });
      return { text: ai.content ?? '', model: ai.model, provider: ai.provider };
    }
    default:
      throw new Error(`o worker não sabe executar "${c.kind}"`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const denied = requireServiceRole(req, corsHeaders);
  if (denied) return denied;

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: claimed, error: claimError } = await admin.rpc('automation_claim_external', { p_limit: 20 });
  if (claimError) return json({ error: claimError.message }, 500);

  let done = 0;
  let failed = 0;
  for (const c of (claimed ?? []) as Claimed[]) {
    let result: Record<string, unknown> | null = null;
    let error: string | null = null;
    try {
      result = await runStep(c, admin);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const { error: completeError } = await admin.rpc('automation_complete_external', {
      p_run: c.run_id, p_step: c.step_id, p_result: result, p_error: error,
    });
    if (completeError) {
      console.error('automation-worker complete failed', c.run_id, completeError);
      failed++;
      continue;
    }
    if (error) failed++; else done++;
  }
  return json({ claimed: (claimed ?? []).length, done, failed });
});

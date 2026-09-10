// Gatilho por webhook das automações (E5-A2, ADR-007): outro sistema chama
//   POST /automation-webhook/<id do fluxo>   com o cabeçalho X-Helpoint-Secret
// e o corpo JSON vira `trigger.body` no fluxo. Sem JWT (é chamada de fora);
// quem confere o segredo (hash no banco), o status do fluxo e o limite de
// 60 disparos por minuto é `automation_webhook_fire`, no banco.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-helpoint-secret',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS_BY_CODE: Record<string, number> = { P0002: 404, P0003: 401, P0004: 429 };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const workflowId = new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? '';
  if (!UUID.test(workflowId)) return json({ error: 'fluxo nao informado' }, 404);
  const secret = req.headers.get('x-helpoint-secret') ?? '';
  if (!secret) return json({ error: 'segredo ausente' }, 401);

  let body: unknown = {};
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return json({ error: 'corpo precisa ser JSON' }, 400);
  }
  if (JSON.stringify(body).length > 64_000) return json({ error: 'corpo grande demais' }, 413);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: runId, error } = await admin.rpc('automation_webhook_fire', { p_workflow: workflowId, p_secret: secret, p_body: body });
  if (error) {
    const status = STATUS_BY_CODE[(error as { code?: string }).code ?? ''] ?? 500;
    if (status === 500) console.error('automation-webhook', error);
    return json({ error: status === 500 ? 'erro ao disparar' : error.message }, status);
  }
  return json({ ok: true, run_id: runId });
});

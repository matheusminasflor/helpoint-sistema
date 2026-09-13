// Recebe o aviso da Focus NFe e resolve a nota do pedido (ENC-3b, ADR-009).
//
// Sem JWT (é a Focus quem chama). A URL leva `?t=<id da empresa>`, cadastrada
// por `nfe-focus` ao ligar o conector, e a autenticidade vem de um cabeçalho
// escolhido por nós na hora de cadastrar o gatilho: o segredo é sorteado no
// servidor e guardado em `tenant_focusnfe_connections.hook_secret`.
//
// **O corpo do aviso não é fonte de verdade.** A Focus manda o que aconteceu,
// mas quem decide o que gravar é a consulta pela referência — assim um aviso
// atrasado, repetido ou fora de ordem nunca escreve uma situação velha por cima
// da atual. Aviso repetido é inofensivo por construção: gravar o mesmo estado
// duas vezes dá no mesmo.
//
// Sem isto a nota nascia "na fila da SEFAZ" e só mudava quando alguém clicava.
import { adminClient, timingSafeEqual, isUuid } from '../_shared/payment-credentials.ts';
import { getFocusConnection, consultarNFe, registrarNota, FOCUS_HOOK_HEADER } from '../_shared/focusnfe.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const tenantId = new URL(req.url).searchParams.get('t');
  if (!isUuid(tenantId)) return json({ error: 'empresa nao informada' }, 400);

  const admin = adminClient();
  const conn = await getFocusConnection(admin, tenantId);
  if (!conn?.hook_secret) return json({ error: 'focus_not_connected' }, 503);

  const given = req.headers.get(FOCUS_HOOK_HEADER) ?? '';
  if (!given || !timingSafeEqual(given, conn.hook_secret)) return json({ error: 'invalid token' }, 401);

  let payload: { ref?: string; status?: string; cnpj_emitente?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'corpo invalido' }, 400);
  }
  const ref = typeof payload.ref === 'string' ? payload.ref.trim() : '';
  if (!ref) return json({ received: true, ignored: 'aviso sem referencia' });

  try {
    // A referência é o id do pedido, mas o pedido pode ter sido apagado, ou o
    // aviso pode ser de uma nota emitida por fora deste Helpoint.
    const { data: pedido, error } = await admin
      .from('crm_orders').select('id').eq('tenant_id', tenantId).eq('nfe_ref', ref).maybeSingle();
    if (error) throw error;
    if (!pedido) {
      console.warn('aviso da Focus sem pedido correspondente', ref);
      return json({ received: true, order: null });
    }

    const res = await consultarNFe(conn, ref);
    const r = await registrarNota(admin, conn, tenantId, (pedido as { id: string }).id, ref, res);
    return json({ received: true, nfe_status: r.nfe_status });
  } catch (e) {
    // A Focus reenvia o aviso; responder 500 é o que pede a repetição.
    console.error('focusnfe-webhook', e instanceof Error ? e.message : String(e));
    return json({ error: e instanceof Error ? e.message : 'erro desconhecido' }, 500);
  }
});

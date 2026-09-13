// Recebe os avisos do Asaas e marca o pedido do CRM como pago (ENC-2, ADR-009).
//
// Sem JWT (é o Asaas quem chama). A URL leva `?t=<id da empresa>`, e a
// autenticidade vem do cabeçalho `asaas-access-token`: um segredo que a empresa
// define no painel do Asaas e que fica guardado por empresa em
// `tenant_payment_credentials.webhook_secret`.
//
// O Asaas entrega **pelo menos uma vez**: o mesmo aviso volta até receber 200, e
// depois de 15 falhas seguidas a fila dele para. Então a ordem aqui é a que eles
// pedem — registrar, responder rápido, e só então agir. Aviso repetido cai fora
// por `crm_payment_events` (chave `provider + event_id`); se o processamento
// falhar no meio, o registro de dedupe é desfeito e a resposta é 500, para o
// Asaas repetir. Mesmo desenho do webhook da Yampi (auditoria de 2026-09-12).
//
// Achar o pedido é direto: a cobrança nasce com `externalReference` = id do
// pedido no Helpoint. Se vier vazio (cobrança criada à mão no painel do Asaas),
// tenta pelo id da cobrança que o pedido guardou.
//
// O que "pago" dispara no negócio é o trigger `crm_orders_on_status`, não este
// arquivo — inclusive a separação na Expedição.
import { adminClient, getPaymentCredential, timingSafeEqual, isUuid, forgetPaymentEvent } from '../_shared/payment-credentials.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Os eventos em que o dinheiro entrou. `RECEIVED` é caiu na conta; `CONFIRMED` é cartão aprovado, ainda a repassar. */
const PAGOS = new Set(['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED_IN_CASH']);

interface AsaasPayment {
  id?: string;
  status?: string;
  value?: number;
  externalReference?: string | null;
  customer?: string;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const tenantId = new URL(req.url).searchParams.get('t');
  if (!isUuid(tenantId)) return json({ error: 'empresa nao informada' }, 400);

  const admin = adminClient();
  const cred = await getPaymentCredential(admin, tenantId, 'asaas');
  if (!cred?.webhook_secret) return json({ error: 'asaas_not_configured' }, 503);

  const given = req.headers.get('asaas-access-token') ?? '';
  if (!given || !timingSafeEqual(given, cred.webhook_secret)) return json({ error: 'invalid token' }, 401);

  let payload: { id?: string; event?: string; payment?: AsaasPayment };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'corpo invalido' }, 400);
  }
  const event = payload.event ?? 'unknown';
  const pagamento = payload.payment;
  if (!pagamento?.id) return json({ received: true, ignored: 'sem cobranca no aviso' });

  // Idempotência: o id do evento é do Asaas; sem ele, evento + cobrança serve.
  const eventId = payload.id ?? `${event}:${pagamento.id}`;
  const { error: dedupeError } = await admin.from('crm_payment_events')
    .insert({ provider: 'asaas', event_id: eventId, tenant_id: tenantId, type: event });
  if (dedupeError) {
    if (dedupeError.code === '23505') return json({ received: true, duplicate: true });
    console.error('crm_payment_events insert', dedupeError);
    return json({ error: dedupeError.message }, 500);
  }
  if (!PAGOS.has(event)) return json({ received: true, ignored: event });

  try {
    let query = admin.from('crm_orders').select('id, tenant_id, deal_id, number, status').eq('tenant_id', tenantId);
    query = isUuid(pagamento.externalReference)
      ? query.eq('id', pagamento.externalReference)
      : query.eq('provider_order_id', pagamento.id).eq('payment_provider', 'asaas');
    const { data: orders, error: orderError } = await query;
    if (orderError) throw orderError;
    const order = orders?.[0];
    if (!order) {
      console.warn('aviso do Asaas sem pedido correspondente', eventId);
      return json({ received: true, order: null });
    }

    const { error: linkError } = await admin.from('crm_payment_events')
      .update({ order_id: order.id }).eq('provider', 'asaas').eq('event_id', eventId);
    if (linkError) console.error('crm_payment_events update', linkError);
    if (order.status === 'paid') return json({ received: true, already_paid: true });

    const { data: updated, error: updateError } = await admin
      .from('crm_orders')
      .update({ status: 'paid', provider_order_id: pagamento.id })
      .eq('id', order.id).eq('tenant_id', tenantId)
      .select('id');
    if (updateError) throw updateError;
    if (!updated?.length) throw new Error('pedido nao atualizado');
    return json({ received: true, paid: true });
  } catch (e) {
    // Falha transitória: solta o dedupe para o Asaas poder repetir o aviso.
    console.error('asaas-webhook', e);
    await forgetPaymentEvent(admin, 'asaas', eventId);
    return json({ error: e instanceof Error ? e.message : 'erro desconhecido' }, 500);
  }
});

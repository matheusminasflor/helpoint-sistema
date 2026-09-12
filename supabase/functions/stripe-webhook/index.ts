// Recebe os avisos do Stripe e marca o pedido do CRM como pago (ADR-006).
//
// Sem JWT (é o Stripe quem chama): a autenticidade vem da assinatura
// `stripe-signature`, conferida com o segredo do webhook DA EMPRESA
// (`tenant_payment_credentials`, CRM-2a). O Stripe pode mandar o mesmo aviso
// duas vezes ou fora de ordem — `crm_payment_events` faz o segundo cair fora. O que "pago" dispara no
// negócio (etapa Ganho, linha do tempo, aviso ao vendedor) é o trigger
// `crm_orders_on_status` (era `crm_orders_on_paid`), não este arquivo.
//
// Registrar no painel do Stripe:  https://<ref>.supabase.co/functions/v1/stripe-webhook
// Eventos: checkout.session.completed, checkout.session.async_payment_succeeded,
//          checkout.session.async_payment_failed, checkout.session.expired
import Stripe from 'npm:stripe@17';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { adminClient, getPaymentCredential } from '../_shared/payment-credentials.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const signature = req.headers.get('stripe-signature');
  if (!signature) return json({ error: 'missing signature' }, 400);
  const rawBody = await req.text();

  // CRM-2a: o segredo do webhook é da EMPRESA. O corpo ainda não está conferido,
  // então só se lê dele o `metadata.tenant_id` (gravado por stripe-create-checkout)
  // para achar o segredo — a assinatura decide se o aviso vale.
  let tenantId: string | null = null;
  try {
    const peek = JSON.parse(rawBody) as { data?: { object?: { metadata?: { tenant_id?: string } } } };
    tenantId = peek?.data?.object?.metadata?.tenant_id ?? null;
  } catch {
    return json({ error: 'corpo invalido' }, 400);
  }
  if (!tenantId) return json({ received: true, ignored: 'sem empresa nos metadados' });

  const admin = adminClient();
  const cred = await getPaymentCredential(admin, tenantId, 'stripe');
  if (!cred?.webhook_secret) return json({ error: 'stripe_not_configured' }, 503);

  const stripe = new Stripe(cred.secret_key, { apiVersion: '2024-06-20', httpClient: Stripe.createFetchHttpClient() });
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, cred.webhook_secret, undefined, Stripe.createSubtleCryptoProvider());
  } catch (e) {
    console.error('assinatura invalida', e);
    return json({ error: 'invalid signature' }, 400);
  }

  // Idempotência: o mesmo aviso só entra uma vez.
  const { error: dedupeError } = await admin.from('crm_payment_events').insert({ provider: 'stripe', event_id: event.id, tenant_id: tenantId, type: event.type });
  if (dedupeError) {
    if (dedupeError.code === '23505') return json({ received: true, duplicate: true });
    console.error('crm_payment_events insert', dedupeError);
    return json({ error: dedupeError.message }, 500);
  }

  if (!event.type.startsWith('checkout.session.')) return json({ received: true, ignored: event.type });

  const session = event.data.object as Stripe.Checkout.Session;
  const orderId = session.metadata?.order_id ?? null;
  const paymentLink = typeof session.payment_link === 'string' ? session.payment_link : session.payment_link?.id ?? null;

  // Pedido: pelo id gravado nos metadados, senão pela sessão/link gravado no pedido.
  let query = admin.from('crm_orders').select('id, tenant_id, deal_id, number, status');
  query = orderId ? query.eq('id', orderId) : query.in('stripe_session_id', [session.id, paymentLink].filter(Boolean) as string[]);
  const { data: order, error: orderError } = await query.maybeSingle();
  if (orderError) {
    console.error('order lookup', orderError);
    return json({ error: orderError.message }, 500);
  }
  if (!order) {
    console.warn('aviso sem pedido correspondente', event.type, session.id);
    return json({ received: true, order: null });
  }

  if (order.tenant_id !== tenantId) {
    // Aviso assinado com o segredo da empresa X apontando para pedido da empresa Y: não pode.
    console.warn('aviso do Stripe com empresa diferente do pedido', event.id);
    return json({ received: true, order: null });
  }
  await admin.from('crm_payment_events').update({ order_id: order.id }).eq('provider', 'stripe').eq('event_id', event.id);

  const paidNow =
    (event.type === 'checkout.session.completed' && session.payment_status === 'paid') ||
    event.type === 'checkout.session.async_payment_succeeded';

  if (paidNow) {
    if (order.status === 'paid') return json({ received: true, already_paid: true });
    const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null;
    const { data: updated, error: updateError } = await admin
      .from('crm_orders')
      .update({ status: 'paid', stripe_payment_intent: paymentIntent })
      .eq('id', order.id)
      .select('id');
    if (updateError) {
      console.error('mark paid', updateError);
      return json({ error: updateError.message }, 500);
    }
    return json({ received: true, paid: updated?.length === 1 });
  }

  if (event.type === 'checkout.session.completed') {
    // Boleto: a sessão completa antes de o dinheiro cair; o pagamento chega no async_payment_succeeded.
    await noteOnDeal(admin, order, `Pedido #${order.number}: pagamento em processamento (boleto)`);
    return json({ received: true, pending: true });
  }

  if (event.type === 'checkout.session.expired') {
    if (order.status === 'sent') {
      await admin.from('crm_orders').update({ status: 'expired' }).eq('id', order.id);
      await noteOnDeal(admin, order, `Link de pagamento do pedido #${order.number} venceu sem pagamento`);
    }
    return json({ received: true, expired: true });
  }

  if (event.type === 'checkout.session.async_payment_failed') {
    await noteOnDeal(admin, order, `Pedido #${order.number}: pagamento falhou (boleto não pago)`);
    return json({ received: true, failed: true });
  }

  return json({ received: true, ignored: event.type });
});

async function noteOnDeal(
  admin: ReturnType<typeof createClient>,
  order: { tenant_id: string; deal_id: string | null },
  content: string,
) {
  if (!order.deal_id) return;
  const { error } = await admin.from('crm_deal_activities').insert({
    tenant_id: order.tenant_id, deal_id: order.deal_id, author_id: null, kind: 'system', content,
  });
  if (error) console.error('activity insert', error);
}

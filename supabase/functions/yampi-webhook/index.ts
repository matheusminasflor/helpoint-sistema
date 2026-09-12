// Recebe os avisos da Yampi e marca o pedido do CRM como pago (CRM-2a, ADR-008).
//
// Sem JWT (é a Yampi quem chama). A URL leva `?t=<id da empresa>` — registrada
// por `payment-credentials` ao salvar as chaves — e a autenticidade vem do
// cabeçalho `X-Yampi-Hmac-SHA256` (HMAC do corpo com o segredo que a Yampi
// devolveu ao registrar o webhook, guardado por empresa). Aviso repetido cai
// fora por `crm_payment_events`; se o processamento falhar no meio, o registro
// de dedupe é desfeito e a resposta é 500 — a Yampi tenta de novo (auditoria
// de 2026-09-12). O que "pago" dispara no negócio é o trigger
// `crm_orders_on_status`, não este arquivo.
//
// Como achar o pedido do Helpoint a partir do pedido da Yampi: pelo cupom de
// uso único que o link levou (`provider_coupon_id`), que a Yampi devolve no
// pedido; sem cupom (preço igual), pelo e-mail/CPF do cliente → o link mais
// recente em aberto. ponytail: a Yampi não guarda o id do link no pedido e o
// valor não é conferido — se o casamento falhar, o aviso fica registrado e
// ninguém é marcado (`nao-funciona.md`, CRM-2a c).
import { adminClient, getPaymentCredential, yampiFetch, yampiSignature, timingSafeEqual, isUuid, forgetPaymentEvent } from '../_shared/payment-credentials.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

interface YampiOrder {
  id: number;
  number?: number;
  promocode_id?: number | null;
  promocode?: { data?: { id?: number; code?: string } };
  customer?: { data?: { email?: string; cpf?: string } };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const tenantId = new URL(req.url).searchParams.get('t');
  if (!isUuid(tenantId)) return json({ error: 'empresa nao informada' }, 400);

  const admin = adminClient();
  const cred = await getPaymentCredential(admin, tenantId, 'yampi');
  if (!cred?.webhook_secret) return json({ error: 'yampi_not_configured' }, 503);

  const rawBody = await req.text();
  const given = req.headers.get('x-yampi-hmac-sha256') ?? '';
  const expected = await yampiSignature(cred.webhook_secret, rawBody);
  if (!given || !timingSafeEqual(given, expected)) return json({ error: 'invalid signature' }, 400);

  let payload: { event?: string; resource?: YampiOrder; id?: string };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: 'corpo invalido' }, 400);
  }
  const event = payload.event ?? 'unknown';
  const resource = payload.resource;
  if (!resource?.id) return json({ received: true, ignored: 'sem pedido no aviso' });

  // Idempotência: mesmo aviso (evento + pedido da Yampi) só entra uma vez.
  const eventId = `${event}:${resource.id}`;
  const { error: dedupeError } = await admin.from('crm_payment_events').insert({ provider: 'yampi', event_id: eventId, tenant_id: tenantId, type: event });
  if (dedupeError) {
    if (dedupeError.code === '23505') return json({ received: true, duplicate: true });
    console.error('crm_payment_events insert', dedupeError);
    return json({ error: dedupeError.message }, 500);
  }
  if (event !== 'order.paid') return json({ received: true, ignored: event });

  try {
    // Casamento pelo cupom (no aviso ou consultando o pedido na Yampi).
    let couponId = resource.promocode_id ?? resource.promocode?.data?.id ?? null;
    let full: YampiOrder | null = null;
    if (!couponId) {
      full = await yampiFetch<{ data?: YampiOrder } & YampiOrder>(cred, `/orders/${resource.id}?include=promocode,customer`).then((r) => r?.data ?? r).catch(() => null);
      couponId = full?.promocode_id ?? full?.promocode?.data?.id ?? null;
    }
    let query = admin.from('crm_orders').select('id, tenant_id, deal_id, number, status').eq('tenant_id', tenantId);
    if (couponId) {
      query = query.eq('provider_coupon_id', String(couponId));
    } else {
      const customer = (full ?? resource).customer?.data;
      if (!customer?.email && !customer?.cpf) return json({ received: true, order: null, reason: 'sem cupom nem cliente para casar' });
      // Sem cupom: o link em aberto mais recente desse cliente nesta empresa.
      const { data: contacts, error: contactsError } = await admin.from('crm_contacts').select('id').eq('tenant_id', tenantId)
        .or([customer.email ? `email.ilike.${customer.email}` : '', customer.cpf ? `document.eq.${String(customer.cpf).replace(/\D/g, '')}` : ''].filter(Boolean).join(','));
      if (contactsError) throw contactsError;
      const ids = (contacts ?? []).map((c: { id: string }) => c.id);
      if (!ids.length) return json({ received: true, order: null, reason: 'cliente nao encontrado' });
      query = query.in('contact_id', ids).eq('payment_provider', 'yampi').in('status', ['sent', 'proposal_sent', 'accepted']).order('created_at', { ascending: false }).limit(1);
    }
    const { data: orders, error: orderError } = await query;
    if (orderError) throw orderError;
    const order = orders?.[0];
    if (!order) {
      console.warn('aviso da Yampi sem pedido correspondente', eventId);
      return json({ received: true, order: null });
    }

    const { error: linkError } = await admin.from('crm_payment_events').update({ order_id: order.id }).eq('provider', 'yampi').eq('event_id', eventId);
    if (linkError) console.error('crm_payment_events update', linkError);
    if (order.status === 'paid') return json({ received: true, already_paid: true });

    const { data: updated, error: updateError } = await admin
      .from('crm_orders')
      .update({ status: 'paid', provider_order_id: String(resource.id) })
      .eq('id', order.id)
      .select('id');
    if (updateError) throw updateError;
    if (!updated?.length) throw new Error('pedido nao atualizado');
    return json({ received: true, paid: true });
  } catch (e) {
    // Falha transitória: solta o dedupe para a Yampi poder repetir o aviso.
    console.error('yampi-webhook', e);
    await forgetPaymentEvent(admin, 'yampi', eventId);
    return json({ error: e instanceof Error ? e.message : 'erro desconhecido' }, 500);
  }
});

// Gera o link de pagamento de um pedido do CRM (ADR-006).
//
// Chamada pelo front com o JWT do vendedor: a leitura do pedido passa pela RLS
// (quem não tem o módulo Comercial não vê o pedido e recebe 404). A escrita de
// volta no pedido usa a service role, porque grava colunas que o vendedor não
// deve editar à mão (link, sessão do Stripe, status).
//
//   kind = 'temporary' → Checkout Session com validade de 1 a 24 h (o Stripe
//                        aceita de 30 min a 24 h); vence sozinha.
//   kind = 'permanent' → Payment Link, que vale até ser desativado.
//
// Sem STRIPE_SECRET_KEY nos segredos da função, responde 503
// `stripe_not_configured` — o front mostra "Pagamento ainda não configurado".
// Hoje é uma conta Stripe só (a do dono do sistema); Stripe Connect por
// empresa entra quando houver o segundo cliente que venda (ADR-006).
import Stripe from 'npm:stripe@17';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

interface OrderItem { description: string; quantity: number; unit_price: number }
interface Order {
  id: string;
  tenant_id: string;
  number: number;
  total: number;
  discount: number;
  status: string;
  deal_id: string | null;
  contact: { name: string; email: string | null } | null;
  items: OrderItem[];
}

const toCents = (n: number) => Math.round(Number(n) * 100);

// O Stripe só aceita quantidade inteira por linha. Com quantidade fracionada
// (2,5 kg) ou desconto, o pedido vira uma linha só, pelo total.
function buildLineItems(order: Order) {
  const itemized = order.discount === 0 && order.items.every((i) => Number.isInteger(Number(i.quantity)));
  if (itemized) {
    return order.items.map((i) => ({
      quantity: Number(i.quantity),
      price_data: { currency: 'brl', unit_amount: toCents(i.unit_price), product_data: { name: i.description } },
    }));
  }
  return [{
    quantity: 1,
    price_data: {
      currency: 'brl',
      unit_amount: toCents(order.total),
      product_data: { name: `Pedido #${order.number} — ${order.items.length} item(ns)` },
    },
  }];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) return json({ error: 'stripe_not_configured' }, 503);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'unauthorized' }, 401);

  try {
    const body = await req.json() as { order_id?: string; kind?: string; expires_in_hours?: number };
    const kind = body.kind === 'permanent' ? 'permanent' : 'temporary';
    const hours = Math.min(24, Math.max(1, Number(body.expires_in_hours ?? 24)));
    if (!body.order_id) return json({ error: 'order_id obrigatorio' }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } },
    });

    const { data: order, error: orderError } = await userClient
      .from('crm_orders')
      .select('id, tenant_id, number, total, discount, status, deal_id, contact:crm_contacts(name, email), items:crm_order_items(description, quantity, unit_price)')
      .eq('id', body.order_id)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return json({ error: 'pedido nao encontrado' }, 404);

    const typed = order as unknown as Order;
    if (typed.status === 'paid') return json({ error: 'pedido ja pago' }, 409);
    if (typed.status === 'cancelled') return json({ error: 'pedido cancelado' }, 409);
    if (!typed.items.length || Number(typed.total) <= 0) return json({ error: 'pedido sem itens ou com total zero' }, 400);

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20', httpClient: Stripe.createFetchHttpClient() });
    const origin = req.headers.get('origin') ?? Deno.env.get('APP_URL') ?? supabaseUrl;
    const successUrl = `${origin}/pagamento/obrigado?pedido=${typed.number}`;
    const cancelUrl = `${origin}/pagamento/cancelado?pedido=${typed.number}`;
    const metadata = { order_id: typed.id, tenant_id: typed.tenant_id, order_number: String(typed.number) };
    const lineItems = buildLineItems(typed);

    let url: string;
    let stripeId: string;
    let expiresAt: string | null = null;

    if (kind === 'temporary') {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: lineItems,
        expires_at: Math.floor(Date.now() / 1000) + hours * 3600,
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer_email: typed.contact?.email ?? undefined,
        metadata,
        payment_intent_data: { metadata },
      });
      if (!session.url) throw new Error('Stripe nao devolveu a URL do checkout');
      url = session.url;
      stripeId = session.id;
      expiresAt = new Date(session.expires_at * 1000).toISOString();
    } else {
      const prices = await Promise.all(lineItems.map((li) =>
        stripe.prices.create({
          currency: 'brl',
          unit_amount: li.price_data.unit_amount,
          product_data: { name: li.price_data.product_data.name },
        }),
      ));
      const link = await stripe.paymentLinks.create({
        line_items: prices.map((p, i) => ({ price: p.id, quantity: lineItems[i].quantity })),
        metadata,
        after_completion: { type: 'redirect', redirect: { url: successUrl } },
      });
      url = link.url;
      stripeId = link.id;
    }

    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: updated, error: updateError } = await admin
      .from('crm_orders')
      // CRM-1c: proposta enviada/aceita não volta a "link enviado" — o link só se soma ao pedido.
      .update({ link_kind: kind, link_url: url, link_expires_at: expiresAt, stripe_session_id: stripeId, ...(typed.status === 'draft' ? { status: 'sent' } : {}) })
      .eq('id', typed.id)
      .select('id');
    if (updateError) throw updateError;
    if (!updated?.length) throw new Error('pedido nao atualizado');

    if (typed.deal_id) {
      const { error: activityError } = await admin.from('crm_deal_activities').insert({
        tenant_id: typed.tenant_id,
        deal_id: typed.deal_id,
        author_id: null,
        kind: 'order',
        content: kind === 'temporary'
          ? `Link de pagamento do pedido #${typed.number} gerado (vale ${hours} h)`
          : `Link de pagamento definitivo do pedido #${typed.number} gerado`,
        meta: { order_id: typed.id, kind, url },
      });
      if (activityError) console.error('activity insert failed', activityError);
    }

    return json({ url, expires_at: expiresAt, kind });
  } catch (e) {
    console.error('stripe-create-checkout', e);
    return json({ error: e instanceof Error ? e.message : 'erro desconhecido' }, 500);
  }
});

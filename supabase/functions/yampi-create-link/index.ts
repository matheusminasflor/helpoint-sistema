// Gera o link de pagamento de um pedido do CRM na Yampi (CRM-2a, ADR-008).
//
// Chamada pelo front com o JWT do vendedor (a leitura do pedido passa pela
// RLS); a escrita de volta usa service_role. A Yampi monta o link com SKUs
// dela (quantidade) e um cupom — ela **não aceita preço por item**, então o
// preço da tabela do Helpoint vira um cupom de valor fixo, de uso único, com
// a validade da proposta: valor = (preço Yampi × qtd) − (total dos itens no
// Helpoint) + desconto do Helpoint. Se o nosso preço for MAIOR que o da
// Yampi, não há cupom que suba preço: o link sai pelo preço da Yampi e a
// resposta avisa.
//
// Frete é da Yampi (CEP no checkout); o frete digitado no Helpoint não vai.
//
// POST { order_id }  → { url, coupon?, warning? }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { adminClient, getPaymentCredential, yampiFetch } from '../_shared/payment-credentials.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

interface Item { product_id: string | null; description: string; quantity: number; unit_price: number }
interface Product { id: string; sku: string | null; name: string; yampi_sku_id: string | null }
interface YampiSku { id: number; sku: string | null; title: string; price_sale: number; price_discount: number | null }

/** Código do cupom: curto, único por link, sem parecer um cupom de campanha. */
export function couponCode(orderNumber: number): string {
  const rand = crypto.getRandomValues(new Uint8Array(4));
  const tail = Array.from(rand, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `HP${orderNumber}-${tail}`;
}

/** Percorre os SKUs da loja até achar os códigos pedidos (a API não filtra por código). */
async function findSkus(cred: Parameters<typeof yampiFetch>[0], codes: Set<string>): Promise<Map<string, YampiSku>> {
  const found = new Map<string, YampiSku>();
  for (let page = 1; page <= 50 && found.size < codes.size; page++) {
    const res = await yampiFetch<{ data: YampiSku[]; meta?: { pagination?: { total_pages?: number } } }>(cred, `/catalog/skus?limit=100&page=${page}`);
    for (const s of res.data ?? []) if (s.sku && codes.has(s.sku)) found.set(s.sku, s);
    if (!res.data?.length || (res.meta?.pagination?.total_pages ?? page) <= page) break;
  }
  return found;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'unauthorized' }, 401);

  try {
    const body = (await req.json()) as { order_id?: string };
    if (!body.order_id) return json({ error: 'order_id obrigatorio' }, 400);

    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
    const { data: order, error: orderError } = await userClient
      .from('crm_orders')
      .select('id, tenant_id, number, subtotal, discount, shipping, total, status, deal_id, proposal_valid_until, contact:crm_contacts(name, email, document), items:crm_order_items(product_id, description, quantity, unit_price)')
      .eq('id', body.order_id)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return json({ error: 'pedido nao encontrado' }, 404);
    const o = order as unknown as { id: string; tenant_id: string; number: number; subtotal: number; discount: number; shipping: number; total: number; status: string; deal_id: string | null; proposal_valid_until: string | null; items: Item[] };
    if (o.status === 'paid') return json({ error: 'pedido ja pago' }, 409);
    if (o.status === 'cancelled') return json({ error: 'pedido cancelado' }, 409);
    if (!o.items.length) return json({ error: 'pedido sem itens' }, 400);
    // O cupom vence com a proposta; proposta vencida daria um cupom já morto e o cliente pagaria o preço da loja sem aviso.
    const todayBR = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    if (o.proposal_valid_until && o.proposal_valid_until < todayBR) {
      return json({ error: `a proposta venceu em ${o.proposal_valid_until.split('-').reverse().join('/')}; renove a validade do pedido antes de gerar o link` }, 409);
    }

    const admin = adminClient();
    const cred = await getPaymentCredential(admin, o.tenant_id, 'yampi');
    if (!cred) return json({ error: 'yampi_not_configured' }, 503);

    // Produto → SKU da Yampi, pelo código `sku` (guardado depois para não procurar de novo).
    const productIds = o.items.map((i) => i.product_id).filter((x): x is string => !!x);
    if (productIds.length !== o.items.length) return json({ error: 'todo item precisa ser um produto do catálogo (com SKU) para o link da Yampi' }, 400);
    const { data: products, error: productsError } = await admin.from('crm_products').select('id, sku, name, yampi_sku_id').in('id', productIds);
    if (productsError) throw productsError;
    const byId = new Map((products as Product[]).map((p) => [p.id, p]));
    const missingSku = (products as Product[]).filter((p) => !p.sku && !p.yampi_sku_id).map((p) => p.name);
    if (missingSku.length) return json({ error: `produto sem código SKU: ${missingSku.join(', ')}. Cadastre o mesmo SKU da Yampi em Comercial → Produtos.` }, 400);

    const toResolve = new Set((products as Product[]).filter((p) => !p.yampi_sku_id).map((p) => p.sku!));
    const resolved = toResolve.size ? await findSkus(cred, toResolve) : new Map<string, YampiSku>();
    const notFound = [...toResolve].filter((code) => !resolved.has(code));
    if (notFound.length) return json({ error: `SKU não existe na Yampi: ${notFound.join(', ')}` }, 400);
    for (const p of products as Product[]) {
      if (!p.yampi_sku_id && p.sku && resolved.has(p.sku)) {
        p.yampi_sku_id = String(resolved.get(p.sku)!.id);
        const { data: saved, error } = await admin.from('crm_products').update({ yampi_sku_id: p.yampi_sku_id }).eq('id', p.id).select('id');
        if (error || !saved?.length) console.warn('yampi_sku_id nao gravado (o link sai mesmo assim; da proxima vez procura de novo)', error);
      }
    }

    // Preço da Yampi por SKU (para o cupom): dos recém-achados, ou consultando os já conhecidos.
    const yampiPrice = new Map<string, number>();
    for (const s of resolved.values()) yampiPrice.set(String(s.id), Number(s.price_discount && s.price_discount > 0 ? s.price_discount : s.price_sale));
    for (const p of products as Product[]) {
      if (p.yampi_sku_id && !yampiPrice.has(p.yampi_sku_id)) {
        const s = await yampiFetch<{ data: YampiSku }>(cred, `/catalog/skus/${p.yampi_sku_id}`);
        yampiPrice.set(p.yampi_sku_id, Number(s.data.price_discount && s.data.price_discount > 0 ? s.data.price_discount : s.data.price_sale));
      }
    }

    let yampiSubtotal = 0;
    let ourItems = 0;
    const skus = o.items.map((i) => {
      const p = byId.get(i.product_id!)!;
      yampiSubtotal += (yampiPrice.get(p.yampi_sku_id!) ?? 0) * Number(i.quantity);
      ourItems += Number(i.unit_price) * Number(i.quantity);
      return { id: Number(p.yampi_sku_id), quantity: Number(i.quantity) };
    });
    const couponValue = Math.round((yampiSubtotal - ourItems + Number(o.discount)) * 100) / 100;

    let promocodeId: number | undefined;
    let code: string | undefined;
    let warning: string | undefined;
    if (couponValue > 0) {
      code = couponCode(o.number);
      const endAt = o.proposal_valid_until ? `${o.proposal_valid_until} 23:59:59` : undefined;
      const promo = await yampiFetch<{ data?: { id: number }; id?: number }>(cred, '/pricing/promocodes', {
        method: 'POST',
        body: JSON.stringify({ code, discount_type: 'v', value: couponValue, quantity: 1, once_per_customer: true, active: true, accumulate: false, ...(endAt ? { end_at: endAt } : {}) }),
      });
      promocodeId = promo?.data?.id ?? promo?.id;
      if (!promocodeId) throw new Error('a Yampi não devolveu o cupom');
    } else if (couponValue < 0) {
      warning = `O preço no Helpoint (R$ ${ourItems.toFixed(2)}) é maior que o da Yampi (R$ ${yampiSubtotal.toFixed(2)}): o link sai pelo preço da Yampi.`;
    }
    if (Number(o.shipping) > 0) warning = `${warning ? warning + ' ' : ''}O frete do pedido (R$ ${Number(o.shipping).toFixed(2)}) não vai no link: a Yampi calcula o frete pelo CEP.`;

    const link = await yampiFetch<{ data?: { id: number; link_url: string }; id?: number; link_url?: string }>(cred, '/checkout/payment-link', {
      method: 'POST',
      body: JSON.stringify({ name: `Helpoint pedido #${o.number}`, active: true, skus, ...(promocodeId ? { promocode_id: promocodeId } : {}) }),
    });
    const created = link?.data ?? link;
    if (!created?.link_url) throw new Error('a Yampi não devolveu a URL do link');

    const { data: updated, error: updateError } = await admin
      .from('crm_orders')
      .update({
        payment_provider: 'yampi', link_kind: 'permanent', link_url: created.link_url, link_expires_at: null,
        provider_link_id: String(created.id), provider_coupon_id: promocodeId ? String(promocodeId) : null,
        ...(o.status === 'draft' ? { status: 'sent' } : {}),
      })
      .eq('id', o.id)
      .select('id');
    if (updateError) throw updateError;
    if (!updated?.length) throw new Error('pedido nao atualizado');

    if (o.deal_id) {
      const { error: activityError } = await admin.from('crm_deal_activities').insert({
        tenant_id: o.tenant_id, deal_id: o.deal_id, author_id: null, kind: 'order',
        content: `Link de pagamento (Yampi) do pedido #${o.number} gerado${code ? ` — cupom ${code} de R$ ${couponValue.toFixed(2)}` : ''}`,
        meta: { order_id: o.id, provider: 'yampi', url: created.link_url, coupon: code ?? null },
      });
      if (activityError) console.error('activity insert failed', activityError);
    }

    return json({ url: created.link_url, coupon: code ?? null, warning: warning ?? null });
  } catch (e) {
    console.error('yampi-create-link', e);
    return json({ error: e instanceof Error ? e.message : 'erro desconhecido' }, 500);
  }
});

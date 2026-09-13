// Gera a cobrança de um pedido do CRM no Asaas (ENC-2, ADR-009).
//
// É o encaixe "cobrar" do caminho nativo: uma conexão só cobra por Pix, boleto
// e cartão, e o **link de pagamento é a própria resposta da cobrança**
// (`invoiceUrl`) — não há um segundo pedido para "criar link".
//
// Diferente da Yampi, o Asaas cobra o valor exato que mandamos: não existe
// catálogo, SKU nem cupom para acertar preço. O total do pedido no Helpoint é o
// total cobrado, frete incluído.
//
// Chamada pelo front com o JWT do vendedor (a leitura do pedido passa pela
// RLS); a escrita de volta usa service_role.
//
// POST { order_id, method?, due_in_days? } → { url, payment_id, method, due_date }
//   method: 'undefined' (o cliente escolhe, padrão) | 'pix' | 'boleto' | 'credit_card'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { adminClient, getPaymentCredential, asaasFetch } from '../_shared/payment-credentials.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/** O que a tela manda → o que o Asaas espera. */
const BILLING: Record<string, string> = {
  undefined: 'UNDEFINED', pix: 'PIX', boleto: 'BOLETO', credit_card: 'CREDIT_CARD',
};

interface Contact {
  id: string; name: string; email: string | null; phone: string | null; whatsapp: string | null;
  document: string | null; asaas_customer_id: string | null;
  zip_code: string | null; street: string | null; street_number: string | null;
  complement: string | null; district: string | null;
}
interface Order {
  id: string; tenant_id: string; number: number; total: number; status: string; deal_id: string | null;
  payment_provider: string | null; provider_order_id: string | null; link_url: string | null;
  contact: Contact | null;
  items: { description: string; quantity: number }[];
}

const digits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');
/** Hoje no Brasil, não no servidor (regra 4 das cinco). */
const hojeBR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'unauthorized' }, 401);

  try {
    const body = (await req.json().catch(() => ({}))) as { order_id?: string; method?: string; due_in_days?: number };
    if (!body.order_id) return json({ error: 'order_id obrigatorio' }, 400);
    const metodo = String(body.method ?? 'undefined');
    if (!BILLING[metodo]) return json({ error: 'forma de pagamento desconhecida' }, 400);
    const prazo = Math.min(Math.max(Number(body.due_in_days ?? 3) || 3, 0), 365);

    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
    const { data: order, error: orderError } = await userClient
      .from('crm_orders')
      .select('id, tenant_id, number, total, status, deal_id, payment_provider, provider_order_id, link_url, contact:crm_contacts(id, name, email, phone, whatsapp, document, asaas_customer_id, zip_code, street, street_number, complement, district), items:crm_order_items(description, quantity)')
      .eq('id', body.order_id)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return json({ error: 'pedido nao encontrado' }, 404);
    const o = order as unknown as Order;
    if (o.status === 'paid') return json({ error: 'pedido ja pago' }, 409);
    if (o.status === 'cancelled') return json({ error: 'pedido cancelado' }, 409);
    if (!o.items.length) return json({ error: 'pedido sem itens' }, 400);
    if (Number(o.total) <= 0) return json({ error: 'o pedido soma zero; nao ha o que cobrar' }, 400);

    const admin = adminClient();
    const cred = await getPaymentCredential(admin, o.tenant_id, 'asaas');
    if (!cred) {
      return json({ error: 'asaas_not_configured', message: 'Ligue o Asaas em Configurações do CRM → Pagamento.' }, 409);
    }

    // Cobrança já criada para este pedido: devolve a mesma, sem cobrar de novo.
    if (o.payment_provider === 'asaas' && o.provider_order_id) {
      const atual = await asaasFetch<{ invoiceUrl?: string; status?: string; billingType?: string; dueDate?: string }>(
        cred, `/payments/${o.provider_order_id}`,
      ).catch(() => null);
      if (atual?.invoiceUrl) {
        return json({
          url: atual.invoiceUrl, payment_id: o.provider_order_id, method: metodo,
          due_date: atual.dueDate ?? null, reaproveitada: true,
        });
      }
      // A cobrança sumiu do Asaas (apagada por lá): segue e cria outra.
    }

    const contact = o.contact;
    if (!contact) return json({ error: 'pedido sem cliente' }, 409);
    if (!digits(contact.document)) {
      return json({
        error: 'cliente_sem_documento',
        message: `O Asaas exige CPF ou CNPJ do cliente. Preencha no cadastro de ${contact.name}.`,
      }, 409);
    }

    // Cliente no Asaas: nasce uma vez e fica guardado no contato.
    let customerId = contact.asaas_customer_id;
    if (!customerId) {
      const criado = await asaasFetch<{ id?: string }>(cred, '/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: contact.name,
          cpfCnpj: digits(contact.document),
          email: contact.email ?? undefined,
          mobilePhone: digits(contact.whatsapp) || undefined,
          phone: digits(contact.phone) || undefined,
          postalCode: digits(contact.zip_code) || undefined,
          address: contact.street ?? undefined,
          addressNumber: contact.street_number ?? undefined,
          complement: contact.complement ?? undefined,
          province: contact.district ?? undefined,
          externalReference: contact.id,
        }),
      });
      if (!criado?.id) throw new Error('o Asaas não devolveu o cliente');
      customerId = criado.id;
      const { data: gravado, error: contatoError } = await admin
        .from('crm_contacts').update({ asaas_customer_id: customerId })
        .eq('id', contact.id).eq('tenant_id', o.tenant_id).select('id');
      if (contatoError) throw contatoError;
      if (!gravado?.length) throw new Error('cliente do Asaas não gravado no contato');
    }

    const vencimento = new Date(`${hojeBR()}T12:00:00Z`);
    vencimento.setUTCDate(vencimento.getUTCDate() + prazo);
    const dueDate = vencimento.toISOString().slice(0, 10);

    const cobranca = await asaasFetch<{ id?: string; invoiceUrl?: string; status?: string }>(cred, '/payments', {
      method: 'POST',
      body: JSON.stringify({
        customer: customerId,
        billingType: BILLING[metodo],
        value: Number(o.total),
        dueDate,
        externalReference: o.id,
        description: `Pedido #${o.number} — ${o.items.map((i) => `${Number(i.quantity)}× ${i.description}`).join(', ')}`.slice(0, 500),
      }),
    });
    if (!cobranca?.id || !cobranca?.invoiceUrl) throw new Error('o Asaas não devolveu a cobrança');

    const { data: updated, error: updateError } = await admin
      .from('crm_orders')
      .update({
        payment_provider: 'asaas', link_kind: 'permanent', link_url: cobranca.invoiceUrl, link_expires_at: null,
        provider_order_id: cobranca.id, payment_method: metodo, payment_due_date: dueDate,
        ...(o.status === 'draft' ? { status: 'sent' } : {}),
      })
      .eq('id', o.id).eq('tenant_id', o.tenant_id)
      .select('id');
    if (updateError) throw updateError;
    if (!updated?.length) throw new Error('pedido nao atualizado');

    if (o.deal_id) {
      const { error: activityError } = await admin.from('crm_deal_activities').insert({
        tenant_id: o.tenant_id, deal_id: o.deal_id, author_id: null, kind: 'order',
        content: `Cobrança (Asaas) do pedido #${o.number} gerada — R$ ${Number(o.total).toFixed(2)}, vence em ${dueDate.split('-').reverse().join('/')}`,
        meta: { order_id: o.id, provider: 'asaas', url: cobranca.invoiceUrl, payment_id: cobranca.id },
      });
      if (activityError) console.error('activity insert failed', activityError);
    }

    return json({ url: cobranca.invoiceUrl, payment_id: cobranca.id, method: metodo, due_date: dueDate });
  } catch (e) {
    console.error('asaas-charge', e);
    return json({ error: e instanceof Error ? e.message : 'erro desconhecido' }, 500);
  }
});

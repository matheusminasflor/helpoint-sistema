// Simula um aviso da Yampi (`order.paid`) contra a edge function `yampi-webhook`
// do projeto de teste, assinando o corpo como a Yampi faz (HMAC-SHA256 em
// base64 no cabeçalho X-Yampi-Hmac-SHA256). Serve para provar o caminho
// "aviso → pedido pago" sem uma loja real: a credencial da empresa precisa
// existir em `tenant_payment_credentials` com este mesmo `webhook_secret`.
//
// Uso: node scripts/yampi-webhook-simular.mjs <tenant_id> <webhook_secret> <coupon_id> [resource_id] [event]
// `coupon_id` é o id numérico do cupom na Yampi — o que `crm_orders.provider_coupon_id` guarda.
// Nada aqui é segredo de verdade: o segredo é o de teste que você mesmo gravou.
import { createHmac } from 'node:crypto';

const [tenantId, secret, coupon, resourceId = String(Date.now()), event = 'order.paid'] = process.argv.slice(2);
if (!tenantId || !secret || !coupon) {
  console.error('uso: node scripts/yampi-webhook-simular.mjs <tenant_id> <webhook_secret> <coupon_id> [resource_id] [event]');
  process.exit(1);
}
const url = `https://gmvvxulubthkagmsngas.supabase.co/functions/v1/yampi-webhook?t=${tenantId}`;
const body = JSON.stringify({
  event,
  time: new Date().toISOString(),
  merchant: { alias: 'loja-de-teste' },
  resource: {
    id: Number(resourceId),
    number: Number(resourceId),
    status: { data: { alias: 'paid', name: 'Pago' } },
    promocode_id: Number(coupon),
    promocode: { data: { id: Number(coupon), code: `HP-TESTE-${coupon}` } },
    customer: { data: { email: 'cliente@exemplo.com', cpf: '' } },
    value_total: 85,
  },
});
const signature = createHmac('sha256', secret).update(body).digest('base64');
const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Yampi-Hmac-SHA256': signature }, body });
console.log(res.status, await res.text());

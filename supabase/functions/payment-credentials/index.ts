// Chaves de pagamento da empresa (CRM-2a, ADR-008) — molde de `ai-credentials`.
// A chave só entra por aqui e nunca sai: as respostas devolvem provedor, padrão,
// alias e os 4 últimos caracteres. Só owner/admin escreve; quem tem o Comercial
// lê o status pela função `crm_payment_providers()` no banco.
//
// POST { action: 'test' | 'save' | 'delete' | 'set_default', provider, ...campos }
//   yampi:  alias, user_token, secret_key
//   stripe: secret_key, webhook_secret
//   asaas:  secret_key
// `save` testa a chave antes de gravar, e registra o aviso de pagamento no
// provedor — ninguém precisa cadastrar endereço nem token no painel deles.
// Na Yampi o webhook é `order.paid` apontando para …/yampi-webhook?t=<empresa>,
// e o segredo de conferência é o que ela devolve. No Asaas o segredo é sorteado
// aqui e vai no `authToken` do `POST /webhooks`: o token nunca passa pela tela.
// Nos dois, remover o provedor remove o webhook lá. A primeira conexão de
// pagamento da empresa vira a padrão sozinha.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { adminClient, getPaymentCredential, yampiFetch, asaasFetch, type PaymentProvider } from '../_shared/payment-credentials.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const PROVIDERS: PaymentProvider[] = ['stripe', 'yampi', 'asaas'];
const YAMPI_EVENTS = ['order.paid']; // o webhook só age no "pago"; outros eventos só gerariam linhas de dedupe
// Asaas: o que marca pago, mais estorno e chargeback — que hoje só ficam
// registrados em `crm_payment_events` (desfazer a venda é decisão do dono,
// registrada como ressalva em `docs/nao-funciona.md`).
const ASAAS_EVENTS = [
  'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_RECEIVED_IN_CASH_UNDONE',
  'PAYMENT_REFUNDED', 'PAYMENT_PARTIALLY_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED',
];

async function testYampi(cred: { alias: string; secret_key: string; secret_key_2: string }) {
  try {
    await yampiFetch(cred, '/webhooks?limit=1');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'falha de rede' };
  }
}

async function testAsaas(secretKey: string) {
  try {
    // Uma listagem vazia já prova a chave: 401 se não valer.
    await asaasFetch({ secret_key: secretKey }, '/customers?limit=1');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'falha de rede' };
  }
}

/** Token do aviso do Asaas: 43 caracteres de base64url sorteados (eles exigem de 32 a 255). */
function sortearToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Primeira conexão de pagamento da empresa vira a padrão sozinha. Sem isto
 * ninguém nunca é padrão, e a tela do pedido escolhe pelo primeiro da lista —
 * que não tem ordem garantida.
 */
async function primeiroProvedor(admin: ReturnType<typeof adminClient>, tenantId: string): Promise<boolean> {
  const { count, error } = await admin
    .from('tenant_payment_credentials')
    .select('tenant_id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  if (error) throw error;
  return (count ?? 0) === 0;
}

async function testStripe(secretKey: string) {
  try {
    const res = await fetch('https://api.stripe.com/v1/balance', { headers: { Authorization: `Bearer ${secretKey}` } });
    if (res.ok) return { ok: true };
    const t = await res.text();
    return { ok: false, error: `Stripe ${res.status}: ${t.slice(0, 200)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'falha de rede' };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);
    const userId = userData.user.id;

    const admin = adminClient();
    const { data: profile, error: profileError } = await admin.from('profiles').select('tenant_id').eq('id', userId).maybeSingle();
    if (profileError) throw profileError;
    const tenantId = profile?.tenant_id as string | undefined;
    if (!tenantId) return json({ error: 'no_tenant' }, 403);

    const { data: isAdmin, error: adminError } = await admin.rpc('is_admin_or_higher', { _user_id: userId });
    if (adminError) throw adminError;
    if (!isAdmin) return json({ error: 'forbidden' }, 403);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? '');
    const provider = body.provider as PaymentProvider;
    if (!PROVIDERS.includes(provider)) return json({ error: 'invalid_provider' }, 400);
    const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() : '');

    if (action === 'delete') {
      const cred = await getPaymentCredential(admin, tenantId, provider);
      // Tira o webhook do provedor para ele parar de chamar um endereço que não o reconhece mais.
      if (cred?.provider === 'yampi' && cred.webhook_id) {
        await yampiFetch(cred, `/webhooks/${cred.webhook_id}`, { method: 'DELETE' }).catch((e) => console.warn('yampi webhook delete', e));
      }
      if (cred?.provider === 'asaas' && cred.webhook_id) {
        await asaasFetch(cred, `/webhooks/${cred.webhook_id}`, { method: 'DELETE' }).catch((e) => console.warn('asaas webhook delete', e));
      }
      const { data, error } = await admin.from('tenant_payment_credentials').delete().eq('tenant_id', tenantId).eq('provider', provider).select('id');
      if (error) throw error;
      return json({ ok: true, removido: !!data?.length });
    }

    if (action === 'set_default') {
      const { data, error } = await admin.from('tenant_payment_credentials').update({ is_default: true }).eq('tenant_id', tenantId).eq('provider', provider).select('id');
      if (error) throw error;
      if (!data?.length) return json({ error: 'provedor não configurado' }, 400);
      return json({ ok: true });
    }

    if (action === 'test' || action === 'save') {
      if (provider === 'yampi') {
        const saved = await getPaymentCredential(admin, tenantId, 'yampi');
        const alias = str('alias') || saved?.alias || '';
        const userToken = str('user_token') || saved?.secret_key_2 || '';
        const secretKey = str('secret_key') || saved?.secret_key || '';
        if (!alias || !userToken || !secretKey) return json({ ok: false, error: 'Informe alias, User-Token e User-Secret-Key.' });
        const cred = { alias, secret_key: secretKey, secret_key_2: userToken };
        const test = await testYampi(cred);
        if (action === 'test' || !test.ok) return json(test);

        // Registra (ou renova) o webhook da Yampi para esta empresa.
        const webhookUrl = `${supabaseUrl}/functions/v1/yampi-webhook?t=${tenantId}`;
        if (saved?.webhook_id) {
          await yampiFetch(cred, `/webhooks/${saved.webhook_id}`, { method: 'DELETE' }).catch((e) => console.warn('yampi webhook delete', e));
        }
        const hook = await yampiFetch<{ data?: { id: number; secret_key: string }; id?: number; secret_key?: string }>(cred, '/webhooks', {
          method: 'POST',
          body: JSON.stringify({ name: 'Helpoint', url: webhookUrl, events: YAMPI_EVENTS, active: true }),
        });
        const created = hook?.data ?? hook;
        if (!created?.id || !created?.secret_key) throw new Error('a Yampi não devolveu o webhook registrado');

        const row = {
          tenant_id: tenantId, provider: 'yampi', alias, key_last4: secretKey.slice(-4),
          secret_key: secretKey, secret_key_2: userToken, webhook_secret: created.secret_key, webhook_id: String(created.id),
          created_by: userId, is_default: saved?.is_default ?? (await primeiroProvedor(admin, tenantId)),
        };
        const { error } = await admin.from('tenant_payment_credentials').upsert(row, { onConflict: 'tenant_id,provider' });
        if (error) throw error;
        return json({ ok: true, key_last4: row.key_last4, webhook_url: webhookUrl });
      }

      if (provider === 'asaas') {
        const saved = await getPaymentCredential(admin, tenantId, 'asaas');
        const secretKey = str('secret_key') || saved?.secret_key || '';
        if (!secretKey) return json({ ok: false, error: 'Informe a chave de API do Asaas.' });
        const cred = { secret_key: secretKey };
        const test = await testAsaas(secretKey);
        if (action === 'test' || !test.ok) return json(test);

        // Registra (ou renova) o aviso de pagamento no Asaas, como se faz na
        // Yampi. O token é sorteado aqui e vai no `authToken`: nunca passa pela
        // tela, e ninguém precisa cadastrar nada no painel deles à mão.
        const webhookUrl = `${supabaseUrl}/functions/v1/asaas-webhook?t=${tenantId}`;
        if (saved?.webhook_id) {
          await asaasFetch(cred, `/webhooks/${saved.webhook_id}`, { method: 'DELETE' }).catch((e) => console.warn('asaas webhook delete', e));
        }
        const webhookSecret = sortearToken();
        const hook = await asaasFetch<{ id?: string }>(cred, '/webhooks', {
          method: 'POST',
          body: JSON.stringify({
            name: 'Helpoint', url: webhookUrl, email: userData.user.email,
            enabled: true, interrupted: false, apiVersion: 3,
            authToken: webhookSecret,
            // SEQUENTIALLY: o Asaas só manda o próximo aviso depois do 200 do
            // anterior, então a ordem dos eventos do mesmo pedido é preservada.
            sendType: 'SEQUENTIALLY',
            events: ASAAS_EVENTS,
          }),
        });
        if (!hook?.id) throw new Error('o Asaas não devolveu o aviso registrado');

        const row = {
          tenant_id: tenantId, provider: 'asaas', alias: null, key_last4: secretKey.slice(-4),
          secret_key: secretKey, secret_key_2: null, webhook_secret: webhookSecret, webhook_id: String(hook.id),
          created_by: userId, is_default: saved?.is_default ?? (await primeiroProvedor(admin, tenantId)),
        };
        const { data, error } = await admin.from('tenant_payment_credentials').upsert(row, { onConflict: 'tenant_id,provider' }).select('id');
        if (error) throw error;
        if (!data?.length) throw new Error('credencial do Asaas não gravada');
        return json({ ok: true, key_last4: row.key_last4, webhook_url: webhookUrl });
      }

      // stripe
      const saved = await getPaymentCredential(admin, tenantId, 'stripe');
      const secretKey = str('secret_key') || saved?.secret_key || '';
      const webhookSecret = str('webhook_secret') || saved?.webhook_secret || '';
      if (!secretKey) return json({ ok: false, error: 'Informe a chave secreta do Stripe.' });
      const test = await testStripe(secretKey);
      if (action === 'test' || !test.ok) return json(test);
      if (!webhookSecret) return json({ ok: false, error: 'Informe o segredo do webhook (whsec_…), registrado no painel do Stripe.' });
      const row = {
        tenant_id: tenantId, provider: 'stripe', alias: null, key_last4: secretKey.slice(-4),
        secret_key: secretKey, secret_key_2: null, webhook_secret: webhookSecret, webhook_id: null,
        created_by: userId, is_default: saved?.is_default ?? (await primeiroProvedor(admin, tenantId)),
      };
      const { error } = await admin.from('tenant_payment_credentials').upsert(row, { onConflict: 'tenant_id,provider' });
      if (error) throw error;
      return json({ ok: true, key_last4: row.key_last4, webhook_url: `${supabaseUrl}/functions/v1/stripe-webhook` });
    }

    return json({ error: 'invalid_action' }, 400);
  } catch (e) {
    console.error('payment-credentials', e);
    return json({ error: e instanceof Error ? e.message : 'erro desconhecido' }, 500);
  }
});

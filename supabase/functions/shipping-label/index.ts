// O encaixe "etiquetar" (ENC-1, ADR-009): a etiqueta que a Expedição imprime.
//
// De onde ela vem é escolha da empresa (`tenants.settings.expedicao.label_provider`):
//   bling    — `GET /logisticas/etiquetas?formato=PDF&idsVendas[]=` devolve o link
//   yampi    — o pedido guarda as etiquetas em `/orders/{id}?include=labels`
//   correios — o Helpoint faz a pré-postagem com o contrato da empresa e traz o PDF
//
// POST { action }  (JWT):
//   save | test | delete   credenciais dos Correios (só owner/admin)
//   provider   { provider }  qual conector usar (só owner/admin)
//   fetch      { shipment_id }  → { provider, label_url? , pdf_base64?, tracking_code? }
//
// A credencial nunca volta para a tela: quem lê o que está ligado é a função
// `exp_shipping_status()` no banco.
//
// **Gerar etiqueta é idempotente.** Bling e Yampi guardam o link e ele é
// devolvido de novo. Nos Correios não há link (o PDF vem autenticado), então a
// guarda é o código do objeto: com ele na mão a função **reimprime**, e nunca
// cria uma segunda pré-postagem — que custaria dinheiro e geraria um objeto
// órfão. Por isso o código do objeto é gravado antes de o PDF ser baixado.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { adminClient, getPaymentCredential, yampiFetch, isUuid } from '../_shared/payment-credentials.ts';
import { blingAccessToken, blingFetch, getBlingConnection } from '../_shared/bling.ts';
import {
  getCorreiosCredential, pedirTokenCorreios, criarPrepostagemCorreios, baixarRotuloCorreios, type Remetente,
} from '../_shared/correios.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const PROVIDERS = ['nenhum', 'bling', 'yampi', 'correios'];

/** Marca que ocupa `label_ref` enquanto a pré-postagem está sendo criada. */
const RESERVA = 'gerando';

interface ContactRow {
  name: string; document: string | null; phone: string | null; whatsapp: string | null; email: string | null;
  zip_code: string | null; street: string | null; street_number: string | null; complement: string | null;
  district: string | null; city: string | null; state: string | null;
}

interface ShipmentRow {
  id: string; tenant_id: string;
  label_provider: string | null; label_url: string | null; label_ref: string | null; tracking_code: string | null;
  order: {
    id: string; number: number; bling_order_id: string | null; provider_order_id: string | null;
    contact: ContactRow | null;
    items: { description: string; quantity: number; unit_price: number; product: { weight_grams: number | null } | null }[];
  } | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);
    const userId = userData.user.id;

    const admin = adminClient();
    const { data: profile, error: profileError } = await admin.from('profiles').select('tenant_id').eq('id', userId).maybeSingle();
    if (profileError) throw profileError;
    const tenantId = profile?.tenant_id as string | undefined;
    if (!tenantId) return json({ error: 'no_tenant' }, 403);

    const { data: podeExpedicao, error: acessoError } = await admin.rpc('has_expedicao_access', { _user_id: userId });
    if (acessoError) throw acessoError;
    if (!podeExpedicao) return json({ error: 'forbidden', message: 'Você não tem o módulo Expedição.' }, 403);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? '');
    const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() : '');

    // ── Configuração: só owner/admin ────────────────────────────────────────
    if (['save', 'test', 'delete', 'provider'].includes(action)) {
      const { data: isAdmin, error: adminError } = await admin.rpc('is_admin_or_higher', { _user_id: userId });
      if (adminError) throw adminError;
      if (!isAdmin) return json({ error: 'forbidden', message: 'Só dono ou administrador configura a etiqueta.' }, 403);

      if (action === 'provider') {
        const provider = str('provider');
        if (!PROVIDERS.includes(provider)) return json({ error: 'provedor desconhecido' }, 400);
        // Grava só esta chave, numa instrução, com o JWT de quem pediu: duas
        // telas mexendo em `settings` ao mesmo tempo não se atropelam.
        const { error } = await userClient.rpc('exp_set_config', { p_key: 'label_provider', p_value: provider });
        if (error) throw error;
        return json({ ok: true, provider });
      }

      if (action === 'delete') {
        const { data, error } = await admin.from('tenant_correios_credentials').delete().eq('tenant_id', tenantId).select('tenant_id');
        if (error) throw error;
        return json({ ok: true, removido: !!data?.length });
      }

      const saved = await getCorreiosCredential(admin, tenantId);
      const cred = {
        tenant_id: tenantId,
        usuario: str('usuario') || saved?.usuario || '',
        codigo_acesso: str('codigo_acesso') || saved?.codigo_acesso || '',
        cartao_postagem: str('cartao_postagem') || saved?.cartao_postagem || '',
        contrato: str('contrato') || saved?.contrato || null,
        codigo_servico: str('codigo_servico') || saved?.codigo_servico || '03298',
        remetente: (body.remetente as Remetente | undefined) ?? saved?.remetente ?? {},
      };
      if (!cred.usuario || !cred.codigo_acesso || !cred.cartao_postagem) {
        return json({ ok: false, error: 'Informe usuário, código de acesso e cartão de postagem.' });
      }

      // "Testar" é pedir o token: se o contrato e o cartão valem, ele vem.
      // O pedido não grava nada, então errar o código de acesso aqui **não**
      // derruba o contrato que já estava ligado.
      let token: { token: string; expira: string };
      try {
        token = await pedirTokenCorreios(cred);
      } catch (e) {
        return json({ ok: false, error: e instanceof Error ? e.message : 'falha ao falar com os Correios' });
      }
      if (action === 'test') return json({ ok: true, cartao_last4: cred.cartao_postagem.slice(-4) });

      const { data: gravado, error: upsertError } = await admin
        .from('tenant_correios_credentials')
        .upsert({ ...cred, connected_by: userId, access_token: token.token, token_expires_at: token.expira }, { onConflict: 'tenant_id' })
        .select('tenant_id');
      if (upsertError) throw upsertError;
      if (!gravado?.length) throw new Error('credencial dos Correios não gravada');
      return json({ ok: true, cartao_last4: cred.cartao_postagem.slice(-4) });
    }

    // ── A etiqueta de uma separação ─────────────────────────────────────────
    if (action !== 'fetch') return json({ error: 'invalid_action' }, 400);
    const shipmentId = str('shipment_id');
    if (!isUuid(shipmentId)) return json({ error: 'separação não informada' }, 400);

    const { data: shipmentRow, error: shipmentError } = await admin
      .from('exp_shipments')
      .select('id, tenant_id, label_provider, label_url, label_ref, tracking_code, order:crm_orders(id, number, bling_order_id, provider_order_id, contact:crm_contacts(name, document, phone, whatsapp, email, zip_code, street, street_number, complement, district, city, state), items:crm_order_items(description, quantity, unit_price, product:crm_products(weight_grams)))')
      .eq('id', shipmentId)
      .maybeSingle();
    if (shipmentError) throw shipmentError;
    const s = shipmentRow as unknown as ShipmentRow | null;
    if (!s || s.tenant_id !== tenantId) return json({ error: 'separação não encontrada' }, 404);

    // Já buscada antes (Bling/Yampi): devolve o link guardado, sem pedir de novo.
    if (s.label_url) return json({ provider: s.label_provider, label_url: s.label_url, tracking_code: s.tracking_code });

    const { data: tenantRow, error: tenantError } = await admin.from('tenants').select('settings').eq('id', tenantId).single();
    if (tenantError) throw tenantError;
    const provider = ((tenantRow.settings as { expedicao?: { label_provider?: string } } | null)?.expedicao?.label_provider) ?? 'nenhum';
    if (provider === 'nenhum') {
      return json({ error: 'sem_conector', message: 'Escolha de onde vem a etiqueta em Configurações da Expedição.' }, 409);
    }

    const order = s.order;
    if (!order) return json({ error: 'separação sem pedido' }, 409);

    if (provider === 'bling') {
      const conn = await getBlingConnection(admin, tenantId);
      if (!conn) return json({ error: 'bling_not_connected', message: 'Conecte o Bling em Configurações do Comercial → Nota fiscal.' }, 409);
      if (!order.bling_order_id) return json({ error: 'sem_pedido_no_bling', message: 'Este pedido ainda não foi para o Bling. O fluxo "pedido pago → Bling" cuida disso.' }, 409);
      const token = await blingAccessToken(admin, conn);
      const res = await blingFetch<{ data?: { id: number; link: string; observacao?: string }[] }>(
        token, `/logisticas/etiquetas?formato=PDF&idsVendas[]=${encodeURIComponent(order.bling_order_id)}`,
      );
      const link = res?.data?.[0]?.link;
      if (!link) return json({ error: 'sem_etiqueta', message: res?.data?.[0]?.observacao ?? 'O Bling ainda não tem etiqueta para este pedido.' }, 409);
      await saveLabel(admin, tenantId, s.id, { label_provider: 'bling', label_url: link, label_ref: order.bling_order_id });
      return json({ provider: 'bling', label_url: link });
    }

    if (provider === 'yampi') {
      const cred = await getPaymentCredential(admin, tenantId, 'yampi');
      if (!cred) return json({ error: 'yampi_not_configured', message: 'Ligue a Yampi em Configurações do CRM → Pagamento.' }, 409);
      if (!order.provider_order_id) return json({ error: 'sem_pedido_na_yampi', message: 'Este pedido não veio da Yampi.' }, 409);
      const res = await yampiFetch<{ data?: { labels?: { data?: { file_url?: string; tracking_code?: string; tracking_url?: string }[] } } }>(
        cred, `/orders/${order.provider_order_id}?include=labels`,
      );
      const label = res?.data?.labels?.data?.[0];
      if (!label?.file_url) return json({ error: 'sem_etiqueta', message: 'A Yampi ainda não tem etiqueta para este pedido.' }, 409);
      await saveLabel(admin, tenantId, s.id, {
        label_provider: 'yampi', label_url: label.file_url, label_ref: order.provider_order_id,
        tracking_code: label.tracking_code ?? null, tracking_url: label.tracking_url ?? null,
      });
      return json({ provider: 'yampi', label_url: label.file_url, tracking_code: label.tracking_code ?? null });
    }

    // ── Correios ────────────────────────────────────────────────────────────
    const cred = await getCorreiosCredential(admin, tenantId);
    if (!cred) return json({ error: 'correios_not_configured', message: 'Ligue o contrato dos Correios em Configurações da Expedição.' }, 409);

    // Objeto já postado: reimprime. Nunca cria uma segunda pré-postagem.
    if (s.label_provider === 'correios' && s.tracking_code) {
      const pdf = await baixarRotuloCorreios(admin, cred, s.tracking_code);
      return json({ provider: 'correios', pdf_base64: pdf, tracking_code: s.tracking_code, reimpressao: true });
    }

    const contact = order.contact;
    if (!contact) return json({ error: 'pedido sem cliente' }, 409);

    // O endereço é o do cadastro do cliente. Endereço por pedido não existe
    // ainda (ressalva registrada em `docs/nao-funciona.md`).
    const destino = {
      nome: contact.name, documento: contact.document, telefone: contact.whatsapp || contact.phone, email: contact.email,
      logradouro: contact.street || undefined,
      numero: contact.street_number || undefined,
      complemento: contact.complement || undefined,
      bairro: contact.district || undefined,
      cidade: contact.city || undefined,
      uf: contact.state || undefined,
      cep: contact.zip_code || undefined,
    };
    const faltando = (['cep', 'logradouro', 'numero', 'cidade', 'uf'] as const).filter((k) => !destino[k]);
    if (faltando.length) {
      return json({
        error: 'endereco_incompleto',
        message: `Os Correios exigem o endereço completo do cliente. Falta preencher no cadastro dele: ${faltando.join(', ')}.`,
      }, 409);
    }

    // Reserva a linha antes de falar com os Correios. Dois cliques ao mesmo
    // tempo (duas abas, duas pessoas) leriam a separação sem etiqueta e
    // criariam duas pré-postagens — cada uma custa dinheiro e vira um objeto
    // rastreado. Este UPDATE é atômico: o segundo espera o cadeado da linha e,
    // ao reavaliar, não casa mais com `label_ref is null`.
    // Reserva velha (a função morreu no meio, sem passar pelo catch) é
    // retomada depois de dois minutos, senão o pedido ficaria travado para sempre.
    const velha = new Date(Date.now() - 2 * 60_000).toISOString();
    const { data: reserva, error: reservaError } = await admin
      .from('exp_shipments')
      .update({ label_provider: 'correios', label_ref: RESERVA })
      .eq('id', s.id).eq('tenant_id', tenantId)
      .or(`label_ref.is.null,and(label_ref.eq.${RESERVA},updated_at.lt.${velha})`)
      .select('id');
    if (reservaError) throw reservaError;
    if (!reserva?.length) {
      return json({
        error: 'etiqueta_em_andamento',
        message: 'A etiqueta deste pedido já está sendo gerada. Espere alguns segundos e clique de novo.',
      }, 409);
    }

    const peso = order.items.reduce((total, i) => total + Number(i.quantity) * (i.product?.weight_grams ?? 0), 0);
    try {
      const pre = await criarPrepostagemCorreios(
        admin, cred, destino,
        order.items.map((i) => ({ conteudo: i.description, quantidade: Number(i.quantity), valor: Number(i.unit_price) })),
        peso,
        order.number,
      );
      // Grava o objeto **antes** de baixar o PDF: se o download falhar, a próxima
      // tentativa reimprime este objeto em vez de criar outro.
      await saveLabel(admin, tenantId, s.id, {
        label_provider: 'correios', label_ref: pre.id_prepostagem,
        tracking_code: pre.codigo_objeto,
        tracking_url: `https://rastreamento.correios.com.br/app/index.php?objetos=${pre.codigo_objeto}`,
      });
      const pdf = await baixarRotuloCorreios(admin, cred, pre.codigo_objeto);
      return json({ provider: 'correios', pdf_base64: pdf, tracking_code: pre.codigo_objeto, peso_gramas: peso });
    } catch (erro) {
      // Solta a reserva só se a pré-postagem não chegou a nascer. Se nasceu, o
      // `label_ref` já é o id dela e este UPDATE não casa — o próximo clique
      // reimprime, como deve.
      await admin.from('exp_shipments').update({ label_ref: null })
        .eq('id', s.id).eq('tenant_id', tenantId).eq('label_ref', RESERVA);
      throw erro;
    }
  } catch (e) {
    console.error('shipping-label', e);
    return json({ error: e instanceof Error ? e.message : 'erro desconhecido' }, 500);
  }
});

async function saveLabel(admin: ReturnType<typeof adminClient>, tenantId: string, shipmentId: string, patch: Record<string, unknown>) {
  const { data, error } = await admin
    .from('exp_shipments').update(patch).eq('id', shipmentId).eq('tenant_id', tenantId).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('etiqueta não gravada na separação');
}

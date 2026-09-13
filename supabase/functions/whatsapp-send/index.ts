// Responder o cliente pelo WhatsApp, de dentro do negócio (CRM-4a).
//
// POST { deal_id, texto }  (JWT) → { enviado, message_id? , motivo? }
//
// A Meta só deixa escrever texto livre **nas 24 horas** depois da última
// mensagem do cliente. Fora dessa janela é preciso mensagem-modelo aprovada por
// ela, que é a CRM-4b — aqui a função diz isso em português, em vez de deixar a
// Meta devolver "(#131047) Message failed to send".
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { adminClient, isUuid } from '../_shared/payment-credentials.ts';
import { getConnectionByTenant, enviarTexto, enviarModeloNoNegocio } from '../_shared/whatsapp.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/** Quanto tempo a Meta deixa responder livremente. */
const JANELA_MS = 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const dealId = typeof body.deal_id === 'string' ? body.deal_id : '';
    const texto = typeof body.texto === 'string' ? body.texto.trim() : '';
    // Modo modelo (CRM-4b): é o que atravessa a janela de 24 h.
    const modelo = typeof body.modelo === 'string' ? body.modelo.trim() : '';
    const idioma = typeof body.idioma === 'string' ? body.idioma.trim() : '';
    const vars = Array.isArray(body.vars) ? body.vars.map(v => String(v ?? '')) : [];

    if (!isUuid(dealId)) return json({ error: 'negócio não informado' }, 400);
    if (!modelo) {
      if (!texto) return json({ error: 'mensagem vazia' }, 400);
      if (texto.length > 4096) return json({ error: 'a mensagem passa de 4096 caracteres' }, 400);
    }

    // Pela RLS de quem pediu: negócio que ele não enxerga não manda mensagem
    // nenhuma, e é isto que impede responder na conversa de outra empresa.
    const { data: deal, error: dealError } = await userClient
      .from('crm_deals').select('id, tenant_id, contact_id, contact:crm_contacts(name, whatsapp_id, phone)')
      .eq('id', dealId).maybeSingle();
    if (dealError) throw dealError;
    if (!deal) return json({ error: 'negocio nao encontrado' }, 404);

    const d = deal as unknown as {
      tenant_id: string; contact_id: string;
      contact: { name: string; whatsapp_id: string | null; phone: string | null } | null;
    };
    const para = d.contact?.whatsapp_id;
    if (!para) {
      return json({ enviado: false, motivo: 'este cliente ainda não tem WhatsApp conhecido — ele precisa escrever primeiro' });
    }

    const admin = adminClient();
    const cred = await getConnectionByTenant(admin, d.tenant_id);
    if (!cred || !cred.is_active) {
      return json({ enviado: false, motivo: 'o WhatsApp ainda não está ligado nesta empresa' });
    }

    // O modelo existe justamente para não depender da janela — então ele pula
    // essa conferência. O texto livre, não.
    if (!modelo) {
      // A janela de 24h. Contada da última mensagem **do cliente**, que é a regra
      // da Meta — não da última mensagem da conversa.
      const { data: ultima, error: ultimaErr } = await admin
        .from('crm_messages').select('created_at')
        .eq('tenant_id', d.tenant_id).eq('contact_id', d.contact_id).eq('direction', 'in')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (ultimaErr) throw ultimaErr;
      const quando = (ultima as { created_at: string } | null)?.created_at;
      if (!quando || Date.now() - new Date(quando).getTime() > JANELA_MS) {
        return json({
          enviado: false,
          motivo: 'passaram-se mais de 24 horas desde a última mensagem do cliente — nesse caso use uma mensagem-modelo',
        });
      }
    }

    // O caminho do modelo é o mesmo que o fluxo automático percorre — uma
    // função só, no `_shared`, para o vendedor clicando e o robô de madrugada
    // não se comportarem diferente.
    if (modelo) {
      const r = await enviarModeloNoNegocio(
        admin, d.tenant_id, dealId, modelo, idioma || 'pt_BR', vars, userData.user.id,
      );
      return json(r);
    }

    let messageId: string | null = null;
    try {
      messageId = await enviarTexto(cred, para, texto);
    } catch (e) {
      // Grava a tentativa falhada: uma conversa em que a mensagem some sem
      // deixar rastro é pior do que uma que mostra "não saiu, e por quê".
      await admin.from('crm_messages').insert({
        tenant_id: d.tenant_id, contact_id: d.contact_id, deal_id: dealId,
        direction: 'out', body: texto, status: 'failed',
        error: (e instanceof Error ? e.message : String(e)).slice(0, 500),
        sent_by: userData.user.id,
      }).select('id');
      return json({ enviado: false, motivo: e instanceof Error ? e.message : String(e) });
    }

    const { error: gravaErro } = await admin.from('crm_messages').insert({
      tenant_id: d.tenant_id, contact_id: d.contact_id, deal_id: dealId,
      direction: 'out', wa_message_id: messageId, body: texto, status: 'sent',
      sent_by: userData.user.id,
    }).select('id');
    if (gravaErro) throw gravaErro;

    return json({ enviado: true, message_id: messageId });
  } catch (e) {
    console.error('whatsapp-send', e instanceof Error ? e.message : String(e));
    return json({ error: e instanceof Error ? e.message : 'erro desconhecido' }, 500);
  }
});

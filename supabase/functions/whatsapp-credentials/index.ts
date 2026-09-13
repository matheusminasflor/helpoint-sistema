// Ligar e desligar o WhatsApp de uma empresa (CRM-4a).
//
// POST { acao: 'salvar', phone_number_id, waba_id, access_token, display_phone, app_secret }
// POST { acao: 'estado' }   → o que a tela mostra, sem nenhum segredo
// POST { acao: 'testar' }   → pergunta à Meta se o número responde
// POST { acao: 'desligar' }
//
// O token e o segredo do app **entram** por aqui e nunca saem: a tabela é
// fechada para `authenticated`, e nenhuma resposta desta função os devolve. É o
// mesmo desenho de `payment-credentials`.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { adminClient } from '../_shared/payment-credentials.ts';
import { metaFetch, getConnectionByTenant, soDigitos } from '../_shared/whatsapp.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

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

    const admin = adminClient();
    const { data: perfil, error: perfilErro } = await admin
      .from('profiles').select('tenant_id').eq('id', userData.user.id).maybeSingle();
    if (perfilErro) throw perfilErro;
    const tenantId = (perfil as { tenant_id: string } | null)?.tenant_id;
    if (!tenantId) return json({ error: 'sua conta não está ligada a nenhuma empresa' }, 403);

    // Ligar o canal de atendimento da empresa é de dono ou administrador — a
    // mesma régua das chaves de pagamento e da nota fiscal.
    const { data: ehAdmin, error: papelErro } = await admin
      .rpc('is_admin_or_higher', { _user_id: userData.user.id });
    if (papelErro) throw papelErro;
    if (!ehAdmin) return json({ error: 'só dono ou administrador liga o WhatsApp' }, 403);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const acao = texto(body.acao) || 'estado';

    if (acao === 'estado') {
      const cred = await getConnectionByTenant(admin, tenantId);
      if (!cred) return json({ conectado: false });
      return json({
        conectado: true,
        numero: cred.display_phone,
        ativo: cred.is_active,
        // A tela precisa disto para o dono colar no painel da Meta. Não é
        // segredo de acesso: é o que a Meta devolve para provar que é ela.
        verify_token: cred.verify_token,
        webhook_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-webhook`,
        assinatura_configurada: !!cred.app_secret,
      });
    }

    if (acao === 'salvar') {
      const phoneNumberId = texto(body.phone_number_id);
      const wabaId = texto(body.waba_id);
      const accessToken = texto(body.access_token);
      const appSecret = texto(body.app_secret);
      if (!phoneNumberId || !wabaId || !accessToken) {
        return json({ error: 'informe o identificador do número, o da conta e o token' }, 400);
      }

      // Antes de gravar, pergunta à Meta se o número existe e o token serve.
      // Guardar credencial que não funciona é o que faz o vendedor descobrir o
      // problema só na hora de responder um cliente.
      let numero: string | null = null;
      try {
        const r = await metaFetch<{ display_phone_number?: string; verified_name?: string }>(
          { access_token: accessToken },
          `${phoneNumberId}?fields=display_phone_number,verified_name`,
        );
        numero = r?.display_phone_number ?? null;
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : 'a Meta recusou a credencial' }, 400);
      }

      const { error } = await admin.from('tenant_whatsapp_connections').upsert({
        tenant_id: tenantId,
        phone_number_id: phoneNumberId,
        waba_id: wabaId,
        access_token: accessToken,
        display_phone: numero ?? soDigitos(texto(body.display_phone)) || null,
        app_secret: appSecret || null,
        is_active: true,
        connected_by: userData.user.id,
      }, { onConflict: 'tenant_id' }).select('tenant_id');
      if (error) {
        // O índice único do `phone_number_id` é o que impede duas empresas
        // apontarem o mesmo número — e a mensagem cair na caixa errada.
        if (String(error.message).includes('tenant_whatsapp_phone_number_idx')) {
          return json({ error: 'esse número já está ligado a outra empresa' }, 409);
        }
        throw error;
      }

      const cred = await getConnectionByTenant(admin, tenantId);
      return json({
        conectado: true,
        numero: cred?.display_phone ?? numero,
        verify_token: cred?.verify_token,
        webhook_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-webhook`,
        assinatura_configurada: !!cred?.app_secret,
      });
    }

    if (acao === 'testar') {
      const cred = await getConnectionByTenant(admin, tenantId);
      if (!cred) return json({ ok: false, motivo: 'o WhatsApp ainda não está ligado' });
      try {
        const r = await metaFetch<{ display_phone_number?: string; quality_rating?: string }>(
          cred, `${cred.phone_number_id}?fields=display_phone_number,quality_rating`,
        );
        return json({ ok: true, numero: r?.display_phone_number, qualidade: r?.quality_rating });
      } catch (e) {
        return json({ ok: false, motivo: e instanceof Error ? e.message : String(e) });
      }
    }

    if (acao === 'desligar') {
      // Desliga, não apaga: a conversa já gravada continua no negócio, e
      // religar não pede tudo de novo.
      const { error } = await admin.from('tenant_whatsapp_connections')
        .update({ is_active: false }).eq('tenant_id', tenantId).select('tenant_id');
      if (error) throw error;
      return json({ conectado: true, ativo: false });
    }

    return json({ error: 'ação desconhecida' }, 400);
  } catch (e) {
    console.error('whatsapp-credentials', e instanceof Error ? e.message : String(e));
    return json({ error: e instanceof Error ? e.message : 'erro desconhecido' }, 500);
  }
});

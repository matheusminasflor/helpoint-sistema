// O encaixe "emitir nota" (ENC-3, ADR-009): a nota fiscal do pedido.
//
// De onde ela sai é escolha da empresa (`tenants.settings.crm.nfe_provider`):
//   focusnfe — o Helpoint monta a nota e a Focus assina e manda à SEFAZ
//   bling    — quem já roda no ERP emite por lá (passo de fluxo `bling_order`)
//   nenhum   — a empresa emite por fora
//
// POST { action }  (JWT):
//   save | test | delete   token da Focus (só owner/admin)
//   provider   { provider }   qual conector usar (só owner/admin)
//   emitir     { order_id }   → { ref, nfe_status, numero?, chave?, danfe_url? }
//   consultar  { order_id }   pergunta à Focus como ficou
//
// O token nunca volta para a tela: quem lê o que está ligado é `crm_nfe_status()`.
//
// **Emitir duas vezes não emite duas notas**: a referência na Focus é o id do
// pedido, ela é gravada antes do envio, e antes de mandar o Helpoint pergunta o
// que já existe naquela referência.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { adminClient, isUuid } from '../_shared/payment-credentials.ts';
import {
  getFocusConnection, focusFetch, consultarNFe, emitirNotaDoPedido, registrarNota,
} from '../_shared/focusnfe.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const PROVIDERS = ['nenhum', 'focusnfe', 'bling'];

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

    const { data: podeCrm, error: acessoError } = await admin.rpc('has_crm_access', { _user_id: userId });
    if (acessoError) throw acessoError;
    if (!podeCrm) return json({ error: 'forbidden', message: 'Você não tem o módulo CRM.' }, 403);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? '');
    const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() : '');

    // ── Configuração: só owner/admin ────────────────────────────────────────
    if (['save', 'test', 'delete', 'provider'].includes(action)) {
      const { data: isAdmin, error: adminError } = await admin.rpc('is_admin_or_higher', { _user_id: userId });
      if (adminError) throw adminError;
      if (!isAdmin) return json({ error: 'forbidden', message: 'Só dono ou administrador configura a nota fiscal.' }, 403);

      if (action === 'provider') {
        const provider = str('provider');
        if (!PROVIDERS.includes(provider)) return json({ error: 'provedor desconhecido' }, 400);
        const { error } = await userClient.rpc('crm_set_config', { p_key: 'nfe_provider', p_value: provider });
        if (error) throw error;
        return json({ ok: true, provider });
      }

      if (action === 'delete') {
        const { data, error } = await admin.from('tenant_focusnfe_connections').delete().eq('tenant_id', tenantId).select('tenant_id');
        if (error) throw error;
        return json({ ok: true, removido: !!data?.length });
      }

      const saved = await getFocusConnection(admin, tenantId);
      // Validar aqui, não só no CHECK do banco: a violação traria a linha
      // inteira na mensagem de erro — com o token dentro — e ela vai para o log.
      const ambiente = str('ambiente') || saved?.ambiente || 'homologacao';
      if (!['homologacao', 'producao'].includes(ambiente)) return json({ error: 'ambiente desconhecido' }, 400);
      const serie = Number(body.serie ?? saved?.serie ?? 1);
      if (!Number.isInteger(serie) || serie < 1 || serie > 999) return json({ error: 'série inválida' }, 400);
      const conn = {
        tenant_id: tenantId,
        token: str('token') || saved?.token || '',
        ambiente: ambiente as 'homologacao' | 'producao',
        cnpj_emitente: str('cnpj_emitente') || saved?.cnpj_emitente || '',
        serie,
        natureza_operacao: str('natureza_operacao') || saved?.natureza_operacao || 'Venda de mercadoria',
        cfop_padrao: str('cfop_padrao') || saved?.cfop_padrao || '5102',
      };
      if (!conn.token || !conn.cnpj_emitente) {
        return json({ ok: false, error: 'Informe o token da Focus e o CNPJ que emite a nota.' });
      }

      // Testar é listar as empresas do token: se ele vale, elas vêm — e ainda
      // confirma que o CNPJ digitado está cadastrado lá.
      let empresas: { cnpj?: string; nome?: string }[] = [];
      try {
        const res = await focusFetch<{ cnpj?: string; nome?: string }[]>(conn, '/empresas');
        empresas = Array.isArray(res) ? res : [];
      } catch (e) {
        return json({ ok: false, error: e instanceof Error ? e.message : 'falha ao falar com a Focus NFe' });
      }
      const cnpj = conn.cnpj_emitente.replace(/\D/g, '');
      const achou = empresas.some((e) => (e.cnpj ?? '').replace(/\D/g, '') === cnpj);
      if (!achou && empresas.length) {
        return json({ ok: false, error: `O CNPJ ${cnpj} não está cadastrado nesse token da Focus. Cadastre a empresa no painel deles primeiro.` });
      }
      if (action === 'test') return json({ ok: true, empresas: empresas.length });

      const { data, error } = await admin
        .from('tenant_focusnfe_connections')
        .upsert({ ...conn, connected_by: userId }, { onConflict: 'tenant_id' })
        .select('tenant_id');
      if (error) throw error;
      if (!data?.length) throw new Error('conexão com a Focus não gravada');
      return json({ ok: true, token_last4: conn.token.slice(-4), ambiente: conn.ambiente });
    }

    // ── A nota de um pedido ─────────────────────────────────────────────────
    const orderId = str('order_id');
    if (!isUuid(orderId)) return json({ error: 'pedido não informado' }, 400);
    // A leitura passa pela RLS: quem não enxerga o pedido não emite a nota dele.
    const { data: visivel, error: visivelError } = await userClient
      .from('crm_orders').select('id, nfe_ref, nfe_provider').eq('id', orderId).maybeSingle();
    if (visivelError) throw visivelError;
    if (!visivel) return json({ error: 'pedido nao encontrado' }, 404);
    const pedido = visivel as { nfe_ref: string | null; nfe_provider: string | null };

    // O conector é escolha da empresa: esconder o botão na tela não basta.
    const { data: tenantRow, error: tenantError } = await admin.from('tenants').select('settings').eq('id', tenantId).single();
    if (tenantError) throw tenantError;
    const conector = ((tenantRow.settings as { crm?: { nfe_provider?: string } } | null)?.crm?.nfe_provider) ?? 'nenhum';
    if (conector !== 'focusnfe') {
      return json({
        error: 'conector_nao_e_focus',
        message: conector === 'bling'
          ? 'Esta empresa emite pelo Bling. A nota sai pelo fluxo "pedido pago → Bling".'
          : 'Escolha a Focus NFe em Configurações do CRM → Nota fiscal.',
      }, 409);
    }
    // Pedido que já foi para o Bling não vira nota da Focus, nem por consulta.
    if (pedido.nfe_provider === 'bling') {
      return json({ error: 'nota_do_bling', message: 'A nota deste pedido é do Bling.' }, 409);
    }

    if (action === 'consultar') {
      const conn = await getFocusConnection(admin, tenantId);
      if (!conn) return json({ error: 'focus_not_connected', message: 'Ligue a Focus NFe em Configurações do CRM → Nota fiscal.' }, 409);
      const ref = pedido.nfe_ref ?? orderId;
      const res = await consultarNFe(conn, ref);
      return json(await registrarNota(admin, conn, tenantId, orderId, ref, res));
    }

    if (action !== 'emitir') return json({ error: 'invalid_action' }, 400);
    try {
      return json(await emitirNotaDoPedido(admin, tenantId, orderId));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'focus_not_connected') {
        return json({ error: 'focus_not_connected', message: 'Ligue a Focus NFe em Configurações do CRM → Nota fiscal.' }, 409);
      }
      if (msg.startsWith('cadastro_incompleto: ')) {
        return json({ error: 'cadastro_incompleto', message: `A nota não foi tentada. ${msg.slice('cadastro_incompleto: '.length)}` }, 409);
      }
      if (msg === 'nota_em_andamento') {
        return json({ error: 'nota_em_andamento', message: 'A nota deste pedido já está sendo emitida. Espere alguns segundos e atualize a situação.' }, 409);
      }
      throw e;
    }
  } catch (e) {
    // Só a mensagem, nunca o objeto: erro do PostgREST traz `details` com a
    // linha inteira, e nesta tabela a linha tem o token.
    console.error('nfe-focus', e instanceof Error ? e.message : String(e));
    return json({ error: e instanceof Error ? e.message : 'erro desconhecido' }, 500);
  }
});

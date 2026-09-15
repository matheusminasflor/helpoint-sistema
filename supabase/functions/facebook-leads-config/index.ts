// Ligar o Lead Ads de uma empresa e listar os formulários da página (CRM-4c).
//
// POST { acao: 'estado' }                  → o que a tela mostra, sem segredo
// POST { acao: 'salvar', app_secret }      → liga; devolve a chave de verificação
// POST { acao: 'formularios', page_id }    → os formulários que existem na Meta
// POST { acao: 'desligar' }
//
// O segredo do aplicativo **entra** por aqui e nunca sai: a tabela é fechada
// para `authenticated` e nenhuma resposta o devolve — só diz se está posto. É o
// mesmo desenho de `whatsapp-credentials`.
//
// Esta função **não decide destino de lead**. Ela só mostra o que a Meta tem;
// quem diz para onde o lead vai é o administrador, gravando em
// `crm_lead_ads_forms` pela própria tela.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { adminClient } from '../_shared/payment-credentials.ts';
import { graphFetch } from '../_shared/meta.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

interface Conexao {
  verify_token: string;
  app_secret: string | null;
  is_active: boolean;
}

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

    const { data: ehAdmin, error: papelErro } = await admin
      .rpc('is_admin_or_higher', { _user_id: userData.user.id });
    if (papelErro) throw papelErro;
    if (!ehAdmin) return json({ error: 'só dono ou administrador liga o Lead Ads' }, 403);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const acao = texto(body.acao) || 'estado';

    const lerConexao = async (): Promise<Conexao | null> => {
      const { data, error } = await admin
        .from('tenant_lead_ads_connections').select('verify_token, app_secret, is_active')
        .eq('tenant_id', tenantId).maybeSingle();
      if (error) throw error;
      return (data as Conexao | null) ?? null;
    };

    // As páginas do Facebook que o Marketing já conectou. É de lá que sai o
    // token do lead — por isso a tela manda conectar ali, e não pede de novo.
    const lerPaginas = async () => {
      // `leads_subscribed_at` é o carimbo posto quando **a Meta confirmou** que
      // a página instalou o aplicativo. Deduzir isso da credencial da página
      // existir seria mentira: ela é guardada antes da chamada que instala, e
      // essa chamada pode falhar — era justamente aí que a tela ficava muda.
      const { data, error } = await admin
        .from('mkt_social_accounts').select('account_name, page_id, leads_subscribed_at')
        .eq('tenant_id', tenantId).eq('platform', 'facebook')
        .eq('is_active', true).not('page_id', 'is', null).order('account_name');
      if (error) throw error;
      return ((data ?? []) as {
        account_name: string; page_id: string; leads_subscribed_at: string | null;
      }[]).map(c => ({
        account_name: c.account_name,
        page_id: c.page_id,
        instalada: !!c.leads_subscribed_at,
      }));
    };

    // O webhook `leadgen` se cadastra uma vez por **aplicativo** da Meta, e o
    // Helpoint tem um só — o mesmo do OAuth do Marketing. Quando o segredo dele
    // está no ambiente, a empresa não precisa colar nada; a chave por empresa
    // continua valendo para quem traz o próprio aplicativo.
    const appDaCasa = !!Deno.env.get('META_APP_SECRET');

    if (acao === 'estado') {
      const [cred, paginas] = await Promise.all([lerConexao(), lerPaginas()]);
      return json({
        conectado: !!cred,
        ativo: cred?.is_active ?? false,
        assinatura_configurada: !!cred?.app_secret || appDaCasa,
        app_da_casa: appDaCasa,
        // O dono cola os dois no painel da Meta ao cadastrar o webhook.
        verify_token: cred?.verify_token ?? null,
        webhook_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/facebook-leads-webhook`,
        paginas,
      });
    }

    if (acao === 'salvar') {
      const appSecret = texto(body.app_secret);
      if (!appSecret && !appDaCasa) {
        return json({ error: 'informe o segredo do aplicativo da Meta' }, 400);
      }

      // `verify_token` tem valor padrão e não se troca ao reeditar — trocá-la
      // derrubaria o webhook já cadastrado no painel da Meta. E `app_secret` só
      // entra no payload quando veio: com o aplicativo da casa, ligar não pede
      // segredo nenhum, e um `null` aqui apagaria o de quem tem o próprio.
      const { error } = await admin.from('tenant_lead_ads_connections').upsert({
        tenant_id: tenantId,
        ...(appSecret ? { app_secret: appSecret } : {}),
        is_active: true,
        connected_by: userData.user.id,
      }, { onConflict: 'tenant_id' }).select('tenant_id');
      if (error) throw error;

      const cred = await lerConexao();
      return json({
        conectado: true,
        ativo: true,
        assinatura_configurada: !!cred?.app_secret || appDaCasa,
        app_da_casa: appDaCasa,
        verify_token: cred?.verify_token ?? null,
        webhook_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/facebook-leads-webhook`,
      });
    }

    if (acao === 'formularios') {
      const pageId = texto(body.page_id);
      if (!pageId) return json({ error: 'escolha a página' }, 400);

      // `platform` no filtro: a conta do Instagram guarda o id da **página** do
      // Facebook a que pertence, e sem isto duas linhas legítimas com o mesmo
      // `page_id` viravam erro do PostgREST em vez de resposta.
      const { data: conta, error: contaErro } = await admin
        .from('mkt_social_accounts').select('id')
        .eq('tenant_id', tenantId).eq('page_id', pageId)
        .eq('platform', 'facebook').eq('is_active', true).maybeSingle();
      if (contaErro) throw contaErro;
      const contaId = (conta as { id: string } | null)?.id;
      if (!contaId) return json({ error: 'essa página não está conectada nesta empresa' }, 404);

      const { data: segredo, error: segredoErro } = await admin
        .from('mkt_social_account_secrets').select('access_token, page_access_token')
        .eq('account_id', contaId).maybeSingle();
      if (segredoErro) throw segredoErro;
      const s = segredo as { access_token: string | null; page_access_token: string | null } | null;
      // A credencial da página é a que a Meta pede aqui; a da pessoa fica de
      // reserva para as contas conectadas antes da CRM-4c.
      const token = s?.page_access_token || s?.access_token;
      if (!token) return json({ error: 'a página não tem credencial guardada — reconecte o Facebook em Marketing' }, 400);

      try {
        // `questions` é o que deixa a tela montar o mapeamento sozinha. A chave
        // de cada pergunta (`key`) é a mesma que volta em `field_data[].name`
        // no lead — é por ela que o destino é gravado.
        const r = await graphFetch<{ data?: unknown[] }>(
          token, `${pageId}/leadgen_forms?fields=id,name,status,questions{key,label,type}&limit=200`,
        );
        return json({ formularios: r?.data ?? [] });
      } catch (e) {
        // O erro mais comum aqui é o escopo: a página foi conectada antes de o
        // Helpoint pedir `leads_retrieval`. A mensagem da Meta diz isso melhor
        // do que qualquer texto nosso, e a saída é a mesma — reconectar.
        return json({ error: e instanceof Error ? e.message : 'a Meta recusou a leitura' }, 400);
      }
    }

    if (acao === 'desligar') {
      // Desliga, não apaga: o que já virou negócio continua no funil, e os
      // formulários configurados esperam do jeito que estão.
      const { data, error } = await admin.from('tenant_lead_ads_connections')
        .update({ is_active: false }).eq('tenant_id', tenantId).select('tenant_id');
      if (error) throw error;
      // Zero linhas não é erro do PostgREST — e responder "desligado" sem ter
      // desligado nada é o tipo de mentira que a regra 2 das cinco existe para
      // impedir do outro lado.
      if (!data || data.length === 0) return json({ conectado: false, ativo: false });
      return json({ conectado: true, ativo: false });
    }

    return json({ error: 'ação desconhecida' }, 400);
  } catch (e) {
    console.error('facebook-leads-config', e instanceof Error ? e.message : String(e));
    return json({ error: e instanceof Error ? e.message : 'erro desconhecido' }, 500);
  }
});

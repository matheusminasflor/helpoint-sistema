import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isPreviewHost } from "../_shared/app-hosts.ts";
import { adminClient } from "../_shared/payment-credentials.ts";
import { graphFetch } from "../_shared/meta.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const META_API_VERSION = 'v18.0';

// ── Proteção CSRF: state assinado (HMAC) + whitelist de redirect_uri ──────────
const STATE_TTL_MS = 10 * 60 * 1000;

function stateSecret() {
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '';
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(stateSecret()),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function b64url(v: string) {
  return btoa(v).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(v: string) {
  return atob(v.replace(/-/g, '+').replace(/_/g, '/'));
}

async function signState(data: Record<string, unknown>): Promise<string> {
  const payload = b64url(JSON.stringify(data));
  return `${payload}.${await hmac(payload)}`;
}

async function verifyState(
  state: string | undefined,
  expected: { platform: string; user_id: string; redirect_uri: string },
): Promise<boolean> {
  if (!state || !state.includes('.')) return false;
  const [payload, sig] = state.split('.');
  const expectedSig = await hmac(payload);
  if (sig.length !== expectedSig.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  if (diff !== 0) return false;
  try {
    const data = JSON.parse(unb64url(payload));
    if (data.platform !== expected.platform) return false;
    if (data.user_id !== expected.user_id) return false;
    if (data.redirect_uri !== expected.redirect_uri) return false;
    if (typeof data.ts !== 'number' || Date.now() - data.ts > STATE_TTL_MS) return false;
    return true;
  } catch {
    return false;
  }
}

const ALLOWED_CALLBACK_PATHS = ['/mkt/social', '/mkt/configuracoes'];

function isAllowedRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    const host = u.hostname.toLowerCase();
    const okHost =
      host === 'localhost' ||
      host === 'helpoint.com.br' ||
      host === 'www.helpoint.com.br' ||
      isPreviewHost(host);
    const okProto = u.protocol === 'https:' || host === 'localhost';
    const okPath = ALLOWED_CALLBACK_PATHS.some(
      (p) => u.pathname === p || u.pathname.endsWith(p),
    );
    return okHost && okProto && okPath;
  } catch {
    return false;
  }
}

interface OAuthRequest {
  action: 'get_auth_url' | 'exchange_code' | 'refresh_token';
  platform: 'instagram' | 'facebook';
  redirect_uri: string;
  code?: string;
  account_id?: string;
  state?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: authData, error: authError } = await supabase.auth.getClaims(token);
    if (authError || !authData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const userId = authData.claims.sub;
    const { action, platform, redirect_uri, code, account_id, state }: OAuthRequest = await req.json();

    if ((action === 'get_auth_url' || action === 'exchange_code') && !isAllowedRedirect(redirect_uri || '')) {
      return new Response(JSON.stringify({ error: 'invalid_redirect_uri' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get Meta App credentials from secrets
    // These should be set per-tenant or as global secrets
    const META_APP_ID = Deno.env.get('META_APP_ID');
    const META_APP_SECRET = Deno.env.get('META_APP_SECRET');

    if (!META_APP_ID || !META_APP_SECRET) {
      return new Response(JSON.stringify({ 
        error: 'Meta API not configured',
        message: 'META_APP_ID e META_APP_SECRET precisam ser configurados. Adicione as credenciais do seu Facebook App nas configurações.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    switch (action) {
      case 'get_auth_url': {
        // Build OAuth authorization URL
        const scopes = platform === 'instagram' 
          ? 'instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement'
          // `leads_retrieval` é o que deixa buscar o conteúdo de um lead de
          // anúncio (CRM-4c). Sem ele o webhook chega e a Graph API recusa a
          // leitura — o lead fica registrado com o erro, sem se perder.
          : 'pages_show_list,pages_read_engagement,pages_manage_posts,leads_retrieval';
        
        const authUrl = new URL(`https://www.facebook.com/${META_API_VERSION}/dialog/oauth`);
        authUrl.searchParams.set('client_id', META_APP_ID);
        authUrl.searchParams.set('redirect_uri', redirect_uri);
        authUrl.searchParams.set('scope', scopes);
        authUrl.searchParams.set('response_type', 'code');
        const signedState = await signState({
          platform,
          user_id: userId,
          redirect_uri,
          nonce: crypto.randomUUID(),
          ts: Date.now(),
        });
        authUrl.searchParams.set('state', signedState);

        return new Response(JSON.stringify({ 
          auth_url: authUrl.toString(),
          state: signedState,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'exchange_code': {
        if (!code) {
          return new Response(JSON.stringify({ error: 'Code is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // CSRF: o state precisa ter sido emitido por nós, para este usuário/plataforma/redirect
        const stateOk = await verifyState(state, {
          platform,
          user_id: String(userId),
          redirect_uri,
        });
        if (!stateOk) {
          return new Response(JSON.stringify({ error: 'invalid_state' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Exchange code for short-lived token
        const tokenUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`);
        tokenUrl.searchParams.set('client_id', META_APP_ID);
        tokenUrl.searchParams.set('client_secret', META_APP_SECRET);
        tokenUrl.searchParams.set('code', code);
        tokenUrl.searchParams.set('redirect_uri', redirect_uri);

        const tokenResponse = await fetch(tokenUrl.toString());
        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
          console.error('Token exchange error:', tokenData.error);
          return new Response(JSON.stringify({ 
            error: 'Token exchange failed',
            details: tokenData.error.message 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const shortLivedToken = tokenData.access_token;

        // Exchange for long-lived token (60 days)
        const longLivedUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`);
        longLivedUrl.searchParams.set('grant_type', 'fb_exchange_token');
        longLivedUrl.searchParams.set('client_id', META_APP_ID);
        longLivedUrl.searchParams.set('client_secret', META_APP_SECRET);
        longLivedUrl.searchParams.set('fb_exchange_token', shortLivedToken);

        const longLivedResponse = await fetch(longLivedUrl.toString());
        const longLivedData = await longLivedResponse.json();

        if (longLivedData.error) {
          console.error('Long-lived token error:', longLivedData.error);
          return new Response(JSON.stringify({ 
            error: 'Failed to get long-lived token',
            details: longLivedData.error.message 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const accessToken = longLivedData.access_token;
        const expiresIn = longLivedData.expires_in || 5184000; // Default 60 days

        // Get user info and pages
        const meResponse = await fetch(`https://graph.facebook.com/${META_API_VERSION}/me?fields=id,name&access_token=${accessToken}`);
        const meData = await meResponse.json();

        let accountName = meData.name || 'Unknown';
        let accountId = meData.id;
        let pageId = null;
        // A credencial **da página**, que a Meta entrega junto com a lista delas
        // e é diferente da credencial da pessoa que conectou. É ela que instala
        // o aplicativo e lê o conteúdo de um lead de anúncio (CRM-4c).
        let pageToken: string | null = null;

        // If Instagram, get Instagram Business Account
        if (platform === 'instagram') {
          const pagesResponse = await fetch(
            `https://graph.facebook.com/${META_API_VERSION}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${accessToken}`
          );
          const pagesData = await pagesResponse.json();

          if (pagesData.data && pagesData.data.length > 0) {
            // Find first page with Instagram business account
            const pageWithIG = pagesData.data.find((p: any) => p.instagram_business_account);
            if (pageWithIG) {
              pageId = pageWithIG.id;
              pageToken = pageWithIG.access_token ?? null;
              accountId = pageWithIG.instagram_business_account.id;
              
              // Get Instagram account details
              const igResponse = await fetch(
                `https://graph.facebook.com/${META_API_VERSION}/${accountId}?fields=username,name&access_token=${accessToken}`
              );
              const igData = await igResponse.json();
              accountName = igData.username ? `@${igData.username}` : igData.name || accountName;
            }
          }
        } else {
          // For Facebook, get first page
          const pagesResponse = await fetch(
            `https://graph.facebook.com/${META_API_VERSION}/me/accounts?access_token=${accessToken}`
          );
          const pagesData = await pagesResponse.json();

          if (pagesData.data && pagesData.data.length > 0) {
            pageId = pagesData.data[0].id;
            pageToken = pagesData.data[0].access_token ?? null;
            accountName = pagesData.data[0].name || accountName;
          }
        }

        // Calculate expiration date
        const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

        // ── Gravar ────────────────────────────────────────────────────────
        //
        // Com a **chave de serviço**, e não com a credencial de quem está
        // logado. Escrever como o usuário nunca funcionou: `tenant_id` é
        // obrigatório e ninguém o preenchia (23502), e o cofre das credenciais
        // tem RLS sem policy nenhuma (42501). Conectar uma página do Facebook
        // falhava sempre — a auditoria da CRM-4c achou, e é anterior a ela.
        //
        // Passar a escrever pela chave de serviço tira a RLS do caminho, então
        // o que ela garantia passa a ser conferido aqui: o cargo (abaixo) e o
        // dono da página (adiante).
        const admin = adminClient();

        const { data: perfil, error: perfilErro } = await admin
          .from('profiles').select('tenant_id').eq('id', userId).maybeSingle();
        if (perfilErro) throw perfilErro;
        const tenantId = (perfil as { tenant_id: string } | null)?.tenant_id;
        if (!tenantId) {
          return new Response(JSON.stringify({ error: 'sua conta não está ligada a nenhuma empresa' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Era a policy de INSERT que exigia isto, e ela deixou de valer quando a
        // escrita passou a ser pela chave de serviço.
        const { data: ehGestor, error: papelErro } = await admin
          .rpc('is_supervisor_or_higher', { _user_id: userId });
        if (papelErro) throw papelErro;
        if (!ehGestor) {
          return new Response(JSON.stringify({ error: 'só gestor ou acima conecta uma rede social' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Uma página é de uma empresa só. Com a chave de serviço o `upsert` por
        // `(platform, page_id)` atualizaria a linha de quem já a tem — inclusive
        // de outra empresa —, então a pergunta é feita antes, explícita.
        if (pageId) {
          const { data: dona, error: donaErro } = await admin
            .from('mkt_social_accounts').select('tenant_id')
            .eq('platform', platform).eq('page_id', pageId).maybeSingle();
          if (donaErro) throw donaErro;
          const donaTenant = (dona as { tenant_id: string } | null)?.tenant_id;
          if (donaTenant && donaTenant !== tenantId) {
            return new Response(JSON.stringify({
              error: 'essa página já está conectada em outra empresa',
            }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
        }

        // `upsert` e não `insert`: reconectar a mesma página é rotina — foi o que
        // esta casa mandou fazer para ganhar a permissão de ler leads de anúncio
        // (CRM-4c) — e com `insert` cada reconexão deixava mais uma conta ativa
        // com o mesmo `page_id`. Duas linhas faziam o webhook do Lead Ads
        // responder 500 e o lead pago não chegar a ser gravado. Conta sem
        // `page_id` (ainda) continua nascendo nova: NULL não conflita.
        const { data: savedAccount, error: saveError } = await admin
          .from('mkt_social_accounts')
          .upsert({
            tenant_id: tenantId,
            platform,
            account_name: accountName,
            account_id: accountId,
            page_id: pageId,
            token_expires_at: tokenExpiresAt,
            is_active: true,
            is_connected: true,
          }, { onConflict: 'platform,page_id' })
          .select()
          .single();
        if (saveError) {
          console.error('Save account error:', saveError);
          throw saveError;
        }

        // O token vai para armazenamento restrito a service_role (nunca legível
        // pelo cliente). `page_access_token` só entra no payload quando a Meta o
        // devolveu: mandá-lo nulo apagaria, numa reconexão que falhou pela
        // metade, a credencial boa de uma página que já estava instalada.
        const { error: secretError } = await admin
          .from('mkt_social_account_secrets')
          .upsert({
            account_id: savedAccount.id,
            tenant_id: savedAccount.tenant_id,
            access_token: accessToken,
            // Só o Facebook: é o Lead Ads que lê a credencial da página, e ele
            // só olha conta de Facebook. Guardar a do Instagram seria segredo
            // que ninguém usa — superfície de graça.
            ...(pageToken && platform === 'facebook' ? { page_access_token: pageToken } : {}),
          }, { onConflict: 'account_id' });
        if (secretError) {
          console.error('Save token error:', secretError);
          throw secretError;
        }

        // A página **instala** o aplicativo (CRM-4c). Conectar dá ao Helpoint
        // permissão de ler a página; é esta chamada que faz ela **mandar** os
        // leads para o nosso webhook. Sem ela o administrador configura tudo e
        // nenhum lead chega — sem erro em lugar nenhum.
        //
        // Não derruba a conexão se falhar: a página segue conectada e o
        // Marketing continua publicando. O que se perde é o lead de anúncio, e
        // quem chama fica sabendo por `leads_ligados`.
        let leadsLigados = false;
        let leadsMotivo: string | null = null;
        if (platform === 'facebook' && pageId && pageToken) {
          try {
            // `graphFetch` já é a Graph API desta casa: fixa a versão num lugar
            // só e traz a mensagem de erro da Meta, que é o que diz o que fazer.
            await graphFetch(pageToken, `${pageId}/subscribed_apps`, {
              method: 'POST',
              body: JSON.stringify({ subscribed_fields: 'leadgen' }),
            });
            leadsLigados = true;
          } catch (e) {
            leadsMotivo = e instanceof Error ? e.message : String(e);
          }
        } else if (platform === 'facebook') {
          leadsMotivo = 'a Meta não devolveu a credencial da página';
        }
        if (leadsMotivo) console.warn('mkt-meta-oauth leadgen:', leadsMotivo);

        // O carimbo é posto **depois** de a Meta confirmar. Antes, a tela do
        // Lead Ads deduzia "instalada" da credencial existir — e a credencial é
        // guardada antes desta chamada, então ela mentia exatamente no caso de
        // falha para o qual o aviso foi feito.
        //
        // E o carimbo é **apagado** quando a inscrição falha, e não só posto
        // quando dá certo: reconectar uma página que já estava instalada e
        // falhar agora deixaria de pé um carimbo velho, dizendo que ela manda
        // leads quando a Meta acabou de recusar.
        if (platform === 'facebook') {
          const { error: carimboErro } = await admin.from('mkt_social_accounts')
            .update({ leads_subscribed_at: leadsLigados ? new Date().toISOString() : null })
            .eq('id', savedAccount.id).select('id');
          if (carimboErro) console.error('Save leadgen stamp error:', carimboErro);
        }

        return new Response(JSON.stringify({
          success: true,
          account: {
            id: savedAccount.id,
            platform,
            account_name: accountName,
          },
          // Para a tela poder dizer que a página conectou mas não vai mandar
          // lead — em vez de o administrador descobrir pelo silêncio.
          leads_ligados: leadsLigados,
          leads_motivo: leadsMotivo,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'refresh_token': {
        if (!account_id) {
          return new Response(JSON.stringify({ error: 'account_id is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Get current account
        const { data: account, error: getError } = await supabase
          .from('mkt_social_accounts')
          .select('*')
          .eq('id', account_id)
          .single();

        if (getError || !account) {
          return new Response(JSON.stringify({ error: 'Account not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // O cofre é **fechado**: RLS ligada, policy nenhuma e privilégio
        // revogado de `anon` e `authenticated`. Lido com a credencial de quem
        // está logado, isto era sempre `42501` — e o erro era jogado fora
        // (regra 1 das cinco), então `currentSecret` vinha nulo e a função
        // respondia "Account not connected". O ramo nunca funcionou.
        //
        // Quem confere a empresa é o `select` em `mkt_social_accounts` logo
        // acima, que passa pela policy do usuário: só chega aqui `account_id`
        // que é da empresa dele.
        const admin = adminClient();

        // Refresh the long-lived token
        const refreshUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`);
        refreshUrl.searchParams.set('grant_type', 'fb_exchange_token');
        refreshUrl.searchParams.set('client_id', META_APP_ID);
        refreshUrl.searchParams.set('client_secret', META_APP_SECRET);
        const { data: currentSecret, error: secretReadError } = await admin
          .from('mkt_social_account_secrets')
          .select('access_token')
          .eq('account_id', account_id)
          .maybeSingle();
        if (secretReadError) throw secretReadError;

        if (!currentSecret?.access_token) {
          return new Response(JSON.stringify({ error: 'Account not connected' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        refreshUrl.searchParams.set('fb_exchange_token', currentSecret.access_token);

        const refreshResponse = await fetch(refreshUrl.toString());
        const refreshData = await refreshResponse.json();

        if (refreshData.error) {
          console.error('Token refresh error:', refreshData.error);
          return new Response(JSON.stringify({ 
            error: 'Token refresh failed',
            details: refreshData.error.message 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const newToken = refreshData.access_token;
        const expiresIn = refreshData.expires_in || 5184000;
        const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

        // Update in database
        const { error: updateError } = await supabase
          .from('mkt_social_accounts')
          .update({
            token_expires_at: tokenExpiresAt,
            last_sync_at: new Date().toISOString(),
            is_connected: true,
          })
          .eq('id', account_id);

        if (updateError) {
          throw updateError;
        }

        // Pela chave de serviço, pelo mesmo motivo da leitura acima — e sem
        // tocar em `page_access_token`: o que se renova aqui é a credencial de
        // quem conectou, e mandá-la nula apagaria a da página (CRM-4c).
        const { error: secretUpdateError } = await admin
          .from('mkt_social_account_secrets')
          .upsert({
            account_id,
            tenant_id: account.tenant_id,
            access_token: newToken,
          }, { onConflict: 'account_id' });
        if (secretUpdateError) {
          throw secretUpdateError;
        }

        return new Response(JSON.stringify({ 
          success: true,
          expires_at: tokenExpiresAt
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

  } catch (error) {
    console.error('mkt-meta-oauth error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

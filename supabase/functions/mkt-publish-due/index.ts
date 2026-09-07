// Worker que publica automaticamente os posts agendados cuja hora chegou.
// Acionado via pg_cron a cada 5 minutos. Exige a chave service_role (verify_jwt = true).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireServiceRole } from "../_shared/require-service-role.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const META_API_VERSION = 'v18.0';

interface Post {
  id: string;
  tenant_id: string;
  content: string | null;
  platform: string;
  media_urls: string[] | null;
  hashtags: string[] | null;
  notes: string | null;
  scheduled_at: string;
}

interface Account {
  id: string;
  platform: string;
  account_id: string;
  page_id: string | null;
  access_token: string | null;
  token_expires_at: string | null;
}

async function publishToMeta(post: Post, account: Account): Promise<{ ok: boolean; publishedId?: string; error?: string }> {
  if (!account.access_token) return { ok: false, error: 'Account not connected' };
  if (account.token_expires_at && new Date(account.token_expires_at) < new Date()) {
    return { ok: false, error: 'Access token expired' };
  }

  let caption = post.content || '';
  if (post.hashtags?.length) {
    const tags = post.hashtags.map((h) => `#${h}`).join(' ');
    caption = caption ? `${caption}\n\n${tags}` : tags;
  }

  try {
    if (account.platform === 'instagram') {
      const media = post.media_urls || [];
      if (!media.length) return { ok: false, error: 'Instagram requires media' };

      const containerRes = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/${account.account_id}/media`,
        {
          method: 'POST',
          body: new URLSearchParams({
            image_url: media[0],
            caption,
            access_token: account.access_token,
          }),
        },
      );
      const containerData = await containerRes.json();
      if (containerData.error) return { ok: false, error: containerData.error.message };

      const publishRes = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/${account.account_id}/media_publish`,
        {
          method: 'POST',
          body: new URLSearchParams({
            creation_id: containerData.id,
            access_token: account.access_token,
          }),
        },
      );
      const publishData = await publishRes.json();
      if (publishData.error) return { ok: false, error: publishData.error.message };
      return { ok: true, publishedId: publishData.id };
    }

    if (account.platform === 'facebook') {
      if (!account.page_id) return { ok: false, error: 'No Facebook page connected' };
      const media = post.media_urls || [];

      if (media.length) {
        const res = await fetch(
          `https://graph.facebook.com/${META_API_VERSION}/${account.page_id}/photos`,
          {
            method: 'POST',
            body: new URLSearchParams({
              url: media[0],
              message: caption,
              access_token: account.access_token,
            }),
          },
        );
        const data = await res.json();
        if (data.error) return { ok: false, error: data.error.message };
        return { ok: true, publishedId: data.post_id || data.id };
      }

      const res = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/${account.page_id}/feed`,
        {
          method: 'POST',
          body: new URLSearchParams({
            message: caption,
            access_token: account.access_token,
          }),
        },
      );
      const data = await res.json();
      if (data.error) return { ok: false, error: data.error.message };
      return { ok: true, publishedId: data.id };
    }

    return { ok: false, error: `Unsupported platform: ${account.platform}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const denied = requireServiceRole(req, corsHeaders);
  if (denied) return denied;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const now = new Date().toISOString();
  const { data: duePosts, error } = await supabase
    .from('mkt_social_posts')
    .select('id, tenant_id, title, content, platform, media_urls, hashtags, notes, scheduled_at, created_by')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .limit(50);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const results = { processed: 0, published: 0, failed: 0, details: [] as any[] };

  // Quem agendou fica sabendo do resultado pelo sino.
  const notifyAuthor = async (post: { id: string; tenant_id: string; title: string | null; platform: string; created_by: string | null }, ok: boolean, detail: string) => {
    if (!post.created_by) return;
    const { error: notifyError } = await supabase.from('notifications').insert({
      tenant_id: post.tenant_id,
      user_id: post.created_by,
      type: ok ? 'post_published' : 'post_failed',
      reference_type: 'mkt_post',
      reference_id: post.id,
      title: ok ? `Post publicado no ${post.platform}` : `Falha ao publicar no ${post.platform}`,
      message: `${post.title ?? 'Post agendado'} — ${detail}`,
    });
    if (notifyError) console.error('notify author failed', notifyError);
  };

  for (const post of duePosts || []) {
    results.processed++;

    // Find an active account on the same tenant/platform
    const { data: account } = await supabase
      .from('mkt_social_accounts')
      .select('id, platform, account_id, page_id, token_expires_at')
      .eq('tenant_id', post.tenant_id)
      .eq('platform', post.platform)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (!account) {
      await supabase
        .from('mkt_social_posts')
        .update({
          status: 'failed',
          notes: `${post.notes ?? ''}\n[auto] Nenhuma conta ${post.platform} conectada.`.trim(),
        })
        .eq('id', post.id);
      await notifyAuthor(post, false, `nenhuma conta ${post.platform} conectada.`);
      results.failed++;
      results.details.push({ id: post.id, error: 'no_account' });
      continue;
    }

    const { data: accountSecret } = await supabase
      .from('mkt_social_account_secrets')
      .select('access_token')
      .eq('account_id', account.id)
      .maybeSingle();

    const result = await publishToMeta(post as Post, {
      ...(account as Omit<Account, 'access_token'>),
      access_token: accountSecret?.access_token ?? null,
    } as Account);

    if (result.ok) {
      await supabase
        .from('mkt_social_posts')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
          notes: `${post.notes ?? ''}\n[auto] Publicado via HELPOINT. ID: ${result.publishedId}`.trim(),
        })
        .eq('id', post.id);
      await notifyAuthor(post, true, 'publicado com sucesso.');
      results.published++;
      results.details.push({ id: post.id, published_id: result.publishedId });
    } else {
      await supabase
        .from('mkt_social_posts')
        .update({
          status: 'failed',
          notes: `${post.notes ?? ''}\n[auto] Falha: ${result.error}`.trim(),
        })
        .eq('id', post.id);
      await notifyAuthor(post, false, result.error ?? 'erro desconhecido.');
      results.failed++;
      results.details.push({ id: post.id, error: result.error });
    }
  }

  return new Response(JSON.stringify({ success: true, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const META_API_VERSION = 'v18.0';

interface PublishRequest {
  post_id: string;
  account_id: string;
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

    const { post_id, account_id }: PublishRequest = await req.json();

    if (!post_id || !account_id) {
      return new Response(JSON.stringify({ error: 'post_id and account_id are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get post data
    const { data: post, error: postError } = await supabase
      .from('mkt_social_posts')
      .select('*')
      .eq('id', post_id)
      .single();

    if (postError || !post) {
      return new Response(JSON.stringify({ error: 'Post not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get social account with access token
    const { data: account, error: accountError } = await supabase
      .from('mkt_social_accounts')
      .select('*')
      .eq('id', account_id)
      .single();

    if (accountError || !account) {
      return new Response(JSON.stringify({ error: 'Social account not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: accountSecret } = await supabase
      .from('mkt_social_account_secrets')
      .select('access_token')
      .eq('account_id', account_id)
      .maybeSingle();

    if (!accountSecret?.access_token) {
      return new Response(JSON.stringify({ error: 'Account not connected. Please reconnect.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check token expiration
    if (account.token_expires_at && new Date(account.token_expires_at) < new Date()) {
      return new Response(JSON.stringify({ 
        error: 'Access token expired',
        message: 'O token de acesso expirou. Por favor, reconecte a conta.'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const accessToken = accountSecret.access_token;
    const igUserId = account.account_id;
    const pageId = account.page_id;

    // Build caption with hashtags
    let caption = post.content || '';
    if (post.hashtags && post.hashtags.length > 0) {
      const hashtagStr = post.hashtags.map((h: string) => `#${h}`).join(' ');
      caption = caption ? `${caption}\n\n${hashtagStr}` : hashtagStr;
    }

    let publishedId = null;

    if (account.platform === 'instagram') {
      // Instagram Publishing Flow
      // Step 1: Create media container
      const mediaUrls = post.media_urls || [];
      
      if (mediaUrls.length === 0) {
        return new Response(JSON.stringify({ 
          error: 'Media required',
          message: 'Instagram requer pelo menos uma imagem para publicar.'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // For single image post
      const createContainerUrl = `https://graph.facebook.com/${META_API_VERSION}/${igUserId}/media`;
      const containerBody = new URLSearchParams({
        image_url: mediaUrls[0],
        caption: caption,
        access_token: accessToken,
      });

      const containerResponse = await fetch(createContainerUrl, {
        method: 'POST',
        body: containerBody,
      });
      const containerData = await containerResponse.json();

      if (containerData.error) {
        console.error('Container creation error:', containerData.error);
        return new Response(JSON.stringify({ 
          error: 'Failed to create media container',
          details: containerData.error.message 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const containerId = containerData.id;

      // Step 2: Publish the container
      const publishUrl = `https://graph.facebook.com/${META_API_VERSION}/${igUserId}/media_publish`;
      const publishBody = new URLSearchParams({
        creation_id: containerId,
        access_token: accessToken,
      });

      const publishResponse = await fetch(publishUrl, {
        method: 'POST',
        body: publishBody,
      });
      const publishData = await publishResponse.json();

      if (publishData.error) {
        console.error('Publish error:', publishData.error);
        return new Response(JSON.stringify({ 
          error: 'Failed to publish',
          details: publishData.error.message 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      publishedId = publishData.id;

    } else if (account.platform === 'facebook') {
      // Facebook Page Publishing
      if (!pageId) {
        return new Response(JSON.stringify({ error: 'No Facebook page connected' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const mediaUrls = post.media_urls || [];
      
      if (mediaUrls.length > 0) {
        // Post with photo
        const postUrl = `https://graph.facebook.com/${META_API_VERSION}/${pageId}/photos`;
        const postBody = new URLSearchParams({
          url: mediaUrls[0],
          message: caption,
          access_token: accessToken,
        });

        const postResponse = await fetch(postUrl, {
          method: 'POST',
          body: postBody,
        });
        const postData = await postResponse.json();

        if (postData.error) {
          console.error('Facebook post error:', postData.error);
          return new Response(JSON.stringify({ 
            error: 'Failed to publish',
            details: postData.error.message 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        publishedId = postData.post_id || postData.id;

      } else {
        // Text-only post
        const postUrl = `https://graph.facebook.com/${META_API_VERSION}/${pageId}/feed`;
        const postBody = new URLSearchParams({
          message: caption,
          access_token: accessToken,
        });

        const postResponse = await fetch(postUrl, {
          method: 'POST',
          body: postBody,
        });
        const postData = await postResponse.json();

        if (postData.error) {
          console.error('Facebook post error:', postData.error);
          return new Response(JSON.stringify({ 
            error: 'Failed to publish',
            details: postData.error.message 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        publishedId = postData.id;
      }
    }

    // Update post status in database
    const { error: updateError } = await supabase
      .from('mkt_social_posts')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        notes: post.notes ? `${post.notes}\nPublicado via HELPOINT. ID: ${publishedId}` : `Publicado via HELPOINT. ID: ${publishedId}`,
      })
      .eq('id', post_id);

    if (updateError) {
      console.error('Update post status error:', updateError);
    }

    return new Response(JSON.stringify({ 
      success: true,
      published_id: publishedId,
      platform: account.platform,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('mkt-meta-publish error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

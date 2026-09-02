import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { resolveSacTenant, isTenantError } from '../_shared/sac-tenant.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const code = String(body.code || '').trim();
    const purpose = body.purpose === 'signup' ? 'signup' : 'login';
    const userMeta = body.user_metadata || {};

    if (!email || !code || code.length !== 6) {
      return new Response(JSON.stringify({ error: 'invalid_request' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Tenant derivado no servidor. Sem fallback.
    const resolved = await resolveSacTenant(admin, req, {
      tenant_id: body.tenant_id,
      tenant_slug: body.tenant_slug,
    });
    if (isTenantError(resolved)) {
      return new Response(JSON.stringify({ error: resolved.error }), {
        status: resolved.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const tenant_id = resolved.tenant.id;

    // Fetch latest active code for this email
    const { data: row, error: selErr } = await admin
      .from('sac_otp_codes')
      .select('id, code_hash, attempts, used, expires_at, purpose, tenant_id')
      .eq('email', email)
      .eq('tenant_id', tenant_id)
      .eq('used', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (selErr || !row) {
      return new Response(JSON.stringify({ error: 'no_code' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await admin.from('sac_otp_codes').update({ used: true }).eq('id', row.id);
      return new Response(JSON.stringify({ error: 'expired' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (row.attempts >= 5) {
      await admin.from('sac_otp_codes').update({ used: true }).eq('id', row.id);
      return new Response(JSON.stringify({ error: 'too_many_attempts' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (row.purpose !== purpose) {
      return new Response(JSON.stringify({ error: 'invalid_request' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const candidate = await sha256(`${code}:${email}`);
    if (candidate !== row.code_hash) {
      await admin.from('sac_otp_codes').update({ attempts: row.attempts + 1 }).eq('id', row.id);
      console.warn(`[verify-sac-otp] invalid code for ${email}`);
      return new Response(JSON.stringify({ error: 'invalid_code', remaining: 4 - row.attempts }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mark used
    await admin.from('sac_otp_codes').update({ used: true }).eq('id', row.id);
    console.log(`[verify-sac-otp] code OK for ${email}, purpose=${purpose}`);

    // Ensure auth user exists — use safe RPC to avoid GoTrue listUsers bug
    let userId: string | null = null;
    const { data: statusRows, error: statusErr } = await admin.rpc('get_auth_user_status', { _email: email });
    if (statusErr) {
      console.error(`[verify-sac-otp] get_auth_user_status failed:`, statusErr);
      return new Response(JSON.stringify({ error: 'lookup_failed', detail: statusErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const existing = Array.isArray(statusRows) ? statusRows[0] : statusRows;
    if (existing?.user_id) {
      userId = existing.user_id as string;
      if (purpose === 'login') {
        const { data: prof } = await admin
          .from('customer_profiles').select('id')
          .eq('user_id', userId).eq('tenant_id', tenant_id).maybeSingle();
        if (!prof) {
          return new Response(JSON.stringify({ error: 'not_registered' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    } else {
      if (purpose === 'login') {
        return new Response(JSON.stringify({ error: 'user_not_found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { ...userMeta, customer_signup: true },
      });
      if (createErr || !created.user) {
        console.error(`[verify-sac-otp] createUser failed:`, createErr);
        return new Response(JSON.stringify({ error: createErr?.message || 'create_failed' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      userId = created.user.id;
    }

    // Generate a magiclink hashed_token (does NOT send email if hook is bypassed; but Auth may try the hook).
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      console.error(`[verify-sac-otp] generateLink failed:`, linkErr);
      return new Response(JSON.stringify({ error: linkErr?.message || 'link_failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[verify-sac-otp] success ${email} user=${userId}`);
    return new Response(JSON.stringify({
      success: true,
      user_id: userId,
      token_hash: linkData.properties.hashed_token,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

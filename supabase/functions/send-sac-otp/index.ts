import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { Resend } from 'https://esm.sh/resend@2.0.0';
import { resolveSacTenant, isTenantError } from '../_shared/sac-tenant.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function buildEmailHtml(opts: { code: string; tenantName: string; logoUrl: string | null; purpose: string }) {
  const { code, tenantName, logoUrl, purpose } = opts;
  const title = purpose === 'signup' ? 'Confirme seu e-mail' : 'Seu código de acesso';
  const intro = purpose === 'signup'
    ? 'Use o código abaixo para concluir seu cadastro no nosso atendimento.'
    : 'Use o código abaixo para entrar no nosso atendimento.';
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:'Segoe UI',Tahoma,Verdana,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 20px;">
    <div style="background:#ffffff;border-radius:14px;padding:36px;box-shadow:0 2px 10px rgba(0,0,0,.06);">
      <div style="text-align:center;margin-bottom:24px;">
        ${logoUrl ? `<img src="${logoUrl}" alt="${tenantName}" style="max-height:56px;margin-bottom:8px;" />` : ''}
        <div style="color:#1a1a2e;font-size:18px;font-weight:700;">${tenantName}</div>
        <div style="color:#7e8599;font-size:13px;margin-top:2px;">Atendimento ao Cliente</div>
      </div>
      <h1 style="text-align:center;color:#1a1a2e;font-size:22px;font-weight:700;margin:8px 0 8px;">${title}</h1>
      <p style="text-align:center;color:#626d80;font-size:15px;line-height:1.6;margin:0 0 24px;">${intro}</p>
      <div style="text-align:center;margin:24px 0;">
        <div style="display:inline-block;background:#f4f6fb;border:2px solid #0073ea;border-radius:12px;padding:18px 28px;">
          <span style="font-family:'Courier New',monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:#1a3a6b;">${code}</span>
        </div>
      </div>
      <p style="text-align:center;color:#f59e0b;font-size:13px;font-weight:600;margin:0 0 12px;">Este código expira em 10 minutos.</p>
      <hr style="border:none;border-top:1px solid #eef0f4;margin:28px 0;">
      <p style="text-align:center;color:#94a0b3;font-size:12px;line-height:1.6;margin:0;">
        Se você não solicitou este código, pode ignorar este e-mail.<br>
        Nunca compartilhe este código com ninguém.
      </p>
    </div>
    <div style="text-align:center;margin-top:18px;color:#94a0b3;font-size:11px;">
      © ${new Date().getFullYear()} ${tenantName}
    </div>
  </div>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: 'resend_not_configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const resend = new Resend(resendApiKey);

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const purpose = body.purpose === 'signup' ? 'signup' : 'login';

    if (!email || !/.+@.+\..+/.test(email)) {
      return new Response(JSON.stringify({ error: 'invalid_email' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Tenant derivado no servidor (host próprio > slug/id validados). Sem fallback.
    const resolved = await resolveSacTenant(admin, req, {
      tenant_id: body.tenant_id,
      tenant_slug: body.tenant_slug,
    });
    if (isTenantError(resolved)) {
      return new Response(JSON.stringify({ error: resolved.error }), {
        status: resolved.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const tenant = resolved.tenant;
    const tenant_id = tenant.id;

    const { data: existing } = await admin
      .from('customer_profiles').select('id, is_blocked')
      .eq('email', email).eq('tenant_id', tenant_id).maybeSingle();

    if (purpose === 'login' && !existing) {
      return new Response(JSON.stringify({ error: 'not_registered' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (purpose === 'signup' && existing) {
      return new Response(JSON.stringify({ error: 'already_registered' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (existing?.is_blocked) {
      return new Response(JSON.stringify({ error: 'blocked' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: recent } = await admin
      .from('sac_otp_codes').select('id, created_at').eq('email', email).eq('used', false)
      .gte('created_at', new Date(Date.now() - 60_000).toISOString()).limit(1);
    if (recent && recent.length > 0) {
      return new Response(JSON.stringify({ error: 'rate_limited' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await admin.from('sac_otp_codes').update({ used: true }).eq('email', email).eq('used', false);

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const code_hash = await sha256(`${code}:${email}`);
    const expires_at = new Date(Date.now() + 10 * 60_000).toISOString();

    const { error: insErr } = await admin.from('sac_otp_codes').insert({
      email, tenant_id, code_hash, purpose, expires_at,
    });
    if (insErr) {
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const html = buildEmailHtml({ code, tenantName: tenant.name, logoUrl: tenant.logo_url, purpose });
    const subject = purpose === 'signup'
      ? `${tenant.name} — Confirme seu e-mail`
      : `${tenant.name} — Seu código de acesso`;

    const fromAddress = Deno.env.get('SAC_FROM_EMAIL') || 'noreply@helpoint.com.br';
    const fromName = tenant.name.replace(/[<>"]/g, '');

    const { data: emailData, error: emailErr } = await resend.emails.send({
      from: `${fromName} <${fromAddress}>`,
      to: [email],
      subject,
      html,
    });

    if (emailErr) {
      console.error('Resend error:', emailErr);
      return new Response(JSON.stringify({ error: 'send_failed', detail: emailErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`✅ OTP SAC enviado para ${email} (tenant ${tenant.name}) id=${emailData?.id}`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

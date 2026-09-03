import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { emailConfigError, sendEmail } from '../_shared/email.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function html(confirmUrl: string, fullName: string) {
  const name = (fullName || '').split(' ')[0] || '';
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:'Segoe UI',Tahoma,Verdana,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 20px;">
    <div style="background:#fff;border-radius:14px;padding:36px;box-shadow:0 2px 10px rgba(0,0,0,.06);">
      <div style="text-align:center;color:#1a1a2e;font-size:20px;font-weight:700;margin-bottom:6px;">Helpoint</div>
      <div style="text-align:center;color:#7e8599;font-size:13px;margin-bottom:24px;">Confirmação de e-mail</div>
      <h1 style="text-align:center;color:#1a1a2e;font-size:22px;font-weight:700;margin:8px 0 8px;">Olá${name ? ', ' + name : ''}!</h1>
      <p style="text-align:center;color:#626d80;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Confirme seu e-mail para concluir o cadastro da sua empresa no Helpoint.
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${confirmUrl}" style="display:inline-block;background:#0073ea;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:10px;">Confirmar meu e-mail</a>
      </div>
      <p style="text-align:center;color:#94a0b3;font-size:12px;line-height:1.6;margin:18px 0 0;">
        Se o botão não funcionar, copie e cole este link no navegador:<br>
        <span style="color:#0073ea;word-break:break-all;">${confirmUrl}</span>
      </p>
      <hr style="border:none;border-top:1px solid #eef0f4;margin:28px 0;">
      <p style="text-align:center;color:#94a0b3;font-size:12px;line-height:1.6;margin:0;">
        Se você não solicitou este cadastro, pode ignorar este e-mail.
      </p>
    </div>
    <div style="text-align:center;margin-top:18px;color:#94a0b3;font-size:11px;">© ${new Date().getFullYear()} Helpoint</div>
  </div>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { email, password, full_name, redirect_to } = await req.json();
    const e = String(email || '').trim().toLowerCase();
    const pw = String(password || '');
    const fn = String(full_name || '').trim();

    if (!/.+@.+\..+/.test(e)) return json({ error: 'invalid_email' }, 400);
    if (pw.length < 8) return json({ error: 'weak_password' }, 400);

    const emailCfg = emailConfigError();
    if (emailCfg) return json({ error: emailCfg }, 500);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Cria (ou atualiza) usuário sem confirmar e gera link de confirmação
    const redirect = (redirect_to && /^https?:\/\//.test(redirect_to))
      ? redirect_to
      : 'https://helpoint.com.br/onboarding/empresa';

    // Tenta criar; se já existe não-confirmado, gera link mesmo assim
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: e,
      password: pw,
      email_confirm: false,
      user_metadata: { full_name: fn },
    });

    if (createErr && !/already|exist|registered/i.test(createErr.message)) {
      return json({ error: createErr.message }, 400);
    }

    // Se já existir, valida que ainda não foi confirmado (via função SQL, evita bug do listUsers)
    let userId = created?.user?.id;
    if (!userId) {
      const { data: statusRows, error: statusErr } = await admin
        .rpc('get_auth_user_status', { _email: e });
      const existing = Array.isArray(statusRows) ? statusRows[0] : statusRows;
      if (statusErr || !existing?.user_id) return json({ error: 'user_not_found' }, 400);
      if (existing.is_confirmed) return json({ error: 'already_confirmed' }, 400);
      userId = existing.user_id;
      // Atualiza senha e metadata
      await admin.auth.admin.updateUserById(userId, {
        password: pw,
        user_metadata: { full_name: fn },
      });
    }

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'signup',
      email: e,
      password: pw,
      options: { redirectTo: redirect, data: { full_name: fn } },
    });
    if (linkErr || !linkData?.properties?.action_link) {
      return json({ error: linkErr?.message || 'link_failed' }, 500);
    }

    const confirmUrl = linkData.properties.action_link;

    const fromAddress = Deno.env.get('AUTH_FROM_EMAIL') || 'noreply@helpoint.com.br';
    const sent = await sendEmail({
      from: `Helpoint <${fromAddress}>`,
      to: e,
      subject: 'Confirme seu e-mail no Helpoint',
      html: html(confirmUrl, fn),
    });
    if (!sent.ok) {
      console.error('Email error', sent.error);
      return json({ error: 'send_failed', detail: sent.error }, 500);
    }

    return json({ success: true, needs_confirmation: true });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

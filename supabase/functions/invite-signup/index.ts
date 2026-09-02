import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AppRole = "owner" | "admin" | "manager" | "member" | "viewer";

// Hierarquia oficial (enum app_role). 'customer' não é convidável por este fluxo.
const ROLE_RANK: Record<string, number> = {
  viewer: 1,
  member: 2,
  manager: 3,
  admin: 4,
  owner: 5,
};

type CreateInviteBody = {
  action: "create_invite";
  email: string;
  role?: AppRole;
  department?: string;
  expires_in_days?: number;
};

type ResendInviteBody = {
  action: "resend_invite";
  invite_id: string;
};

type CancelInviteBody = {
  action: "cancel_invite";
  invite_id: string;
};

type AcceptInviteBody = {
  action: "accept_invite";
  invite_id: string;
  email: string;
  password: string;
  full_name?: string;
  department?: string;
  job_title?: string;
  phone?: string;
};

function json(resBody: unknown, status = 200) {
  return new Response(JSON.stringify(resBody), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "https://helpoint.com.br";
const INVITE_FROM_ADDRESS = Deno.env.get("INVITE_FROM_EMAIL")
  || Deno.env.get("AUTH_FROM_EMAIL")
  || "noreply@helpoint.com.br";
const INVITE_FROM = `Helpoint <${INVITE_FROM_ADDRESS}>`;

function inviteEmailHtml(opts: {
  tenantName: string;
  inviterName?: string | null;
  role: string;
  department?: string | null;
  acceptUrl: string;
  expiresAt: string;
}) {
  const exp = new Date(opts.expiresAt).toLocaleDateString("pt-BR");
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#f6f7fb;margin:0;padding:32px;color:#111">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e6e9ef;border-radius:12px;overflow:hidden">
    <tr><td style="padding:28px 32px 8px">
      <h1 style="margin:0 0 8px;font-size:20px">Você foi convidado para o Helpoint</h1>
      <p style="margin:0;color:#555;font-size:14px">${opts.inviterName ? `<b>${opts.inviterName}</b> convidou você ` : "Você foi convidado "}para entrar em <b>${opts.tenantName}</b>.</p>
    </td></tr>
    <tr><td style="padding:16px 32px">
      <table cellpadding="0" cellspacing="0" style="font-size:13px;color:#333">
        <tr><td style="padding:4px 0;color:#777">Papel</td><td style="padding:4px 0 4px 16px"><b>${opts.role}</b></td></tr>
        ${opts.department ? `<tr><td style="padding:4px 0;color:#777">Departamento</td><td style="padding:4px 0 4px 16px"><b>${opts.department}</b></td></tr>` : ""}
        <tr><td style="padding:4px 0;color:#777">Validade</td><td style="padding:4px 0 4px 16px"><b>${exp}</b></td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:16px 32px 32px">
      <a href="${opts.acceptUrl}" style="display:inline-block;background:#0073ea;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:14px">Aceitar convite e criar conta</a>
      <p style="margin:16px 0 0;font-size:12px;color:#888">Se o botão não funcionar, copie e cole no navegador:<br/><span style="word-break:break-all">${opts.acceptUrl}</span></p>
    </td></tr>
  </table>
  <p style="text-align:center;color:#9aa0a6;font-size:11px;margin-top:16px">© Helpoint</p>
  </body></html>`;
}

async function sendInviteEmail(opts: {
  to: string;
  tenantName: string;
  inviterName?: string | null;
  role: string;
  department?: string | null;
  acceptUrl: string;
  expiresAt: string;
}) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    return { ok: false, used_from: INVITE_FROM, error: "resend_not_configured" };
  }

  try {
    const resend = new Resend(RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: INVITE_FROM,
      to: [opts.to],
      subject: `Convite para ${opts.tenantName} no Helpoint`,
      html: inviteEmailHtml(opts),
    });

    if (error) {
      const msg = typeof error === "string" ? error : (error as any).message || JSON.stringify(error);
      console.error("[invite] resend error", error);
      return { ok: false, used_from: INVITE_FROM, error: `resend: ${msg}`.slice(0, 500) };
    }
    return { ok: true, used_from: INVITE_FROM, data };
  } catch (e) {
    console.error("[invite] resend exception", e);
    return { ok: false, used_from: INVITE_FROM, error: `resend_exception: ${String(e)}`.slice(0, 500) };
  }
}

async function requireAuthenticatedUser(req: Request): Promise<string> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return data.claims.sub;
}

async function handleCreateInvite(req: Request, body: CreateInviteBody) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userId = await requireAuthenticatedUser(req);
  const authHeader = req.headers.get("Authorization")!;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: isAllowed } = await supabase.rpc("is_supervisor_or_higher", { _user_id: userId });
  if (!isAllowed) return json({ error: "Forbidden" }, 403);

  const email = body.email?.trim().toLowerCase();
  if (!email) return json({ error: "email is required" }, 400);

  const { data: profile, error: profileErr } = await supabase
    .from("profiles").select("tenant_id, full_name").eq("id", userId).single();
  if (profileErr || !profile?.tenant_id) {
    return json({ error: "Unable to resolve tenant" }, 500);
  }

  const { data: tenant } = await supabase
    .from("tenants").select("name").eq("id", profile.tenant_id).single();

  // Validação server-side do papel: whitelist + hierarquia do convidante
  const requestedRole = (body.role ?? "member") as string;
  if (!(requestedRole in ROLE_RANK)) {
    return json({ error: "invalid_role" }, 400);
  }

  const { data: inviterRoles } = await supabase
    .from("user_roles").select("role").eq("user_id", userId);
  const inviterRank = Math.max(
    0,
    ...((inviterRoles ?? []).map((r: { role: string }) => ROLE_RANK[r.role] ?? 0)),
  );
  if (inviterRank === 0) return json({ error: "Forbidden" }, 403);

  const requestedRank = ROLE_RANK[requestedRole];
  if (requestedRank > inviterRank) {
    return json({ error: "insufficient_privilege_for_role" }, 403);
  }
  if (requestedRole === "owner" && inviterRank < ROLE_RANK.owner) {
    return json({ error: "only_owner_can_invite_owner" }, 403);
  }
  const role: AppRole = requestedRole as AppRole;
  // Convites válidos por 24 horas
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const insertData: Record<string, unknown> = {
    tenant_id: profile.tenant_id,
    email,
    role,
    invited_by: userId,
    expires_at: expiresAt,
    send_status: "pending",
  };
  if (body.department) insertData.department = body.department;
  if ((body as any).access_profile_id) insertData.access_profile_id = (body as any).access_profile_id;
  if ((body as any).access_profile_overrides) insertData.access_profile_overrides = (body as any).access_profile_overrides;

  const { data: invite, error: inviteErr } = await supabase
    .from("tenant_invites")
    .insert(insertData)
    .select("id, email, role, department, expires_at, created_at")
    .single();

  if (inviteErr) {
    console.error("create_invite insert error:", inviteErr);
    return json({ error: inviteErr.message || "Failed to create invite" }, 500);
  }

  const acceptUrl = `${APP_BASE_URL}/convite/${invite.id}`;
  const sendRes = await sendInviteEmail({
    to: email,
    tenantName: tenant?.name || "Helpoint",
    inviterName: profile.full_name,
    role: String(role),
    department: body.department || null,
    acceptUrl,
    expiresAt: invite.expires_at,
  });

  await supabase.from("tenant_invites").update({
    send_status: sendRes.ok ? "sent" : "failed",
    send_attempts: 1,
    last_sent_at: new Date().toISOString(),
    last_send_error: sendRes.ok ? null : (sendRes as any).error?.slice?.(0, 1000) || null,
  }).eq("id", invite.id);

  if (!sendRes.ok) {
    return json({
      invite,
      email_sent: false,
      error: `Não foi possível enviar o e-mail pelo Resend: ${(sendRes as any).error}. O convite foi salvo; reenvie pelo painel.`,
    }, 200);
  }

  return json({
    invite,
    email_sent: true,
    used_from: (sendRes as any).used_from,
  });
}

async function handleResendInvite(req: Request, body: ResendInviteBody) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userId = await requireAuthenticatedUser(req);
  const authHeader = req.headers.get("Authorization")!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: isAllowed } = await supabase.rpc("is_supervisor_or_higher", { _user_id: userId });
  if (!isAllowed) return json({ error: "Forbidden" }, 403);

  const { data: invite, error } = await supabase
    .from("tenant_invites")
    .select("id, tenant_id, email, role, department, used_at, send_attempts")
    .eq("id", body.invite_id)
    .single();
  if (error || !invite) return json({ error: "invite_not_found" }, 404);
  if (invite.used_at) return json({ error: "invite_already_used" }, 400);

  // Renova validade por mais 24h a partir do reenvio
  const newExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await supabase.from("tenant_invites").update({ expires_at: newExpires }).eq("id", invite.id);

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", userId).single();
  const { data: tenant } = await supabase.from("tenants").select("name").eq("id", invite.tenant_id).single();

  const sendRes = await sendInviteEmail({
    to: invite.email,
    tenantName: tenant?.name || "Helpoint",
    inviterName: profile?.full_name,
    role: String(invite.role),
    department: invite.department,
    acceptUrl: `${APP_BASE_URL}/convite/${invite.id}`,
    expiresAt: newExpires,
  });

  await supabase.from("tenant_invites").update({
    send_status: sendRes.ok ? "sent" : "failed",
    send_attempts: (invite.send_attempts || 0) + 1,
    last_sent_at: new Date().toISOString(),
    last_send_error: sendRes.ok ? null : (sendRes as any).error?.slice?.(0, 1000) || null,
  }).eq("id", invite.id);

  return json({
    ok: sendRes.ok,
    email_sent: sendRes.ok,
    error: sendRes.ok ? null : (sendRes as any).error,
  });
}

async function handleCancelInvite(req: Request, body: CancelInviteBody) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userId = await requireAuthenticatedUser(req);
  const authHeader = req.headers.get("Authorization")!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: isAllowed } = await supabase.rpc("is_supervisor_or_higher", { _user_id: userId });
  if (!isAllowed) return json({ error: "Forbidden" }, 403);

  const { error } = await supabase.from("tenant_invites").delete().eq("id", body.invite_id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}

async function handleAcceptInvite(body: AcceptInviteBody) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const inviteId = body.invite_id?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  if (!inviteId || !email || !password) {
    return json({ error: "invite_id, email and password are required" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: invite, error: inviteErr } = await admin
    .from("tenant_invites")
    .select("id, tenant_id, email, role, department, expires_at, used_at, access_profile_id, access_profile_overrides")
    .eq("id", inviteId)
    .single();

  if (inviteErr || !invite) return json({ error: "Invalid invite" }, 400);
  if (invite.used_at) return json({ error: "Invite already used" }, 400);
  if (new Date(invite.expires_at).getTime() < Date.now()) return json({ error: "Invite expired" }, 400);
  if (invite.email.toLowerCase() !== email) return json({ error: "Email does not match invite" }, 400);

  let newUserId: string | null = null;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });

  if (createErr || !created?.user?.id) {
    const code = (createErr as any)?.code || "";
    const msg = (createErr as any)?.message || "";
    if (code === "weak_password" || /weak.?password|pwned/i.test(msg)) {
      return json({
        error: "Esta senha já apareceu em vazamentos públicos ou é muito fraca. Use o botão 'Sugerir senha forte' ou escolha outra senha.",
        code: "weak_password",
      }, 400);
    }
    if (code === "email_exists" || /already.*registered|already.*exists/i.test(msg)) {
      const { data: statusRows, error: statusErr } = await admin.rpc("get_auth_user_status", { _email: email });
      const row = Array.isArray(statusRows) ? statusRows[0] : (statusRows as any);
      const existingId: string | undefined = row?.user_id;
      if (statusErr || !existingId) {
        console.error("accept_invite: email_exists but lookup failed", statusErr);
        return json({ error: "Este e-mail já está cadastrado. Use 'Esqueci minha senha' para recuperar o acesso." }, 409);
      }
      const { data: prof } = await admin.from("profiles").select("id, tenant_id").eq("id", existingId).maybeSingle();
      if (prof?.tenant_id && prof.tenant_id !== invite.tenant_id) {
        return json({ error: "Este e-mail já está vinculado a outra empresa." }, 409);
      }
      const { error: updErr } = await admin.auth.admin.updateUserById(existingId, { password, email_confirm: true });
      if (updErr) {
        const uCode = (updErr as any)?.code || "";
        const uMsg = (updErr as any)?.message || "";
        if (uCode === "weak_password" || /weak.?password|pwned/i.test(uMsg)) {
          return json({
            error: "Esta senha já apareceu em vazamentos públicos ou é muito fraca. Use o botão 'Sugerir senha forte' ou escolha outra senha.",
            code: "weak_password",
          }, 400);
        }
        console.error("accept_invite updateUserById error:", updErr);
        return json({ error: "Não foi possível redefinir a senha desta conta. Use 'Esqueci minha senha'." }, 500);
      }
      newUserId = existingId;
    } else {
      console.error("accept_invite createUser error:", createErr);
      return json({ error: msg || "Falha ao criar usuário" }, 500);
    }
  } else {
    newUserId = created.user.id;
  }

  const department = invite.department || body.department || null;

  const { error: profileInsErr } = await admin.from("profiles").upsert({
    id: newUserId!, tenant_id: invite.tenant_id, email,
    full_name: body.full_name ?? null, department,
    job_title: body.job_title ?? null, phone: body.phone ?? null, is_active: true,
  }, { onConflict: "id" });
  if (profileInsErr) {
    console.error("accept_invite profile upsert error:", profileInsErr);
    return json({ error: "Failed to create profile" }, 500);
  }

  // Idempotente: ignora se já existir o par (user_id, role)
  const { error: roleInsErr } = await admin.from("user_roles").insert({
    user_id: newUserId!, role: invite.role, granted_by: null,
  });
  if (roleInsErr && !/duplicate key|unique constraint|23505/i.test(roleInsErr.message || "")) {
    console.error("accept_invite user_roles insert error:", roleInsErr);
    return json({ error: "Failed to assign role" }, 500);
  }

  // Aplica perfil de acesso pré-selecionado no convite
  if ((invite as any).access_profile_id) {
    const { error: apErr } = await admin.from("user_access_profiles").upsert({
      tenant_id: invite.tenant_id,
      user_id: newUserId!,
      profile_id: (invite as any).access_profile_id,
      overrides: (invite as any).access_profile_overrides ?? null,
    }, { onConflict: "tenant_id,user_id,profile_id" });
    if (apErr) console.error("accept_invite access profile assign error:", apErr);
  }

  await admin
    .from("rh_employee_profiles")
    .update({ user_id: newUserId })
    .eq("tenant_id", invite.tenant_id)
    .is("user_id", null)
    .ilike("access_email", email);

  await admin
    .from("tenant_invites")
    .update({ used_at: new Date().toISOString(), used_by: newUserId, send_status: "accepted" })
    .eq("id", invite.id);

  return json({ success: true });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = (await req.json()) as any;
    if (body.action === "create_invite") return await handleCreateInvite(req, body);
    if (body.action === "resend_invite") return await handleResendInvite(req, body);
    if (body.action === "cancel_invite") return await handleCancelInvite(req, body);
    if (body.action === "accept_invite") return await handleAcceptInvite(body);
    return json({ error: "Invalid action" }, 400);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("invite-signup error:", error);
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido" }, 500);
  }
});

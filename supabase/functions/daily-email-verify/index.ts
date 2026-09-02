import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FROM_ADDRESS = Deno.env.get("AUTH_FROM_EMAIL") || Deno.env.get("INVITE_FROM_EMAIL") || "noreply@helpoint.com.br";
const FROM = `Helpoint <${FROM_ADDRESS}>`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256(text: string) {
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function getUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Response("Unauthorized", { status: 401, headers: corsHeaders });
  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await supa.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (error || !data?.claims?.sub) throw new Response("Unauthorized", { status: 401, headers: corsHeaders });
  return { userId: data.claims.sub as string, email: (data.claims.email as string) || "" };
}

function html(code: string) {
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f6f7fb;padding:32px;color:#111">
  <div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e6e9ef;border-radius:12px;padding:28px 32px">
    <h1 style="margin:0 0 8px;font-size:18px">Confirmação de acesso</h1>
    <p style="margin:0 0 16px;color:#555;font-size:14px">Use o código abaixo para confirmar seu acesso ao Helpoint. Ele é válido por 15 minutos e só será solicitado uma vez por dia.</p>
    <div style="font-size:30px;letter-spacing:8px;font-weight:700;text-align:center;background:#f1f3f7;padding:16px;border-radius:8px;color:#0073ea">${code}</div>
    <p style="margin:16px 0 0;color:#888;font-size:12px">Se você não tentou entrar, ignore este e-mail.</p>
  </div></body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const { userId, email } = await getUser(req);
    const body = await req.json();
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (body.action === "status") {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await admin
        .from("daily_email_otps")
        .select("verified_at")
        .eq("user_id", userId)
        .not("verified_at", "is", null)
        .gte("verified_at", `${today}T00:00:00Z`)
        .limit(1);
      return json({ verified: (data?.length ?? 0) > 0 });
    }

    if (body.action === "send_code") {
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      if (!RESEND_API_KEY) return json({ error: "resend_not_configured" }, 500);
      // Rate limit: máx 3 envios em 10 min
      const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { count } = await admin.from("daily_email_otps")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId).gte("created_at", since);
      if ((count ?? 0) >= 3) return json({ error: "rate_limited" }, 429);

      const code = String(Math.floor(100000 + Math.random() * 900000));
      const code_hash = await sha256(`${userId}:${code}`);
      const expires_at = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await admin.from("daily_email_otps").insert({ user_id: userId, code_hash, expires_at });

      const resend = new Resend(RESEND_API_KEY);
      const { error } = await resend.emails.send({
        from: FROM,
        to: [email],
        subject: `Helpoint • Código de acesso ${code}`,
        html: html(code),
      });
      if (error) {
        console.error("[daily-email] resend error", error);
        return json({ error: "send_failed" }, 500);
      }
      return json({ ok: true });
    }

    if (body.action === "verify_code") {
      const code = String(body.code || "").trim();
      if (!/^\d{6}$/.test(code)) return json({ error: "invalid_code_format" }, 400);
      const code_hash = await sha256(`${userId}:${code}`);
      const { data } = await admin
        .from("daily_email_otps")
        .select("id, expires_at, verified_at")
        .eq("user_id", userId)
        .eq("code_hash", code_hash)
        .is("verified_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return json({ error: "invalid_code" }, 400);
      if (new Date(data.expires_at).getTime() < Date.now()) return json({ error: "expired" }, 400);
      await admin.from("daily_email_otps").update({ verified_at: new Date().toISOString() }).eq("id", data.id);
      return json({ ok: true });
    }

    return json({ error: "invalid_action" }, 400);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("daily-email-verify error:", e);
    return json({ error: String(e) }, 500);
  }
});

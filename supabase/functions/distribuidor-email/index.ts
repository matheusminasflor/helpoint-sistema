// Os e-mails do Portal do Distribuidor (etapa 6): "acesso liberado", quando a TI libera o cadastro, e o convite do
// vendedor, quando o distribuidor chama alguém da equipe. Quem chama é a tela, com o login de quem agiu; os dados vêm
// de `dist_dados_do_email`, que só responde a quem pode mandar aquele e-mail (quem libera, ou o dono do distribuidor).
// Sem service_role: tudo com a permissão de quem chamou.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { escapeHtml, sendEmail } from "../_shared/email.ts";
import { appBaseUrl, REMETENTE_PADRAO } from "../_shared/app-hosts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const FROM = `Helpoint <${Deno.env.get("AUTH_FROM_EMAIL") || Deno.env.get("INVITE_FROM_EMAIL") || REMETENTE_PADRAO}>`;

type Dados = { para: string; nome: string | null; razao_social: string; empresa: string; slug: string };

function corpo(tipo: "liberado" | "convite", d: Dados, link: string): { subject: string; html: string } {
  const ola = d.nome ? `Olá, ${escapeHtml(d.nome)}!` : "Olá!";
  const texto = tipo === "liberado"
    ? `O cadastro de <b>${escapeHtml(d.razao_social)}</b> no Portal do Distribuidor da ${escapeHtml(d.empresa)} foi liberado. Já dá para entrar e organizar seus salões, visitas, vendas e estoque.`
    : `<b>${escapeHtml(d.razao_social)}</b> convidou você para a equipe no Portal do Distribuidor da ${escapeHtml(d.empresa)}. Faça seu cadastro com este e-mail para entrar.`;
  const botao = tipo === "liberado" ? "Entrar no portal" : "Fazer meu cadastro";
  return {
    subject: tipo === "liberado" ? "Seu acesso ao Portal do Distribuidor foi liberado" : `Convite para a equipe de ${d.razao_social}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#0a0a0a">
      <p style="font-size:16px">${ola}</p>
      <p style="font-size:15px;line-height:1.5">${texto}</p>
      <p style="margin:24px 0"><a href="${link}" style="background:#141414;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-size:15px">${botao}</a></p>
      <p style="font-size:13px;color:#5f5f5c">Você entra com um código enviado para este e-mail, sem senha.</p>
    </div>`,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  let body: { tipo?: string; id?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const tipo = body.tipo === "liberado" || body.tipo === "convite" ? body.tipo : null;
  if (!tipo || !body.id) return json({ error: "tipo e id são obrigatórios" }, 400);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data, error } = await supabase.rpc("dist_dados_do_email", { p_tipo: tipo, p_id: body.id });
  if (error) return json({ error: error.message }, 500);
  if (!data) return json({ error: "Forbidden" }, 403);

  const d = data as Dados;
  const caminho = tipo === "liberado" ? "/sac/entrar" : "/sac/cadastro";
  const link = `${appBaseUrl()}${caminho}?tenant=${encodeURIComponent(d.slug)}&destino=distribuidor`;
  const { subject, html } = corpo(tipo, d, link);
  const res = await sendEmail({ to: d.para, subject, html, from: FROM });
  return res.ok ? json({ ok: true }) : json({ error: res.error }, 502);
});

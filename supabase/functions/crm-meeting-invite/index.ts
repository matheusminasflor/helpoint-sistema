// Avisa o cliente da reunião marcada no negócio (CRM-3b, ADR-006).
//
// A reunião em si é gravada pelo banco (`crm_agendar_reuniao`): evento na agenda
// do vendedor e linha na história do negócio, numa transação só. Esta função faz
// **só o convite por e-mail**, porque mandar e-mail exige a credencial que vive
// nos segredos das edge functions.
//
// POST { deal_id, event_id }  (JWT) → { enviado: boolean, motivo?: string }
//
// Falhar aqui **não** desfaz a reunião: ela já está marcada, e a tela diz que o
// aviso não saiu. O contrário — desfazer a reunião porque o e-mail não foi —
// seria pior.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { adminClient, isUuid } from '../_shared/payment-credentials.ts';
import { sendEmail, emailConfigError } from '../_shared/email.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const FROM = Deno.env.get('AUTH_FROM_EMAIL') || Deno.env.get('INVITE_FROM_EMAIL') || 'noreply@helpoint.com.br';

const escapar = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const dealId = typeof body.deal_id === 'string' ? body.deal_id : '';
    const eventId = typeof body.event_id === 'string' ? body.event_id : '';
    if (!isUuid(dealId) || !isUuid(eventId)) return json({ error: 'negócio ou reunião não informados' }, 400);

    // Tudo pela RLS de quem pediu: negócio que ele não enxerga não manda convite,
    // e evento que não é dele também não.
    const { data: deal, error: dealError } = await userClient
      .from('crm_deals').select('id, title, contact:crm_contacts(name, email)').eq('id', dealId).maybeSingle();
    if (dealError) throw dealError;
    if (!deal) return json({ error: 'negocio nao encontrado' }, 404);

    const { data: evento, error: eventoError } = await userClient
      .from('calendar_events').select('id, title, description, start_at, end_at, source_id')
      .eq('id', eventId).maybeSingle();
    if (eventoError) throw eventoError;
    if (!evento || (evento as { source_id: string | null }).source_id !== dealId) {
      return json({ error: 'reuniao nao encontrada' }, 404);
    }

    const contato = (deal as unknown as { contact: { name: string; email: string | null } | null }).contact;
    if (!contato?.email) return json({ enviado: false, motivo: 'o cliente não tem e-mail no cadastro' });

    const faltaConfig = emailConfigError();
    if (faltaConfig) return json({ enviado: false, motivo: 'o envio de e-mail ainda não está configurado nesta instalação' });

    const ev = evento as unknown as { title: string; description: string | null; start_at: string; end_at: string | null };
    const quando = new Date(ev.start_at).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'short',
    });

    // Quem convida é a empresa, não o Helpoint: o nome dela vai no texto.
    const admin = adminClient();
    const { data: perfil, error: perfilError } = await admin
      .from('profiles').select('full_name, tenant_id').eq('id', userData.user.id).maybeSingle();
    if (perfilError) throw perfilError;
    const { data: empresa, error: empresaError } = await admin
      .from('tenants').select('name').eq('id', (perfil as { tenant_id: string }).tenant_id).maybeSingle();
    if (empresaError) throw empresaError;

    const quem = (perfil as { full_name: string | null })?.full_name ?? '';
    const nomeEmpresa = (empresa as { name: string } | null)?.name ?? 'Helpoint';

    const res = await sendEmail({
      to: contato.email,
      subject: `Reunião marcada: ${ev.title}`,
      from: `${nomeEmpresa} <${FROM}>`,
      html: `
        <p>Olá, ${escapar(contato.name)}.</p>
        <p>${escapar(quem || nomeEmpresa)} marcou uma reunião com você:</p>
        <p><strong>${escapar(ev.title)}</strong><br>${escapar(quando)}</p>
        ${ev.description ? `<p>${escapar(ev.description).replace(/\n/g, '<br>')}</p>` : ''}
        <p>Se esse horário não servir, é só responder este e-mail.</p>
        <p style="color:#6b7280;font-size:12px">${escapar(nomeEmpresa)}</p>
      `,
    });
    if (!res.ok) return json({ enviado: false, motivo: res.error });
    return json({ enviado: true, para: contato.email });
  } catch (e) {
    console.error('crm-meeting-invite', e instanceof Error ? e.message : String(e));
    return json({ error: e instanceof Error ? e.message : 'erro desconhecido' }, 500);
  }
});

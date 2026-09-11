// Entrada de lead pelo site da empresa (ADR-006): o formulário público chama
// esta função, que cria (ou reaproveita) o contato, abre um negócio na
// primeira etapa do funil e avisa a equipe do Comercial.
//
// Sem JWT: é o site público quem chama. Proteções: campo-armadilha `website`
// (robô preenche, humano não vê → descartado em silêncio), tamanhos máximos e
// exigência de e-mail ou telefone. Sem limite de taxa nesta versão
// (ponytail: entra com o primeiro abuso real — Vercel/Cloudflare na frente).
//
// POST { tenant_slug, name, email?, phone?, company?, message?, source?, segment? }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const SOURCES = new Set(['site', 'whatsapp', 'instagram', 'facebook', 'indicacao', 'outro', 'manual']);
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const digits = (v: string) => v.replace(/\D/g, '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const body = await req.json() as Record<string, unknown>;

    if (clean(body.website, 10)) return json({ ok: true }); // armadilha para robô

    const slug = clean(body.tenant_slug, 80);
    const name = clean(body.name, 160);
    const email = clean(body.email, 160).toLowerCase();
    const phone = digits(clean(body.phone, 40));
    const company = clean(body.company, 160);
    const message = clean(body.message, 2000);
    const source = SOURCES.has(String(body.source)) ? String(body.source) : 'site';

    if (!slug) return json({ error: 'tenant_slug obrigatorio' }, 400);
    if (name.length < 2) return json({ error: 'nome obrigatorio' }, 400);
    if (!email && !phone) return json({ error: 'informe e-mail ou telefone' }, 400);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'e-mail invalido' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: tenant, error: tenantError } = await admin.from('tenants').select('id, name').eq('slug', slug).maybeSingle();
    if (tenantError) throw tenantError;
    if (!tenant) return json({ error: 'empresa nao encontrada' }, 404);

    // Contato: a regra de reaproveitar (e-mail, senão telefone, senão criar) é
    // UMA, no banco — `crm_find_or_create_contact` (E3) —, a mesma da planilha.
    const { data: found, error: contactError } = await admin.rpc('crm_find_or_create_contact', {
      p_tenant: tenant.id, p_name: name, p_email: email || null, p_phone: phone || null,
      p_company: company || null, p_source: source,
    });
    if (contactError) throw contactError;
    const contact = (found as { contact_id: string; owner_id: string | null }[] | null)?.[0];
    if (!contact) throw new Error('crm_find_or_create_contact nao devolveu contato');

    // Segmento (CRM-1b): o formulário pode dizer em que segmento o lead entra
    // (nome, como a empresa cadastrou). Com segmento, o negócio nasce no funil
    // dele e o contato fica marcado; sem, no funil padrão.
    const segmentName = clean(body.segment, 60).toLowerCase();
    let pipelineId: string | null = null;
    if (segmentName) {
      // Compara em JS: `ilike` com texto vindo do site trataria `%` e `_` como curinga.
      const { data: segments, error: segmentError } = await admin
        .from('crm_segments').select('id, name, pipeline_id').eq('tenant_id', tenant.id).eq('is_active', true);
      if (segmentError) throw segmentError;
      const segment = (segments ?? []).find((s: { name: string }) => s.name.trim().toLowerCase() === segmentName);
      if (segment) {
        pipelineId = segment.pipeline_id;
        const { error: segError } = await admin.from('crm_contacts').update({ segment_id: segment.id }).eq('id', contact.contact_id).is('segment_id', null);
        if (segError) throw segError;
      }
    }

    let stageQuery = admin
      .from('crm_pipeline_stages').select('id, crm_pipelines!inner(is_default)').eq('tenant_id', tenant.id).eq('kind', 'open');
    stageQuery = pipelineId ? stageQuery.eq('pipeline_id', pipelineId) : stageQuery.eq('crm_pipelines.is_default', true);
    const { data: stage, error: stageError } = await stageQuery.order('position').limit(1).maybeSingle();
    if (stageError) throw stageError;
    if (!stage) return json({ error: 'funil sem etapas' }, 500);

    const title = message ? message.slice(0, 80) : `Contato pelo site — ${name}`;
    const { data: deal, error: dealError } = await admin.from('crm_deals').insert({
      tenant_id: tenant.id, contact_id: contact.contact_id, stage_id: stage.id, title, source, owner_id: contact.owner_id,
    }).select('id').single();
    if (dealError) throw dealError;

    const { error: activityError } = await admin.from('crm_deal_activities').insert({
      tenant_id: tenant.id, deal_id: deal.id, author_id: null, kind: 'system',
      content: `Lead recebido (${source}).${message ? ' Mensagem: ' + message : ''}`,
      meta: { email: email || null, phone: phone || null, company: company || null },
    });
    if (activityError) throw activityError;

    // Quem é avisado: o dono do contato; senão quem tem o módulo Comercial; senão owner/admin/manager.
    let targets: string[] = contact.owner_id ? [contact.owner_id] : [];
    if (!targets.length) {
      const { data: team, error: teamError } = await admin.from('user_module_access').select('user_id').eq('tenant_id', tenant.id).eq('module', 'comercial');
      if (teamError) throw teamError;
      targets = (team ?? []).map((t: { user_id: string }) => t.user_id);
    }
    if (!targets.length) {
      const { data: sup, error: supError } = await admin
        .from('profiles').select('id, user_roles!user_roles_user_id_fkey(role)').eq('tenant_id', tenant.id).eq('is_active', true);
      if (supError) throw supError;
      targets = (sup ?? [])
        .filter((p: { user_roles: { role: string }[] }) => p.user_roles.some((r) => ['owner', 'admin', 'manager'].includes(r.role)))
        .map((p: { id: string }) => p.id);
    }
    if (targets.length) {
      const { error: notifyError } = await admin.from('notifications').insert(targets.map((userId) => ({
        tenant_id: tenant.id, user_id: userId, type: 'crm_new_lead', reference_type: 'crm_deal', reference_id: deal.id,
        title: `Novo lead: ${name}`, message: message ? message.slice(0, 140) : `${email || phone}${company ? ' · ' + company : ''}`,
      })));
      if (notifyError) console.error('notify failed', notifyError);
    }

    return json({ ok: true });
  } catch (e) {
    console.error('crm-lead-intake', e);
    return json({ error: e instanceof Error ? e.message : 'erro desconhecido' }, 500);
  }
});

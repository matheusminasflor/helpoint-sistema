// Os modelos de mensagem, como a Meta os tem (CRM-4b).
//
// POST { }  (JWT) → sincroniza o catálogo daquela empresa e devolve a lista.
//
// A Meta é a dona: quem escreve, aprova, reprova e pausa é ela, no painel dela.
// Aqui só se copia, para a tela poder escolher sem uma ida à Meta a cada clique.
// Por isso a sincronização **apaga o que sumiu de lá** — catálogo local com
// modelo que a Meta já não tem é o caminho para o vendedor escolher algo que vai
// falhar na hora do envio.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { adminClient } from '../_shared/payment-credentials.ts';
import { getConnectionByTenant, listarTemplates, corpoDoTemplate } from '../_shared/whatsapp.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);

    const admin = adminClient();
    const { data: perfil, error: perfilErro } = await admin
      .from('profiles').select('tenant_id').eq('id', userData.user.id).maybeSingle();
    if (perfilErro) throw perfilErro;
    const tenantId = (perfil as { tenant_id: string } | null)?.tenant_id;
    if (!tenantId) return json({ error: 'sua conta não está ligada a nenhuma empresa' }, 403);

    // Ler o catálogo é de quem tem o Comercial — a mesma régua do resto do CRM.
    const { data: temCrm, error: acessoErro } = await admin
      .rpc('has_crm_access', { _user_id: userData.user.id });
    if (acessoErro) throw acessoErro;
    if (!temCrm) return json({ error: 'você não tem o Comercial' }, 403);

    const cred = await getConnectionByTenant(admin, tenantId);
    if (!cred) return json({ conectado: false, modelos: [] });

    const daMeta = await listarTemplates(cred);
    const linhas = daMeta.map(t => {
      const { body, variaveis } = corpoDoTemplate(t);
      return {
        tenant_id: tenantId,
        name: t.name,
        language: t.language,
        category: t.category ?? null,
        status: t.status,
        body,
        variaveis,
        components: t.components ?? [],
        synced_at: new Date().toISOString(),
      };
    });

    if (linhas.length > 0) {
      const { error } = await admin.from('crm_whatsapp_templates')
        .upsert(linhas, { onConflict: 'tenant_id,name,language' }).select('name');
      if (error) throw error;
    }

    // O que sumiu lá some aqui. Sem isto, um modelo reprovado pela Meta
    // continuaria oferecido na tela e só falharia na hora de enviar.
    const vivos = linhas.map(l => `${l.name}|${l.language}`);
    const { data: locais, error: lerErro } = await admin
      .from('crm_whatsapp_templates').select('name, language').eq('tenant_id', tenantId);
    if (lerErro) throw lerErro;
    const mortos = (locais as { name: string; language: string }[] ?? [])
      .filter(l => !vivos.includes(`${l.name}|${l.language}`));
    for (const m of mortos) {
      const { error } = await admin.from('crm_whatsapp_templates').delete()
        .eq('tenant_id', tenantId).eq('name', m.name).eq('language', m.language).select('name');
      if (error) throw error;
    }

    return json({
      conectado: true,
      sincronizados: linhas.length,
      removidos: mortos.length,
      modelos: linhas.map(l => ({
        name: l.name, language: l.language, status: l.status,
        category: l.category, body: l.body, variaveis: l.variaveis,
      })),
    });
  } catch (e) {
    console.error('whatsapp-templates', e instanceof Error ? e.message : String(e));
    return json({ error: e instanceof Error ? e.message : 'erro desconhecido' }, 500);
  }
});

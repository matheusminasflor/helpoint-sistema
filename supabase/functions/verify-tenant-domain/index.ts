import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const APP_HOSTS = ['helpoint.com.br', 'www.helpoint.com.br', 'helpoint.lovable.app'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (!claims?.claims?.sub) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const domainId = String(body?.domainId || '');
    if (!domainId) return json({ error: 'domainId required' }, 400);

    const admin = createClient(url, service);

    // Fetch domain + ensure caller belongs to tenant and is admin
    const { data: domain, error: dErr } = await admin
      .from('tenant_domains')
      .select('id, tenant_id, hostname, verification_token')
      .eq('id', domainId)
      .maybeSingle();
    if (dErr || !domain) return json({ error: 'Domain not found' }, 404);

    const { data: profile } = await admin
      .from('profiles')
      .select('tenant_id')
      .eq('id', claims.claims.sub)
      .maybeSingle();
    if (!profile || profile.tenant_id !== domain.tenant_id) {
      return json({ error: 'Forbidden' }, 403);
    }
    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', claims.claims.sub)
      .in('role', ['owner', 'admin'])
      .maybeSingle();
    if (!roleRow) return json({ error: 'Forbidden' }, 403);

    const host = domain.hostname.toLowerCase();
    const errors: string[] = [];

    // 1) CNAME check
    let cnameOk = false;
    try {
      const cnames = await Deno.resolveDns(host, 'CNAME').catch(() => []);
      cnameOk = cnames.some((c) =>
        APP_HOSTS.some((h) => c.toLowerCase().replace(/\.$/, '').endsWith(h))
      );
      if (!cnameOk) {
        // Fallback: A record matching our IP (Lovable: 185.158.133.1)
        const aRecs = await Deno.resolveDns(host, 'A').catch(() => []);
        cnameOk = aRecs.includes('185.158.133.1');
      }
      if (!cnameOk) errors.push(`CNAME de ${host} não aponta para helpoint.com.br.`);
    } catch (e) {
      errors.push(`Falha ao consultar CNAME: ${(e as Error).message}`);
    }

    // 2) TXT check on _helpoint-verify.<host>
    let txtOk = false;
    try {
      const txtName = `_helpoint-verify.${host}`;
      const txts = await Deno.resolveDns(txtName, 'TXT').catch(() => []);
      const flat = txts.flat().map((t) => String(t).trim());
      txtOk = flat.some((t) => t.includes(domain.verification_token));
      if (!txtOk) {
        errors.push(`TXT ${txtName} não contém o token esperado.`);
      }
    } catch (e) {
      errors.push(`Falha ao consultar TXT: ${(e as Error).message}`);
    }

    const verified = cnameOk && txtOk;
    const { error: uErr } = await admin
      .from('tenant_domains')
      .update({
        verified_at: verified ? new Date().toISOString() : null,
        last_check_at: new Date().toISOString(),
        last_error: verified ? null : errors.join(' '),
      })
      .eq('id', domainId);
    if (uErr) return json({ error: uErr.message }, 500);

    return json({ verified, cnameOk, txtOk, errors });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let hostname = url.searchParams.get('hostname') || '';
    if (!hostname && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      hostname = String(body?.hostname || '');
    }
    if (!hostname) return json({ tenant: null }, 200);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );
    const { data, error } = await supabase.rpc('get_tenant_by_hostname', {
      _hostname: hostname,
    });
    if (error) return json({ tenant: null, error: error.message }, 200);
    return json({ tenant: data?.[0] || null });
  } catch (e) {
    return json({ tenant: null, error: (e as Error).message }, 200);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Quem pode disparar uma leitura (Kommo, reuniões): o pg_cron, com a chave de serviço, ou o dono/admin pelo botão
// "Ler agora" de Configurações › Integrações (decisão do dono, 2026-11-08). Mesmo par de `require-service-role.ts`:
// isto lê as claims, e quem verifica a assinatura é o gateway, com `verify_jwt = true` no `supabase/config.toml`.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type QuemChama = { servico: true } | { servico: false; tenantId: string };

const json = (corpo: unknown, status: number) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

/** O pg_cron passa; o usuário logado passa se for dono ou admin, com a empresa dele. Senão, a resposta de recusa. */
export async function servicoOuAdmin(req: Request, db: SupabaseClient): Promise<QuemChama | Response> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
  let papel = '';
  try { papel = JSON.parse(atob(auth.slice(7).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role ?? ''; } catch { /* token sem claims */ }
  if (papel === 'service_role') return { servico: true };

  const usuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: claims, error: erroClaims } = await usuario.auth.getClaims(auth.slice(7));
  if (erroClaims || !claims?.claims?.sub) return json({ error: 'Unauthorized' }, 401);
  const userId = claims.claims.sub as string;
  const { data: ehAdmin, error: erroPapel } = await db.rpc('is_admin_or_higher', { _user_id: userId });
  if (erroPapel) return json({ error: erroPapel.message }, 500);
  if (!ehAdmin) return json({ error: 'só o dono e o admin leem de novo as integrações' }, 403);
  const { data: perfil, error: erroPerfil } = await db.from('profiles').select('tenant_id').eq('id', userId).maybeSingle();
  if (erroPerfil) return json({ error: erroPerfil.message }, 500);
  const tenantId = (perfil as { tenant_id: string } | null)?.tenant_id;
  if (!tenantId) return json({ error: 'sua conta não está ligada a nenhuma empresa' }, 403);
  return { servico: false, tenantId };
}

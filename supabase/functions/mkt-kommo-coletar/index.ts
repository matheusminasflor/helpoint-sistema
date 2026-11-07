// OS LEADS DO KOMMO para os Indicadores do Marketing (dono, 2026-11-03: "só quantos leads chegaram por funil"). Conta os
// leads criados em cada semana (segunda a domingo, horário de Brasília) pelo funil em que estão agora, e grava em
// `mkt_trafego_semana`, nas colunas do lançamento à mão. O funil Entrada é o "Sem triagem"; os outros funis não entram.
//
// Quem chama: o pg_cron, a cada 3 horas (20270212640000), com a chave de serviço: a semana em andamento e a anterior
// (o lead triado depois muda de funil). Com `{ desde: 'AAAA-MM-DD' }` refaz todas as semanas desde aquela data.
// A chave é a do token de longa duração da integração privada "Helpoint" (secrets KOMMO_TOKEN e KOMMO_SUBDOMINIO).
// ponytail: Brasília é UTC−3 fixo, como em `mkt-meta-coletar`; uma conta do Kommo, de uma empresa.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireServiceRole } from '../_shared/require-service-role.ts';

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

const HORA = 3600_000;
const diaBR = (ms: number) => new Date(ms - 3 * HORA).toISOString().slice(0, 10);
const somarDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 24 * HORA).toISOString().slice(0, 10);
const domingoDe = (iso: string) => somarDias(iso, (7 - new Date(`${iso}T12:00:00Z`).getUTCDay()) % 7);
const inicioBR = (iso: string) => Date.parse(`${iso}T00:00:00-03:00`);

// O nome do funil no Kommo → a coluna dos Indicadores.
const COLUNA: Record<string, string> = {
  'entrada': 'leads_sem_triagem',
  'consumidor final': 'leads_consumidor',
  'salao de beleza': 'leads_salao',
  'distribuidor': 'leads_distribuidor',
};
const normaliza = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();

async function kommo<T>(caminho: string): Promise<T | null> {
  const sub = Deno.env.get('KOMMO_SUBDOMINIO')?.trim();
  const token = Deno.env.get('KOMMO_TOKEN')?.trim();
  if (!sub || !token) throw new Error('a chave do Kommo não está no cofre (KOMMO_TOKEN e KOMMO_SUBDOMINIO)');
  const r = await fetch(`https://${sub}.kommo.com/api/v4/${caminho}`, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 204) return null;
  if (r.status === 401 || r.status === 403) {
    throw new Error('o Kommo recusou a chave: gere outro token na integração Helpoint do Kommo e troque KOMMO_TOKEN no cofre');
  }
  if (!r.ok) throw new Error(`o Kommo respondeu ${r.status}: ${(await r.text()).slice(0, 150)}`);
  return await r.json() as T;
}

async function rodada(db: SupabaseClient, tenant: string, desde: string) {
  const funis = await kommo<{ _embedded: { pipelines: { id: number; name: string }[] } }>('leads/pipelines');
  const colunaDoFunil = new Map((funis?._embedded.pipelines ?? []).flatMap((p) => {
    const coluna = COLUNA[normaliza(p.name)];
    return coluna ? [[p.id, coluna] as const] : [];
  }));
  if (colunaDoFunil.size < 4) throw new Error('não achei no Kommo os funis Entrada, Consumidor Final, Salão de Beleza e Distribuidor');

  const agora = Date.now();
  const ultimo = domingoDe(diaBR(agora));
  const semanas = new Map<string, Record<string, number>>();
  for (let d = domingoDe(desde); d <= ultimo; d = somarDias(d, 7)) {
    semanas.set(d, { leads_sem_triagem: 0, leads_consumidor: 0, leads_salao: 0, leads_distribuidor: 0 });
  }
  const de = Math.floor(inicioBR(somarDias(domingoDe(desde), -6)) / 1000);
  for (let pagina = 1; ; pagina++) {
    const r = await kommo<{ _embedded: { leads: { pipeline_id: number; created_at: number }[] }; _links?: { next?: unknown } }>(
      `leads?limit=250&page=${pagina}&filter[created_at][from]=${de}&filter[created_at][to]=${Math.floor(agora / 1000)}`);
    for (const l of r?._embedded.leads ?? []) {
      const coluna = colunaDoFunil.get(l.pipeline_id);
      const semana = semanas.get(domingoDe(diaBR(l.created_at * 1000)));
      if (coluna && semana) semana[coluna]++;
    }
    if (!r?._links?.next) break;
  }

  const linhas = [...semanas].map(([semana, n]) => ({ tenant_id: tenant, semana, ...n }));
  const { error } = await db.from('mkt_trafego_semana').upsert(linhas, { onConflict: 'tenant_id,semana' });
  if (error) throw error;
  return linhas.map(({ tenant_id: _, ...l }) => l);
}

serve(async (req) => {
  const recusa = requireServiceRole(req);
  if (recusa) return recusa;
  const corpo = await req.json().catch(() => ({})) as { desde?: string };

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: empresa, error: erroEmpresa } = await db.from('tenants').select('id').order('created_at').limit(1).single();
  if (erroEmpresa) return json({ error: erroEmpresa.message }, 500);
  const tenant = empresa.id as string;

  try {
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(corpo.desde ?? '') ? corpo.desde! : somarDias(diaBR(Date.now()), -7);
    const semanas = await rodada(db, tenant, desde);
    const { error } = await db.from('mkt_kommo_robo').upsert({ tenant_id: tenant, ok_em: new Date().toISOString(), caiu_em: null, ultimo_erro: null });
    if (error) throw error;
    return json({ semanas });
  } catch (erro) {
    const motivo = String((erro as Error).message).slice(0, 200);
    const { error } = await db.rpc('mkt_kommo_robo_caiu', { p_tenant: tenant, p_motivo: motivo });
    if (error) console.error('mkt_kommo_robo_caiu:', error.message);
    return json({ error: motivo }, 500);
  }
});

// OS LEADS E AS VENDAS DO KOMMO para os Indicadores do Marketing (dono, 2026-11-07, proposta v4
// https://claude.ai/artifact/4YkGvumGgu6Z9JmgmwodQr): por dia e por segmento, quantos leads chegaram (pelo funil em que
// estão agora), quantas vendas ganhas e perdidas (no dia em que fecharam), o valor ganho e o motivo de cada perda.
// O funil Entrada é o "Sem triagem"; Educacional, MF LOVER, Serviços prestados e ENAD não entram.
//
// Quem chama: o pg_cron, a cada 3 horas (20270212640000), com a chave de serviço. Toda leitura reconta desde 1º/01/2026
// (no máximo os últimos 400 dias) e troca as linhas de uma vez (`mkt_kommo_gravar`): o lead triado ou fechado depois
// corrige o dia dele. São uns 2.400 leads por ano, poucas páginas de 250.
// A chave é o token de longa duração da integração privada "Helpoint" (secrets KOMMO_TOKEN e KOMMO_SUBDOMINIO).
// ponytail: Brasília é UTC−3 fixo, como em `mkt-meta-coletar`; uma conta do Kommo, de uma empresa.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireServiceRole } from '../_shared/require-service-role.ts';

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

const HORA = 3600_000;
const diaBR = (ms: number) => new Date(ms - 3 * HORA).toISOString().slice(0, 10);
const inicioBR = (iso: string) => Date.parse(`${iso}T00:00:00-03:00`);
const GANHA = 142;
const PERDIDA = 143;

// O nome do funil no Kommo → o segmento dos Indicadores.
const SEGMENTO: Record<string, string> = {
  'entrada': 'sem_triagem',
  'consumidor final': 'consumidor',
  'salao de beleza': 'salao',
  'distribuidor': 'distribuidor',
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

interface Lead { pipeline_id: number; status_id: number; price: number | null; created_at: number; closed_at: number | null; loss_reason_id: number | null }

/** Todos os leads com `campo` (criado ou fechado) entre `de` e agora, em segundos. */
async function leads(campo: 'created_at' | 'closed_at', de: number): Promise<Lead[]> {
  const todos: Lead[] = [];
  for (let pagina = 1; ; pagina++) {
    const r = await kommo<{ _embedded: { leads: Lead[] }; _links?: { next?: unknown } }>(
      `leads?limit=250&page=${pagina}&filter[${campo}][from]=${de}&filter[${campo}][to]=${Math.floor(Date.now() / 1000)}`);
    todos.push(...(r?._embedded.leads ?? []));
    if (!r?._links?.next) return todos;
  }
}

async function rodada(db: SupabaseClient, tenant: string) {
  const funis = await kommo<{ _embedded: { pipelines: { id: number; name: string }[] } }>('leads/pipelines');
  const segmentoDo = new Map((funis?._embedded.pipelines ?? []).flatMap((p) => {
    const s = SEGMENTO[normaliza(p.name)];
    return s ? [[p.id, s] as const] : [];
  }));
  if (segmentoDo.size < 4) throw new Error('não achei no Kommo os funis Entrada, Consumidor Final, Salão de Beleza e Distribuidor');
  // Sem a lista de motivos a perda ainda conta, só sem o nome do motivo.
  const motivos = await kommo<{ _embedded: { loss_reasons: { id: number; name: string }[] } }>('leads/loss_reasons')
    .catch((e) => { console.warn('motivos de perda:', e instanceof Error ? e.message : e); return null; });
  const motivoDo = new Map<number, string>((motivos?._embedded.loss_reasons ?? []).map((m) => [m.id, m.name]));

  const desde = [diaBR(Date.now() - 400 * 24 * HORA), '2026-01-01'].sort()[1];
  const de = Math.floor(inicioBR(desde) / 1000);
  const dias = new Map<string, { dia: string; funil: string; chegaram: number; ganhas: number; perdidas: number; valor_ganho: number }>();
  const linha = (dia: string, funil: string) => {
    const k = `${dia}|${funil}`;
    if (!dias.has(k)) dias.set(k, { dia, funil, chegaram: 0, ganhas: 0, perdidas: 0, valor_ganho: 0 });
    return dias.get(k)!;
  };
  const perdas = new Map<string, { dia: string; funil: string; motivo: string | null; quantos: number }>();

  for (const l of await leads('created_at', de)) {
    const funil = segmentoDo.get(l.pipeline_id);
    if (funil) linha(diaBR(l.created_at * 1000), funil).chegaram++;
  }
  for (const l of await leads('closed_at', de)) {
    const funil = segmentoDo.get(l.pipeline_id);
    if (!funil || !l.closed_at || (l.status_id !== GANHA && l.status_id !== PERDIDA)) continue;
    const dia = diaBR(l.closed_at * 1000);
    const n = linha(dia, funil);
    if (l.status_id === GANHA) {
      n.ganhas++;
      n.valor_ganho += Number(l.price ?? 0);
    } else {
      n.perdidas++;
      const motivo: string | null = (l.loss_reason_id && motivoDo.get(l.loss_reason_id)) || null;
      const k = `${dia}|${funil}|${motivo ?? ''}`;
      const p = perdas.get(k) ?? { dia, funil, motivo, quantos: 0 };
      p.quantos++;
      perdas.set(k, p);
    }
  }

  const { error } = await db.rpc('mkt_kommo_gravar', {
    p_tenant: tenant, p_desde: desde, p_dias: [...dias.values()], p_perdas: [...perdas.values()],
  });
  if (error) throw error;
  const soma = (k: 'chegaram' | 'ganhas' | 'perdidas') => [...dias.values()].reduce((s, d) => s + d[k], 0);
  return { desde, chegaram: soma('chegaram'), ganhas: soma('ganhas'), perdidas: soma('perdidas') };
}

/**
 * De onde vêm os leads (estudo da proposta v5, 2026-11-07): as fontes que o Kommo conhece, os campos de lead e, nos
 * leads dos últimos `dias`, quantos por fonte, por etiqueta e por campo preenchido. Só contagens, nenhum nome ou telefone.
 */
async function diagnostico(dias: number) {
  const de = Math.floor((Date.now() - dias * 24 * HORA) / 1000);
  const fontes = await kommo<{ _embedded?: { sources?: { id: number; name: string; origin_code?: string }[] } }>('sources').catch((e) => ({ erro: String(e) }));
  const campos = await kommo<{ _embedded: { custom_fields: { id: number; name: string; code?: string }[] } }>('leads/custom_fields?limit=250').catch(() => null);
  const conta = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  const porFonte = new Map<string, number>(), porEtiqueta = new Map<string, number>(), porCampo = new Map<string, number>(), formatos = new Map<string, number>();
  let total = 0;
  for (let pagina = 1; ; pagina++) {
    const r = await kommo<{ _embedded: { leads: (Lead & { source_id?: number | null; custom_fields_values?: { field_name: string; values: { value: unknown }[] }[] | null; _embedded?: { tags?: { name: string }[]; source?: { name?: string; type?: string } } })[] }; _links?: { next?: unknown } }>(
      `leads?limit=250&page=${pagina}&with=source_id,source&filter[created_at][from]=${de}`);
    for (const l of r?._embedded.leads ?? []) {
      total++;
      const s = l._embedded?.source;
      conta(porFonte, s ? `${s.name ?? '?'} (${s.type ?? '?'})` : l.source_id ? `source_id ${l.source_id}` : 'sem fonte');
      for (const t of l._embedded?.tags ?? []) conta(porEtiqueta, t.name);
      for (const c of l.custom_fields_values ?? []) {
        conta(porCampo, c.field_name);
        // O valor dos campos de origem (utm, canal) diz por onde veio; os outros campos só contam.
        if (/utm|origem|canal|source|fonte|referrer/i.test(c.field_name)) conta(formatos, `${c.field_name}: ${String(c.values?.[0]?.value).slice(0, 40)}`);
      }
    }
    if (!r?._links?.next) break;
  }
  // As conversas (WhatsApp, Direct, site) dizem o canal em `origin`; as mais recentes bastam para ver quais existem.
  const porCanal = new Map<string, number>();
  for (let pagina = 1; pagina <= 4; pagina++) {
    const r = await kommo<{ _embedded?: { talks?: { origin?: string; created_at?: number }[] }; _links?: { next?: unknown } }>(`talks?limit=250&page=${pagina}`)
      .catch((e) => { porCanal.set(`erro: ${String(e).slice(0, 80)}`, 1); return null; });
    for (const t of r?._embedded?.talks ?? []) if ((t.created_at ?? 0) >= de) conta(porCanal, t.origin ?? 'sem canal');
    if (!r?._links?.next) break;
  }
  const lista = (m: Map<string, number>) => Object.fromEntries([...m].sort((a, b) => b[1] - a[1]));
  return { dias, total, porCanal: lista(porCanal), fontes, campos: campos?._embedded.custom_fields.map((c) => c.name), porFonte: lista(porFonte), porEtiqueta: lista(porEtiqueta), porCampo: lista(porCampo), origens: lista(formatos) };
}

serve(async (req) => {
  const recusa = requireServiceRole(req);
  if (recusa) return recusa;
  const corpo = await req.json().catch(() => ({})) as { diagnostico?: number };
  if (corpo.diagnostico) {
    try { return json(await diagnostico(Math.min(365, Number(corpo.diagnostico) || 60))); } catch (e) { return json({ error: String(e) }, 500); }
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: empresa, error: erroEmpresa } = await db.from('tenants').select('id').order('created_at').limit(1).single();
  if (erroEmpresa) return json({ error: erroEmpresa.message }, 500);
  const tenant = empresa.id as string;

  try {
    const resultado = await rodada(db, tenant);
    const { error } = await db.from('mkt_kommo_robo').upsert({ tenant_id: tenant, ok_em: new Date().toISOString(), caiu_em: null, ultimo_erro: null });
    if (error) throw error;
    return json(resultado);
  } catch (erro) {
    const motivo = String((erro as Error).message).slice(0, 200);
    const { error } = await db.rpc('mkt_kommo_robo_caiu', { p_tenant: tenant, p_motivo: motivo });
    if (error) console.error('mkt_kommo_robo_caiu:', error.message);
    return json({ error: motivo }, 500);
  }
});

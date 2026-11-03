// O COLETOR DA META para os Indicadores do Marketing (proposta v3, aprovada em 2026-11-03: "conectei o Meta mas os
// dados não foram atualizados" — a ligação só guardava a chave). Busca na Graph API, com a credencial que a ligação
// guardou em `mkt_meta_ligacao_segredo`, os números da semana de cada conta do Instagram e da conta de anúncios, e
// grava em `mkt_redes_semana` / `mkt_trafego_semana`, as mesmas tabelas do lançamento à mão.
//
// Quem chama:
//   · o pg_cron, todo dia às 06h (Brasília), com a chave de serviço: todas as empresas ligadas; a semana em andamento,
//     e na segunda-feira também a que acabou (é quando ela fecha);
//   · o botão "Buscar agora" dos Indicadores (gestor ou acima): a empresa de quem clicou, esta semana e a anterior.
//
// Regras:
//   · o coletor só grava número que a Meta deu: nunca apaga o que foi lançado à mão (campo nulo não sobrescreve);
//   · seguidores (total) só na semana em andamento, e na anterior só na coleta de segunda (é o total do domingo);
//   · stories: a Meta só mostra os das últimas 24 h, então a coleta diária guarda os dias vistos em `coleta`;
//   · novos e perdidos vêm de `follows_and_unfollows`, quando a Meta entrega (contas com 100+ seguidores).
// ponytail: Brasília é UTC−3 fixo (sem horário de verão desde 2019); se voltar, trocar por Intl com o fuso.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { adminClient } from '../_shared/payment-credentials.ts';
import { graphFetch } from '../_shared/meta.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Os nomes que a equipe usa (planilha e lançamento à mão) para as contas da Meta.
const NOME_DA_CONTA: Record<string, string> = { '@mf.professional': '@mf.pro', '@bymf.br': '@by.mf' };
const nomeDaConta = (username: string) => NOME_DA_CONTA[username.toLowerCase()] ?? username.toLowerCase();

const HORA = 3600_000;
const diaBR = (ms: number) => new Date(ms - 3 * HORA).toISOString().slice(0, 10);
const somarDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 24 * HORA).toISOString().slice(0, 10);
const domingoDe = (iso: string) => somarDias(iso, (7 - new Date(`${iso}T12:00:00Z`).getUTCDay()) % 7);
const inicioBR = (iso: string) => Date.parse(`${iso}T00:00:00-03:00`);

interface Semana { domingo: string; desde: number; ate: number; fechando: boolean }
function semana(domingo: string, agora: number, fechando: boolean): Semana {
  return { domingo, desde: inicioBR(somarDias(domingo, -6)), ate: Math.min(agora, inicioBR(somarDias(domingo, 1))), fechando };
}

type Conta = { tipo: 'pagina' | 'instagram' | 'anuncios'; id: string; nome: string };
type Insight = { name: string; total_value?: { value?: number; breakdowns?: { results?: { dimension_values: string[]; value: number }[] }[] } };
type Acao = { action_type: string; value: string };

const seg = (ms: number) => Math.floor(ms / 1000);
// A tela é lida pelo dono em português: os erros da Meta que já apareceram ganham tradução com o que fazer.
function emPortugues(msg: string) {
  if (/has NOT grant ads_management or ads_read/i.test(msg)) {
    return 'a Meta não liberou a leitura de anúncios para o Helpoint. Conecte de novo com a Meta (botão ao lado), marcando a MF INTERNO - Marketing, e busque de novo';
  }
  if (/Missing Permissions/i.test(msg)) return 'a Meta recusou por falta de permissão. Conecte de novo com a Meta e aceite todas as permissões';
  if (/Error validating access token|Session has expired/i.test(msg)) return 'a chave da Meta deixou de valer. Conecte de novo com a Meta';
  return msg;
}

/**
 * O que a Meta diz que a chave tem (debug_token, com a chave do app): as permissões e, na de anúncios, para quais contas.
 * Entra no aviso quando a leitura de anúncios falha, para a causa aparecer em vez de ser adivinhada (2026-11-03).
 */
async function permissoesDaChave(token: string): Promise<string> {
  const app = `${Deno.env.get('META_APP_ID')}|${Deno.env.get('META_APP_SECRET')}`;
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(app)}`);
    const d = (await r.json()) as { data?: { type?: string; scopes?: string[]; granular_scopes?: { scope: string; target_ids?: string[] }[] } };
    const info = d.data;
    if (!info) return 'não consegui perguntar à Meta quais permissões a chave tem';
    const anuncio = (info.granular_scopes ?? []).filter((g) => g.scope.startsWith('ads_'))
      .map((g) => `${g.scope} para ${g.target_ids?.length ? g.target_ids.join(', ') : 'todas as contas'}`);
    const temAds = (info.scopes ?? []).some((s) => s === 'ads_read' || s === 'ads_management');
    return `a chave (${info.type === 'SYSTEM_USER' ? 'usuário do sistema' : info.type ?? 'tipo desconhecido'}) ${temAds ? 'tem' : 'NÃO tem'} permissão de anúncios`
      + (anuncio.length ? ` (${anuncio.join('; ')})` : '') + `; permissões: ${(info.scopes ?? []).join(', ') || 'nenhuma'}`;
  } catch (e) {
    return `não consegui perguntar à Meta quais permissões a chave tem (${e instanceof Error ? e.message : String(e)})`;
  }
}

const semNulos = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));

/** Os números de uma conta do Instagram numa semana. */
async function doInstagram(token: string, ig: Conta, s: Semana, agora: number) {
  const tempo = `period=day&metric_type=total_value&since=${seg(s.desde)}&until=${seg(s.ate)}`;
  const valores = new Map<string, number>();
  const ins = await graphFetch<{ data: Insight[] }>(token, `${ig.id}/insights?metric=profile_views,total_interactions,reach,shares&${tempo}`);
  for (const i of ins.data ?? []) if (typeof i.total_value?.value === 'number') valores.set(i.name, i.total_value.value);

  let novos: number | null = null, perdidos: number | null = null;
  try {
    const f = await graphFetch<{ data: Insight[] }>(token, `${ig.id}/insights?metric=follows_and_unfollows&breakdown=follow_type&${tempo}`);
    for (const r of f.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? []) {
      if (r.dimension_values[0] === 'FOLLOWER') novos = r.value;
      if (r.dimension_values[0] === 'NON_FOLLOWER') perdidos = r.value;
    }
  } catch (e) {
    console.warn(`follows_and_unfollows de ${ig.nome}:`, e instanceof Error ? e.message : e); // fica o lançado à mão
  }

  // Os posts da semana: os 50 mais recentes cobrem uma semana com folga.
  const midia = await graphFetch<{ data: { media_product_type?: string; timestamp: string }[] }>(token, `${ig.id}/media?fields=media_product_type,timestamp&limit=50`);
  const daSemana = (midia.data ?? []).filter((m) => { const t = Date.parse(m.timestamp); return t >= s.desde && t < s.ate; });
  const stories = await graphFetch<{ data: { timestamp: string }[] }>(token, `${ig.id}/stories?fields=timestamp&limit=100`);
  const diasDeStories = [...new Set((stories.data ?? []).map((x) => diaBR(Date.parse(x.timestamp))))];

  const perfil = await graphFetch<{ followers_count?: number }>(token, `${ig.id}?fields=followers_count`);
  const alcance = valores.get('reach') ?? null;
  const interacoes = valores.get('total_interactions') ?? null;
  return {
    posts: daSemana.filter((m) => m.media_product_type === 'FEED').length,
    reels: daSemana.filter((m) => m.media_product_type === 'REELS').length,
    visitas_perfil: valores.get('profile_views') ?? null,
    compartilhamentos: valores.get('shares') ?? null,
    engajamento: alcance && interacoes !== null ? Math.round((interacoes / alcance) * 10000) / 100 : null,
    novos_seguidores: novos, quedas_seguidores: perdidos,
    // O total de agora é o do fim da semana em andamento — ou o do domingo, na coleta de segunda.
    total_seguidores: (s.ate >= agora || s.fechando) ? perfil.followers_count ?? null : null,
    diasDeStories,
  };
}

const visitasDasAcoes = (acoes: Acao[] | undefined) => {
  const v = (acoes ?? []).filter((a) => a.action_type.includes('profile_visit'));
  return v.length ? v.reduce((s, a) => s + Number(a.value), 0) : null;
};

/** A conta de anúncios numa semana: o total e cada campanha, com a conta do Instagram dela. */
async function dosAnuncios(token: string, act: Conta, s: Semana, instagrams: Map<string, string>) {
  const periodo = encodeURIComponent(JSON.stringify({ since: diaBR(s.desde), until: diaBR(s.ate - 1) }));
  const total = (await graphFetch<{ data: { spend?: string; reach?: string; actions?: Acao[] }[] }>(
    token, `${act.id}/insights?fields=spend,reach,actions&time_range=${periodo}`)).data?.[0];
  const campanhas = (await graphFetch<{ data: { campaign_id: string; campaign_name: string; spend?: string; reach?: string; actions?: Acao[] }[] }>(
    token, `${act.id}/insights?level=campaign&fields=campaign_id,campaign_name,spend,reach,actions&time_range=${periodo}&limit=200`)).data ?? [];
  const estados = new Map((await graphFetch<{ data: { id: string; effective_status: string }[] }>(
    token, `${act.id}/campaigns?fields=effective_status&limit=200`)).data?.map((c) => [c.id, c.effective_status]) ?? []);
  // A conta do Instagram de cada campanha vem do criativo dos anúncios; sem ela, do nome ("MF.PRO – Seguidores…").
  const doCriativo = new Map<string, string>();
  try {
    const ads = await graphFetch<{ data: { campaign_id: string; creative?: { instagram_user_id?: string } }[] }>(
      token, `${act.id}/ads?fields=campaign_id,creative{instagram_user_id}&limit=500`);
    for (const a of ads.data ?? []) {
      const conta = a.creative?.instagram_user_id && instagrams.get(a.creative.instagram_user_id);
      if (conta && !doCriativo.has(a.campaign_id)) doCriativo.set(a.campaign_id, conta);
    }
  } catch (e) {
    console.warn('criativos:', e instanceof Error ? e.message : e);
  }
  const pelaNome = (nome: string) => {
    const n = nome.toUpperCase();
    if (n.includes('MF.PRO') || n.includes('PROFESSIONAL')) return '@mf.pro';
    if (n.includes('BY.MF') || n.includes('BYMF')) return '@by.mf';
    if (n.includes('MINASFLOR')) return '@minasflor';
    return null;
  };
  const porConta = new Map<string, { investimento: number; alcance: number; visitas: number | null; ativas: number; campanhas: unknown[] }>();
  let ativas = 0;
  for (const c of campanhas) {
    const investimento = Number(c.spend ?? 0);
    if (!investimento) continue;
    const ativa = estados.get(c.campaign_id) === 'ACTIVE';
    if (ativa) ativas++;
    const conta = doCriativo.get(c.campaign_id) ?? pelaNome(c.campaign_name);
    if (!conta) continue;
    const p = porConta.get(conta) ?? { investimento: 0, alcance: 0, visitas: null, ativas: 0, campanhas: [] };
    const visitas = visitasDasAcoes(c.actions);
    p.investimento += investimento;
    p.alcance += Number(c.reach ?? 0);
    if (visitas !== null) p.visitas = (p.visitas ?? 0) + visitas;
    if (ativa) p.ativas++;
    p.campanhas.push({ nome: c.campaign_name, investimento, alcance: c.reach ? Number(c.reach) : null, ativa });
    porConta.set(conta, p);
  }
  return {
    total: {
      investimento: total ? Number(total.spend ?? 0) : null, alcance: total?.reach ? Number(total.reach) : null,
      visitas_perfil: visitasDasAcoes(total?.actions), campanhas_ativas: ativas,
    },
    porConta,
  };
}

async function coletarEmpresa(tenantId: string, semanas: Semana[], agora: number) {
  const admin = adminClient();
  const { data: lig, error: e1 } = await admin.from('mkt_meta_ligacao').select('contas').eq('tenant_id', tenantId).maybeSingle();
  if (e1) throw e1;
  const { data: segredo, error: e2 } = await admin.from('mkt_meta_ligacao_segredo').select('access_token').eq('tenant_id', tenantId).maybeSingle();
  if (e2) throw e2;
  const token = (segredo as { access_token: string } | null)?.access_token;
  if (!lig || !token) return { tenantId, erro: 'sem ligação com a Meta' };
  const contas = ((lig as { contas: Conta[] }).contas ?? []);
  const instagrams = contas.filter((c) => c.tipo === 'instagram');
  const doIg = new Map(instagrams.map((c) => [c.id, nomeDaConta(c.nome)]));
  const erros: string[] = [];
  // A Meta compartilhou a MF INTERNO com o app, mas recusou LISTAR as contas de anúncios na ligação ("(#200) Missing
  // Permissions", 2026-11-03). Sem a lista, vai direto às contas de `META_CONTAS_DE_ANUNCIO` (o número da conta, que não
  // é segredo): se a credencial lê anúncio, os números vêm; se não, o erro da Meta aparece na tela.
  const listadas = contas.filter((c) => c.tipo === 'anuncios');
  const anuncios: Conta[] = listadas.length ? listadas : (Deno.env.get('META_CONTAS_DE_ANUNCIO') ?? '').split(',')
    .map((s) => s.trim()).filter(Boolean)
    .map((id) => ({ tipo: 'anuncios' as const, id: id.startsWith('act_') ? id : `act_${id}`, nome: `conta de anúncios ${id}` }));

  for (const s of semanas) {
    for (const ig of instagrams) {
      const conta = nomeDaConta(ig.nome);
      try {
        const n = await doInstagram(token, ig, s, agora);
        const { data: atual, error } = await admin.from('mkt_redes_semana').select('coleta')
          .eq('tenant_id', tenantId).eq('semana', s.domingo).eq('conta', conta).maybeSingle();
        if (error) throw error;
        const vistos = new Set<string>(((atual as { coleta?: { stories_dias?: string[] } } | null)?.coleta?.stories_dias) ?? []);
        const inicio = somarDias(s.domingo, -6);
        const { diasDeStories, ...numeros } = n;
        for (const d of diasDeStories) if (d >= inicio && d <= s.domingo) vistos.add(d);
        const { error: e } = await admin.from('mkt_redes_semana').upsert(semNulos({
          tenant_id: tenantId, semana: s.domingo, conta, ...numeros,
          stories: vistos.size || null, coleta: { stories_dias: [...vistos].sort(), em: new Date(agora).toISOString() },
        }), { onConflict: 'tenant_id,semana,conta' });
        if (e) throw e;
      } catch (e) {
        erros.push(`${conta}: ${emPortugues(e instanceof Error ? e.message : String(e))}`);
      }
    }
    for (const act of anuncios) {
      try {
        const a = await dosAnuncios(token, act, s, doIg);
        const { error } = await admin.from('mkt_trafego_semana').upsert(semNulos({ tenant_id: tenantId, semana: s.domingo, ...a.total }),
          { onConflict: 'tenant_id,semana' });
        if (error) throw error;
        // Toda conta do Instagram recebe o tráfego da semana, zero quando não teve anúncio.
        for (const conta of new Set([...doIg.values(), ...a.porConta.keys()])) {
          const p = a.porConta.get(conta);
          const { error: e } = await admin.from('mkt_redes_semana').upsert(semNulos({
            tenant_id: tenantId, semana: s.domingo, conta,
            investimento: p?.investimento ?? 0, alcance_pago: p?.alcance ?? 0, visitas_pagas: p?.visitas ?? null,
            campanhas_ativas: p?.ativas ?? 0, campanhas: p?.campanhas ?? [],
          }), { onConflict: 'tenant_id,semana,conta' });
          if (e) throw e;
        }
      } catch (e) {
        erros.push(`${act.nome}: ${emPortugues(e instanceof Error ? e.message : String(e))}`);
        if (!erros.some((x) => x.startsWith('a chave ('))) erros.push(await permissoesDaChave(token));
      }
    }
  }
  const semAnuncios = anuncios.length ? null : 'as contas de anúncios não vieram na ligação; conecte de novo marcando a MF INTERNO - Marketing';
  const { error } = await admin.from('mkt_meta_ligacao').update({
    // Uma semana e a anterior dão o mesmo erro: aparece uma vez só.
    coletado_em: new Date(agora).toISOString(), ultimo_erro: [...new Set([...erros, semAnuncios].filter(Boolean))].join(' · ') || null,
  }).eq('tenant_id', tenantId);
  if (error) throw error;
  return { tenantId, semanas: semanas.map((s) => s.domingo), erros };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const agora = Date.now();
    const hoje = diaBR(agora);
    const domingo = domingoDe(hoje);
    const anterior = somarDias(domingo, -7);
    const admin = adminClient();

    // O gateway já verificou a assinatura (verify_jwt = true); o papel diz quem chamou.
    let papel = '';
    try { papel = JSON.parse(atob(auth.slice(7).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role ?? ''; } catch { /* token sem claims */ }

    if (papel === 'service_role') {
      const segunda = new Date(`${hoje}T12:00:00Z`).getUTCDay() === 1;
      const semanas = [semana(domingo, agora, false), ...(segunda ? [semana(anterior, agora, true)] : [])];
      const { data: ligacoes, error } = await admin.from('mkt_meta_ligacao').select('tenant_id');
      if (error) throw error;
      const resultados = [];
      for (const l of (ligacoes ?? []) as { tenant_id: string }[]) {
        try { resultados.push(await coletarEmpresa(l.tenant_id, semanas, agora)); } catch (e) { resultados.push({ tenantId: l.tenant_id, erro: String(e) }); }
      }
      return json({ ok: true, resultados });
    }

    // "Buscar agora": a empresa de quem clicou, gestor ou acima.
    const usuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: claims, error: claimsErro } = await usuario.auth.getClaims(auth.slice(7));
    if (claimsErro || !claims?.claims?.sub) return json({ error: 'Unauthorized' }, 401);
    const userId = claims.claims.sub as string;
    const { data: ehGestor, error: papelErro } = await admin.rpc('is_supervisor_or_higher', { _user_id: userId });
    if (papelErro) throw papelErro;
    if (!ehGestor) return json({ error: 'só gestor ou acima busca os números da Meta' }, 403);
    const { data: perfil, error: perfilErro } = await admin.from('profiles').select('tenant_id').eq('id', userId).maybeSingle();
    if (perfilErro) throw perfilErro;
    const tenantId = (perfil as { tenant_id: string } | null)?.tenant_id;
    if (!tenantId) return json({ error: 'sua conta não está ligada a nenhuma empresa' }, 403);
    // A semana anterior entra sem o total de seguidores (o de agora não é o do domingo dela).
    return json(await coletarEmpresa(tenantId, [semana(domingo, agora, false), semana(anterior, agora, false)], agora));
  } catch (e) {
    console.error('mkt-meta-coletar:', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

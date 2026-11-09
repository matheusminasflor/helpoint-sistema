// O COLETOR DA META para os Indicadores do Marketing (proposta v3, aprovada em 2026-11-03: "conectei o Meta mas os
// dados não foram atualizados" — a ligação só guardava a chave). Busca na Graph API, com a credencial que a ligação
// guardou em `mkt_meta_ligacao_segredo`, os números da semana de cada conta do Instagram e da conta de anúncios, e
// grava em `mkt_redes_semana` / `mkt_trafego_semana`, as mesmas tabelas do lançamento à mão.
//
// Quem chama:
//   · o pg_cron, a cada 3 horas (20270212290000; era às 06h), com a chave de serviço: todas as empresas ligadas; a semana
//     em andamento, e na segunda-feira também a que acabou (a da meia-noite fecha o total de seguidores do domingo);
//     o público do mês (quem segue, quando fica online) só na passada das 06h;
//   · o botão "Buscar agora" dos Indicadores (gestor ou acima): a empresa de quem clicou, esta semana e a anterior.
//   · e o mês inteiro em `mkt_redes_mes` / `mkt_trafego_mes` (20270212660000): o em andamento, o anterior na primeira
//     semana do mês e no "Buscar agora"; `{ meses: ['AAAA-MM'], semanas: ['AAAA-MM-DD'] }` refaz os que passaram.
//
// Regras:
//   · o coletor só grava número que a Meta deu: nunca apaga o que foi lançado à mão (campo nulo não sobrescreve);
//   · seguidores (total) só na semana em andamento, e na anterior só na coleta de segunda (é o total do domingo);
//   · stories: a Meta só mostra os das últimas 24 h, então cada coleta guarda os dias vistos em `coleta` e, em
//     `publicacoes`, o maior alcance que viu de cada story (proposta de 2026-11-04);
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

/** Quando a chave para de valer (debug_token: `expires_at` e `data_access_expires_at`, 0 = nunca), em ms; null se nunca. */
async function vencimentoDaChave(token: string): Promise<number | null> {
  const app = `${Deno.env.get('META_APP_ID')}|${Deno.env.get('META_APP_SECRET')}`;
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(app)}`);
    const corpo = (await r.json()) as { data?: { expires_at?: number; data_access_expires_at?: number }; error?: { message?: string } };
    // Sem `data` a Meta não respondeu o vencimento: fica no log (senão parece chave que nunca vence).
    if (!corpo.data) console.warn('vencimento da chave:', corpo.error?.message ?? `HTTP ${r.status}`);
    const d = corpo.data;
    const datas = [d?.expires_at, d?.data_access_expires_at].filter((x): x is number => !!x && x > 0);
    return datas.length ? Math.min(...datas) * 1000 : null;
  } catch (e) {
    console.warn('vencimento da chave:', e instanceof Error ? e.message : e);
    return null;
  }
}

// A Meta recusou a chave (venceu, foi revogada ou perdeu permissão): é a queda que avisa a TI na hora (20270212300000).
const CHAVE_RECUSADA = /#190|Error validating access token|Session has expired|has NOT grant|Missing Permissions|OAuthException|has not authorized application/i;

const semNulos = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));

type Tipo = 'FEED' | 'REELS' | 'STORY';
/** Uma publicação da semana com os números da Meta (`mkt_redes_semana.publicacoes`). */
interface Publicacao {
  id: string; tipo: Tipo; data: string; link: string | null; legenda: string | null;
  alcance: number | null; visualizacoes: number | null; interacoes: number | null;
}
type Midia = { id: string; media_product_type?: string; timestamp: string; permalink?: string; caption?: string };
type InsightDoPost = { name: string; values?: { value?: number }[]; total_value?: { value?: number } };

/** Alcance, visualizações e interações de um post, reels ou story; o que a Meta recusar fica nulo. */
async function numerosDoPost(token: string, m: Midia, tipo: Tipo): Promise<Publicacao> {
  const base: Publicacao = {
    id: m.id, tipo, data: m.timestamp, link: m.permalink ?? null,
    legenda: m.caption ? m.caption.split('\n')[0].slice(0, 90) : null, alcance: null, visualizacoes: null, interacoes: null,
  };
  // Se a Meta recusar visualizações nesse tipo de publicação, a segunda tentativa salva o alcance.
  for (const metricas of ['reach,views,total_interactions', 'reach,total_interactions', 'reach']) {
    try {
      const r = await graphFetch<{ data: InsightDoPost[] }>(token, `${m.id}/insights?metric=${metricas}`);
      const v = new Map((r.data ?? []).map((i) => [i.name, i.values?.[0]?.value ?? i.total_value?.value ?? null]));
      return { ...base, alcance: v.get('reach') ?? null, visualizacoes: v.get('views') ?? null, interacoes: v.get('total_interactions') ?? null };
    } catch (e) {
      console.warn(`insights do post ${m.id} (${metricas}):`, e instanceof Error ? e.message : e);
    }
  }
  return base;
}

/**
 * As publicações já guardadas e as de agora: o story que saiu do ar fica como estava, e de cada story vale o maior alcance
 * visto (a Meta só mostra o número enquanto ele está no ar); post e reels ficam com o número mais novo.
 */
function juntarPublicacoes(antes: Publicacao[], agora: Publicacao[]): Publicacao[] {
  const porId = new Map(antes.map((p) => [p.id, p]));
  for (const p of agora) {
    const v = porId.get(p.id);
    const maior = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.max(a, b));
    porId.set(p.id, v && p.tipo === 'STORY'
      ? { ...p, alcance: maior(v.alcance, p.alcance), visualizacoes: maior(v.visualizacoes, p.visualizacoes), interacoes: maior(v.interacoes, p.interacoes) }
      : { ...p, alcance: p.alcance ?? v?.alcance ?? null, visualizacoes: p.visualizacoes ?? v?.visualizacoes ?? null, interacoes: p.interacoes ?? v?.interacoes ?? null });
  }
  return [...porId.values()].sort((a, b) => a.data.localeCompare(b.data));
}

/**
 * Os insights da conta num período, em pedaços de até 30 dias quando a Meta recusar o período inteiro (o mês de 31 dias).
 * Em pedaços, o alcance vira soma: a mesma pessoa nos dois pedaços conta duas vezes.
 */
async function insightsDoPeriodo(token: string, igId: string, consulta: string, desde: number, ate: number): Promise<Insight[][]> {
  const pedir = (de: number, a: number) =>
    graphFetch<{ data: Insight[] }>(token, `${igId}/insights?${consulta}&period=day&metric_type=total_value&since=${seg(de)}&until=${seg(a)}`).then((r) => r.data ?? []);
  const TRINTA = 30 * 24 * HORA;
  try {
    return [await pedir(desde, ate)];
  } catch (e) {
    if (ate - desde <= TRINTA) throw e;
    console.warn(`${consulta} em pedaços:`, e instanceof Error ? e.message : e);
    const pedacos: Insight[][] = [];
    for (let de = desde; de < ate; de += TRINTA) pedacos.push(await pedir(de, Math.min(ate, de + TRINTA)));
    return pedacos;
  }
}
const somaDoInsight = (pedacos: Insight[][], nome: string) => {
  const v = pedacos.map((p) => p.find((i) => i.name === nome)?.total_value?.value).filter((x): x is number => typeof x === 'number');
  return v.length ? v.reduce((s, x) => s + x, 0) : null;
};

/** Os números de uma conta do Instagram numa semana ou num mês. */
async function doInstagram(token: string, ig: Conta, s: Semana, agora: number) {
  const valores = new Map<string, number>();
  const ins = await insightsDoPeriodo(token, ig.id, 'metric=profile_views,total_interactions,reach', s.desde, s.ate);
  for (const nome of ['profile_views', 'total_interactions', 'reach']) {
    const v = somaDoInsight(ins, nome);
    if (v !== null) valores.set(nome, v);
  }
  // Visualizações à parte: a Meta marca a métrica como "em desenvolvimento" e, se recusar, o resto não pode cair junto.
  try {
    const v = somaDoInsight(await insightsDoPeriodo(token, ig.id, 'metric=views', s.desde, s.ate), 'views');
    if (v !== null) valores.set('views', v);
  } catch (e) {
    console.warn(`views de ${ig.nome}:`, e instanceof Error ? e.message : e);
  }

  let novos: number | null = null, perdidos: number | null = null;
  try {
    const f = await insightsDoPeriodo(token, ig.id, 'metric=follows_and_unfollows&breakdown=follow_type', s.desde, s.ate);
    for (const pedaco of f) {
      for (const r of pedaco[0]?.total_value?.breakdowns?.[0]?.results ?? []) {
        if (r.dimension_values[0] === 'FOLLOWER') novos = (novos ?? 0) + r.value;
        if (r.dimension_values[0] === 'NON_FOLLOWER') perdidos = (perdidos ?? 0) + r.value;
      }
    }
  } catch (e) {
    console.warn(`follows_and_unfollows de ${ig.nome}:`, e instanceof Error ? e.message : e); // fica o lançado à mão
  }

  // Os posts do período: os 100 mais recentes cobrem um mês com folga.
  const campos = 'id,media_product_type,timestamp,permalink,caption';
  const midia = await graphFetch<{ data: Midia[] }>(token, `${ig.id}/media?fields=${campos}&limit=100`);
  const naSemana = (m: Midia) => { const t = Date.parse(m.timestamp); return t >= s.desde && t < s.ate; };
  const daSemana = (midia.data ?? []).filter(naSemana);
  // A Meta entrega os 100 posts mais recentes: se o mais antigo deles é de depois do início do período, o período é mais
  // velho que a lista e a contagem sairia zero. Aí feed e reels ficam sem número (refazer meses antigos, 2026-11-07).
  const lista = midia.data ?? [];
  const cobre = lista.length < 100 || Date.parse(lista[lista.length - 1].timestamp) <= s.desde;
  const stories = await graphFetch<{ data: Midia[] }>(token, `${ig.id}/stories?fields=${campos}&limit=100`);
  const diasDeStories = [...new Set((stories.data ?? []).map((x) => diaBR(Date.parse(x.timestamp))))];
  const publicacoes = await Promise.all([
    ...daSemana.filter((m) => m.media_product_type === 'FEED' || m.media_product_type === 'REELS')
      .map((m) => numerosDoPost(token, m, m.media_product_type as Tipo)),
    ...(stories.data ?? []).filter(naSemana).map((m) => numerosDoPost(token, m, 'STORY')),
  ]);

  const perfil = await graphFetch<{ followers_count?: number }>(token, `${ig.id}?fields=followers_count`);
  const alcance = valores.get('reach') ?? null;
  const interacoes = valores.get('total_interactions') ?? null;
  return {
    posts: cobre ? daSemana.filter((m) => m.media_product_type === 'FEED').length : null,
    reels: cobre ? daSemana.filter((m) => m.media_product_type === 'REELS').length : null,
    visitas_perfil: valores.get('profile_views') ?? null,
    alcance, visualizacoes: valores.get('views') ?? null,
    engajamento: alcance && interacoes !== null ? Math.round((interacoes / alcance) * 10000) / 100 : null,
    novos_seguidores: novos, quedas_seguidores: perdidos,
    // O total de agora é o do fim da semana em andamento — ou o do domingo, na coleta de segunda.
    total_seguidores: (s.ate >= agora || s.fechando) ? perfil.followers_count ?? null : null,
    diasDeStories, publicacoes,
  };
}

type Contagem = Record<string, number>;
/** Uma quebra de `follower_demographics` (gênero, idade, país ou cidade) do mês: { valor: seguidores }. */
async function demografia(token: string, ig: Conta, quebra: string): Promise<Contagem | null> {
  const r = await graphFetch<{ data: Insight[] }>(token,
    `${ig.id}/insights?metric=follower_demographics&period=lifetime&timeframe=this_month&metric_type=total_value&breakdown=${quebra}`);
  const linhas = r.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
  return linhas.length ? Object.fromEntries(linhas.map((l) => [l.dimension_values[0], l.value])) : null;
}

/**
 * Quando os seguidores ficam online, na média dos últimos 30 dias: { dia da semana (0 = domingo): { hora: seguidores } },
 * em horário de Brasília. A Meta conta o dia e a hora no fuso do Pacífico; `end_time` é a meia-noite (em UTC) que fecha o
 * dia, e é dela que sai o deslocamento (7 h no horário de verão de lá, 8 h fora dele).
 * ponytail: se a Meta marcar o INÍCIO do dia em `end_time`, o dia da semana sai deslocado em um; conferir o primeiro mês
 * contra Meta Business Suite › Insights › Público e, se for o caso, tirar o `- 24 * HORA`.
 */
async function online(token: string, ig: Conta, agora: number): Promise<Record<string, Contagem> | null> {
  const r = await graphFetch<{ data: { values?: { value?: Contagem; end_time: string }[] }[] }>(token,
    `${ig.id}/insights?metric=online_followers&period=lifetime&since=${seg(agora - 29 * 24 * HORA)}&until=${seg(agora)}`);
  const soma: Record<string, Record<string, { total: number; n: number }>> = {};
  for (const dia of r.data?.[0]?.values ?? []) {
    if (!dia.value) continue;
    const inicioDoDia = Date.parse(dia.end_time) - 24 * HORA;
    for (const [h, n] of Object.entries(dia.value)) {
      const br = new Date(inicioDoDia + Number(h) * HORA - 3 * HORA);
      const d = String(br.getUTCDay()), hora = String(br.getUTCHours());
      const c = ((soma[d] ??= {})[hora] ??= { total: 0, n: 0 });
      c.total += n; c.n++;
    }
  }
  const dias = Object.entries(soma);
  return dias.length
    ? Object.fromEntries(dias.map(([d, hs]) => [d, Object.fromEntries(Object.entries(hs).map(([h, c]) => [h, Math.round(c.total / c.n)]))]))
    : null;
}

/** Quem segue a conta no mês. O que a Meta recusar fica nulo; só o "online" falha calado (saiu da documentação dela). */
async function doPublico(token: string, ig: Conta, agora: number) {
  // Cada quebra por si: se a Meta recusar só as cidades, gênero, idade e país ainda entram.
  const [genero, idade, paises, cidades] = await Promise.all(['gender', 'age', 'country', 'city'].map((q) =>
    demografia(token, ig, q).catch((e) => {
      console.warn(`follower_demographics ${q} de ${ig.nome}:`, e instanceof Error ? e.message : e);
      return null;
    })));
  let quando: Record<string, Contagem> | null = null;
  try {
    quando = await online(token, ig, agora);
  } catch (e) {
    console.warn(`online_followers de ${ig.nome}:`, e instanceof Error ? e.message : e);
  }
  return { genero, idade, paises, cidades, online: quando };
}

const visitasDasAcoes = (acoes: Acao[] | undefined) => {
  const v = (acoes ?? []).filter((a) => a.action_type.includes('profile_visit'));
  return v.length ? v.reduce((s, a) => s + Number(a.value), 0) : null;
};
type Resultado = { indicator?: string; values?: { value?: string }[] };
/** Na campanha, a visita ao perfil vem no resultado dela (indicador profile_visit_view); nas ações, só no total da conta. */
const visitasDoResultado = (resultados: Resultado[] | undefined) => {
  const v = (resultados ?? []).filter((r) => r.indicator?.includes('profile_visit'));
  return v.length ? v.reduce((s, r) => s + Number(r.values?.[0]?.value ?? 0), 0) : null;
};

/** A conta de anúncios numa semana: o total e cada campanha, com a conta do Instagram dela. */
async function dosAnuncios(token: string, act: Conta, s: Semana, instagrams: Map<string, string>) {
  const periodo = encodeURIComponent(JSON.stringify({ since: diaBR(s.desde), until: diaBR(s.ate - 1) }));
  const total = (await graphFetch<{ data: { spend?: string; reach?: string; actions?: Acao[] }[] }>(
    token, `${act.id}/insights?fields=spend,reach,actions&time_range=${periodo}`)).data?.[0];
  type LinhaDaCampanha = { campaign_id: string; campaign_name: string; spend?: string; reach?: string; actions?: Acao[]; results?: Resultado[] };
  const pedirCampanhas = (campos: string) => graphFetch<{ data: LinhaDaCampanha[] }>(
    token, `${act.id}/insights?level=campaign&fields=${campos}&time_range=${periodo}&limit=200`);
  // "results" é campo novo da Meta: se ela recusar, as visitas por conta ficam sem número, e o resto vem.
  const campanhas = (await pedirCampanhas('campaign_id,campaign_name,spend,reach,actions,results')
    .catch((e) => { console.warn('results das campanhas:', e instanceof Error ? e.message : e); return pedirCampanhas('campaign_id,campaign_name,spend,reach,actions'); })).data ?? [];
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
    // Alcance sem gasto também é entrega (2026-11-04: MF.PRO alcançou 3 pessoas por R$ 0,00 e o total da conta contava).
    if (!investimento && !Number(c.reach ?? 0)) continue;
    const ativa = estados.get(c.campaign_id) === 'ACTIVE';
    if (ativa) ativas++;
    const conta = doCriativo.get(c.campaign_id) ?? pelaNome(c.campaign_name);
    if (!conta) continue;
    const p = porConta.get(conta) ?? { investimento: 0, alcance: 0, visitas: null, ativas: 0, campanhas: [] };
    const visitas = visitasDasAcoes(c.actions) ?? visitasDoResultado(c.results);
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

/** Conta ao banco como foi a passada: é ele que abre e fecha a queda (aviso, chamado e interrupção, 20270212300000). */
async function resultado(tenantId: string, ok: boolean, recusada: string | null, venceEm: number | null) {
  const { error } = await adminClient().rpc('ligacao_meta_resultado', {
    p_tenant: tenantId, p_ok: ok, p_desconectou: recusada !== null, p_motivo: recusada,
    p_vence_em: venceEm === null ? null : new Date(venceEm).toISOString(),
  });
  if (error) console.error('ligacao_meta_resultado:', error.message);
}

const proximoMes = (mes: string) => { const [a, m] = mes.split('-').map(Number); return `${m === 12 ? a + 1 : a}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`; };
/** O mês inteiro (dia 1 até o último, ou até agora no mês em andamento), no formato da semana. */
const doMes = (mes: string, agora: number): Semana =>
  ({ domingo: somarDias(proximoMes(mes), -1), desde: inicioBR(mes), ate: Math.min(agora, inicioBR(proximoMes(mes))), fechando: false });
async function coletarEmpresa(tenantId: string, semanas: Semana[], agora: number, comPublico: boolean, meses: string[] = []) {
  const admin = adminClient();
  const { data: lig, error: e1 } = await admin.from('mkt_meta_ligacao').select('contas').eq('tenant_id', tenantId).maybeSingle();
  if (e1) throw e1;
  const { data: segredo, error: e2 } = await admin.from('mkt_meta_ligacao_segredo').select('access_token').eq('tenant_id', tenantId).maybeSingle();
  if (e2) throw e2;
  const token = (segredo as { access_token: string } | null)?.access_token;
  if (!lig) return { tenantId, erro: 'sem ligação com a Meta' };
  if (!token) {
    await resultado(tenantId, false, 'a ligação com a Meta está sem chave', null);
    return { tenantId, erro: 'a ligação com a Meta está sem chave' };
  }
  const contas = ((lig as { contas: Conta[] }).contas ?? []);
  const instagrams = contas.filter((c) => c.tipo === 'instagram');
  const doIg = new Map(instagrams.map((c) => [c.id, nomeDaConta(c.nome)]));
  const erros: string[] = [];
  // As recusas de chave à parte: são elas que derrubam a ligação na hora (o resto espera a conferência de hora em hora).
  const recusas: string[] = [];
  const anotar = (quem: string, e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    erros.push(`${quem}: ${emPortugues(msg)}`);
    if (CHAVE_RECUSADA.test(msg)) recusas.push(`${quem}: ${emPortugues(msg)}`);
  };
  // A Meta compartilhou a MF INTERNO com o app, mas recusou LISTAR as contas de anúncios na ligação ("(#200) Missing
  // Permissions", 2026-11-03). Sem a lista, vai direto às contas de `META_CONTAS_DE_ANUNCIO` (o número da conta, que não
  // é segredo): se a credencial lê anúncio, os números vêm; se não, o erro da Meta aparece na tela.
  const listadas = contas.filter((c) => c.tipo === 'anuncios');
  // A chave que o "Conectar com a Meta" cria veio SEM ads_read (debug_token, 2026-11-03), embora a configuração do login
  // peça. A de anúncios pode vir de um usuário do sistema criado à mão no Business Manager, guardada pelo dono no cofre
  // das funções como `META_TOKEN_ANUNCIOS`. ponytail: uma chave só, porque o Helpoint é só da Minasflor; com outra empresa,
  // a chave de anúncios passa para `mkt_meta_ligacao_segredo`.
  const tokenDeAnuncios = Deno.env.get('META_TOKEN_ANUNCIOS') || token;
  const anuncios: Conta[] = listadas.length ? listadas : (Deno.env.get('META_CONTAS_DE_ANUNCIO') ?? '').split(',')
    .map((s) => s.trim()).filter(Boolean)
    .map((id) => ({ tipo: 'anuncios' as const, id: id.startsWith('act_') ? id : `act_${id}`, nome: `conta de anúncios ${id}` }));

  for (const s of semanas) {
    for (const ig of instagrams) {
      const conta = nomeDaConta(ig.nome);
      try {
        const n = await doInstagram(token, ig, s, agora);
        const { data: atual, error } = await admin.from('mkt_redes_semana').select('coleta, publicacoes')
          .eq('tenant_id', tenantId).eq('semana', s.domingo).eq('conta', conta).maybeSingle();
        if (error) throw error;
        const antes = atual as { coleta?: { stories_dias?: string[] }; publicacoes?: Publicacao[] | null } | null;
        const vistos = new Set<string>(antes?.coleta?.stories_dias ?? []);
        const inicio = somarDias(s.domingo, -6);
        const { diasDeStories, publicacoes, ...numeros } = n;
        for (const d of diasDeStories) if (d >= inicio && d <= s.domingo) vistos.add(d);
        const { error: e } = await admin.from('mkt_redes_semana').upsert(semNulos({
          tenant_id: tenantId, semana: s.domingo, conta, ...numeros,
          publicacoes: juntarPublicacoes(antes?.publicacoes ?? [], publicacoes),
          stories: vistos.size || null, coleta: { stories_dias: [...vistos].sort(), em: new Date(agora).toISOString() },
        }), { onConflict: 'tenant_id,semana,conta' });
        if (e) throw e;
      } catch (e) {
        anotar(conta, e);
      }
    }
    for (const act of anuncios) {
      try {
        const a = await dosAnuncios(tokenDeAnuncios, act, s, doIg);
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
        anotar(act.nome, e);
        if (!erros.some((x) => x.startsWith('a chave ('))) erros.push(await permissoesDaChave(tokenDeAnuncios));
      }
    }
  }
  // O mês inteiro (20270212660000): a Meta dá o alcance sem repetir pessoa, o que a soma das semanas não dá. Stories e
  // seguidores vêm das semanas já guardadas (o story só existe 24 h; o total é o do último domingo do mês).
  for (const mes of meses) {
    const s = doMes(mes, agora);
    const { data: semanasDoMes, error: e0 } = await admin.from('mkt_redes_semana').select('conta, semana, total_seguidores, publicacoes, coleta')
      .eq('tenant_id', tenantId).gte('semana', mes).lte('semana', somarDias(s.domingo, 6)).order('semana');
    if (e0) throw e0;
    const guardadas = (semanasDoMes ?? []) as { conta: string; semana: string; total_seguidores: number | null; publicacoes: Publicacao[] | null; coleta: { stories_dias?: string[] } | null }[];
    for (const ig of instagrams) {
      const conta = nomeDaConta(ig.nome);
      try {
        const { diasDeStories, publicacoes, total_seguidores, ...numeros } = await doInstagram(token, ig, s, agora);
        const daConta = guardadas.filter((g) => g.conta === conta);
        const noMes = (d: string) => d >= mes && d <= s.domingo;
        const storiesGuardados = daConta.flatMap((g) => g.publicacoes ?? []).filter((p) => p.tipo === 'STORY' && noMes(diaBR(Date.parse(p.data))));
        const dias = new Set([...daConta.flatMap((g) => g.coleta?.stories_dias ?? []), ...diasDeStories].filter(noMes));
        const total = s.ate >= agora - HORA ? total_seguidores
          : [...daConta].reverse().find((g) => g.semana <= s.domingo && g.total_seguidores !== null)?.total_seguidores ?? null;
        const { error } = await admin.from('mkt_redes_mes').upsert(semNulos({
          tenant_id: tenantId, mes, conta, ...numeros, total_seguidores: total, stories: dias.size || null,
          publicacoes: juntarPublicacoes(storiesGuardados, publicacoes), coletado_em: new Date(agora).toISOString(),
        }), { onConflict: 'tenant_id,mes,conta' });
        if (error) throw error;
      } catch (e) {
        anotar(`${conta} (mês)`, e);
      }
    }
    for (const act of anuncios) {
      try {
        const a = await dosAnuncios(tokenDeAnuncios, act, s, doIg);
        const { error } = await admin.from('mkt_trafego_mes').upsert(semNulos({
          tenant_id: tenantId, mes, ...a.total, visitas_perfil: a.total.visitas_perfil, coletado_em: new Date(agora).toISOString(),
        }), { onConflict: 'tenant_id,mes' });
        if (error) throw error;
        for (const conta of new Set([...doIg.values(), ...a.porConta.keys()])) {
          const p = a.porConta.get(conta);
          const { error: e } = await admin.from('mkt_redes_mes').upsert(semNulos({
            tenant_id: tenantId, mes, conta,
            investimento: p?.investimento ?? 0, alcance_pago: p?.alcance ?? 0, visitas_pagas: p?.visitas ?? null,
            campanhas_ativas: p?.ativas ?? 0, campanhas: p?.campanhas ?? [],
          }), { onConflict: 'tenant_id,mes,conta' });
          if (e) throw e;
        }
      } catch (e) {
        anotar(`${act.nome} (mês)`, e);
      }
    }
  }

  if (comPublico) {
    const mes = `${diaBR(agora).slice(0, 7)}-01`;
    for (const ig of instagrams) {
      const conta = nomeDaConta(ig.nome);
      try {
        const p = await doPublico(token, ig, agora);
        const { error } = await admin.from('mkt_publico_ig').upsert(semNulos({
          tenant_id: tenantId, conta, mes, ...p, coletado_em: new Date(agora).toISOString(),
        }), { onConflict: 'tenant_id,conta,mes' });
        if (error) throw error;
      } catch (e) {
        anotar(`${conta} (público)`, e);
      }
    }
  }
  const semAnuncios = anuncios.length ? null : 'as contas de anúncios não vieram na ligação; conecte de novo marcando a MF INTERNO - Marketing';
  const { error } = await admin.from('mkt_meta_ligacao').update({
    // Uma semana e a anterior dão o mesmo erro: aparece uma vez só.
    coletado_em: new Date(agora).toISOString(), ultimo_erro: [...new Set([...erros, semAnuncios].filter(Boolean))].join(' · ') || null,
  }).eq('tenant_id', tenantId);
  if (error) throw error;
  // O vencimento da chave uma vez por dia (passada das 6h e "Buscar agora"): vale o que vencer primeiro.
  const vencimentos = comPublico
    ? (await Promise.all([...new Set([token, tokenDeAnuncios])].map(vencimentoDaChave))).filter((x): x is number => x !== null)
    : [];
  await resultado(tenantId, erros.length === 0, recusas.length ? [...new Set(recusas)].join(' · ') : null,
    vencimentos.length ? Math.min(...vencimentos) : null);
  return { tenantId, semanas: semanas.map((s) => s.domingo), meses, erros };
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
      const horaBR = new Date(agora - 3 * HORA).getUTCHours();
      // Na segunda, a semana que acabou é buscada de novo o dia todo (a Meta fecha os números com atraso), mas o total de
      // seguidores dela só sai das passadas da madrugada, 0h e 3h. ponytail: a das 3h cobre a da meia-noite se ela falhar,
      // ao custo de o total levar 3 h de segunda-feira; se as duas falharem, a semana fica sem total (lançar à mão).
      const corpo = await req.json().catch(() => ({})) as { meses?: string[]; semanas?: string[] };
      // Refazer o que passou (só a chave de serviço): `{ meses: ['2026-08'] }` e/ou `{ semanas: ['2026-11-01'] }` (domingos),
      // poucos por vez — a função tem uns 150 s; 11 meses de uma vez estouraram (2026-11-07).
      const refazer = Array.isArray(corpo.meses) || Array.isArray(corpo.semanas);
      const semanas = refazer
        ? (corpo.semanas ?? []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).map((d) => semana(domingoDe(d), agora, false))
        : [semana(domingo, agora, false), ...(segunda ? [semana(anterior, agora, horaBR < 6)] : [])];
      const comPublico = !refazer && horaBR >= 6 && horaBR < 9;
      const esteMes = `${hoje.slice(0, 7)}-01`;
      const meses = refazer ? (corpo.meses ?? []).filter((m) => /^\d{4}-\d{2}$/.test(m)).map((m) => `${m}-01`)
        : Number(hoje.slice(8, 10)) <= 7 ? [somarDias(esteMes, -1).slice(0, 8) + '01', esteMes] : [esteMes];
      const { data: ligacoes, error } = await admin.from('mkt_meta_ligacao').select('tenant_id');
      if (error) throw error;
      const resultados = [];
      for (const l of (ligacoes ?? []) as { tenant_id: string }[]) {
        try { resultados.push(await coletarEmpresa(l.tenant_id, semanas, agora, comPublico, meses)); } catch (e) { resultados.push({ tenantId: l.tenant_id, erro: String(e) }); }
      }
      return json({ ok: true, resultados });
    }

    // "Buscar agora": a empresa de quem clicou, dono ou admin (decisão do dono, 2026-11-08).
    const usuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: claims, error: claimsErro } = await usuario.auth.getClaims(auth.slice(7));
    if (claimsErro || !claims?.claims?.sub) return json({ error: 'Unauthorized' }, 401);
    const userId = claims.claims.sub as string;
    const { data: ehAdmin, error: papelErro } = await admin.rpc('is_admin_or_higher', { _user_id: userId });
    if (papelErro) throw papelErro;
    if (!ehAdmin) return json({ error: 'só o dono e o admin buscam os números da Meta' }, 403);
    const { data: perfil, error: perfilErro } = await admin.from('profiles').select('tenant_id').eq('id', userId).maybeSingle();
    if (perfilErro) throw perfilErro;
    const tenantId = (perfil as { tenant_id: string } | null)?.tenant_id;
    if (!tenantId) return json({ error: 'sua conta não está ligada a nenhuma empresa' }, 403);
    // A semana anterior entra sem o total de seguidores (o de agora não é o do domingo dela).
    const esteMes = `${hoje.slice(0, 7)}-01`;
    return json(await coletarEmpresa(tenantId, [semana(domingo, agora, false), semana(anterior, agora, false)], agora, true,
      [somarDias(esteMes, -1).slice(0, 8) + '01', esteMes]));
  } catch (e) {
    console.error('mkt-meta-coletar:', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

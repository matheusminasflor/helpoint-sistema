// OS LEADS E AS VENDAS DO KOMMO para os Indicadores do Marketing (dono, 2026-11-07, proposta v4
// https://claude.ai/artifact/4YkGvumGgu6Z9JmgmwodQr): por dia e por segmento, quantos leads chegaram (pelo funil em que
// estão agora), quantas vendas ganhas e perdidas (no dia em que fecharam), o valor ganho e o motivo de cada perda.
// O segmento sai de `_shared/kommo-segmento.ts`: o funil pelo número e, acima dele, o campo "Segmento" da triagem;
// a Entrada (arquivada ou não) e a etapa "Com a Lyra" sem Segmento são o "Sem triagem". Funil que não é de venda não entra.
//
// Quem chama: o pg_cron, a cada 3 horas (20270212640000), com a chave de serviço. Toda leitura reconta desde 1º/01/2026
// (no máximo os últimos 400 dias) e troca as linhas de uma vez (`mkt_kommo_gravar`): o lead triado ou fechado depois
// corrige o dia dele. São uns 2.400 leads por ano, poucas páginas de 250.
// A chave é o token de longa duração da integração privada "Helpoint" (secrets KOMMO_TOKEN e KOMMO_SUBDOMINIO).
// ponytail: Brasília é UTC−3 fixo, como em `mkt-meta-coletar`; uma conta do Kommo, de uma empresa.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { servicoOuAdmin } from '../_shared/servico-ou-admin.ts';
import { ufDoCliente } from '../_shared/kommo-uf.ts';
import { documentoDoLead, ehLimpeza, whatsappDoLead, etapasDeTriagem, FUNIL_DE_VENDA, segmentoDoLead, type LeadParaSegmento } from '../_shared/kommo-segmento.ts';

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

const HORA = 3600_000;
const diaBR = (ms: number) => new Date(ms - 3 * HORA).toISOString().slice(0, 10);
const inicioBR = (iso: string) => Date.parse(`${iso}T00:00:00-03:00`);
const GANHA = 142;
const PERDIDA = 143;


async function kommo<T>(caminho: string): Promise<T | null> {
  const sub = Deno.env.get('KOMMO_SUBDOMINIO')?.trim();
  const token = Deno.env.get('KOMMO_TOKEN')?.trim();
  if (!sub || !token) throw new Error('a chave do Kommo não está no cofre (KOMMO_TOKEN e KOMMO_SUBDOMINIO)');
  // A rede com o Kommo falha às vezes por segundos ("error sending request", 06:20 e 21:20 de 08/11): tenta de novo
  // 3 vezes antes de dar a leitura por perdida. Resposta do Kommo (401, 500…) não é falha de rede e não repete.
  let r: Response | null = null;
  for (let tentativa = 1; ; tentativa++) {
    try {
      r = await fetch(`https://${sub}.kommo.com/api/v4/${caminho}`, { headers: { Authorization: `Bearer ${token}` } });
      break;
    } catch (e) {
      if (tentativa >= 3) throw e;
      await new Promise((ok) => setTimeout(ok, tentativa * 3000));
    }
  }
  if (r.status === 204) return null;
  if (r.status === 401 || r.status === 403) {
    throw new Error('o Kommo recusou a chave: gere outro token na integração Helpoint do Kommo e troque KOMMO_TOKEN no cofre');
  }
  if (!r.ok) throw new Error(`o Kommo respondeu ${r.status}: ${(await r.text()).slice(0, 150)}`);
  return await r.json() as T;
}

interface Lead extends LeadParaSegmento {
  id: number; name: string; price: number | null; created_at: number; closed_at: number | null;
  loss_reason_id: number | null; responsible_user_id?: number | null;
  _embedded?: { contacts?: { id: number; is_main?: boolean }[]; tags?: { name: string }[] };
}

/** Todos os leads com `campo` (criado, fechado ou mexido) entre `de` e agora, em segundos; fechados e mexidos vêm com os contatos. */
async function leads(campo: 'created_at' | 'closed_at' | 'updated_at', de: number): Promise<Lead[]> {
  const todos: Lead[] = [];
  const com = campo !== 'created_at' ? '&with=contacts' : '';
  for (let pagina = 1; ; pagina++) {
    const r = await kommo<{ _embedded: { leads: Lead[] }; _links?: { next?: unknown } }>(
      `leads?limit=250&page=${pagina}${com}&filter[${campo}][from]=${de}&filter[${campo}][to]=${Math.floor(Date.now() / 1000)}`);
    todos.push(...(r?._embedded.leads ?? []));
    if (!r?._links?.next) return todos;
  }
}

const contatoPrincipal = (l: Lead) => {
  const cs = l._embedded?.contacts ?? [];
  return (cs.find((c) => c.is_main) ?? cs[0])?.id ?? null;
};

/** Etiqueta que tira o lead ou o contato do Atendimento do CRM: equipe, fornecedor e os artistas da marca (dono, 2026-11-09; 20270212720300). */
const FORA_DOS_INDICADORES = /^(equipe interna|fornecedor|artistas?)$/i;
const foraDosIndicadores = (tags?: { name: string }[]) => (tags ?? []).some((t) => FORA_DOS_INDICADORES.test(t.name.trim()));

/** O nome e o telefone (só os dígitos) de cada contato, e os da equipe ou de fornecedor. O nome do contato diz quem é; "Lead #118411874", não. */
async function contatos(lista: (number | null)[]) {
  const ids = [...new Set(lista.filter((x): x is number => x !== null))];
  const nomeDo = new Map<number, string>();
  const telefoneDo = new Map<number, string>();
  const fora = new Set<number>();
  const estadoDo = new Map<number, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const filtro = ids.slice(i, i + 200).map((id) => `filter[id][]=${id}`).join('&');
    const r = await kommo<{ _embedded: { contacts: { id: number; name: string; custom_fields_values?: { field_code?: string; field_name?: string; values?: { value?: unknown }[] }[] | null; _embedded?: { tags?: { name: string }[] } }[] } }>(`contacts?limit=250&${filtro}`);
    for (const c of r?._embedded.contacts ?? []) {
      if (c.name?.trim()) nomeDo.set(c.id, c.name.trim());
      if (foraDosIndicadores(c._embedded?.tags)) fora.add(c.id);
      const estado = c.custom_fields_values?.find((f) => f.field_name?.trim().toLowerCase() === 'estado')?.values?.[0]?.value;
      if (typeof estado === 'string' && estado.trim()) estadoDo.set(c.id, estado);
      const tel = String(c.custom_fields_values?.find((f) => f.field_code === 'PHONE')?.values?.[0]?.value ?? '').replace(/\D/g, '');
      if (tel.length >= 8 && tel.length <= 15) telefoneDo.set(c.id, tel);
    }
  }
  return { nomeDo, telefoneDo, fora, estadoDo };
}

async function rodada(db: SupabaseClient, tenant: string) {
  const funis = (await kommo<{ _embedded: { pipelines: { id: number; name: string; _embedded?: { statuses?: { id: number; name: string }[] } }[] } }>('leads/pipelines'))?._embedded.pipelines ?? [];
  // A Entrada pode estar arquivada; os três funis de venda, não. Sem eles a chave é de outra conta ou um funil foi apagado.
  const faltam = Object.entries(FUNIL_DE_VENDA).filter(([id, s]) => s !== 'sem_triagem' && !funis.some((p) => p.id === Number(id)));
  if (faltam.length) throw new Error(`não achei no Kommo os funis de venda ${faltam.map(([id]) => id).join(', ')} (Consumidor Final, Salão de Beleza, Distribuidor)`);
  const triagem = etapasDeTriagem(funis);
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
    const funil = segmentoDoLead(l, triagem);
    if (funil) linha(diaBR(l.created_at * 1000), funil).chegaram++;
  }
  const vendas: { lead_id: number; nome: string; contato: number | null; funil: string; responsavel: number | null; situacao: string; valor: number; fechou: string; motivo: string | null; link: string; documento: string | null; whatsapp: string | null }[] = [];
  const sub = Deno.env.get('KOMMO_SUBDOMINIO')!.trim();
  for (const l of await leads('closed_at', de)) {
    const funil = segmentoDoLead(l, triagem);
    if (!funil || !l.closed_at || (l.status_id !== GANHA && l.status_id !== PERDIDA)) continue;
    if (l.status_id === PERDIDA && ehLimpeza(l.loss_reason_id ? motivoDo.get(l.loss_reason_id) : null)) continue;
    const dia = diaBR(l.closed_at * 1000);
    const n = linha(dia, funil);
    vendas.push({
      lead_id: l.id, nome: l.name, contato: contatoPrincipal(l), funil,
      situacao: l.status_id === GANHA ? 'ganha' : 'perdida', valor: Number(l.price ?? 0), fechou: dia,
      responsavel: l.responsible_user_id ?? null,
      motivo: l.status_id === PERDIDA ? (l.loss_reason_id && motivoDo.get(l.loss_reason_id)) || null : null,
      link: `https://${sub}.kommo.com/leads/detail/${l.id}`,
      // Parte 4.3: o CPF/CNPJ liga a venda de Distribuidor às notas do Forteplus (mkt_kommo_faturado).
      documento: documentoDoLead(l),
      whatsapp: whatsappDoLead(l),
    });
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

  // O nome é o do contato principal do lead; sem contato, fica o nome do lead. O telefone do contato só SUGERE o
  // cliente na lista "Para corrigir" (parte 4.3); a ligação é pelo CPF/CNPJ.
  const { nomeDo, telefoneDo } = await contatos(vendas.map((v) => v.contato));
  const { error: e2 } = await db.rpc('mkt_kommo_gravar_vendas', {
    p_tenant: tenant, p_desde: desde,
    // Sem telefone no contato (o Direct do Instagram não traz), vale o WhatsApp que a Lyra pediu.
    p_vendas: vendas.map(({ contato, whatsapp, ...v }) => ({ ...v, nome: (contato !== null && nomeDo.get(contato)) || v.nome,
      telefone: (contato !== null && telefoneDo.get(contato)) || whatsapp })),
  });
  if (e2) throw e2;
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

interface Tarefa { id: number; entity_id: number; entity_type: string; text: string; created_at: number; complete_till: number }

interface Evento {
  id: string; type: string; entity_id: number; entity_type: string; created_by: number; created_at: number;
  value_after?: { message?: { origin?: string }; lead_status?: { id: number; pipeline_id: number } }[] | null;
}

/**
 * Atendimento do CRM (parte 4b, 20270212710000): as mensagens que entraram e saíram desde a última guardada (com 2 horas
 * de folga; na primeira vez, desde 01/10), os leads delas e os mexidos nesse tempo, as pessoas do Kommo e as tarefas
 * concluídas, e as trocas de etapa (20270212720000: a mensagem de autor 0 é do robô só em "Com a Lyra"). O banco conta o resto.
 * A mensagem que ficou só no contato (conversa que ainda não virou lead) vai para o lead mais novo dele.
 */
async function atendimento(db: SupabaseClient, tenant: string) {
  const { data: ultima, error } = await db.from('kommo_mensagens').select('quando').eq('tenant_id', tenant)
    .order('quando', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  // Dono, 2026-11-09: só outubro e novembro para trás; depois, só o que chegou desde a última leitura.
  const de = Math.max(Math.floor(inicioBR('2026-10-01') / 1000), ultima ? Math.floor(Date.parse((ultima as { quando: string }).quando) / 1000) - 7200 : 0);

  const mensagens: { id: string; lead_id: number; quando: number; entrou: boolean; autor: number; canal: string | null }[] = [];
  const doContato: Evento[] = [];
  for (let pagina = 1; ; pagina++) {
    const r = await kommo<{ _embedded: { events: Evento[] }; _links?: { next?: unknown } }>(
      `events?limit=100&page=${pagina}&filter[type][]=incoming_chat_message&filter[type][]=outgoing_chat_message&filter[created_at][from]=${de}`);
    for (const e of r?._embedded.events ?? []) {
      if (e.entity_type === 'contact') doContato.push(e);
      if (e.entity_type !== 'lead') continue;
      mensagens.push({ id: e.id, lead_id: e.entity_id, quando: e.created_at, entrou: e.type === 'incoming_chat_message',
        autor: e.created_by || 0, canal: e.value_after?.[0]?.message?.origin ?? null });
    }
    if (!r?._links?.next) break;
  }
  const ids = [...new Set(doContato.map((e) => e.entity_id))];
  for (let i = 0; i < ids.length; i += 200) {
    const filtro = ids.slice(i, i + 200).map((id) => `filter[id][]=${id}`).join('&');
    const r = await kommo<{ _embedded: { contacts: { id: number; _embedded?: { leads?: { id: number }[] } }[] } }>(`contacts?limit=250&with=leads&${filtro}`);
    const leadDo = new Map((r?._embedded.contacts ?? []).map((c) => [c.id, Math.max(0, ...(c._embedded?.leads ?? []).map((l) => l.id))]));
    for (const e of doContato) {
      const lead = leadDo.get(e.entity_id);
      if (lead) mensagens.push({ id: e.id, lead_id: lead, quando: e.created_at, entrou: e.type === 'incoming_chat_message',
        autor: e.created_by || 0, canal: e.value_after?.[0]?.message?.origin ?? null });
    }
  }

  const porId = new Map((await leads('updated_at', de)).map((l) => [l.id, l]));
  // Lead que ainda não tem o estado (gravado antes de 20270212720400) entra também, 200 por leitura, até completar.
  const { data: semUf, error: erroUf } = await db.from('kommo_leads').select('lead_id').eq('tenant_id', tenant).is('uf', null).limit(200);
  if (erroUf) throw erroUf;
  const faltam = [...new Set([...mensagens.map((m) => m.lead_id), ...(semUf ?? []).map((l) => (l as { lead_id: number }).lead_id)])]
    .filter((id) => !porId.has(id));
  for (let i = 0; i < faltam.length; i += 200) {
    const filtro = faltam.slice(i, i + 200).map((id) => `filter[id][]=${id}`).join('&');
    const r = await kommo<{ _embedded: { leads: Lead[] } }>(`leads?limit=250&with=contacts&${filtro}`);
    for (const l of r?._embedded.leads ?? []) porId.set(l.id, l);
  }
  const funis = (await kommo<{ _embedded: { pipelines: { id: number; name: string; _embedded?: { statuses?: { id: number; name: string }[] } }[] } }>('leads/pipelines'))?._embedded.pipelines ?? [];
  const triagem = etapasDeTriagem(funis);
  const nomeDoFunil = new Map(funis.map((p) => [p.id, p.name]));
  const nomeDaEtapa = new Map(funis.flatMap((p) => (p._embedded?.statuses ?? []).map((st) => [`${p.id}|${st.id}`, st.name] as const)));
  const { nomeDo, fora, telefoneDo, estadoDo } = await contatos([...porId.values()].map(contatoPrincipal));
  const sub = Deno.env.get('KOMMO_SUBDOMINIO')!.trim();
  const leadsAtendidos = [...porId.values()].map((l) => {
    const contato = contatoPrincipal(l);
    return {
      lead_id: l.id, nome: (contato !== null && nomeDo.get(contato)) || l.name, segmento: segmentoDoLead(l, triagem),
      funil: nomeDoFunil.get(l.pipeline_id) ?? null, etapa: nomeDaEtapa.get(`${l.pipeline_id}|${l.status_id}`) ?? null,
      fechado: l.status_id === GANHA || l.status_id === PERDIDA, responsavel: l.responsible_user_id ?? null,
      link: `https://${sub}.kommo.com/leads/detail/${l.id}`,
      interno: foraDosIndicadores(l._embedded?.tags) || (contato !== null && fora.has(contato)),
      // O campo do lead (a Lyra pergunta ao distribuidor), o do contato e, sem eles, o DDD; '' = não deu para saber.
      uf: ufDoCliente([
        (l as LeadParaSegmento).custom_fields_values?.find((c) => c.field_name?.trim().toLowerCase() === 'estado de atuação')?.values?.[0]?.value,
        contato !== null ? estadoDo.get(contato) : null,
      ], contato !== null ? telefoneDo.get(contato) : null) ?? '',
    };
  });

  const usuarios = ((await kommo<{ _embedded: { users: { id: number; name: string; email: string }[] } }>('users?limit=250'))?._embedded.users ?? [])
    .map((u) => ({ kommo_id: u.id, nome: u.name, email: u.email }));
  const tarefas: { id: number; responsavel: number; feita_em: number }[] = [];
  for (let pagina = 1; ; pagina++) {
    const r = await kommo<{ _embedded: { tasks: (Tarefa & { responsible_user_id: number; updated_at: number })[] }; _links?: { next?: unknown } }>(
      `tasks?filter[is_completed]=1&filter[entity_type]=leads&filter[updated_at][from]=${de}&limit=250&page=${pagina}`);
    for (const t of r?._embedded.tasks ?? []) tarefas.push({ id: t.id, responsavel: t.responsible_user_id, feita_em: t.updated_at });
    if (!r?._links?.next) break;
  }

  const { data, error: e2 } = await db.rpc('kommo_gravar_atendimento', {
    p_tenant: tenant, p_mensagens: mensagens, p_leads: leadsAtendidos, p_usuarios: usuarios, p_tarefas: tarefas,
  });
  if (e2) throw e2;

  // As trocas de etapa, desde a última guardada (com 2 horas de folga; na primeira vez, desde 01/10).
  const { data: ultimaEtapa, error: e3 } = await db.from('kommo_etapas').select('quando').eq('tenant_id', tenant)
    .order('quando', { ascending: false }).limit(1).maybeSingle();
  if (e3) throw e3;
  const deEtapa = Math.max(Math.floor(inicioBR('2026-10-01') / 1000), ultimaEtapa ? Math.floor(Date.parse((ultimaEtapa as { quando: string }).quando) / 1000) - 7200 : 0);
  const etapas: { id: string; lead_id: number; quando: number; etapa: string | null }[] = [];
  for (let pagina = 1; ; pagina++) {
    const r = await kommo<{ _embedded: { events: Evento[] }; _links?: { next?: unknown } }>(
      `events?limit=100&page=${pagina}&filter[type][]=lead_status_changed&filter[created_at][from]=${deEtapa}`);
    for (const e of r?._embedded.events ?? []) {
      const st = e.value_after?.[0]?.lead_status;
      if (e.entity_type === 'lead' && st) etapas.push({ id: e.id, lead_id: e.entity_id, quando: e.created_at, etapa: nomeDaEtapa.get(`${st.pipeline_id}|${st.id}`) ?? null });
    }
    if (!r?._links?.next) break;
  }
  const { data: novasEtapas, error: e4 } = await db.rpc('kommo_gravar_etapas', { p_tenant: tenant, p_etapas: etapas });
  if (e4) throw e4;
  return { ...data, etapas: novasEtapas, do_contato: doContato.length };
}

serve(async (req) => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // O pg_cron a cada 3 horas, ou o dono/admin pelo "Ler agora" de Configurações › Integrações.
  const quem = await servicoOuAdmin(req, db);
  if (quem instanceof Response) return quem;
  const corpo = await req.json().catch(() => ({})) as { diagnostico?: number; semResposta?: boolean };
  if (corpo.diagnostico && quem.servico) {
    try { return json(await diagnostico(Math.min(365, Number(corpo.diagnostico) || 60))); } catch (e) { return json({ error: String(e) }, 500); }
  }

  const { data: empresa, error: erroEmpresa } = await db.from('tenants').select('id').order('created_at').limit(1).single();
  if (erroEmpresa) return json({ error: erroEmpresa.message }, 500);
  const tenant = empresa.id as string;
  // ponytail: uma conta do Kommo, da primeira empresa; o admin de outra empresa não lê esta.
  if (!quem.servico && quem.tenantId !== tenant) return json({ error: 'o Kommo ligado é de outra empresa' }, 403);
  if (!quem.servico) {
    // Clique repetido: o Kommo limita as chamadas, e uma leitura leva quase um minuto.
    const { data: robo, error: erroRobo } = await db.from('mkt_kommo_robo').select('ok_em').eq('tenant_id', tenant).maybeSingle();
    if (erroRobo) return json({ error: erroRobo.message }, 500);
    const ok = (robo as { ok_em: string | null } | null)?.ok_em;
    if (ok && Date.now() - Date.parse(ok) < 2 * 60_000) return json({ error: 'a última leitura foi há menos de 2 minutos; tente daqui a pouco' }, 429);
  }

  // A cada 10 minutos, à parte da leitura de 3 em 3 horas: o aviso de lead sem resposta e as conversas do Atendimento do
  // CRM. Falha aqui não marca a leitura como parada.
  if (corpo.semResposta) {
    if (!quem.servico) return json({ error: 'só o robô confere os leads sem resposta' }, 403);
    try {
      const lido = await atendimento(db, tenant);
      // Cliente esperando a atendente há 45 minutos de expediente (20270212720400): o banco decide e avisa.
      const { data: avisos, error } = await db.rpc('kommo_avisar_esperas', { p_tenant: tenant });
      if (error) throw error;
      return json({ atendimento: lido, avisos });
    } catch (e) { return json({ error: String((e as Error).message).slice(0, 200) }, 500); }
  }

  try {
    const resultado = await rodada(db, tenant);
    const { error } = await db.rpc('leitura_ok', { p_robo: 'kommo', p_tenant: tenant, p_aviso: null });
    if (error) throw error;
    return json(resultado);
  } catch (erro) {
    const motivo = String((erro as Error).message).slice(0, 200);
    // Chave recusada avisa na hora; erro de rede ou do Kommo, só na 2ª leitura seguida (20270212690000).
    const { error } = await db.rpc('leitura_falhou', { p_robo: 'kommo', p_tenant: tenant, p_motivo: motivo, p_na_hora: /recusou a chave/.test(motivo) });
    if (error) console.error('leitura_falhou:', error.message);
    return json({ error: motivo }, 500);
  }
});

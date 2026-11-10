// Atendimento do CRM (projeto do Kommo, parte 4b; tela nova aprovada pelo dono em 2026-11-09,
// https://claude.ai/artifact/9b6cYeC6VFZFvtwXttya6H). A conta é do banco (`crm_atendimento`, 20270212720400); aqui só o
// que a tela escreve e soma: os nomes, o tempo, o recorte por segmento e por estado.
import { SEGMENTOS, type Segmento } from '@/lib/leads-e-vendas';

/** Quando a Lyra entrou no ar no WhatsApp (`kommo_lyra_no_ar` no banco): antes disso não havia robô. */
export const LYRA_NO_AR = '08/11 às 18h56';

export interface LinhaDaAtendente {
  kommo_id: number; nome: string; leads: number; mensagens: number; primeira_resposta: number | null;
  /** As mensagens dela que o Kommo gravou sem nome (fora de "Com a Lyra"). */
  sem_nome: number;
  /** Conversas em que ela deu a 1ª resposta, e quantas dentro da meta. */
  respondidos: number; no_prazo: number;
  /** Clientes que ela procurou sem eles terem escrito no período (retorno, pós-venda, cobrança). */
  ativos: number;
  tarefas: number; ganhas: number; perdidas: number;
}
export interface LeadParaResponder {
  lead_id: number; desde: string; nome: string; segmento: Segmento | null; funil: string | null; etapa: string | null; link: string; uf: string | null;
}
export type CampoObrigatorio = 'cnpj' | 'telefone' | 'valor' | 'valor_kommo' | 'motivo';
export interface VendaComCampoFaltando {
  lead_id: number; nome: string; funil: Segmento; situacao: 'ganha' | 'perdida'; fechou: string; link: string; faltam: CampoObrigatorio[];
}
/** Uma célula segmento × estado do período. */
export interface LinhaCruzada {
  segmento: Segmento | null; funil: string | null; uf: string | null;
  conversas: number; so_lyra: number; sem_resposta: number; respondidas: number; no_prazo: number; soma_minutos: number;
}
/** `valor`: o mesmo do `valor_ganho` (o digitado no Kommo e, para quem gere as carteiras, o faturado do distribuidor). */
export interface VendaCruzada { segmento: Segmento; uf: string | null; ganhas: number; perdidas: number; valor: number }
export type SituacaoDoLead = 'so_lyra' | 'sem_resposta' | 'no_prazo' | 'fora_do_prazo';
/** Um lead do período: conversou (`situacao`), fechou venda ou perdeu (`venda`), ou os dois. */
export interface LeadDoPeriodo {
  lead_id: number; nome: string | null; segmento: Segmento | null; funil: string | null; uf: string | null; link: string | null;
  atendente: string | null; situacao: SituacaoDoLead | null; minutos: number | null; venda: 'ganha' | 'perdida' | null; valor: number | null;
}
export interface AtendimentoDoCrm {
  todos: boolean;
  /** A meta da 1ª resposta, em minutos de expediente (`kommo_meta_resposta`). */
  meta: number;
  conversas: number; so_lyra: number; sem_resposta: number; respondidas: number; no_prazo: number; primeira_resposta: number | null;
  ganhas: number; perdidas: number;
  /** O digitado no Kommo e, para quem gere as carteiras, o faturado dos distribuidores. */
  valor_ganho: number;
  /** A Lyra (lead em "Com a Lyra") e a transmissão; null quando o período é todo antes de ela entrar no ar, ou para a atendente. */
  robo: { leads: number; mensagens: number } | null;
  atendentes: LinhaDaAtendente[];
  cruzado: LinhaCruzada[];
  vendas_cruzado: VendaCruzada[];
  leads: LeadDoPeriodo[];
  para_responder: LeadParaResponder[];
  campos_faltando: VendaComCampoFaltando[];
}

export const CAMPO_OBRIGATORIO: Record<CampoObrigatorio, string> = {
  cnpj: 'CNPJ', telefone: 'Telefone', valor: 'Valor', valor_kommo: 'Valor no Kommo', motivo: 'Motivo da perda',
};
/** O que aparece na etiqueta de cada campo que falta. */
export const FALTA: Record<CampoObrigatorio, string> = {
  cnpj: 'falta CNPJ', telefone: 'falta telefone', valor: 'falta valor', valor_kommo: 'valor só no faturado: digitar no Kommo',
  motivo: 'falta motivo',
};

const ESTADO: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo',
  GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba',
  PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul',
  RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};
export const nomeDoEstado = (uf: string | null) => (uf ? ESTADO[uf] ?? uf : 'Sem estado');

/** O segmento pelo nome dos Indicadores; o funil que não é de venda (ENAD, Educacional), pelo nome dele no Kommo. */
export function nomeDoFunil(segmento: Segmento | null, funil: string | null): string {
  return SEGMENTOS.find((s) => s.k === segmento)?.nome ?? funil ?? 'Sem funil';
}

/** 25 → "25 min"; 70 → "1 h 10 min"; 120 → "2 h". */
export function minutos(n: number | null): string {
  if (n === null) return '—';
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export const dentroDaMeta = (n: number | null, meta: number) => n !== null && n <= meta;

/** Quantas vendas têm cada campo vazio, na ordem em que a tela mostra. */
export function contagemDosCampos(vendas: VendaComCampoFaltando[]): { campo: CampoObrigatorio; quantos: number }[] {
  return (Object.keys(CAMPO_OBRIGATORIO) as CampoObrigatorio[])
    .map((campo) => ({ campo, quantos: vendas.filter((v) => v.faltam.includes(campo)).length }));
}

export interface Soma { conversas: number; so_lyra: number; sem_resposta: number; respondidas: number; no_prazo: number; tempo: number | null }
const somar = (linhas: LinhaCruzada[]): Soma => {
  const t = linhas.reduce((a, l) => ({
    conversas: a.conversas + l.conversas, so_lyra: a.so_lyra + l.so_lyra, sem_resposta: a.sem_resposta + l.sem_resposta,
    respondidas: a.respondidas + l.respondidas, no_prazo: a.no_prazo + l.no_prazo, soma: a.soma + l.soma_minutos,
  }), { conversas: 0, so_lyra: 0, sem_resposta: 0, respondidas: 0, no_prazo: 0, soma: 0 });
  const { soma, ...resto } = t;
  return { ...resto, tempo: t.respondidas ? Math.round(soma / t.respondidas) : null };
};

/** O "estado" de quem não tem estado, para o filtro da tela. */
export const SEM_ESTADO = 'sem';

/** A chave da linha do segmento: o segmento, ou o funil que não é de venda (ENAD) pelo nome. */
export const chaveDoSegmento = (x: { segmento: Segmento | null; funil: string | null }) => x.segmento ?? `funil:${x.funil ?? ''}`;
const doEstado = (uf: string | null) => (x: { uf: string | null }) => uf === null || (x.uf || SEM_ESTADO) === uf;

export interface LinhaDoSegmento extends Soma { chave: string; nome: string; vendas: number; valor: number }
/**
 * Por segmento, só do estado escolhido (null = todos). O funil que não é de venda vai pelo nome; o maior primeiro.
 * O segmento que vendeu sem conversa no período também ganha linha, para o Valor somar a Venda total.
 */
export function porSegmento(cruzado: LinhaCruzada[], vendas: VendaCruzada[], uf: string | null): LinhaDoSegmento[] {
  const grupos = new Map<string, { segmento: Segmento | null; funil: string | null; ls: LinhaCruzada[] }>();
  for (const l of cruzado.filter(doEstado(uf))) {
    const g = grupos.get(chaveDoSegmento(l)) ?? { segmento: l.segmento, funil: l.funil, ls: [] };
    grupos.set(chaveDoSegmento(l), { ...g, ls: [...g.ls, l] });
  }
  const vendidas = vendas.filter(doEstado(uf));
  for (const v of vendidas) if (!grupos.has(v.segmento)) grupos.set(v.segmento, { segmento: v.segmento, funil: null, ls: [] });
  return [...grupos].map(([chave, g]) => {
    const dele = g.segmento ? vendidas.filter((v) => v.segmento === g.segmento) : [];
    return {
      chave, nome: nomeDoFunil(g.segmento, g.funil), ...somar(g.ls),
      vendas: dele.reduce((a, v) => a + v.ganhas, 0), valor: dele.reduce((a, v) => a + Number(v.valor ?? 0), 0),
    };
  }).sort((a, b) => b.conversas - a.conversas || b.valor - a.valor || a.nome.localeCompare(b.nome));
}

export type FiltroDosLeads = 'todos' | 'sem_resposta' | 'fora_do_prazo' | 'venda';
/** Os leads do estado e do segmento escolhidos (null = todos), com o filtro da lista. */
export function leadsDoRecorte(leads: LeadDoPeriodo[], uf: string | null, segmento: string | null, filtro: FiltroDosLeads): LeadDoPeriodo[] {
  return leads.filter((l) => doEstado(uf)(l) && (segmento === null || chaveDoSegmento(l) === segmento)
    && (filtro === 'todos' || (filtro === 'venda' ? l.venda === 'ganha' : l.situacao === filtro)));
}

export interface LinhaDoEstado extends Soma { uf: string; nome: string }
/**
 * Por estado, o maior primeiro: até 8 com nome (Lei de Miller), o resto junto em "Outros" e, por último, "Sem estado".
 * "Outros" não filtra: a tela só deixa clicar nos estados com nome e no "Sem estado".
 */
export function porEstado(cruzado: LinhaCruzada[]): LinhaDoEstado[] {
  const grupos = new Map<string, LinhaCruzada[]>();
  for (const l of cruzado) {
    const uf = l.uf || SEM_ESTADO;
    grupos.set(uf, [...(grupos.get(uf) ?? []), l]);
  }
  const com = [...grupos].filter(([uf]) => uf !== SEM_ESTADO)
    .map(([uf, ls]) => ({ uf, nome: nomeDoEstado(uf), ...somar(ls) }))
    .sort((a, b) => b.conversas - a.conversas || a.nome.localeCompare(b.nome));
  const linhas = com.length > 8
    ? [...com.slice(0, 8), { uf: 'outros', nome: `Outros ${com.length - 8}`, ...somar(com.slice(8).flatMap((e) => grupos.get(e.uf) ?? [])) }]
    : com;
  const sem = grupos.get(SEM_ESTADO);
  return sem ? [...linhas, { uf: SEM_ESTADO, nome: 'Sem estado', ...somar(sem) }] : linhas;
}

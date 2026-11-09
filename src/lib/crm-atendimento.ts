// Atendimento do CRM (projeto do Kommo, parte 4b, aprovada pelo dono em 2026-11-09,
// https://claude.ai/artifact/XGuhzJXvTEze4kajUNcdvz). A conta é do banco (`crm_atendimento`, 20270212710000); aqui só
// o que a tela escreve: o nome do funil, o tempo em minutos e o nome dos campos que faltam.
import { SEGMENTOS, type Segmento } from '@/lib/leads-e-vendas';

/** A meta da 1ª resposta (decisão 2 do dono): 30 minutos de expediente, a mesma do aviso de lead sem resposta. */
export const META_DA_PRIMEIRA_RESPOSTA = 30;

export interface LinhaDaAtendente {
  kommo_id: number; nome: string; leads: number; mensagens: number; primeira_resposta: number | null;
  tarefas: number; ganhas: number; perdidas: number;
}
export interface LeadParaResponder {
  lead_id: number; desde: string; nome: string; segmento: Segmento | null; funil: string | null; etapa: string | null; link: string;
}
export type CampoObrigatorio = 'cnpj' | 'telefone' | 'valor' | 'motivo';
export interface VendaComCampoFaltando {
  lead_id: number; nome: string; funil: Segmento; situacao: 'ganha' | 'perdida'; fechou: string; link: string; faltam: CampoObrigatorio[];
}
export interface AtendimentoDoCrm {
  todos: boolean;
  conversas: number; sem_resposta: number; respondidas: number; no_prazo: number; primeira_resposta: number | null;
  ganhas: number; perdidas: number;
  /** O digitado no Kommo e, para quem gere as carteiras, o faturado dos distribuidores. */
  valor_ganho: number;
  /** As mensagens que nenhuma pessoa digitou: a Lyra, o robô antigo, a resposta automática e a transmissão. */
  robo: { leads: number; mensagens: number } | null;
  atendentes: LinhaDaAtendente[];
  sem_resposta_por_funil: { segmento: Segmento | null; funil: string | null; quantos: number }[];
  para_responder: LeadParaResponder[];
  campos_faltando: VendaComCampoFaltando[];
}

export const CAMPO_OBRIGATORIO: Record<CampoObrigatorio, string> = {
  cnpj: 'CNPJ', telefone: 'Telefone', valor: 'Valor da venda', motivo: 'Motivo da perda',
};

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

export const dentroDaMeta = (n: number | null) => n !== null && n <= META_DA_PRIMEIRA_RESPOSTA;

/** Quantas vendas têm cada campo vazio, na ordem em que a tela mostra. */
export function contagemDosCampos(vendas: VendaComCampoFaltando[]): { campo: CampoObrigatorio; quantos: number }[] {
  return (Object.keys(CAMPO_OBRIGATORIO) as CampoObrigatorio[])
    .map((campo) => ({ campo, quantos: vendas.filter((v) => v.faltam.includes(campo)).length }));
}

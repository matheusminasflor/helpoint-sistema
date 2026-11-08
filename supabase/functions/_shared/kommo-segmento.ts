// Em que segmento dos Indicadores do Marketing um lead do Kommo conta (projeto do Kommo, revisão de 2026-11-08,
// https://claude.ai/artifact/WJMy4yWq43hcShLZWYAuan, pontos 1 e 19). Regra pura: sem Deno nem rede, testada no Vitest
// (src/lib/kommo-segmento.test.ts) e usada por `mkt-kommo-coletar`.
//
// O funil é reconhecido pelo número, não pelo nome: renomear um funil ou arquivar a Entrada não pode parar a leitura.
// O campo "Segmento", preenchido pela triagem, vale mais que o funil: o WhatsApp nasce no funil Salão, e quem ainda está
// na etapa "Com a Lyra" sem Segmento é "sem triagem", não Salão. Funil fora desta lista (Educacional, comentários,
// atendimento fora de venda) não conta.
// ponytail: os números são os da conta ticminasflor; um funil de venda novo entra aqui.
export type Segmento = 'sem_triagem' | 'consumidor' | 'salao' | 'distribuidor';

export const FUNIL_DE_VENDA: Record<number, Segmento> = {
  13975223: 'sem_triagem', // Entrada (arquivada no projeto; o histórico continua)
  12904179: 'consumidor', // Consumidor Final
  12927111: 'salao', // Salão de Beleza
  12927087: 'distribuidor', // Distribuidor
};

const normaliza = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();

/** O valor do campo "Segmento" ("Consumidor final", "Uso em casa", "Salão", "Distribuidor", "Revenda"…) → segmento; outro valor, nada. */
export function segmentoDoCampo(valor: unknown): Segmento | null {
  if (typeof valor !== 'string') return null;
  const v = normaliza(valor);
  if (v.includes('consumidor') || v.includes('em casa')) return 'consumidor';
  if (v.includes('salao') || v.includes('profissional')) return 'salao';
  if (v.includes('distribu') || v.includes('revend')) return 'distribuidor';
  return null;
}

export interface LeadParaSegmento {
  pipeline_id: number;
  status_id: number;
  custom_fields_values?: { field_name?: string; values?: { value?: unknown }[] }[] | null;
}

/**
 * O segmento em que o lead conta, ou `null` quando ele não é de venda. `etapaDeTriagem` são as etapas "Com a Lyra"
 * de cada funil (o número da etapa, lido do Kommo pelo nome).
 */
export function segmentoDoLead(lead: LeadParaSegmento, etapaDeTriagem: ReadonlySet<number>): Segmento | null {
  const doFunil = FUNIL_DE_VENDA[lead.pipeline_id];
  if (!doFunil) return null;
  const campo = lead.custom_fields_values?.find((c) => normaliza(c.field_name ?? '') === 'segmento');
  const doCampo = segmentoDoCampo(campo?.values?.[0]?.value);
  if (doCampo) return doCampo;
  if (etapaDeTriagem.has(lead.status_id)) return 'sem_triagem';
  return doFunil;
}

/** As etapas chamadas "Com a Lyra" nos funis de venda: enquanto o lead está nelas sem Segmento, não foi triado. */
export function etapasDeTriagem(funis: { id: number; _embedded?: { statuses?: { id: number; name: string }[] } }[]): Set<number> {
  return new Set(funis.flatMap((f) => (FUNIL_DE_VENDA[f.id] ? f._embedded?.statuses ?? [] : [])
    .filter((s) => normaliza(s.name) === 'com a lyra').map((s) => s.id)));
}

// Perda que não é perda de venda (dono, 2026-11-08): os 252 contatos que o robô antigo deixou na Entrada e ninguém atendeu
// foram fechados na limpeza com este motivo. Eles não entram na contagem de perdidas nem na lista de vendas.
export const MOTIVO_LIMPEZA = 'limpeza de cadastro';
export const ehLimpeza = (motivo: string | null | undefined) => !!motivo && normaliza(motivo) === MOTIVO_LIMPEZA;

// O CPF/CNPJ do lead (campo "CPF/CNPJ", parte 4.3 do projeto): só os dígitos, e só com 11 (CPF) ou 14 (CNPJ). Outra
// coisa escrita no campo não liga a venda a cliente nenhum, e ela vai para "Para corrigir" como sem CNPJ.
export function documentoDoLead(lead: LeadParaSegmento): string | null {
  const campo = lead.custom_fields_values?.find((c) => normaliza(c.field_name ?? '') === 'cpf/cnpj');
  const d = String(campo?.values?.[0]?.value ?? '').replace(/\D/g, '');
  return d.length === 11 || d.length === 14 ? d : null;
}

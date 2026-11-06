// A lista "Falta informar a nota": o rótulo de cada situação e há quantos dias o pedido foi aprovado.
export type SituacaoParaResolver = 'falta_nota' | 'corrigir' | 'valor_diferente';

const TITULOS: Record<SituacaoParaResolver, { rotulo: string; classe: string }> = {
  falta_nota: { rotulo: 'Falta a nota', classe: 'badge-warning' },
  corrigir: { rotulo: 'Nota não encontrada', classe: 'badge-danger' },
  valor_diferente: { rotulo: 'Valor corrigido pelo Forteplus', classe: 'badge-info' },
};
export const tituloDaNota = (n: { situacao: SituacaoParaResolver }) => TITULOS[n.situacao];

export const diasDesde = (quando: string, hoje: string) =>
  Math.max(0, Math.round((Date.parse(`${hoje}T12:00:00`) - Date.parse(`${quando.slice(0, 10)}T12:00:00`)) / 86_400_000));

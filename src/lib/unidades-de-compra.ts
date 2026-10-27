// A unidade da compra (dono, 2026-10-27: "matéria-prima, insumos não tem como pôr kg, grama"). A mesma lista do banco
// (`compras_unidade_e_materia_prima`, check em `compras_produtos` e `compras_solicitacoes`).
import { formatQuantidade } from '@/types/purchases';

export const UNIDADES_DE_COMPRA = [
  { valor: 'un', rotulo: 'un (unidade)' },
  { valor: 'kg', rotulo: 'kg' },
  { valor: 'g', rotulo: 'g' },
  { valor: 'L', rotulo: 'L (litro)' },
  { valor: 'mL', rotulo: 'mL' },
  { valor: 'caixa', rotulo: 'caixa' },
  { valor: 'pacote', rotulo: 'pacote' },
  { valor: 'rolo', rotulo: 'rolo' },
  { valor: 'metro', rotulo: 'metro' },
] as const;

export type UnidadeDeCompra = (typeof UNIDADES_DE_COMPRA)[number]['valor'];

/** "por kg", "por unidade" — o que o valor do orçamento quer dizer. */
export const porUnidade = (u: string | null | undefined) => (!u || u === 'un' ? 'por unidade' : `por ${u}`);

/** "2,5 kg", "3 un". */
export const comUnidade = (quantidade: number, u: string | null | undefined) => `${formatQuantidade(quantidade)} ${u || 'un'}`;

/**
 * Quanto o preço por unidade de agora está acima (+) ou abaixo (−) da última compra, em %, arredondado.
 * Só compara na mesma unidade: R$/kg contra R$/g não diz nada. Sem a última, ou com unidade diferente, `null`.
 */
export function diferencaParaUltima(
  unitarioAgora: number,
  unidadeAgora: string,
  ultima: { unitario: number | null; unidade: string } | null | undefined,
): number | null {
  if (!ultima || ultima.unitario == null || !(ultima.unitario > 0) || !(unitarioAgora > 0)) return null;
  if (ultima.unidade !== unidadeAgora) return null;
  return Math.round(((unitarioAgora - ultima.unitario) / ultima.unitario) * 100);
}

/** "12% mais caro que a última compra", "igual à última compra". */
export function fraseDaDiferenca(pct: number): string {
  if (pct === 0) return 'mesmo preço da última compra';
  return `${Math.abs(pct)}% ${pct > 0 ? 'mais caro' : 'mais barato'} que a última compra`;
}

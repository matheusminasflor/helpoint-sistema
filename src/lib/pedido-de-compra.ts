// As regras do pedido de compra, fora do componente para o Vitest não carregar o cliente do Supabase.
import type { NewQuoteInput } from '@/types/purchases';
import { totalDoOrcamento } from '@/types/purchases';
import { isSetor, normalizarSetor } from '@/lib/setores';
import { parseAmount } from '@/lib/planilha';

export interface PurchaseFieldsValue {
  productId: string | null;
  productName: string;
  /** Setor que paga a compra — vira o centro de custo da conta a pagar. */
  setor: string;
  quantidade: string;
  /** Índice do orçamento que quem pede recomenda (opcional). */
  recomendado: number | null;
  motivoRecomendacao: string;
  quotes: NewQuoteInput[];
}

const numero = (s: string | undefined) => parseAmount(s ?? '') ?? NaN;

/** O total de um orçamento como digitado; NaN enquanto faltar número. */
export function totalDigitado(q: NewQuoteInput, quantidade: string): number {
  return totalDoOrcamento(numero(q.amount), numero(quantidade), q.fretePago ? numero(q.frete) : 0);
}

/**
 * `setorSugerido` é o setor do perfil de quem está abrindo. Vem sugerido e não
 * imposto: a TI compra cabo para o Comercial, e até a leva I o setor era lido de
 * um campo que nada escrevia — toda compra nascia sem setor.
 */
export const emptyPurchaseValue = (setorSugerido?: string | null): PurchaseFieldsValue => ({
  productId: null,
  productName: '',
  setor: normalizarSetor(setorSugerido) ?? '',
  quantidade: '1',
  recomendado: null,
  motivoRecomendacao: '',
  quotes: [0, 1, 2].map(() => ({ supplier: '', supplierId: null, amount: '', fretePago: false, frete: '', prazoDias: '', link: '', file: null })),
});

export function validatePurchaseFields(value: PurchaseFieldsValue): string | null {
  if (!value.productName.trim()) return 'Informe o produto da solicitação de compra.';
  if (!isSetor(value.setor)) return 'Escolha o setor que paga esta compra.';
  if (!(numero(value.quantidade) > 0)) return 'Informe a quantidade (maior que zero).';
  const filled = value.quotes.filter(q => q.supplier.trim() && String(q.amount).trim());
  if (filled.length < 3) return 'Informe os 3 orçamentos (fornecedor e valor unitário).';
  // O link é de cada orçamento, não um só para a compra (dono, 2026-10-09). Orçamento que veio por PDF
  // ou foto (sem página na internet) vale com o anexo no lugar do link.
  if (filled.some(q => !q.link?.trim() && !q.file)) return 'Cada orçamento precisa do link de compra (ou do anexo, se o orçamento não tem página).';
  if (filled.some(q => !(numero(q.amount) > 0))) return 'Os valores unitários precisam ser números maiores que zero.';
  if (filled.some(q => q.fretePago && !(numero(q.frete) > 0))) return 'Informe o valor do frete pago (ou marque frete grátis).';
  if (filled.some(q => !/^\d+$/.test(q.prazoDias?.trim() ?? ''))) return 'Informe o prazo de entrega de cada orçamento, em dias.';
  return null;
}

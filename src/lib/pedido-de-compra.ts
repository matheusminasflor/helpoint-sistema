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
  /** un, kg, g… (dono, 2026-10-27); vem do produto do catálogo, quem pede pode trocar. */
  unidade: string;
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
  unidade: 'un',
  recomendado: null,
  motivoRecomendacao: '',
  quotes: [0, 1, 2].map(() => ({ supplier: '', supplierId: null, amount: '', fretePago: false, frete: '', prazoDias: '', link: '', file: null })),
});

/** Os orçamentos que a pessoa começou a preencher (fornecedor ou valor). */
export const orcamentosPreenchidos = (value: PurchaseFieldsValue) =>
  value.quotes.filter((q) => q.supplier.trim() !== '' || String(q.amount).trim() !== '');

/**
 * Pedir compra (dono, 2026-10-29): quem pede traz os orçamentos — no mínimo três; com menos, escreve o porquê
 * (`motivoPoucos`). Cada um com fornecedor, valor e o link (ou o anexo, quando o orçamento não tem página). O banco
 * confere o mesmo em `compras_abrir_pedido`. A Caixinha segue no pedido simples (`validarPedidoSimples`).
 */
export function validarPedidoDeCompra(value: PurchaseFieldsValue, motivoPoucos: string): string | null {
  if (!value.productName.trim()) return 'Informe o produto.';
  if (!isSetor(value.setor)) return 'Escolha o setor que paga esta compra.';
  if (!(numero(value.quantidade) > 0)) return 'Informe a quantidade (maior que zero).';
  const feitos = orcamentosPreenchidos(value);
  if (feitos.length === 0) return 'Informe os orçamentos: no mínimo três.';
  if (feitos.some((q) => !q.supplier.trim() || !(numero(q.amount) > 0))) return 'Em cada orçamento, informe o fornecedor e o valor.';
  if (feitos.some((q) => !q.link?.trim() && !q.file)) return 'Cada orçamento precisa do link (ou do anexo, se não tem página na internet).';
  if (feitos.some((q) => q.fretePago && !(numero(q.frete) > 0))) return 'Informe o valor do frete pago (ou marque frete grátis).';
  if (feitos.length < 3 && !motivoPoucos.trim()) return 'Com menos de três orçamentos, escreva o porquê.';
  return null;
}

/**
 * Pedido simples — hoje só a Caixinha (compra pequena do dia a dia, sem os três orçamentos): o quê, quanto, para quê e
 * UM orçamento se souber.
 */
export const pedidoSimplesVazio = (setorSugerido?: string | null): PurchaseFieldsValue => ({
  ...emptyPurchaseValue(setorSugerido),
  quotes: [{ supplier: '', supplierId: null, amount: '', fretePago: false, frete: '', prazoDias: '', link: '', file: null }],
});

export function validarPedidoSimples(value: PurchaseFieldsValue): string | null {
  if (!value.productName.trim()) return 'Informe o produto.';
  if (!isSetor(value.setor)) return 'Escolha o setor que paga esta compra.';
  if (!(numero(value.quantidade) > 0)) return 'Informe a quantidade (maior que zero).';
  const q = value.quotes[0];
  const comecou = !!q && (q.supplier.trim() !== '' || String(q.amount).trim() !== '');
  if (comecou && (!q.supplier.trim() || !(numero(q.amount) > 0))) return 'No orçamento, informe o fornecedor e o valor unitário (ou deixe em branco).';
  return null;
}

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Link2, Package, Plus, Paperclip, X, Sparkles } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePurchaseProducts, useCreatePurchaseProduct, usePurchaseHistoryByProduct } from '@/hooks/usePurchases';
import { ComoFuncionaCompras } from './ComoFuncionaCompras';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { SeletorFornecedor } from '@/components/financeiro/SeletorFornecedor';
import type { NewQuoteInput } from '@/types/purchases';
import { formatBRLAmount, totalDoOrcamento } from '@/types/purchases';
import { Textarea } from '@/components/ui/textarea';
import { SETORES, isSetor, normalizarSetor } from '@/lib/setores';
import { cn } from '@/lib/utils';
import { parseAmount } from '@/lib/finance-import';

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

interface Props {
  value: PurchaseFieldsValue;
  onChange: (value: PurchaseFieldsValue) => void;
}

export function PurchaseRequestFields({ value, onChange }: Props) {
  const [search, setSearch] = useState('');
  const { data: products = [] } = usePurchaseProducts(search);
  const { data: history } = usePurchaseHistoryByProduct();
  const createProduct = useCreatePurchaseProduct();
  // A MESMA expressão da RLS de `compras_produtos` desde a leva I: gestor
  // para cima, ou quem tem a permissão. Antes o botão aparecia para todos e a
  // porta do banco estava aberta para todos — cinza combinando com aberta.
  const { can } = useDepartmentPermissions('compras');
  const podeCadastrarProduto = can('catalogo', 'edit');

  const lastPurchase = value.productId ? history?.get(value.productId) : undefined;

  const setQuote = (index: number, patch: Partial<NewQuoteInput>) => {
    const quotes = value.quotes.map((q, i) => (i === index ? { ...q, ...patch } : q));
    onChange({ ...value, quotes });
  };

  const selectProduct = (id: string | null, name: string) => {
    const suggestion = id ? history?.get(id) : undefined;
    let quotes = value.quotes;
    // Sugere o último fornecedor no primeiro orçamento vazio. O preço não: o histórico guarda o TOTAL da
    // compra anterior, e o campo agora é o valor unitário (2026-10-09).
    if (suggestion?.supplier && !quotes[0].supplier.trim()) {
      quotes = quotes.map((q, i) => (i === 0 ? { ...q, supplier: suggestion.supplier! } : q));
    }
    onChange({ ...value, productId: id, productName: name, quotes });
    setSearch('');
  };

  const handleCreateProduct = async () => {
    const name = search.trim();
    if (!name) return;
    try {
      const created = await createProduct.mutateAsync({ name });
      selectProduct(created.id, created.name);
    } catch {
      // o toast de erro já é exibido pelo hook
    }
  };

  // A terceira saída, que faltava: a compra sempre pôde ter produto fora do
  // catálogo (`product_id` é opcional e `product_name` é texto) — a tela é que
  // não oferecia o caminho, e por isso a porta do catálogo não podia fechar.
  const usarNomeDigitado = () => {
    const name = search.trim();
    if (!name) return;
    selectProduct(null, name);
  };

  return (
    <Card className="p-4 space-y-5 border-primary/30">
      <div className="flex items-center gap-2">
        <Package className="w-4 h-4 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-semibold">Dados da compra</h3>
        <span className="ml-auto"><ComoFuncionaCompras para="quem-pede" /></span>
      </div>

      {/* Produto */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Produto *</label>
        {value.productName ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2">
              <span className="text-sm">{value.productName}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onChange({ ...value, productId: null, productName: '' })}
                title="Trocar produto"
              >
                <X className="w-4 h-4" aria-hidden="true" />
                <span className="sr-only">Trocar produto</span>
              </Button>
            </div>
            {lastPurchase?.supplier && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  Última compra: {lastPurchase.supplier}
                  {lastPurchase.amount != null && ` por ${formatBRLAmount(lastPurchase.amount)} no total`}. Já sugerimos
                  o fornecedor no primeiro orçamento — ajuste se precisar.
                </span>
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar no catálogo ou digitar o nome"
                className="min-w-[200px] flex-1"
              />
              {podeCadastrarProduto && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCreateProduct}
                  disabled={!search.trim() || createProduct.isPending}
                  title="Cadastrar o texto digitado no catálogo de produtos"
                >
                  <Plus className="w-4 h-4 mr-1" aria-hidden="true" /> Cadastrar
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                onClick={usarNomeDigitado}
                disabled={!search.trim()}
                title="Usar o nome digitado só nesta compra, sem entrar no catálogo"
              >
                Usar este nome
              </Button>
            </div>
            {!search.trim() && (
              <p className="text-xs text-muted-foreground">
                Digite o nome para buscar no catálogo. Se não estiver lá, "Usar este nome" vale só para esta
                compra{podeCadastrarProduto && ' e "Cadastrar" guarda no catálogo para as próximas'}.
              </p>
            )}
            {search.trim() && (
              <div className="rounded-lg border border-border divide-y divide-border">
                {products.map(p => {
                  const info = history?.get(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectProduct(p.id, p.name)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-secondary/60"
                    >
                      <span className="block">{p.name}</span>
                      {info?.supplier && (
                        <span className="block text-xs text-muted-foreground">
                          Último: {info.supplier}
                          {info.amount != null && ` · ${formatBRLAmount(info.amount)}`}
                        </span>
                      )}
                    </button>
                  );
                })}
                {products.length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    "{search.trim()}" não está no catálogo. Use "Usar este nome" para seguir com a compra
                    {podeCadastrarProduto && ', ou "Cadastrar" para guardá-lo no catálogo'}.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Setor que paga */}
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="compra-setor">Setor que paga *</label>
        <Select value={value.setor} onValueChange={(v) => onChange({ ...value, setor: v })}>
          <SelectTrigger id="compra-setor">
            <SelectValue placeholder="Escolha o setor" />
          </SelectTrigger>
          <SelectContent>
            {SETORES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Já vem o seu setor. Troque se a compra é para outro — é este setor que entra no centro de custo da
          despesa e no teto de gasto mensal.
        </p>
      </div>

      {/* Quantidade (dono, 2026-10-09): o valor de cada orçamento é por unidade, e o total sai daqui. */}
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="compra-quantidade">Quantidade *</label>
        <Input id="compra-quantidade" value={value.quantidade} inputMode="decimal" className="w-32 font-mono"
          onChange={(e) => onChange({ ...value, quantidade: e.target.value })} />
      </div>

      {/* Orçamentos — cada um com o seu link de compra (dono, 2026-10-09: era um link só, geral). */}
      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium">Três orçamentos *</label>
          <p className="text-xs text-muted-foreground">
            Informe fornecedor, valor unitário, frete, prazo de entrega e o link de compra de cada orçamento.
            Orçamento sem página na internet (PDF, foto) vale com o anexo no lugar do link. Se tiver um
            preferido, marque "Recomendo este".
          </p>
        </div>
        {value.quotes.map((q, i) => {
          const total = totalDigitado(q, value.quantidade);
          return (
          <div key={i} className={cn('grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_140px_auto]',
            value.recomendado === i ? 'border-primary ring-1 ring-primary/20' : 'border-border')}>
            <SeletorFornecedor
              nome={q.supplier}
              fornecedorId={q.supplierId ?? null}
              onChange={(patch) => setQuote(i, patch)}
              placeholder={`Fornecedor ${i + 1}`}
            />
            <Input
              value={q.amount}
              onChange={(e) => setQuote(i, { amount: e.target.value })}
              placeholder="Unitário 0,00"
              aria-label={`Valor unitário do orçamento ${i + 1}`}
              inputMode="decimal"
              className="font-mono"
            />
            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer px-2">
              <Paperclip className="w-4 h-4" aria-hidden="true" />
              <span className="max-w-[120px] truncate">{q.file ? q.file.name : 'Anexar'}</span>
              <input
                type="file"
                className="hidden"
                onChange={(e) => setQuote(i, { file: e.target.files?.[0] ?? null })}
              />
            </label>
            <div className="relative sm:col-span-3">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Input
                value={q.link ?? ''}
                onChange={(e) => setQuote(i, { link: e.target.value })}
                placeholder={`Link de compra do orçamento ${i + 1} (https://...)`}
                aria-label={`Link de compra do orçamento ${i + 1}`}
                type="url"
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-3 text-sm">
              <select
                value={q.fretePago ? 'pago' : 'gratis'}
                onChange={(e) => setQuote(i, { fretePago: e.target.value === 'pago' })}
                aria-label={`Frete do orçamento ${i + 1}`}
                className="h-9 rounded-md border border-input bg-background px-2"
              >
                <option value="gratis">Frete grátis</option>
                <option value="pago">Frete pago</option>
              </select>
              {q.fretePago && (
                <Input value={q.frete ?? ''} onChange={(e) => setQuote(i, { frete: e.target.value })}
                  placeholder="Frete 0,00" aria-label={`Valor do frete do orçamento ${i + 1}`} inputMode="decimal" className="w-28 font-mono" />
              )}
              <Input value={q.prazoDias ?? ''} onChange={(e) => setQuote(i, { prazoDias: e.target.value })}
                placeholder="Prazo" aria-label={`Prazo de entrega do orçamento ${i + 1}, em dias`} inputMode="numeric" className="w-20 font-mono" />
              <span className="text-muted-foreground">dias para entregar</span>
              <span className="ml-auto font-medium">
                Total: <span className="font-mono">{Number.isFinite(total) ? formatBRLAmount(total) : '—'}</span>
              </span>
            </div>
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer sm:col-span-3">
              <input type="radio" name="orcamento-recomendado" checked={value.recomendado === i}
                onChange={() => onChange({ ...value, recomendado: i })} />
              Recomendo este
            </label>
          </div>
          );
        })}
        {value.recomendado != null && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium" htmlFor="motivo-recomendacao">
                Por que recomenda? <span className="font-normal text-muted-foreground">(opcional)</span>
              </label>
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...value, recomendado: null, motivoRecomendacao: '' })}>
                Não recomendar nenhum
              </Button>
            </div>
            <Textarea id="motivo-recomendacao" rows={2} value={value.motivoRecomendacao}
              onChange={(e) => onChange({ ...value, motivoRecomendacao: e.target.value })}
              placeholder="Ex.: entrega em 3 dias e o fornecedor já atende a gente bem." />
          </div>
        )}
      </div>
    </Card>
  );
}

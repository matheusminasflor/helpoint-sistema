import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Link2, Package, Plus, Paperclip, X, Sparkles } from 'lucide-react';
import { usePurchaseProducts, useCreatePurchaseProduct, usePurchaseHistoryByProduct } from '@/hooks/usePurchases';
import type { NewQuoteInput } from '@/types/purchases';
import { formatBRLAmount } from '@/types/purchases';
import { cn } from '@/lib/utils';

export interface PurchaseFieldsValue {
  productId: string | null;
  productName: string;
  productLink: string;
  quotes: NewQuoteInput[];
}

export const emptyPurchaseValue = (): PurchaseFieldsValue => ({
  productId: null,
  productName: '',
  productLink: '',
  quotes: [
    { supplier: '', amount: '', link: '', file: null },
    { supplier: '', amount: '', link: '', file: null },
    { supplier: '', amount: '', link: '', file: null },
  ],
});

export function validatePurchaseFields(value: PurchaseFieldsValue): string | null {
  if (!value.productName.trim()) return 'Informe o produto da solicitação de compra.';
  if (!value.productLink.trim()) return 'Informe o link do produto ou do fornecedor.';
  const filled = value.quotes.filter(q => q.supplier.trim() && String(q.amount).trim());
  if (filled.length < 3) return 'Informe os 3 orçamentos (fornecedor e valor).';
  const invalid = filled.some(q => {
    const n = Number(String(q.amount).replace(/\./g, '').replace(',', '.'));
    return !Number.isFinite(n) || n <= 0;
  });
  if (invalid) return 'Os valores dos orçamentos precisam ser números maiores que zero.';
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

  const lastPurchase = value.productId ? history?.get(value.productId) : undefined;

  const setQuote = (index: number, patch: Partial<NewQuoteInput>) => {
    const quotes = value.quotes.map((q, i) => (i === index ? { ...q, ...patch } : q));
    onChange({ ...value, quotes });
  };

  const selectProduct = (id: string | null, name: string) => {
    const suggestion = id ? history?.get(id) : undefined;
    let quotes = value.quotes;
    // Sugere automaticamente o último fornecedor e preço pago no primeiro orçamento vazio.
    if (suggestion?.supplier && !quotes[0].supplier.trim() && !String(quotes[0].amount).trim()) {
      quotes = quotes.map((q, i) =>
        i === 0
          ? { ...q, supplier: suggestion.supplier!, amount: suggestion.amount != null ? String(suggestion.amount).replace('.', ',') : '' }
          : q,
      );
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

  return (
    <Card className="p-4 space-y-5 border-primary/30">
      <div className="flex items-center gap-2">
        <Package className="w-4 h-4 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-semibold">Dados da compra</h3>
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
                  {lastPurchase.amount != null && ` por ${formatBRLAmount(lastPurchase.amount)}`}. Já sugerimos no
                  primeiro orçamento — ajuste se precisar.
                </span>
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar produto cadastrado ou digitar um novo"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleCreateProduct}
                disabled={!search.trim() || createProduct.isPending}
                title="Cadastrar o texto digitado como novo produto"
              >
                <Plus className="w-4 h-4 mr-1" aria-hidden="true" /> Novo produto
              </Button>
            </div>
            {!search.trim() && (
              <p className="text-xs text-muted-foreground">
                Digite o nome para buscar no catálogo ou cadastrar um produto novo.
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
                    Nenhum produto encontrado. Use "Novo produto" para cadastrar "{search.trim()}".
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Link do produto */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Link do produto ou fornecedor *</label>
        <div className="relative">
          <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <Input
            value={value.productLink}
            onChange={(e) => onChange({ ...value, productLink: e.target.value })}
            placeholder="https://..."
            className="pl-9"
          />
        </div>
      </div>

      {/* Orçamentos */}
      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium">Três orçamentos *</label>
          <p className="text-xs text-muted-foreground">Informe fornecedor e valor de cada orçamento. O anexo é opcional.</p>
        </div>
        {value.quotes.map((q, i) => (
          <div key={i} className={cn('grid gap-2 rounded-lg border border-border p-3', 'sm:grid-cols-[1fr_140px_auto]')}>
            <Input
              value={q.supplier}
              onChange={(e) => setQuote(i, { supplier: e.target.value })}
              placeholder={`Fornecedor ${i + 1}`}
            />
            <Input
              value={q.amount}
              onChange={(e) => setQuote(i, { amount: e.target.value })}
              placeholder="0,00"
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
          </div>
        ))}
      </div>
    </Card>
  );
}

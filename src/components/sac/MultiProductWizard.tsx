import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Plus, X, Package, Upload, ChevronLeft, ChevronRight } from 'lucide-react';
import { ImproveTextButton } from '@/components/ai/ImproveTextButton';

export interface ProductItem {
  product_id: string;
  product_batch_id: string;
  product_name: string;
  product_batch: string;
  quantity: string;
  description: string;
  files: File[];
}

export const emptyItem = (): ProductItem => ({
  product_id: '', product_batch_id: '',
  product_name: '', product_batch: '', quantity: '', description: '',
  files: [],
});

interface Props {
  items: ProductItem[];
  onChange: (items: ProductItem[]) => void;
  products: { id: string; name: string }[];
  batches: { id: string; product_id: string; batch_code: string }[];
  tenantSlug?: string | null;
}

export function MultiProductWizard({ items, onChange, products, batches, tenantSlug }: Props) {

  const [step, setStep] = useState(0);
  const current = items[step];
  if (!current) return null;

  const update = (k: keyof ProductItem, v: any) => {
    const next = items.slice();
    next[step] = { ...next[step], [k]: v };
    onChange(next);
  };

  const add = () => {
    onChange([...items, emptyItem()]);
    setStep(items.length);
  };

  const remove = (idx: number) => {
    if (items.length === 1) return;
    const next = items.filter((_, i) => i !== idx);
    onChange(next);
    setStep(Math.max(0, Math.min(step, next.length - 1)));
  };

  const usingCustom = current.product_id === '__other__';
  const filteredBatches = batches.filter(b => b.product_id === current.product_id);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setStep(i)}
              className={`text-xs px-2.5 py-1 rounded-full border transition flex items-center gap-1 ${
                i === step
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-surface-2 hover:bg-surface-3 border-border'
              }`}
            >
              <Package className="w-3 h-3" /> Produto {i + 1}
              {items.length > 1 && (
                <X
                  className="w-3 h-3 ml-1 opacity-70 hover:opacity-100"
                  onClick={(e) => { e.stopPropagation(); remove(i); }}
                />
              )}
            </button>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={add} className="h-7 text-xs">
            <Plus className="w-3 h-3 mr-1" /> Adicionar produto
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">{step + 1} / {items.length}</span>
      </div>

      <Card className="p-4 border-dashed">
        <p className="text-xs font-semibold text-primary mb-3">
          PRODUTO {step + 1} — descreva apenas este produto
        </p>

        <div className="space-y-3">
          <div>
            <Label className="text-xs mb-1 block">Produto *</Label>
            {products.length > 0 ? (
              <select
                value={current.product_id}
                onChange={e => {
                  update('product_id', e.target.value);
                  update('product_batch_id', '');
                  update('product_name', '');
                  update('product_batch', '');
                }}
                className="flex h-9 w-full rounded-md border border-border bg-card px-3 text-[13px]"
              >
                <option value="">Selecione o produto...</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                <option value="__other__">Outro (não está na lista)</option>
              </select>
            ) : (
              <Input value={current.product_name} onChange={e => update('product_name', e.target.value)} />
            )}
          </div>

          {usingCustom && (
            <div>
              <Label className="text-xs mb-1 block">Descreva o produto *</Label>
              <Input value={current.product_name} onChange={e => update('product_name', e.target.value)} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1 block">Lote</Label>
              {current.product_id && !usingCustom && filteredBatches.length > 0 ? (
                <select
                  value={current.product_batch_id}
                  onChange={e => update('product_batch_id', e.target.value)}
                  className="flex h-9 w-full rounded-md border border-border bg-card px-3 text-[13px]"
                >
                  <option value="">Selecione o lote...</option>
                  {filteredBatches.map(b => <option key={b.id} value={b.id}>{b.batch_code}</option>)}
                </select>
              ) : (
                <Input value={current.product_batch} onChange={e => update('product_batch', e.target.value)} />
              )}
            </div>
            <div>
              <Label className="text-xs mb-1 block">Quantidade</Label>
              <Input type="number" value={current.quantity} onChange={e => update('quantity', e.target.value)} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Descrição deste produto *</Label>
              <ImproveTextButton
                text={current.description}
                onApply={(t) => update('description', t)}
                tone="claro, educado e objetivo, mantendo todos os fatos"
                tenantSlug={tenantSlug}
              />

            </div>
            <Textarea
              value={current.description}
              onChange={e => update('description', e.target.value)}
              rows={4}
              placeholder={`Descreva o que ocorreu apenas com o Produto ${step + 1}…`}
            />
          </div>

          <div>
            <Label className="text-xs mb-1 block">Fotos deste produto (até 5, 5MB cada)</Label>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="cursor-pointer inline-flex items-center gap-2 px-3 h-9 rounded-md border border-border text-[13px] hover:bg-surface-2">
                <Upload className="w-4 h-4" /> Adicionar fotos
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={e => {
                    const list = Array.from(e.target.files || [])
                      .filter(f => f.size <= 5 * 1024 * 1024)
                      .slice(0, 5);
                    update('files', list);
                  }}
                />
              </label>
              <span className="text-xs text-muted-foreground">{current.files.length} foto(s)</span>
            </div>
            {current.files.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {current.files.map((f, i) => (
                  <span key={i} className="text-xs bg-surface-2 border rounded px-2 py-1 flex items-center gap-1">
                    {f.name}
                    <button
                      type="button"
                      onClick={() => update('files', current.files.filter((_, j) => j !== i))}
                    ><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t">
          <Button
            type="button" size="sm" variant="ghost"
            disabled={step === 0}
            onClick={() => setStep(s => Math.max(0, s - 1))}
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
          </Button>
          {step < items.length - 1 ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setStep(s => s + 1)}>
              Próximo <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={add}>
              <Plus className="w-3 h-3 mr-1" /> Adicionar mais um produto
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

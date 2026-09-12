import { useMemo, useState } from 'react';
import { Package, Plus, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useCRMProducts, useSaveProduct, type CRMProduct } from '@/hooks/useCRM';
import { formatBRL } from '@/lib/crm';

interface FormState {
  id?: string;
  name: string;
  sku: string;
  description: string;
  unit: string;
  price: string;
  is_active: boolean;
}

function emptyForm(): FormState {
  return { name: '', sku: '', description: '', unit: 'un', price: '0', is_active: true };
}

function fromProduct(product: CRMProduct): FormState {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku ?? '',
    description: product.description ?? '',
    unit: product.unit,
    price: String(product.price),
    is_active: product.is_active,
  };
}

export default function ComercialProdutos() {
  const { role } = useAuth();
  const canEdit = ['owner', 'admin', 'manager'].includes(role ?? '');

  const [search, setSearch] = useState('');
  const { data: products = [], isLoading } = useCRMProducts(false);
  const saveProduct = useSaveProduct();
  const [form, setForm] = useState<FormState | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter((p) => p.name.toLowerCase().includes(term) || (p.sku ?? '').toLowerCase().includes(term));
  }, [products, search]);

  const handleSave = () => {
    if (!form || !form.name.trim()) return;
    saveProduct.mutate(
      {
        id: form.id,
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        description: form.description.trim() || null,
        unit: form.unit.trim() || 'un',
        price: Number(form.price) || 0,
        is_active: form.is_active,
      },
      { onSuccess: () => setForm(null) },
    );
  };

  const toggleActive = (product: CRMProduct) =>
    saveProduct.mutate({ id: product.id, name: product.name, price: product.price, unit: product.unit, is_active: !product.is_active });

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Produtos"
        description="Catálogo do que o Comercial vende — usado para montar pedidos."
        icon={Package}
        actions={canEdit && <Button onClick={() => setForm(emptyForm())}><Plus className="w-4 h-4 mr-1.5" /> Novo produto</Button>}
      >
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou SKU" className="max-w-sm" />
      </PageHeader>

      <div className="p-4 lg:p-6">
        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="p-4 space-y-1">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Package}
              title="Nenhum produto cadastrado"
              description="Cadastre os produtos para agilizar o preenchimento dos pedidos."
              actionLabel={canEdit ? 'Novo produto' : undefined}
              actionIcon={Plus}
              onAction={canEdit ? () => setForm(emptyForm()) : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border bg-secondary/60 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-semibold border-r border-border">Produto</th>
                    <th className="px-3 py-2 font-semibold border-r border-border">SKU</th>
                    <th className="px-3 py-2 font-semibold border-r border-border">Unidade</th>
                    <th className="px-3 py-2 font-semibold border-r border-border text-right">Preço</th>
                    <th className="px-3 py-2 font-semibold border-r border-border">Ativo</th>
                    {canEdit && <th className="px-3 py-2 font-semibold text-right">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((product) => (
                    <tr key={product.id} className="border-b border-border hover:bg-secondary/50">
                      <td className="px-3 py-2 font-medium">{product.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{product.sku || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{product.unit}</td>
                      <td className="px-3 py-2 font-mono text-right">{formatBRL(product.price)}</td>
                      <td className="px-3 py-2">
                        <Switch checked={product.is_active} onCheckedChange={() => canEdit && toggleActive(product)} disabled={!canEdit} />
                      </td>
                      {canEdit && (
                        <td className="px-3 py-2 text-right">
                          <Button variant="ghost" size="icon" onClick={() => setForm(fromProduct(product))}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={!!form} onOpenChange={(v) => !v && setForm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form?.id ? 'Editar produto' : 'Novo produto'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={form?.name ?? ''} onChange={(e) => setForm((f) => f && { ...f, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>SKU</Label>
                <Input value={form?.sku ?? ''} onChange={(e) => setForm((f) => f && { ...f, sku: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Unidade</Label>
                <Input value={form?.unit ?? 'un'} onChange={(e) => setForm((f) => f && { ...f, unit: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Preço (R$)</Label>
              <Input type="number" min="0" step="0.01" value={form?.price ?? '0'} onChange={(e) => setForm((f) => f && { ...f, price: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Input value={form?.description ?? ''} onChange={(e) => setForm((f) => f && { ...f, description: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form?.is_active ?? true} onCheckedChange={(v) => setForm((f) => f && { ...f, is_active: v })} />
              <Label>Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form?.name.trim() || saveProduct.isPending}>Salvar produto</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

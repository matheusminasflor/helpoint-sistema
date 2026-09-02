import { useMemo, useState } from 'react';
import { Package, Plus, Pencil, PowerOff, Power } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  usePurchaseProducts, useCreatePurchaseProduct, useUpdatePurchaseProduct, usePurchaseHistoryByProduct,
} from '@/hooks/usePurchases';
import { formatBRLAmount, type PurchaseProduct } from '@/types/purchases';
import { formatDateBR } from '@/types/financeiro';

interface FormState { id?: string; name: string; category: string; description: string }

const emptyForm: FormState = { name: '', category: '', description: '' };

export default function FinProducts() {
  const [search, setSearch] = useState('');
  const { data: products = [], isLoading } = usePurchaseProducts('', { includeInactive: true });
  const { data: history } = usePurchaseHistoryByProduct();
  const create = useCreatePurchaseProduct();
  const update = useUpdatePurchaseProduct();

  const [form, setForm] = useState<FormState | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter(p =>
      p.name.toLowerCase().includes(term) || (p.category || '').toLowerCase().includes(term),
    );
  }, [products, search]);

  const openNew = () => setForm({ ...emptyForm });
  const openEdit = (p: PurchaseProduct) =>
    setForm({ id: p.id, name: p.name, category: p.category || '', description: p.description || '' });

  const handleSave = async () => {
    if (!form || !form.name.trim()) return;
    try {
      if (form.id) {
        await update.mutateAsync({
          id: form.id,
          name: form.name.trim(),
          category: form.category.trim() || null,
          description: form.description.trim() || null,
        });
      } else {
        await create.mutateAsync({ name: form.name, category: form.category, description: form.description });
      }
      setForm(null);
    } catch {
      // toasts de erro já exibidos pelos hooks
    }
  };

  const toggleActive = (p: PurchaseProduct) =>
    update.mutate({ id: p.id, is_active: !p.is_active });

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Catálogo de Produtos"
        description="Produtos disponíveis para solicitação de compra, com o último fornecedor e preço pago."
        icon={Package}
        actions={
          <Button onClick={openNew}>
            <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" /> Novo produto
          </Button>
        }
      >
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou categoria"
          className="max-w-sm"
          aria-label="Buscar produto"
        />
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
              description="Cadastre os produtos que o time costuma comprar para agilizar as solicitações."
              actionLabel="Novo produto"
              actionIcon={Plus}
              onAction={openNew}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border bg-secondary/60 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-semibold border-r border-border">Produto</th>
                    <th className="px-3 py-2 font-semibold border-r border-border">Categoria</th>
                    <th className="px-3 py-2 font-semibold border-r border-border">Último fornecedor</th>
                    <th className="px-3 py-2 font-semibold border-r border-border text-right">Último preço</th>
                    <th className="px-3 py-2 font-semibold border-r border-border">Última compra</th>
                    <th className="px-3 py-2 font-semibold border-r border-border">Situação</th>
                    <th className="px-3 py-2 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const info = history?.get(p.id);
                    return (
                      <tr key={p.id} className="border-b border-border hover:bg-secondary/50">
                        <td className="px-3 py-2 font-medium">{p.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{p.category || '—'}</td>
                        <td className="px-3 py-2">{info?.supplier || '—'}</td>
                        <td className="px-3 py-2 font-mono text-right">
                          {info?.amount != null ? formatBRLAmount(info.amount) : '—'}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{formatDateBR(info?.purchased_at)}</td>
                        <td className="px-3 py-2">
                          <Badge className={p.is_active ? 'badge-success' : 'badge-neutral'}>
                            {p.is_active ? 'Ativo' : 'Desativado'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <Button variant="ghost" size="icon" title="Editar produto" onClick={() => openEdit(p)}>
                            <Pencil className="w-4 h-4" aria-hidden="true" />
                            <span className="sr-only">Editar produto</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={p.is_active ? 'Desativar produto' : 'Reativar produto'}
                            onClick={() => toggleActive(p)}
                          >
                            {p.is_active
                              ? <PowerOff className="w-4 h-4 text-destructive" aria-hidden="true" />
                              : <Power className="w-4 h-4 text-primary" aria-hidden="true" />}
                            <span className="sr-only">{p.is_active ? 'Desativar produto' : 'Reativar produto'}</span>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={!!form} onOpenChange={(v) => !v && setForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form?.id ? 'Editar produto' : 'Novo produto'}</DialogTitle>
            <DialogDescription>
              O produto fica disponível para todas as solicitações de compra da empresa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="prod-name">Nome *</label>
              <Input
                id="prod-name"
                value={form?.name ?? ''}
                onChange={(e) => setForm(f => f && { ...f, name: e.target.value })}
                placeholder="Ex.: Notebook 14 polegadas"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="prod-cat">Categoria</label>
              <Input
                id="prod-cat"
                value={form?.category ?? ''}
                onChange={(e) => setForm(f => f && { ...f, category: e.target.value })}
                placeholder="Ex.: Equipamentos"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="prod-desc">Descrição</label>
              <Input
                id="prod-desc"
                value={form?.description ?? ''}
                onChange={(e) => setForm(f => f && { ...f, description: e.target.value })}
                placeholder="Detalhes que ajudam quem for comprar"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form?.name.trim() || create.isPending || update.isPending}>
              Salvar produto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

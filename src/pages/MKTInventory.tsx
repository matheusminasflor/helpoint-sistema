import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { useQueryState } from '@/hooks/useQueryState';
import { Plus, Package, Pencil, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useMKTAssets, useCreateMKTAsset, useUpdateMKTAsset, useDeleteMKTAsset, type MKTAsset, type MKTAssetInput } from '@/hooks/useMKTInventory';
import { toast } from 'sonner';
import type { AssetStatus } from '@/types/helpdesk';

const STATUS_OPTIONS: { value: AssetStatus; label: string; color: string }[] = [
  { value: 'active',         label: 'Ativo',          color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { value: 'in_use' as any,  label: 'Em uso',         color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'maintenance',    label: 'Em manutenção',  color: 'bg-amber-100 text-amber-800 border-amber-200' },
  { value: 'in_stock' as any,label: 'Em estoque',     color: 'bg-slate-100 text-slate-700 border-slate-200' },
];

const CATEGORY_OPTIONS = [
  'Equipamento de gravação',
  'Iluminação',
  'Áudio',
  'Computador/Notebook',
  'Câmera/Foto',
  'Brindes e materiais promocionais',
  'Material gráfico',
  'Stand/Estrutura de evento',
  'Outros',
];

const emptyForm: MKTAssetInput = {
  asset_tag: '',
  name: '',
  category: 'Outros',
  status: 'active',
};

export default function MKTInventory() {
  const { data: assets = [], isLoading } = useMKTAssets();
  const createMut = useCreateMKTAsset();
  const updateMut = useUpdateMKTAsset();
  const deleteMut = useDeleteMKTAsset();

  const [statusFilter, setStatusFilter] = useQueryState<string>('status', 'all');
  const [editing, setEditing] = useState<MKTAsset | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<MKTAssetInput>(emptyForm);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return assets;
    return assets.filter(a => a.status === statusFilter);
  }, [assets, statusFilter]);

  const statusCount = useMemo(() => {
    const counts: Record<string, number> = { all: assets.length };
    STATUS_OPTIONS.forEach(s => { counts[s.value] = 0; });
    assets.forEach(a => { counts[a.status] = (counts[a.status] || 0) + 1; });
    return counts;
  }, [assets]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (asset: MKTAsset) => {
    setEditing(asset);
    setForm({
      asset_tag: asset.asset_tag,
      name: asset.name,
      description: asset.description,
      category: asset.category,
      subcategory: asset.subcategory,
      manufacturer: asset.manufacturer,
      model: asset.model,
      serial_number: asset.serial_number,
      department: asset.department,
      location: asset.location,
      status: asset.status,
      purchase_date: asset.purchase_date,
      purchase_value: asset.purchase_value,
      warranty_expiry: asset.warranty_expiry,
      notes: asset.notes,
    });
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.asset_tag.trim() || !form.name.trim()) {
      toast.error('Patrimônio e Nome são obrigatórios');
      return;
    }
    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, ...form });
      } else {
        await createMut.mutateAsync(form);
      }
      setFormOpen(false);
    } catch {/* toasted */}
  };

  const handleDelete = async (asset: MKTAsset) => {
    if (!confirm(`Excluir "${asset.name}"?`)) return;
    await deleteMut.mutateAsync(asset.id);
  };

  const statusBadge = (status: AssetStatus) => {
    const opt = STATUS_OPTIONS.find(s => s.value === status);
    return <Badge variant="outline" className={opt?.color}>{opt?.label || status}</Badge>;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          className="bg-transparent border-0 px-0 py-0"
          icon={Package}
          identifier="MKT"
          title="Inventário de Marketing"
          description="Equipamentos, materiais promocionais e itens da equipe de marketing."
        />
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> Novo item
        </Button>
      </div>

      {/* Filtros de status */}
      <div className="flex flex-wrap gap-2">
        <FilterChip label={`Todos · ${statusCount.all}`} active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
        {STATUS_OPTIONS.map(s => (
          <FilterChip
            key={s.value}
            label={`${s.label} · ${statusCount[s.value] || 0}`}
            active={statusFilter === s.value}
            onClick={() => setStatusFilter(s.value)}
          />
        ))}
      </div>

      <Card>
        {isLoading ? (
          <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nenhum item encontrado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Patrimônio</th>
                  <th className="text-left px-4 py-3 font-medium">Item</th>
                  <th className="text-left px-4 py-3 font-medium">Categoria</th>
                  <th className="text-left px-4 py-3 font-medium">Localização</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(asset => (
                  <tr key={asset.id} className="border-t border-border hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs">{asset.asset_tag}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{asset.name}</div>
                      {asset.manufacturer && (
                        <div className="text-xs text-muted-foreground">{asset.manufacturer} {asset.model}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{asset.category}</td>
                    <td className="px-4 py-3 text-muted-foreground">{asset.location || '—'}</td>
                    <td className="px-4 py-3">{statusBadge(asset.status)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(asset)} className="h-8 w-8">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(asset)} className="h-8 w-8 text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar item' : 'Novo item'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Patrimônio *</Label>
                <Input value={form.asset_tag} onChange={e => setForm(p => ({ ...p, asset_tag: e.target.value }))} placeholder="MKT-2026-001" className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label>Nome *</Label>
                <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Câmera Sony Alpha" />
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v as AssetStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Fabricante</Label>
                <Input value={form.manufacturer || ''} onChange={e => setForm(p => ({ ...p, manufacturer: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Modelo</Label>
                <Input value={form.model || ''} onChange={e => setForm(p => ({ ...p, model: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Número de série</Label>
                <Input value={form.serial_number || ''} onChange={e => setForm(p => ({ ...p, serial_number: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Localização</Label>
                <Input value={form.location || ''} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="Sala MKT, Armário 3" />
              </div>
              <div className="space-y-1.5">
                <Label>Data de compra</Label>
                <Input type="date" value={form.purchase_date || ''} onChange={e => setForm(p => ({ ...p, purchase_date: e.target.value || null }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Valor (R$)</Label>
                <Input type="number" step="0.01" value={form.purchase_value ?? ''} onChange={e => setForm(p => ({ ...p, purchase_value: e.target.value ? parseFloat(e.target.value) : null }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea value={form.notes || ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>
                {editing ? 'Salvar' : 'Criar item'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
        active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/50'
      }`}
    >
      {label}
    </button>
  );
}

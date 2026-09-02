import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProfiles, useAssetMutations } from '@/hooks/useInventory';
import { useTICategories } from '@/hooks/useTICategories';
import { toast } from 'sonner';
import type { AssetWithOwner } from '@/types/inventory';
import type { AssetCategory, AssetStatus } from '@/types/helpdesk';

interface AssetFormProps {
  asset?: AssetWithOwner | null;
  onSave: () => void;
  onCancel: () => void;
}

// Mapeamento do nome da categoria raiz → enum técnico de category
const inferCategoryEnum = (rootName?: string): AssetCategory => {
  const n = (rootName || '').toLowerCase();
  if (n.includes('hard')) return 'hardware';
  if (n.includes('soft')) return 'software';
  if (n.includes('perif')) return 'peripheral';
  if (n.includes('rede') || n.includes('network')) return 'network';
  if (n.includes('mobile') || n.includes('celular') || n.includes('movel') || n.includes('móvel')) return 'mobile';
  return 'other';
};

const STATUSES: { value: AssetStatus; label: string }[] = [
  { value: 'active', label: 'Ativo' },
  { value: 'in_use' as AssetStatus, label: 'Em uso' },
  { value: 'maintenance', label: 'Em manutenção' },
  { value: 'in_stock' as AssetStatus, label: 'Em estoque' },
  { value: 'inactive', label: 'Inativo' },
  { value: 'decommissioned', label: 'Desativado' },
];

type AssignMode = 'user' | 'department' | 'stock';

export function AssetForm({ asset, onSave, onCancel }: AssetFormProps) {
  const { profiles } = useProfiles();
  const { rootCategories, getSubcategories } = useTICategories('inventory');
  const { createAsset, updateAsset, isLoading } = useAssetMutations();
  
  const [formData, setFormData] = useState({
    name: '',
    asset_tag: '',
    type: 'hardware' as AssetCategory,
    category_id: '',
    subcategory_id: '',
    subcategory: '',
    status: 'in_stock' as AssetStatus,
    manufacturer: '',
    model: '',
    serial_number: '',
    description: '',
    location: '',
    department: '',
    purchase_date: '',
    purchase_value: '',
    warranty_expiry: '',
    assigned_to: '',
    notes: '',
  });
  const [assignMode, setAssignMode] = useState<AssignMode>('stock');

  // Lista de departamentos distintos vindos dos profiles
  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    profiles.forEach(p => { if (p.department) set.add(p.department); });
    return Array.from(set).sort();
  }, [profiles]);

  const subcategoryOptions = formData.category_id ? getSubcategories(formData.category_id) : [];

  useEffect(() => {
    if (asset) {
      const matchedCat = rootCategories.find(c => c.name === asset.subcategory) || null;
      setFormData({
        name: asset.name || '',
        asset_tag: asset.asset_tag || '',
        type: asset.category || 'hardware',
        category_id: matchedCat?.id || '',
        subcategory_id: '',
        subcategory: asset.subcategory || '',
        status: asset.status || 'in_stock',
        manufacturer: asset.manufacturer || '',
        model: asset.model || '',
        serial_number: asset.serial_number || '',
        description: asset.description || '',
        location: asset.location || '',
        department: asset.department || '',
        purchase_date: asset.purchase_date || '',
        purchase_value: asset.purchase_value?.toString() || '',
        warranty_expiry: asset.warranty_expiry || '',
        assigned_to: asset.assigned_to || '',
        notes: asset.notes || '',
      });
      setAssignMode(asset.assigned_to ? 'user' : (asset.department ? 'department' : 'stock'));
    }
  }, [asset, rootCategories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.asset_tag.trim()) {
      toast.error('Nome e Patrimônio são obrigatórios');
      return;
    }

    // Resolve categoria/subcategoria (a partir do que existe em ti_categories)
    const catName = rootCategories.find(c => c.id === formData.category_id)?.name;
    const subName = subcategoryOptions.find(s => s.id === formData.subcategory_id)?.name;
    const subcategoryLabel = subName || catName || formData.subcategory || undefined;
    const inferredCategory = inferCategoryEnum(catName);

    const data = {
      name: formData.name.trim(),
      asset_tag: formData.asset_tag.trim(),
      category: inferredCategory,
      subcategory: subcategoryLabel,
      status: formData.status,
      manufacturer: formData.manufacturer || undefined,
      model: formData.model || undefined,
      serial_number: formData.serial_number || undefined,
      description: formData.description || undefined,
      location: formData.location || undefined,
      department: assignMode === 'department' ? (formData.department || undefined) : (formData.department || undefined),
      purchase_date: formData.purchase_date || undefined,
      purchase_value: formData.purchase_value ? parseFloat(formData.purchase_value) : undefined,
      warranty_expiry: formData.warranty_expiry || undefined,
      assigned_to: assignMode === 'user' ? (formData.assigned_to || null) : null,
      notes: formData.notes || undefined,
    };

    try {
      if (asset) {
        await updateAsset(asset.id, data);
        toast.success('Ativo atualizado com sucesso');
      } else {
        await createAsset(data);
        toast.success('Ativo criado com sucesso');
      }
      onSave();
    } catch (error: any) {
      console.error('[Inventário] erro ao salvar:', error);
      toast.error(error?.message || 'Erro ao salvar ativo', {
        description: error?.details || error?.hint || undefined,
      });
    }
  };

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (field === 'category_id') {
      setFormData(prev => ({ ...prev, subcategory_id: '' }));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full">
      {/* Header */}
      <div className="panel-header">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onCancel} className="p-2 hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-bold">{asset ? 'Editar Ativo' : 'Novo Ativo'}</h2>
            <p className="text-xs text-muted-foreground">Preencha os dados do ativo</p>
          </div>
        </div>
      </div>

      {/* Form Fields */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Basic Info */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Identificação
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nome *</label>
              <Input
                value={formData.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="Ex: Notebook Dell Latitude"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Patrimônio *</label>
              <Input
                value={formData.asset_tag}
                onChange={(e) => updateField('asset_tag', e.target.value)}
                placeholder="Ex: TI-2024-001"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Categoria</label>
              <select
                value={formData.category_id}
                onChange={(e) => updateField('category_id', e.target.value)}
                className="w-full px-3 py-2 bg-input border border-border text-sm"
              >
                <option value="">Selecione...</option>
                {rootCategories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {rootCategories.length === 0 && (
                <p className="text-xs text-muted-foreground">Cadastre categorias em Configurações de TI → Categorias → Inventário.</p>
              )}
            </div>
            {subcategoryOptions.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Subcategoria</label>
                <select
                  value={formData.subcategory_id}
                  onChange={(e) => updateField('subcategory_id', e.target.value)}
                  className="w-full px-3 py-2 bg-input border border-border text-sm"
                >
                  <option value="">Selecione...</option>
                  {subcategoryOptions.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <select
                value={formData.status}
                onChange={(e) => updateField('status', e.target.value)}
                className="w-full px-3 py-2 bg-input border border-border text-sm"
              >
                {STATUSES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="divider" />

        {/* Specs */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Especificações
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Fabricante</label>
              <Input
                value={formData.manufacturer}
                onChange={(e) => updateField('manufacturer', e.target.value)}
                placeholder="Ex: Dell, HP, Lenovo"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Modelo</label>
              <Input
                value={formData.model}
                onChange={(e) => updateField('model', e.target.value)}
                placeholder="Ex: Latitude 5520"
              />
            </div>
            <div className="col-span-2 space-y-2">
              <label className="text-sm font-medium">Número de Série</label>
              <Input
                value={formData.serial_number}
                onChange={(e) => updateField('serial_number', e.target.value)}
                placeholder="Ex: ABC123XYZ456"
                className="font-mono"
              />
            </div>
          </div>
        </div>

        <div className="divider" />

        {/* Ownership */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Posse e Localização
          </h3>

          {/* Assign mode toggle */}
          <div className="flex flex-wrap gap-2 mb-4">
            {([
              { v: 'user', l: 'Para um colaborador' },
              { v: 'department', l: 'Para um setor inteiro' },
              { v: 'stock', l: 'Não atribuir agora (estoque)' },
            ] as { v: AssignMode; l: string }[]).map(opt => (
              <button
                key={opt.v}
                type="button"
                onClick={() => {
                  setAssignMode(opt.v);
                  if (opt.v === 'stock') {
                    setFormData(p => ({ ...p, assigned_to: '', department: '', status: p.status === 'in_use' ? 'in_stock' : p.status }));
                  } else if (opt.v === 'user') {
                    setFormData(p => ({ ...p, department: '', status: p.status === 'in_stock' ? 'in_use' : p.status }));
                  } else {
                    setFormData(p => ({ ...p, assigned_to: '', status: p.status === 'in_stock' ? 'in_use' : p.status }));
                  }
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  assignMode === opt.v
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                }`}
              >
                {opt.l}
              </button>
            ))}
          </div>
          {assignMode === 'stock' && (
            <p className="text-xs text-muted-foreground mb-3">Você pode atrelar a um colaborador ou setor depois.</p>
          )}

          <div className="grid grid-cols-2 gap-4">
            {assignMode === 'user' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Colaborador</label>
                <select
                  value={formData.assigned_to}
                  onChange={(e) => updateField('assigned_to', e.target.value)}
                  className="w-full px-3 py-2 bg-input border border-border text-sm"
                >
                  <option value="">Selecione...</option>
                  {profiles.map(profile => (
                    <option key={profile.id} value={profile.id}>
                      {profile.full_name || profile.email}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {assignMode === 'department' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Setor</label>
                <select
                  value={formData.department}
                  onChange={(e) => updateField('department', e.target.value)}
                  className="w-full px-3 py-2 bg-input border border-border text-sm"
                >
                  <option value="">Selecione...</option>
                  {departmentOptions.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <Input
                  className="mt-1"
                  placeholder="Ou digite um novo setor"
                  value={formData.department}
                  onChange={(e) => updateField('department', e.target.value)}
                />
              </div>
            )}
            <div className="col-span-2 space-y-2">
              <label className="text-sm font-medium">Localização</label>
              <Input
                value={formData.location}
                onChange={(e) => updateField('location', e.target.value)}
                placeholder="Ex: Sala 201, Rack A2"
              />
            </div>
          </div>
        </div>

        <div className="divider" />

        {/* Financial */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Aquisição e Garantia
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Data de Compra</label>
              <Input
                type="date"
                value={formData.purchase_date}
                onChange={(e) => updateField('purchase_date', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Valor de Compra (R$)</label>
              <Input
                type="number"
                step="0.01"
                value={formData.purchase_value}
                onChange={(e) => updateField('purchase_value', e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="col-span-2 space-y-2">
              <label className="text-sm font-medium">Garantia até</label>
              <Input
                type="date"
                value={formData.warranty_expiry}
                onChange={(e) => updateField('warranty_expiry', e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="divider" />

        {/* Notes */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Observações
          </h3>
          <textarea
            value={formData.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            placeholder="Informações adicionais sobre o ativo..."
            className="w-full min-h-[100px] p-3 bg-input border border-border text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border p-4 flex gap-3">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Cancelar
        </Button>
        <Button type="submit" disabled={isLoading} className="flex-1 gap-2">
          <Save className="w-4 h-4" />
          {isLoading ? 'Salvando...' : 'Salvar Ativo'}
        </Button>
      </div>
    </form>
  );
}

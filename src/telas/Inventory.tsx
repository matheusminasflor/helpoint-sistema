import { useEffect, useState } from 'react';
import { useQueryState } from '@/hooks/useQueryState';
import { Plus, Package, FileDown } from 'lucide-react';
import { exportarPlanilha } from '@/lib/tabela';
import { todayISO } from '@/lib/dates';
import { getAssetCategoryLabel, getAssetStatusLabel } from '@/types/helpdesk';
import { Button } from '@/components/ui/button';
import { AssetTable } from '@/components/inventory/AssetTable';
import { AssetDetail } from '@/components/inventory/AssetDetail';
import { AssetForm } from '@/components/inventory/AssetForm';
import { WorkOSPageHeader } from '@/components/workos/WorkOSPageHeader';
import { PageHeader } from '@/components/layout/PageHeader';
import { WorkOSContainer } from '@/components/workos/WorkOSContainer';
import { useInventoryAssets, useAssetMutations } from '@/hooks/useInventory';
import { InventoryKPIs } from '@/components/inventory/InventoryKPIs';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { AssetWithOwner } from '@/types/inventory';

type ViewMode = 'list' | 'detail' | 'form';

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativo' },
  { value: 'in_use', label: 'Em uso' },
  { value: 'maintenance', label: 'Em manutenção' },
  { value: 'in_stock', label: 'Em estoque' },
];

export default function Inventory() {
  const { can } = useDepartmentPermissions('ti');
  const { assets, isLoading, refetch } = useInventoryAssets();
  const { deleteAsset } = useAssetMutations();
  const [viewMode, setViewMode] = useQueryState<ViewMode>('vis', 'list');
  const [selectedAsset, setSelectedAsset] = useState<AssetWithOwner | null>(null);
  const [editingAsset, setEditingAsset] = useState<AssetWithOwner | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useQueryState<string>('status', 'all');

  // O perfil da TI decide, como o banco (20261123040000) — não o cargo.
  const canCreate = can('inventory', 'create');

  const statusCounts = assets.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, { all: assets.length });

  const filteredAssets = statusFilter === 'all'
    ? assets
    : assets.filter(a => a.status === statusFilter);


  const handleSelectAsset = (asset: AssetWithOwner) => {
    setSelectedAsset(asset);
    setViewMode('detail');
  };

  // O Ctrl+K abre o equipamento direto (etapa 3, 2026-10-24): `/inventario?ativo=<id>`.
  const [ativoDoLink, setAtivoDoLink] = useQueryState<string>('ativo', '');
  useEffect(() => {
    if (!ativoDoLink || isLoading) return;
    const achado = assets.find((a) => a.id === ativoDoLink);
    if (achado) handleSelectAsset(achado);
    setAtivoDoLink('');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- abre uma vez, quando a lista chega
  }, [ativoDoLink, isLoading, assets]);

  const handleCreateNew = () => {
    setEditingAsset(null);
    setViewMode('form');
  };

  const handleEdit = () => {
    setEditingAsset(selectedAsset);
    setViewMode('form');
  };

  const handleFormSave = () => {
    refetch();
    setViewMode('list');
    setSelectedAsset(null);
    setEditingAsset(null);
  };

  const handleFormCancel = () => {
    setViewMode(selectedAsset ? 'detail' : 'list');
    setEditingAsset(null);
  };

  const handleDelete = async () => {
    if (!selectedAsset) return;
    
    try {
      await deleteAsset(selectedAsset.id);
      toast.success('Ativo excluído com sucesso');
      setDeleteDialogOpen(false);
      setSelectedAsset(null);
      setViewMode('list');
      refetch();
    } catch (error: any) {
      console.error('[Inventário] erro ao excluir:', error);
      toast.error(error?.message || 'Erro ao excluir ativo', {
        description: error?.details || error?.hint || undefined,
      });
    }
  };

  const handleBackToList = () => {
    setViewMode('list');
    setSelectedAsset(null);
  };

  return (
    <WorkOSContainer>
      {/* Page Header */}
      {viewMode === 'list' ? (
        <WorkOSPageHeader
          icon={Package}
          title="Inventário de TI"
          description="Gestão de Ativos e Equipamentos"
          action={
            <div className="flex gap-2">
              {/* Exportar (R6): quem vê o inventário baixa o que a lista tem — a mesma informação da tela. */}
              <Button variant="outline" className="gap-2" disabled={!assets.length} onClick={() => exportarPlanilha(`inventario-${todayISO()}`,
                assets.map((a) => ({
                  Patrimônio: a.asset_tag, Nome: a.name, Categoria: getAssetCategoryLabel(a.category), Situação: getAssetStatusLabel(a.status),
                  Responsável: a.owner ? (a.owner.full_name || a.owner.email) : null, Setor: a.department, Local: a.location,
                  Fabricante: a.manufacturer, Modelo: a.model, 'Número de série': a.serial_number,
                  Compra: a.purchase_date, 'Fim da garantia': a.warranty_expiry, Valor: a.purchase_value,
                })))}>
                <FileDown className="w-4 h-4" aria-hidden="true" />
                Exportar
              </Button>
              {canCreate && (
                <Button onClick={handleCreateNew} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Novo Ativo
                </Button>
              )}
            </div>
          }
        />
      ) : (
        <PageHeader
          title={viewMode === 'detail' ? 'Detalhes do Ativo' : editingAsset ? 'Editar Ativo' : 'Novo Ativo'}
          icon={Package}
          onBack={handleBackToList}
        />
      )}

      {/* Content */}
      <div className={`flex-1 overflow-hidden p-6 ${viewMode === 'detail' ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:gap-4' : ''}`}>
        {(viewMode === 'list' || viewMode === 'detail') && (
          <div className={`h-full overflow-y-auto space-y-4 ${viewMode === 'detail' ? 'hidden lg:block' : ''}`}>
            <InventoryKPIs />

            {/* Filtros de status */}
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map(s => {
                const count = statusCounts[s.value] || 0;
                const active = statusFilter === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setStatusFilter(s.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                    }`}
                  >
                    {s.label} · {count}
                  </button>
                );
              })}
            </div>

            <div className="bg-card border border-border rounded-lg overflow-hidden shadow-sm">
              <AssetTable
                assets={filteredAssets}
                isLoading={isLoading}
                selectedAssetId={selectedAsset?.id || null}
                onSelect={handleSelectAsset}
              />
            </div>
          </div>
        )}

        {viewMode === 'detail' && selectedAsset && (
          <div className="h-full bg-card border border-border rounded-lg overflow-auto shadow-sm">
            <AssetDetail
              asset={selectedAsset}
              onEdit={handleEdit}
              onDelete={() => setDeleteDialogOpen(true)}
              onRefresh={() => {
                refetch();
                const updated = assets.find(a => a.id === selectedAsset.id);
                if (updated) setSelectedAsset(updated);
              }}
            />
          </div>
        )}

        {viewMode === 'form' && (
          <div className="h-full bg-card border border-border rounded-lg overflow-auto shadow-sm">
            <AssetForm
              asset={editingAsset}
              onSave={handleFormSave}
              onCancel={handleFormCancel}
            />
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o ativo "{selectedAsset?.name}" ({selectedAsset?.asset_tag})?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O histórico de chamados vinculado será mantido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir ativo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WorkOSContainer>
  );
}

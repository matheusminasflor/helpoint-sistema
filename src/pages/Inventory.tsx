import { useState } from 'react';
import { useQueryState } from '@/hooks/useQueryState';
import { Plus, Package, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AssetTable } from '@/components/inventory/AssetTable';
import { AssetDetail } from '@/components/inventory/AssetDetail';
import { AssetForm } from '@/components/inventory/AssetForm';
import { WorkOSPageHeader } from '@/components/workos/WorkOSPageHeader';
import { WorkOSContainer } from '@/components/workos/WorkOSContainer';
import { useInventoryAssets, useAssetMutations } from '@/hooks/useInventory';
import { InventoryKPIs } from '@/components/inventory/InventoryKPIs';
import { useAuth } from '@/contexts/AuthContext';
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
  const { role } = useAuth();
  const { assets, isLoading, refetch } = useInventoryAssets();
  const { deleteAsset } = useAssetMutations();
  const [viewMode, setViewMode] = useQueryState<ViewMode>('vis', 'list');
  const [selectedAsset, setSelectedAsset] = useState<AssetWithOwner | null>(null);
  const [editingAsset, setEditingAsset] = useState<AssetWithOwner | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useQueryState<string>('status', 'all');

  const canCreate = role === 'manager' || role === 'admin' || role === 'owner';

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
            canCreate && (
              <Button onClick={handleCreateNew} className="gap-2">
                <Plus className="w-4 h-4" />
                Novo Ativo
              </Button>
            )
          }
        />
      ) : (
        <div className="h-14 px-6 flex items-center border-b border-border bg-card">
          <Button variant="ghost" size="icon" onClick={handleBackToList} className="mr-2">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded bg-primary/10">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-lg font-semibold text-foreground">
              {viewMode === 'detail' ? 'Detalhes do Ativo' : editingAsset ? 'Editar Ativo' : 'Novo Ativo'}
            </h1>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden p-6">
        {viewMode === 'list' && (
          <div className="h-full overflow-y-auto space-y-4">
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

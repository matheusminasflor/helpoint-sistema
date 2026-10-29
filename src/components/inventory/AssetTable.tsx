import { useState } from 'react';
import { 
  Monitor, 
  Laptop, 
  Server, 
  Smartphone, 
  Printer, 
  Network,
  Package,
  FileCode,
  Search,
  Filter,
  ChevronRight,
  AlertCircle,
  FilterX
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { AssetWithOwner } from '@/types/inventory';
import type { AssetCategory, AssetStatus } from '@/types/helpdesk';
import { getAssetCategoryLabel, getAssetStatusLabel } from '@/types/helpdesk';

interface AssetTableProps {
  assets: AssetWithOwner[];
  isLoading: boolean;
  selectedAssetId: string | null;
  onSelect: (asset: AssetWithOwner) => void;
}

const getCategoryIcon = (category: AssetCategory) => {
  switch (category) {
    case 'hardware': return Laptop;
    case 'mobile': return Smartphone;
    case 'peripheral': return Printer;
    case 'network': return Network;
    case 'software': return FileCode;
    default: return Package;
  }
};

const getStatusColor = (status: AssetStatus) => {
  switch (status) {
    case 'active': return 'bg-status-success';
    case 'maintenance': return 'bg-status-warning';
    case 'inactive': return 'bg-status-danger';
    case 'decommissioned': return 'bg-muted';
    default: return 'bg-muted';
  }
};

const getStatusBadge = (status: AssetStatus) => {
  switch (status) {
    case 'active': return 'badge-success text-status-success';
    case 'maintenance': return 'badge-warning text-status-warning';
    case 'inactive': return 'badge-danger text-status-danger';
    case 'decommissioned': return 'bg-surface-1 text-muted-foreground';
    default: return 'bg-surface-1 text-muted-foreground';
  }
};

const isWarrantyExpiring = (date: string | null): boolean => {
  if (!date) return false;
  const warrantyDate = new Date(date);
  const today = new Date();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  return warrantyDate.getTime() - today.getTime() < thirtyDays && warrantyDate > today;
};

const isWarrantyExpired = (date: string | null): boolean => {
  if (!date) return false;
  return new Date(date) < new Date();
};

export function AssetTable({ assets, isLoading, selectedAssetId, onSelect }: AssetTableProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<AssetCategory | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<AssetStatus | 'all'>('all');

  const hasFilters = search.trim() !== '' || categoryFilter !== 'all' || statusFilter !== 'all';
  const clearFilters = () => {
    setSearch('');
    setCategoryFilter('all');
    setStatusFilter('all');
  };

  const filteredAssets = assets.filter(asset => {
    const matchesSearch = 
      asset.name.toLowerCase().includes(search.toLowerCase()) ||
      asset.asset_tag.toLowerCase().includes(search.toLowerCase()) ||
      asset.serial_number?.toLowerCase().includes(search.toLowerCase()) ||
      asset.manufacturer?.toLowerCase().includes(search.toLowerCase()) ||
      asset.model?.toLowerCase().includes(search.toLowerCase()) ||
      asset.owner?.full_name?.toLowerCase().includes(search.toLowerCase());
    
    const matchesCategory = categoryFilter === 'all' || asset.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || asset.status === statusFilter;
    
    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Total, em uso e manutenção saíram daqui (2026-10-29): os cartões de número logo acima já mostram. Fica a garantia,
  // que não aparece em outro lugar.
  const garantiaVencendo = assets.filter(a => isWarrantyExpiring(a.warranty_expiry)).length;

  return (
    <div className="flex flex-col h-full">
      {garantiaVencendo > 0 && (
        <div className="px-5 pt-4 flex items-center gap-2 text-[14px] font-semibold text-status-danger">
          <AlertCircle className="w-4 h-4" aria-hidden="true" />
          {garantiaVencendo === 1 ? '1 ativo com a garantia vencendo' : `${garantiaVencendo} ativos com a garantia vencendo`}
        </div>
      )}

      {/* Search & Filters */}
      <div className="p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por patrimônio, nome, série, responsável…"
            className="pl-10"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as AssetCategory | 'all')}
          className="h-9 px-3 bg-background dark:bg-muted border border-input text-[14px] font-semibold rounded-sm focus:ring-2 focus:ring-ring"
        >
          <option value="all">Todas Categorias</option>
          <option value="hardware">Hardware</option>
          <option value="mobile">Mobile</option>
          <option value="peripheral">Periféricos</option>
          <option value="network">Rede</option>
          <option value="software">Software</option>
          <option value="other">Outros</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as AssetStatus | 'all')}
          className="h-9 px-3 bg-background dark:bg-muted border border-input text-[14px] font-semibold rounded-sm focus:ring-2 focus:ring-ring"
        >
          <option value="all">Todos Status</option>
          <option value="active">Ativo</option>
          <option value="maintenance">Manutenção</option>
          <option value="inactive">Inativo</option>
          <option value="decommissioned">Desativado</option>
        </select>
      </div>

      {/* Table Header */}
      {/* No celular o cabeçalho some e a linha vira duas (revisão do celular, 2026-10-25). */}
      <div className="hidden sm:grid grid-cols-[60px_1fr_120px_150px_150px_100px_40px] gap-2 mx-4 workos-table-header">
        <div>Tipo</div>
        <div>Ativo</div>
        <div>Patrimônio</div>
        <div>Modelo</div>
        <div>Responsável</div>
        <div>Status</div>
        <div></div>
      </div>

      {/* Table Body */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-1 p-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : filteredAssets.length === 0 ? (
          hasFilters ? (
            <EmptyState
              icon={FilterX}
              title="Nenhum equipamento para estes filtros"
              description="Os filtros atuais escondem todos os equipamentos. Limpe os filtros para ver a lista completa."
              actionLabel="Limpar filtros"
              actionIcon={FilterX}
              onAction={clearFilters}
            />
          ) : (
            <EmptyState
              icon={Package}
              title="Nenhum equipamento cadastrado"
              description="Cadastre computadores, celulares e periféricos para saber quem usa cada item e quando a garantia termina."
            />
          )

        ) : (
          filteredAssets.map(asset => {
            const Icon = getCategoryIcon(asset.category);
            const isSelected = selectedAssetId === asset.id;
            const warrantyExpiring = isWarrantyExpiring(asset.warranty_expiry);
            const warrantyExpired = isWarrantyExpired(asset.warranty_expiry);
            
            return (
              <button
                key={asset.id}
                onClick={() => onSelect(asset)}
                className={cn(
                  "w-full grid grid-cols-[44px_1fr_24px] sm:grid-cols-[60px_1fr_120px_150px_150px_100px_40px] gap-2 px-4 sm:px-8 py-4 text-left border-b border-border transition-colors hover:bg-muted/50",
                  isSelected && "bg-primary/10"
                )}
              >
                {/* Type Icon */}
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                    <Icon className="w-5 h-5 text-muted-foreground" />
                  </div>
                </div>

                {/* Name & Details */}
                <div className="flex flex-col justify-center min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{asset.name}</span>
                    {(warrantyExpiring || warrantyExpired) && (
                      <AlertCircle className={cn(
                        "w-4 h-4 flex-shrink-0",
                        warrantyExpired ? "text-status-danger" : "text-status-warning"
                      )} />
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {getAssetCategoryLabel(asset.category)}
                    {asset.subcategory && ` • ${asset.subcategory}`}
                  </span>
                  {/* No celular, o que as outras colunas diziam, numa linha. */}
                  <span className="sm:hidden text-xs text-muted-foreground truncate">
                    {[asset.asset_tag, asset.owner ? (asset.owner.full_name || asset.owner.email) : 'Em estoque', getAssetStatusLabel(asset.status)].filter(Boolean).join(' · ')}
                  </span>
                </div>

                {/* Asset Tag */}
                <div className="hidden sm:flex items-center">
                  <span className="tabular-nums text-xs">{asset.asset_tag}</span>
                </div>

                {/* Model */}
                <div className="hidden sm:flex flex-col justify-center min-w-0">
                  <span className="text-sm truncate">{asset.manufacturer || '-'}</span>
                  <span className="text-xs text-muted-foreground truncate">{asset.model || '-'}</span>
                </div>

                {/* Owner */}
                <div className="hidden sm:flex flex-col justify-center min-w-0">
                  {asset.owner ? (
                    <>
                      <span className="text-sm truncate">{asset.owner.full_name || asset.owner.email}</span>
                      <span className="text-xs text-muted-foreground truncate">{asset.owner.department || '-'}</span>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">Em Estoque</span>
                  )}
                </div>

                {/* Status */}
                <div className="hidden sm:flex items-center">
                  <span className={cn(
                    "text-xs font-medium px-2.5 py-1 rounded-md",
                    getStatusBadge(asset.status)
                  )}>
                    {getAssetStatusLabel(asset.status)}
                  </span>
                </div>

                {/* Arrow */}
                <div className="flex items-center justify-center">
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

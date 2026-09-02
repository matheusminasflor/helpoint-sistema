import { useState, useMemo } from 'react';
import { useMyAssets, useAssets } from '@/hooks/useHelpdesk';
import { useAuth } from '@/contexts/AuthContext';
import { useMyAccessProfile } from '@/hooks/useAccessProfiles';
import { 
  HardDrive, Monitor, Laptop, Smartphone, Printer, Server, FileCode, ChevronRight, Check
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Asset, AssetCategory } from '@/types/helpdesk';
import { getAssetCategoryLabel } from '@/types/helpdesk';

interface AssetSelectorProps {
  selectedAsset: Asset | null;
  onSelect: (asset: Asset | null) => void;
  ticketCategory?: string;
}

const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'hardware': return Monitor;
    case 'mobile': return Smartphone;
    case 'peripheral': return Printer;
    case 'network': return Server;
    case 'software': return FileCode;
    default: return HardDrive;
  }
};

const getAssetCategoryFilter = (ticketCategory?: string): AssetCategory[] | null => {
  switch (ticketCategory) {
    case 'hardware': return ['hardware'];
    case 'printer': return ['peripheral'];
    case 'network': return ['network'];
    case 'software': return ['software'];
    default: return null;
  }
};

export function AssetSelector({ selectedAsset, onSelect, ticketCategory }: AssetSelectorProps) {
  const { role } = useAuth();
  const { assets: myAssets, isLoading: loadingMy } = useMyAssets();
  const { assets: allAssets, isLoading: loadingAll } = useAssets();
  const [showAll, setShowAll] = useState(false);
  const { data: tiProfile } = useMyAccessProfile('ti');

  const isSupervisor = ['manager', 'admin', 'owner'].includes(role);
  const isTechnician = !!tiProfile || isSupervisor;
  const baseAssets = showAll && isTechnician ? allAssets : myAssets;
  const isLoading = showAll ? loadingAll : loadingMy;

  const assets = useMemo(() => {
    const categoryFilter = getAssetCategoryFilter(ticketCategory);
    if (!categoryFilter) return baseAssets;
    return baseAssets.filter(asset => categoryFilter.includes(asset.category));
  }, [baseAssets, ticketCategory]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">Equipamento Relacionado</label>
        {isTechnician && (
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-primary hover:underline"
          >
            {showAll ? 'Mostrar meus ativos' : 'Mostrar todos'}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map(i => (
            <div key={i} className="h-16 bg-surface-1 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : assets.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-4 text-center text-sm text-muted-foreground">
          Nenhum ativo atribuído a você
        </div>
      ) : (
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {/* Option to skip asset selection */}
          <button
            type="button"
            onClick={() => onSelect(null)}
            className={cn(
              "w-full flex items-center gap-3 p-3 text-left rounded-xl border transition-all duration-200",
              !selectedAsset
                ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                : 'bg-card border-border hover:border-slate-300 hover:bg-background'
            )}
          >
            <div className="w-9 h-9 rounded-lg bg-surface-1 flex items-center justify-center">
              <HardDrive className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Não relacionado a equipamento</p>
              <p className="text-xs text-muted-foreground">Problema geral ou de software</p>
            </div>
            {!selectedAsset && <Check className="w-4 h-4 text-primary" />}
          </button>

          {assets.map(asset => {
            const Icon = getCategoryIcon(asset.category);
            const isSelected = selectedAsset?.id === asset.id;
            
            return (
              <button
                key={asset.id}
                type="button"
                onClick={() => onSelect(asset)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 text-left rounded-xl border transition-all duration-200",
                  isSelected
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                    : 'bg-card border-border hover:border-slate-300 hover:bg-background'
                )}
              >
                <div className="w-9 h-9 rounded-lg bg-surface-1 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{asset.name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{getAssetCategoryLabel(asset.category)}</span>
                    <span>•</span>
                    <span className="font-mono">{asset.asset_tag}</span>
                  </div>
                </div>
                {isSelected ? (
                  <Check className="w-4 h-4 text-primary" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Selected Asset Details */}
      {selectedAsset && (
        <div className="bg-background rounded-xl border border-border p-4">
          <h4 className="text-xs font-semibold mb-2 text-primary uppercase tracking-wider">Ficha Técnica</h4>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <dt className="text-muted-foreground">Patrimônio:</dt>
            <dd className="font-mono text-foreground">{selectedAsset.asset_tag}</dd>
            
            {selectedAsset.serial_number && (
              <>
                <dt className="text-muted-foreground">Nº Série:</dt>
                <dd className="font-mono text-foreground">{selectedAsset.serial_number}</dd>
              </>
            )}
            {selectedAsset.manufacturer && (
              <>
                <dt className="text-muted-foreground">Fabricante:</dt>
                <dd className="text-foreground">{selectedAsset.manufacturer}</dd>
              </>
            )}
            {selectedAsset.model && (
              <>
                <dt className="text-muted-foreground">Modelo:</dt>
                <dd className="text-foreground">{selectedAsset.model}</dd>
              </>
            )}
            {selectedAsset.warranty_expiry && (
              <>
                <dt className="text-muted-foreground">Garantia até:</dt>
                <dd className="text-foreground">{new Date(selectedAsset.warranty_expiry).toLocaleDateString('pt-BR')}</dd>
              </>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { ArrowRight, AlertTriangle, Loader2, Package } from 'lucide-react';
import { toast } from 'sonner';

interface AssetInfo {
  id: string;
  name: string;
  asset_tag: string;
  category: string;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
}

interface AssetSwapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentAsset: AssetInfo;
  ticketId: string;
  requesterId: string;
  onSwapComplete: () => void;
  onSwap: (
    ticketId: string,
    oldAssetId: string,
    newAssetId: string,
    requesterId: string,
    reason: string,
    oldAssetName: string,
    newAssetName: string
  ) => Promise<void>;
  isSwapping: boolean;
}

export function AssetSwapDialog({
  open,
  onOpenChange,
  currentAsset,
  ticketId,
  requesterId,
  onSwapComplete,
  onSwap,
  isSwapping,
}: AssetSwapDialogProps) {
  const [availableAssets, setAvailableAssets] = useState<AssetInfo[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [reason, setReason] = useState('');
  const [loadingAssets, setLoadingAssets] = useState(false);

  const fetchAvailableAssets = useCallback(async () => {
    setLoadingAssets(true);
    try {
      const { data, error } = await supabase
        .from('assets')
        .select('id, name, asset_tag, category, manufacturer, model, serial_number')
        .eq('category', currentAsset.category as any)
        .eq('status', 'active' as any)
        .is('assigned_to', null)
        .neq('id', currentAsset.id)
        .order('name', { ascending: true });

      if (error) throw error;
      setAvailableAssets((data as AssetInfo[]) || []);
    } catch (err) {
      console.error('Error fetching available assets:', err);
    } finally {
      setLoadingAssets(false);
    }
  }, [currentAsset.category, currentAsset.id]);

  useEffect(() => {
    if (open) {
      fetchAvailableAssets();
      setSelectedAssetId('');
      setReason('');
    }
  }, [open, fetchAvailableAssets]);

  const selectedAsset = availableAssets.find((a) => a.id === selectedAssetId);

  const handleConfirm = async () => {
    if (!selectedAssetId || !reason.trim()) return;

    try {
      await onSwap(
        ticketId,
        currentAsset.id,
        selectedAssetId,
        requesterId,
        reason.trim(),
        `${currentAsset.name} (${currentAsset.asset_tag})`,
        `${selectedAsset?.name} (${selectedAsset?.asset_tag})`
      );
      toast.success('Equipamento trocado com sucesso');
      onOpenChange(false);
      onSwapComplete();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao trocar equipamento.');
    }
  };

  const AssetCard = ({
    asset,
    label,
    variant,
  }: {
    asset: AssetInfo;
    label: string;
    variant: 'destructive' | 'default';
  }) => (
    <div className="flex-1 rounded-lg border border-border bg-muted/50 p-3 space-y-2">
      <Badge variant={variant} className="text-[10px]">
        {label}
      </Badge>
      <p className="font-semibold text-sm truncate">{asset.name}</p>
      <p className="font-mono text-xs text-muted-foreground">{asset.asset_tag}</p>
      {asset.manufacturer && (
        <p className="text-xs text-muted-foreground">
          {asset.manufacturer} {asset.model ? `— ${asset.model}` : ''}
        </p>
      )}
      {asset.serial_number && (
        <p className="text-xs text-muted-foreground">S/N: {asset.serial_number}</p>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Trocar Equipamento
          </DialogTitle>
          <DialogDescription>
            Selecione o equipamento substituto. O ativo atual será marcado como "Em
            Manutenção" e o novo será atribuído ao solicitante.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Asset comparison */}
          <div className="flex items-center gap-2">
            <AssetCard asset={currentAsset} label="Com Defeito" variant="destructive" />
            <ArrowRight className="w-5 h-5 flex-shrink-0 text-muted-foreground" />
            {selectedAsset ? (
              <AssetCard asset={selectedAsset} label="Substituto" variant="default" />
            ) : (
              <div className="flex-1 rounded-lg border border-dashed border-border p-3 flex items-center justify-center min-h-[100px] text-xs text-muted-foreground">
                Selecione abaixo
              </div>
            )}
          </div>

          {/* Asset selector */}
          <div className="space-y-2">
            <Label htmlFor="replacement-asset">Equipamento Substituto</Label>
            {loadingAssets ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando ativos disponíveis...
              </div>
            ) : availableAssets.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 py-2">
                <AlertTriangle className="w-4 h-4" />
                Nenhum ativo disponível nesta categoria.
              </div>
            ) : (
              <Select value={selectedAssetId} onValueChange={setSelectedAssetId}>
                <SelectTrigger id="replacement-asset">
                  <SelectValue placeholder="Selecione o ativo substituto" />
                </SelectTrigger>
                <SelectContent>
                  {availableAssets.map((asset) => (
                    <SelectItem key={asset.id} value={asset.id}>
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          {asset.asset_tag}
                        </span>
                        <span>{asset.name}</span>
                        {asset.model && (
                          <span className="text-muted-foreground text-xs">
                            ({asset.model})
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="swap-reason">Motivo da Troca *</Label>
            <Textarea
              id="swap-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Descreva o motivo da substituição do equipamento..."
              rows={3}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSwapping}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedAssetId || !reason.trim() || isSwapping}
          >
            {isSwapping ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processando...
              </>
            ) : (
              'Confirmar Troca'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

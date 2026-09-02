import { useState } from 'react';
import { 
  Package, 
  User, 
  Calendar, 
  Shield, 
  MapPin, 
  Building,
  Hash,
  FileText,
  History,
  Edit,
  Trash2,
  UserPlus,
  AlertCircle,
  Ticket
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAssetTicketHistory, useAssetMutations, useProfiles } from '@/hooks/useInventory';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import type { AssetWithOwner } from '@/types/inventory';
import { getAssetCategoryLabel, getAssetStatusLabel, getTicketStatusLabel, getTicketPriorityLabel } from '@/types/helpdesk';

interface AssetDetailProps {
  asset: AssetWithOwner;
  onEdit: () => void;
  onDelete: () => void;
  onRefresh: () => void;
}

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

export function AssetDetail({ asset, onEdit, onDelete, onRefresh }: AssetDetailProps) {
  const { role } = useAuth();
  const { tickets, isLoading: loadingTickets } = useAssetTicketHistory(asset.id);
  const { transferOwnership, isLoading: isTransferring } = useAssetMutations();
  const { profiles } = useProfiles();
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [selectedNewOwner, setSelectedNewOwner] = useState<string | null>(null);

  const canEdit = role === 'manager' || role === 'admin' || role === 'owner';
  const canDelete = role === 'admin' || role === 'owner';
  const warrantyExpiring = isWarrantyExpiring(asset.warranty_expiry);
  const warrantyExpired = isWarrantyExpired(asset.warranty_expiry);

  const handleTransfer = async () => {
    try {
      await transferOwnership(asset.id, selectedNewOwner);
      toast.success('Posse transferida com sucesso');
      setShowTransferDialog(false);
      onRefresh();
    } catch (error) {
      console.error('Error transferring ownership:', error);
      toast.error('Erro ao transferir posse. Tente novamente ou avise o suporte.');
    }
  };

  // Analyze recurring issues
  const issueAnalysis = tickets.reduce((acc, ticket) => {
    const category = ticket.category || 'other';
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const recurringIssue = Object.entries(issueAnalysis)
    .sort((a, b) => b[1] - a[1])
    .find(([_, count]) => count >= 2);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="panel-header">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 flex items-center justify-center">
            <Package className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold">{asset.name}</h2>
            <p className="text-xs text-muted-foreground font-mono">{asset.asset_tag}</p>
          </div>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowTransferDialog(true)}>
              <UserPlus className="w-4 h-4 mr-1" />
              Transferir
            </Button>
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Edit className="w-4 h-4" />
            </Button>
            {canDelete && (
              <Button variant="destructive" size="sm" onClick={onDelete}>
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Status & Warranty Alert */}
        {(warrantyExpiring || warrantyExpired) && (
          <div className={cn(
            "mx-4 mt-4 p-3 border flex items-center gap-3",
            warrantyExpired ? "bg-status-danger/10 border-status-danger" : "bg-status-warning/10 border-status-warning"
          )}>
            <AlertCircle className={cn(
              "w-5 h-5",
              warrantyExpired ? "text-status-danger" : "text-status-warning"
            )} />
            <div>
              <p className="text-sm font-medium">
                {warrantyExpired ? "Garantia Expirada" : "Garantia Expirando"}
              </p>
              <p className="text-xs text-muted-foreground">
                {warrantyExpired 
                  ? `Expirou em ${format(new Date(asset.warranty_expiry!), "dd/MM/yyyy", { locale: ptBR })}`
                  : `Expira em ${formatDistanceToNow(new Date(asset.warranty_expiry!), { locale: ptBR })}`
                }
              </p>
            </div>
          </div>
        )}

        {/* Recurring Issue Alert */}
        {recurringIssue && (
          <div className="mx-4 mt-4 p-3 border bg-status-info/10 border-status-info flex items-center gap-3">
            <History className="w-5 h-5 text-status-info" />
            <div>
              <p className="text-sm font-medium">Problema Recorrente Detectado</p>
              <p className="text-xs text-muted-foreground">
                {recurringIssue[1]} chamados na categoria "{recurringIssue[0]}" - Considerar substituição ou manutenção preventiva
              </p>
            </div>
          </div>
        )}

        {/* Technical Specs */}
        <div className="p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Ficha Técnica
          </h3>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Categoria</dt>
              <dd className="font-medium">{getAssetCategoryLabel(asset.category)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Subcategoria</dt>
              <dd className="font-medium">{asset.subcategory || '-'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Fabricante</dt>
              <dd className="font-medium">{asset.manufacturer || '-'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Modelo</dt>
              <dd className="font-medium">{asset.model || '-'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Número de Série</dt>
              <dd className="font-mono text-xs">{asset.serial_number || '-'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Status</dt>
              <dd className="font-medium">{getAssetStatusLabel(asset.status)}</dd>
            </div>
          </dl>
        </div>

        <div className="divider" />

        {/* Ownership & Location */}
        <div className="p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <User className="w-4 h-4" />
            Posse e Localização
          </h3>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Responsável</dt>
              <dd className="font-medium">
                {asset.owner ? (asset.owner.full_name || asset.owner.email) : (
                  <span className="italic text-muted-foreground">Em Estoque</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Departamento</dt>
              <dd className="font-medium">{asset.owner?.department || asset.department || '-'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Localização</dt>
              <dd className="font-medium">{asset.location || '-'}</dd>
            </div>
          </dl>
        </div>

        <div className="divider" />

        {/* Financial & Warranty */}
        <div className="p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Aquisição e Garantia
          </h3>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Data de Compra</dt>
              <dd className="font-medium">
                {asset.purchase_date 
                  ? format(new Date(asset.purchase_date), "dd/MM/yyyy", { locale: ptBR })
                  : '-'
                }
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Valor de Compra</dt>
              <dd className="font-mono">
                {asset.purchase_value 
                  ? `R$ ${asset.purchase_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                  : '-'
                }
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Garantia até</dt>
              <dd className={cn(
                "font-medium",
                warrantyExpired && "text-status-danger",
                warrantyExpiring && "text-status-warning"
              )}>
                {asset.warranty_expiry 
                  ? format(new Date(asset.warranty_expiry), "dd/MM/yyyy", { locale: ptBR })
                  : '-'
                }
              </dd>
            </div>
          </dl>
        </div>

        <div className="divider" />

        {/* Ticket History */}
        <div className="p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <Ticket className="w-4 h-4" />
            Histórico de Chamados ({tickets.length})
          </h3>
          
          {loadingTickets ? (
            <div className="space-y-2">
              {[1, 2].map(i => <div key={i} className="h-12 bg-surface-2 animate-pulse" />)}
            </div>
          ) : tickets.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum chamado registrado para este ativo
            </p>
          ) : (
            <div className="space-y-2">
              {tickets.slice(0, 10).map(ticket => (
                <div 
                  key={ticket.id}
                  className="p-3 border border-border bg-surface-1 hover:bg-surface-2 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">#{ticket.ticket_number}</span>
                      <Badge variant="outline" className="text-[11px]">
                        {getTicketStatusLabel(ticket.status)}
                      </Badge>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                  <p className="text-sm font-medium truncate">{ticket.title}</p>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                    <span>{ticket.category || 'Geral'}</span>
                    <span>•</span>
                    <span>{getTicketPriorityLabel(ticket.priority)}</span>
                  </div>
                </div>
              ))}
              {tickets.length > 10 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  + {tickets.length - 10} chamados anteriores
                </p>
              )}
            </div>
          )}
        </div>

        {/* Notes */}
        {asset.notes && (
          <>
            <div className="divider" />
            <div className="p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Observações
              </h3>
              <p className="text-sm whitespace-pre-wrap">{asset.notes}</p>
            </div>
          </>
        )}
      </div>

      {/* Transfer Dialog */}
      <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir Posse do Ativo</DialogTitle>
            <DialogDescription>
              Selecione o novo responsável pelo ativo {asset.asset_tag}. 
              Esta ação será registrada no log de auditoria.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <select
              value={selectedNewOwner || ''}
              onChange={(e) => setSelectedNewOwner(e.target.value || null)}
              className="w-full px-3 py-2 bg-input border border-border text-sm"
            >
              <option value="">Em Estoque (sem responsável)</option>
              {profiles.map(profile => (
                <option key={profile.id} value={profile.id}>
                  {profile.full_name || profile.email} {profile.department && `(${profile.department})`}
                </option>
              ))}
            </select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransferDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleTransfer} disabled={isTransferring}>
              {isTransferring ? 'Transferindo...' : 'Confirmar Transferência'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

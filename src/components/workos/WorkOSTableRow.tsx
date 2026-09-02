import { useState } from 'react';
import { cn } from '@/lib/utils';
import { StatusCell } from './StatusCell';
import { PriorityCell } from './PriorityCell';
import { getSLATimeRemaining } from '@/types/helpdesk';
import { AlertTriangle, HardDrive, UserPlus, ShoppingCart } from 'lucide-react';
import { TicketContextMenu } from '@/components/helpdesk/TicketContextMenu';
import { useTicketActions } from '@/hooks/useTicketActions';
import { toast } from 'sonner';
import type { TicketWithDetails } from '@/types/helpdesk';

interface WorkOSTableRowProps {
  ticket: TicketWithDetails;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate?: () => void;
  gridCols?: string;
  simplified?: boolean;
  /** Altura da linha em px (densidade confortável/compacta) */
  rowHeight?: number;
  /** Abaixo de 768px a linha vira cartão empilhado */
  asCard?: boolean;
}

export function WorkOSTableRow({ 
  ticket, 
  isSelected, 
  onSelect,
  onUpdate,
  gridCols = 'grid-cols-[60px_1fr_100px_80px_100px_90px]',
  simplified = false,
  rowHeight = 38,
  asCard = false,
}: WorkOSTableRowProps) {
  const sla = getSLATimeRemaining(ticket.sla_due_at, ticket);
  const { assignToMe } = useTicketActions();
  const [assigning, setAssigning] = useState(false);

  const handleAssign = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setAssigning(true);
    try {
      await assignToMe(ticket.id);
      toast.success(`Chamado #${ticket.ticket_number} atribuído a você`);
      onUpdate?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível atribuir o chamado');
    } finally {
      setAssigning(false);
    }
  };

  const slaLabel = sla.hasSLA ? sla.label : 'Sem prazo definido';
  /** Só destaca em vermelho quando o relógio ainda está correndo. */
  const slaAlert = sla.isOverdue && !sla.isFrozen;

  const CardContent = (
    <div
      onClick={onSelect}
      className={cn(
        'flex flex-col gap-2 px-4 py-3 cursor-pointer bg-card border-b border-border transition-colors',
        isSelected && 'workos-row-selected',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-primary font-bold">#{ticket.ticket_number}</span>
        <StatusCell status={ticket.status} size="sm" />
      </div>
      <p className="text-sm font-medium text-foreground">{ticket.title}</p>
      <div className="flex items-center justify-between gap-2">
        <div className={cn(
          'flex items-center gap-1 font-mono text-[11px] text-muted-foreground',
          slaAlert && 'text-monday-red font-bold',
        )}>
          {slaAlert && <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />}
          <span>{slaLabel}</span>
        </div>
        {!simplified && <PriorityCell priority={ticket.priority} size="sm" />}
      </div>
    </div>
  );

  const isPurchase = (ticket.category || '').toLowerCase().includes('compra');

  const RowContent = (
    <div 
      onClick={onSelect}
      style={{ height: rowHeight }}
      className={cn(
        "workos-row px-4 transition-colors",
        gridCols,
        isSelected && "workos-row-selected"
      )}
    >
      {/* ID */}
      <span className="font-mono text-xs text-primary font-bold">
        #{ticket.ticket_number}
      </span>
      
      {/* Title + Category/Requester */}
      <div className="min-w-0 pr-4">
        <p className="text-sm font-medium truncate text-foreground">
          {isPurchase && (
            <span
              className="badge-warning mr-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold align-middle"
              title="Solicitação de compra"
            >
              <ShoppingCart className="w-3 h-3" aria-hidden="true" />
              Compra
            </span>
          )}
          {ticket.title}
        </p>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
          {simplified ? (
            <span className="truncate">{ticket.category || 'Sem categoria'}</span>
          ) : (
            <>
              <span className="truncate">{ticket.requester?.full_name || 'Usuário'}</span>
              {ticket.requester?.department && (
                <>
                  <span className="text-border">•</span>
                  <span className="truncate">{ticket.requester.department}</span>
                </>
              )}
              {ticket.asset && (
                <>
                  <span className="text-border">•</span>
                  <span className="flex items-center gap-1 font-mono text-primary/60">
                    <HardDrive className="w-3 h-3" />
                    {ticket.asset.asset_tag}
                  </span>
                </>
              )}
            </>
          )}
        </div>
      </div>
      
      {/* Status */}
      <StatusCell status={ticket.status} size="sm" />
      
      {/* Technician columns */}
      {!simplified && (
        <>
          <PriorityCell priority={ticket.priority} size="sm" />
          
          {/* Assignee */}
          <div className="text-center">
            {ticket.assignee ? (
              <div className="flex items-center justify-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-bold text-primary">
                  {ticket.assignee.full_name?.charAt(0)}
                </div>
                <span className="text-xs text-foreground truncate">
                  {ticket.assignee.full_name?.split(' ')[0]}
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleAssign}
                disabled={assigning}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-card text-xs font-medium text-primary hover:bg-muted disabled:opacity-60"
              >
                <UserPlus className="w-3 h-3" aria-hidden="true" />
                {assigning ? 'Atribuindo…' : 'Atribuir'}
              </button>
            )}
          </div>
          
          {/* SLA — sinal sempre explícito, nunca só pela cor */}
          <div className={cn(
            "flex items-center justify-center gap-1 font-mono text-[11px] text-muted-foreground",
            slaAlert && "text-monday-red font-bold"
          )}>
            {slaAlert && <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />}
            <span className="truncate">
              {sla.hasSLA ? sla.label : 'Sem SLA'}
            </span>
          </div>
        </>
      )}
    </div>
  );

  const Content = asCard ? CardContent : RowContent;

  if (simplified) {
    return Content;
  }

  return (
    <TicketContextMenu ticket={ticket} onUpdate={onUpdate}>
      {Content}
    </TicketContextMenu>
  );
}

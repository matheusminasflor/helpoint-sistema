import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useNavigate } from 'react-router-dom';
import { useMyAccessProfile } from '@/hooks/useAccessProfiles';
import { useTicketDetail } from '@/hooks/useTicketComments';
import { TicketConversation } from './TicketConversation';
import { TicketStatusBadge } from './TicketStatusBadge';
import { TicketActionsBar } from './TicketActionsBar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { 
  ExternalLink, 
  Sparkles, 
  User, 
  Building, 
  Mail,
  HardDrive,
  Clock,
  AlertTriangle
} from 'lucide-react';
import { getTicketPriorityLabel, getSLATimeRemaining } from '@/types/helpdesk';
import { ticketDetailPath } from '@/lib/ticket-route';
import { cn } from '@/lib/utils';
import type { TicketWithDetails } from '@/types/helpdesk';

interface TicketDetailSheetProps {
  ticket: TicketWithDetails | null;
  open: boolean;
  onClose: () => void;
  onUpdate?: () => void;
  simplified?: boolean;
}

export function TicketDetailSheet({ 
  ticket, 
  open, 
  onClose,
  onUpdate,
  simplified = false
}: TicketDetailSheetProps) {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const { role } = useAuth();
  const { data: tiProfile } = useMyAccessProfile('ti');
  
  // É técnico se tem perfil TI atribuído OU é supervisor/admin/owner
  const isSupervisor = ['manager', 'admin', 'owner'].includes(role);
  const isTechnician = !!tiProfile || isSupervisor;
  const showTechFeatures = isTechnician && !simplified;
  
  const sla = ticket ? getSLATimeRemaining(ticket.sla_due_at, ticket) : null;

  const openFullPage = () => {
    if (ticket) {
      navigate(tenantPath(ticketDetailPath(ticket.module, ticket.id)));
      onClose();
    }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent 
        side="right" 
        className="w-[480px] sm:max-w-[480px] p-0 flex flex-col"
      >
        {ticket ? (
          <>
            {/* Header */}
            <SheetHeader className="p-4 border-b border-border flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-muted-foreground">
                    #{ticket.ticket_number}
                  </span>
                  <TicketStatusBadge status={ticket.status} size="sm" />
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={openFullPage} 
                  className="gap-1 text-xs"
                >
                  <ExternalLink className="w-3 h-3" />
                  Abrir
                </Button>
              </div>
              <SheetTitle className="text-left text-base line-clamp-2 mt-1">
                {ticket.title}
              </SheetTitle>
              
              {/* Category + Priority/SLA (only for technicians) */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {ticket.category && (
                  <Badge variant="secondary" className="text-[11px]">
                    {ticket.category}
                  </Badge>
                )}
                
                {showTechFeatures && (
                  <Badge className={cn(
                    "text-[11px]",
                    ticket.priority === 'critical' && "bg-red-500 hover:bg-red-600",
                    ticket.priority === 'high' && "bg-orange-500 hover:bg-orange-600",
                    ticket.priority === 'medium' && "bg-yellow-500 hover:bg-yellow-600 text-black",
                    ticket.priority === 'low' && "bg-emerald-500 hover:bg-emerald-600"
                  )}>
                    {getTicketPriorityLabel(ticket.priority)}
                  </Badge>
                )}
                
                {showTechFeatures && sla && (
                  <Badge 
                    variant={sla.isOverdue ? "destructive" : "outline"} 
                    className="text-[11px] gap-1 font-mono"
                  >
                    {sla.isOverdue ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                    {sla.label}
                  </Badge>
                )}
              </div>
            </SheetHeader>

            {/* AI Suggestion - only for technicians */}
            {showTechFeatures && (
              <div className="p-3 bg-primary/5 border-b border-border flex-shrink-0">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <div className="text-xs">
                    <p className="text-muted-foreground">
                      Sugestão: Verifique se há um tutorial relacionado na base de conhecimento.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Requester Info */}
            <div className="px-4 py-3 border-b border-border bg-muted/30 flex-shrink-0">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{ticket.requester?.full_name || 'Usuário'}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-0.5 text-xs text-muted-foreground">
                    {ticket.requester?.department && (
                      <span className="flex items-center gap-1">
                        <Building className="w-3 h-3" />
                        {ticket.requester.department}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      {ticket.requester?.email}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Asset Info */}
            {ticket.asset && (
              <div className="px-4 py-2.5 border-b border-border bg-muted/20 flex-shrink-0">
                <div className="flex items-center gap-2 text-xs">
                  <HardDrive className="w-4 h-4 text-muted-foreground" />
                  <span className="font-mono font-medium">{ticket.asset.asset_tag}</span>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-muted-foreground truncate">{ticket.asset.name}</span>
                </div>
              </div>
            )}

            {/* Conversation */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <TicketConversation 
                ticketId={ticket.id} 
                showInternalOption={isTechnician}
              />
            </div>

            {/* Actions Bar - only for technicians */}
            {showTechFeatures && (
              <div className="p-3 border-t border-border bg-card flex-shrink-0">
                <TicketActionsBar 
                  ticket={ticket} 
                  onUpdate={onUpdate}
                  compact
                />
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <Clock className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="font-medium">Selecione um chamado</p>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

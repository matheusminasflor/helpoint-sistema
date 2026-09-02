import { useTenantPath } from '@/hooks/useTenantPath';
import { useSetBreadcrumbLeaf } from '@/contexts/BreadcrumbContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TicketConversation } from '@/components/helpdesk/TicketConversation';
import { TicketStatusBadge } from '@/components/helpdesk/TicketStatusBadge';
import { TicketActionsBar } from '@/components/helpdesk/TicketActionsBar';
import { TicketComplianceChecklist } from '@/components/helpdesk/TicketComplianceChecklist';
import { useTicketDetail } from '@/hooks/useTicketComments';
import { useMaintenancesByTicket } from '@/hooks/useLinkedMaintenances';
import { useAuth } from '@/contexts/AuthContext';
import { useMyAccessProfile } from '@/hooks/useAccessProfiles';
import { Skeleton } from '@/components/ui/skeleton';
import { useTicketActions } from '@/hooks/useTicketActions';
import { AssetSwapDialog } from '@/components/helpdesk/AssetSwapDialog';
import { OffboardingAccessPanel } from '@/components/helpdesk/OffboardingAccessPanel';
import { PurchasePanel } from '@/components/financeiro/PurchasePanel';
import { TicketEvaluationPanel } from '@/components/helpdesk/TicketEvaluationPanel';
import { 
  ArrowLeft, 
  User, 
  Calendar, 
  Tag,
  Monitor,
  Clock,
  UserCheck,
  RefreshCw,
  Wrench,
  AlertTriangle
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getTicketPriorityLabel, getSLATimeRemaining } from '@/types/helpdesk';
import { getMaintenanceTypeLabel, getMaintenanceStatusLabel, getMaintenanceStatusColor } from '@/types/it-management';
import { cn } from '@/lib/utils';

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const { user, role } = useAuth();
  const { ticket, isLoading, refetch } = useTicketDetail(id || null);
  const { data: tiProfile } = useMyAccessProfile('ti');
  const { swapAsset, isLoading: isSwapping } = useTicketActions();
  const { data: linkedMaintenances } = useMaintenancesByTicket(id || null);
  const [showSwapDialog, setShowSwapDialog] = useState(false);

  useSetBreadcrumbLeaf(
    ticket
      ? `#${ticket.ticket_number} — ${ticket.title.length > 40 ? `${ticket.title.slice(0, 40)}…` : ticket.title}`
      : null,
  );
  
  const isSupervisor = ['manager', 'admin', 'owner'].includes(role);
  const isTechnician = !!tiProfile || isSupervisor;
  const canManageChecklist = isSupervisor || ticket?.assigned_to === user?.id;

  const locationState = (window.history.state?.usr) as { from?: string } | undefined;

  const handleBack = () => {
    if (locationState?.from) {
      navigate(locationState.from);
    } else if (isTechnician) {
      navigate(tenantPath('/ti/chamados'));
    } else {
      navigate(tenantPath('/helpdesk'));
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b border-border bg-card">
          <div className="max-w-6xl mx-auto px-4 py-4">
            <Skeleton className="h-8 w-64" />
          </div>
        </div>
        <div className="max-w-6xl mx-auto p-4">
          <Skeleton className="h-[600px] w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-semibold mb-2">Chamado não encontrado</h1>
          <p className="text-muted-foreground mb-4">O chamado que você procura não existe ou foi removido.</p>
          <Button onClick={handleBack}>Voltar</Button>
        </div>
      </div>
    );
  }

  const sla = getSLATimeRemaining(ticket.sla_due_at, ticket);

  if (!isTechnician) {
    return (
      <div className="min-h-screen bg-background">
        <PageHeader
          sticky
          onBack={handleBack}
          identifier={`#${ticket.ticket_number}`}
          status={<TicketStatusBadge status={ticket.status} />}
          title={ticket.title}
        />


        <div className="max-w-4xl mx-auto p-4">
          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4 px-1">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {format(new Date(ticket.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </span>
            {ticket.assignee && (
              <span className="flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5" />
                {ticket.assignee.full_name}
              </span>
            )}
            {ticket.category && (
              <span className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" />
                {ticket.category}
              </span>
            )}
          </div>

          {linkedMaintenances && linkedMaintenances.length > 0 && (
            <div className="mb-4 px-1">
              {linkedMaintenances.map(m => (
                <div key={m.id} className="flex items-start gap-3 p-3 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30">
                  <Wrench className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-800 dark:text-blue-300">
                      Manutenção agendada: {m.title}
                    </p>
                    <p className="text-blue-600 dark:text-blue-400 mt-0.5">
                      Tipo: {getMaintenanceTypeLabel(m.maintenance_type)} · 
                      Status: {getMaintenanceStatusLabel(m.status)}
                      {m.scheduled_date && ` · Data: ${format(new Date(m.scheduled_date), 'dd/MM/yyyy', { locale: ptBR })}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {ticket.status === 'resolved' && ticket.requester_id === user?.id && (
            <div className="mb-4">
              <TicketEvaluationPanel
                ticketId={ticket.id}
                resolvedAt={ticket.resolved_at}
                resolutionNotes={ticket.resolution_notes}
                onUpdate={refetch}
              />
            </div>
          )}

          <div className="mb-4">
            <PurchasePanel ticketId={ticket.id} onUpdate={refetch} />
          </div>

          <div className="bg-card border border-border rounded-2xl shadow-md h-[calc(100vh-200px)] flex flex-col overflow-hidden">
            <TicketConversation 
              ticketId={ticket.id} 
              showInternalOption={false}
              onUpdate={refetch}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        sticky
        onBack={handleBack}
        identifier={`#${ticket.ticket_number}`}
        title={ticket.title}
        status={
          <>
            <TicketStatusBadge status={ticket.status} />
            <span className={cn(
              'text-xs font-semibold px-2 py-0.5 rounded-full',
              ticket.priority === 'critical' && 'priority-critical',
              ticket.priority === 'high' && 'priority-high',
              ticket.priority === 'medium' && 'priority-medium',
              ticket.priority === 'low' && 'priority-low',
            )}>
              {getTicketPriorityLabel(ticket.priority)}
            </span>
          </>
        }
        actions={<TicketActionsBar ticket={ticket} onUpdate={refetch} compact />}
      />

      <div className="max-w-6xl mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-card border border-border rounded-2xl shadow-md h-[calc(100vh-200px)] flex flex-col overflow-hidden">
              <TicketConversation 
                ticketId={ticket.id} 
                showInternalOption={isTechnician}
                onUpdate={refetch}
              />
            </div>
          </div>
          
          {/* Coluna direita fixa: metadados e ações */}
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
            <PurchasePanel ticketId={ticket.id} onUpdate={refetch} />

            <TicketComplianceChecklist ticketId={ticket.id} canEdit={canManageChecklist} />


            <OffboardingAccessPanel ticketId={ticket.id} canEdit={canManageChecklist} />

            {linkedMaintenances && linkedMaintenances.length > 0 && (
              <div className="bg-card border border-border rounded-xl shadow-sm p-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Wrench className="w-3.5 h-3.5" />
                  Manutenções Vinculadas
                </h3>
                <div className="space-y-3">
                  {linkedMaintenances.map(m => (
                    <div key={m.id} className="space-y-1.5">
                      <p className="font-medium text-sm">{m.title}</p>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className={getMaintenanceStatusColor(m.status)}>
                          {getMaintenanceStatusLabel(m.status)}
                        </Badge>
                        <Badge variant="outline">
                          {getMaintenanceTypeLabel(m.maintenance_type)}
                        </Badge>
                      </div>
                      {m.scheduled_date && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(m.scheduled_date), 'dd/MM/yyyy', { locale: ptBR })}
                        </p>
                      )}
                      {m.status !== 'completed' && m.status !== 'cancelled' && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1">
                          <AlertTriangle className="w-3 h-3" />
                          Chamado bloqueado até conclusão
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-card border border-border rounded-xl shadow-sm p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <User className="w-3.5 h-3.5" />
                Solicitante
              </h3>
              <div className="space-y-2">
                <p className="font-medium">{ticket.requester?.full_name || 'Usuário'}</p>
                <p className="text-sm text-muted-foreground">{ticket.requester?.email}</p>
                {ticket.requester?.department && (
                  <p className="text-sm text-muted-foreground">{ticket.requester.department}</p>
                )}
              </div>
            </div>
            
            <div className="bg-card border border-border rounded-xl shadow-sm p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <Tag className="w-3.5 h-3.5" />
                Detalhes
              </h3>
              <dl className="space-y-3 text-sm">
                {ticket.category && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Categoria</dt>
                    <dd className="font-medium">{ticket.category}</dd>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <dt className="text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    Criado em
                  </dt>
                  <dd>{format(new Date(ticket.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</dd>
                </div>
                {ticket.assignee && (
                  <div className="flex justify-between items-center">
                    <dt className="text-muted-foreground flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5" />
                      Atribuído a
                    </dt>
                    <dd className="font-medium">{ticket.assignee.full_name}</dd>
                  </div>
                )}
                {ticket.sla_due_at && (
                  <div className="flex justify-between items-center">
                    <dt className="text-muted-foreground flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      SLA
                    </dt>
                    <dd className={cn(
                      'font-medium',
                      sla.isOverdue ? 'text-destructive' : 'text-status-success'
                    )}>
                      {sla.label}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
            
            {ticket.asset && (
              <div className="bg-card border border-border rounded-xl shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Monitor className="w-3.5 h-3.5" />
                    Ativo Relacionado
                  </h3>
                  {isTechnician && !['resolved', 'closed', 'cancelled'].includes(ticket.status) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      onClick={() => setShowSwapDialog(true)}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Trocar
                    </Button>
                  )}
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Nome</dt>
                    <dd className="font-medium">{ticket.asset.name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Patrimônio</dt>
                    <dd className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{ticket.asset.asset_tag}</dd>
                  </div>
                  {ticket.asset.serial_number && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Nº Série</dt>
                      <dd className="font-mono text-xs">{ticket.asset.serial_number}</dd>
                    </div>
                  )}
                  {ticket.asset.manufacturer && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Fabricante</dt>
                      <dd>{ticket.asset.manufacturer}</dd>
                    </div>
                  )}
                  {ticket.asset.model && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Modelo</dt>
                      <dd>{ticket.asset.model}</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            {ticket.asset && (
              <AssetSwapDialog
                open={showSwapDialog}
                onOpenChange={setShowSwapDialog}
                currentAsset={{
                  id: ticket.asset.id,
                  name: ticket.asset.name,
                  asset_tag: ticket.asset.asset_tag,
                  category: ticket.asset.category,
                  manufacturer: ticket.asset.manufacturer || null,
                  model: ticket.asset.model || null,
                  serial_number: ticket.asset.serial_number || null,
                }}
                ticketId={ticket.id}
                requesterId={ticket.requester_id}
                onSwapComplete={refetch}
                onSwap={swapAsset}
                isSwapping={isSwapping}
              />
            )}
          </aside>

        </div>
      </div>
    </div>
  );
}


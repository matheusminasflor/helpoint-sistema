import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MaintenanceWithDetails, getMaintenanceTypeLabel, getMaintenanceTypeColor, getMaintenanceStatusLabel, getMaintenanceStatusColor, formatCurrency } from '@/types/it-management';
import { useTicketByMaintenance } from '@/hooks/useLinkedMaintenances';
import { TicketStatusBadge } from '@/components/helpdesk/TicketStatusBadge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, Trash2, Calendar, DollarSign, User, Wrench, HardDrive, Building, Ticket, ExternalLink } from 'lucide-react';

interface MaintenanceDetailProps {
  maintenance: MaintenanceWithDetails;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function MaintenanceDetail({
  maintenance,
  onBack,
  onEdit,
  onDelete,
  canEdit = false,
  canDelete = false,
}: MaintenanceDetailProps) {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const { data: linkedTicket } = useTicketByMaintenance(maintenance.ticket_id);
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold">{maintenance.title}</h2>
              <Badge className={getMaintenanceStatusColor(maintenance.status)} variant="outline">
                {getMaintenanceStatusLabel(maintenance.status)}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Badge className={getMaintenanceTypeColor(maintenance.maintenance_type)} variant="outline">
                {getMaintenanceTypeLabel(maintenance.maintenance_type)}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <Button variant="outline" onClick={onEdit}>
              <Edit className="h-4 w-4 mr-2" />
              Editar
            </Button>
          )}
          {canDelete && (
            <Button variant="destructive" onClick={onDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </Button>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              Ativo
            </CardDescription>
          </CardHeader>
          <CardContent>
            {maintenance.asset ? (
              <div>
                <p className="text-lg font-semibold">{maintenance.asset.name}</p>
                <p className="text-sm text-muted-foreground">{maintenance.asset.asset_tag}</p>
              </div>
            ) : (
              <p className="text-muted-foreground">-</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Datas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {maintenance.scheduled_date && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Agendada:</span>{' '}
                  {format(new Date(maintenance.scheduled_date), 'dd/MM/yyyy', { locale: ptBR })}
                </p>
              )}
              {maintenance.completed_date && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Concluída:</span>{' '}
                  {format(new Date(maintenance.completed_date), 'dd/MM/yyyy', { locale: ptBR })}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Custo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{formatCurrency(maintenance.cost)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Técnico
            </CardDescription>
          </CardHeader>
          <CardContent>
            {maintenance.technician ? (
              <div>
                <p className="text-lg font-semibold">{maintenance.technician.full_name || 'Sem nome'}</p>
                <p className="text-sm text-muted-foreground">{maintenance.technician.email}</p>
              </div>
            ) : (
              <p className="text-muted-foreground">Não atribuído</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* External Provider */}
      {maintenance.external_provider && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building className="h-4 w-4" />
              Fornecedor Externo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>{maintenance.external_provider}</p>
          </CardContent>
        </Card>
      )}

      {/* Description */}
      {maintenance.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Descrição</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{maintenance.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Related Ticket */}
      {(maintenance.ticket_id && linkedTicket) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Ticket className="h-4 w-4" />
              Chamado Vinculado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="font-medium">#{linkedTicket.ticket_number} — {linkedTicket.title}</p>
                <div className="flex items-center gap-2">
                  <TicketStatusBadge status={linkedTicket.status} />
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => navigate(tenantPath(`/ti/chamados/${linkedTicket.id}`))}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Abrir
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {(maintenance.ticket_id && !linkedTicket) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Ticket className="h-4 w-4" />
              Chamado Vinculado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">ID: {maintenance.ticket_id}</p>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {maintenance.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{maintenance.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

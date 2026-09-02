import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { MaintenanceWithDetails, getMaintenanceTypeLabel, getMaintenanceTypeColor, getMaintenanceStatusLabel, getMaintenanceStatusColor, formatCurrency } from '@/types/it-management';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Wrench } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

interface MaintenanceTableProps {
  maintenances: MaintenanceWithDetails[];
  onSelect: (maintenance: MaintenanceWithDetails) => void;
  isLoading?: boolean;
}

export function MaintenanceTable({ maintenances, onSelect, isLoading }: MaintenanceTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        Carregando manutenções...
      </div>
    );
  }

  if (maintenances.length === 0) {
    return (
      <EmptyState
        icon={Wrench}
        title="Nenhuma manutenção registrada"
        description="Registre reparos e revisões dos equipamentos para manter o histórico completo de cada ativo."
      />
    );
  }

  return (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Título</TableHead>
            <TableHead>Ativo</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Data</TableHead>
            <TableHead>Custo</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {maintenances.map((maintenance) => (
            <TableRow
              key={maintenance.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => onSelect(maintenance)}
            >
              <TableCell>
                <p className="font-medium">{maintenance.title}</p>
                {maintenance.technician && (
                  <p className="text-sm text-muted-foreground">
                    Técnico: {maintenance.technician.full_name || maintenance.technician.email}
                  </p>
                )}
              </TableCell>
              <TableCell>
                {maintenance.asset ? (
                  <div>
                    <p>{maintenance.asset.name}</p>
                    <p className="text-sm text-muted-foreground">{maintenance.asset.asset_tag}</p>
                  </div>
                ) : (
                  '-'
                )}
              </TableCell>
              <TableCell>
                <Badge className={getMaintenanceTypeColor(maintenance.maintenance_type)} variant="outline">
                  {getMaintenanceTypeLabel(maintenance.maintenance_type)}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="text-sm">
                  {maintenance.scheduled_date && (
                    <p>Agendada: {format(new Date(maintenance.scheduled_date), 'dd/MM/yyyy', { locale: ptBR })}</p>
                  )}
                  {maintenance.completed_date && (
                    <p className="text-muted-foreground">
                      Concluída: {format(new Date(maintenance.completed_date), 'dd/MM/yyyy', { locale: ptBR })}
                    </p>
                  )}
                </div>
              </TableCell>
              <TableCell>{formatCurrency(maintenance.cost)}</TableCell>
              <TableCell>
                <Badge className={getMaintenanceStatusColor(maintenance.status)} variant="outline">
                  {getMaintenanceStatusLabel(maintenance.status)}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

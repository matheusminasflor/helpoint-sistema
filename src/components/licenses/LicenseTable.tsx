import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { LicenseWithAssignments, getLicenseTypeLabel, isExpired, isExpiringWithinDays, LICENSE_ITEM_CATEGORY_LABEL } from '@/types/it-management';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, CheckCircle, XCircle, KeyRound } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

interface LicenseTableProps {
  licenses: LicenseWithAssignments[];
  onSelect: (license: LicenseWithAssignments) => void;
  isLoading?: boolean;
}

export function LicenseTable({ licenses, onSelect, isLoading }: LicenseTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        Carregando licenças...
      </div>
    );
  }

  if (licenses.length === 0) {
    return (
      <EmptyState
        icon={KeyRound}
        title="Nenhuma licença cadastrada"
        description="Cadastre licenças de software e domínios para acompanhar prazos, custos e responsáveis em um só lugar."
      />
    );
  }

  const getExpiryStatus = (expiryDate: string | null) => {
    if (!expiryDate) return null;
    if (isExpired(expiryDate)) {
      return { icon: XCircle, color: 'text-destructive', label: 'Expirada' };
    }
    if (isExpiringWithinDays(expiryDate, 30)) {
      return { icon: AlertTriangle, color: 'text-yellow-500', label: 'Expirando' };
    }
    return { icon: CheckCircle, color: 'text-green-500', label: 'Válida' };
  };

  return (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Uso</TableHead>
            <TableHead>Validade</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {licenses.map((license) => {
            const isSoftware = (license.item_category || 'software') === 'software';
            const usagePercent = isSoftware && license.total_quantity > 0
              ? (license.used_quantity / license.total_quantity) * 100
              : 0;
            const expiryStatus = getExpiryStatus(license.expiry_date);

            return (
              <TableRow
                key={license.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onSelect(license)}
              >
                <TableCell className="font-medium">
                  {license.name}
                  {!isSoftware && license.domain && (
                    <div className="text-xs text-muted-foreground">{license.domain}</div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {LICENSE_ITEM_CATEGORY_LABEL[license.item_category || 'software']}
                  </Badge>
                </TableCell>
                <TableCell>
                  {isSoftware ? (
                    <Badge variant="outline">{getLicenseTypeLabel(license.license_type)}</Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {isSoftware ? (
                    <div className="flex items-center gap-2 min-w-[140px]">
                      <Progress value={usagePercent} className="h-2 flex-1" />
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        {license.used_quantity}/{license.total_quantity}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {license.expiry_date
                    ? format(new Date(license.expiry_date), 'dd/MM/yyyy', { locale: ptBR })
                    : 'Perpétua'}
                </TableCell>
                <TableCell>
                  {expiryStatus ? (
                    <div className={`flex items-center gap-1 ${expiryStatus.color}`}>
                      <expiryStatus.icon className="h-4 w-4" />
                      <span className="text-sm">{expiryStatus.label}</span>
                    </div>
                  ) : (
                    <Badge variant={license.is_active ? 'default' : 'secondary'}>
                      {license.is_active ? 'Ativa' : 'Inativa'}
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

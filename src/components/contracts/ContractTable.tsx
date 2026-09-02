import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { SoftwareContract, getContractStatusLabel, getContractStatusColor, getPaymentFrequencyLabel, formatCurrency, getDaysUntilExpiry } from '@/types/it-management';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, RefreshCw, FileText } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

interface ContractTableProps {
  contracts: SoftwareContract[];
  onSelect: (contract: SoftwareContract) => void;
  isLoading?: boolean;
}

export function ContractTable({ contracts, onSelect, isLoading }: ContractTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        Carregando contratos...
      </div>
    );
  }

  if (contracts.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Nenhum contrato cadastrado"
        description="Registre contratos para acompanhar vigência, valores e renovações sem depender de planilhas."
      />
    );
  }

  return (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Fornecedor</TableHead>
            <TableHead>Período</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Pagamento</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contracts.map((contract) => {
            const daysUntilExpiry = getDaysUntilExpiry(contract.end_date);
            const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry > 0 && daysUntilExpiry <= contract.renewal_alert_days;

            return (
              <TableRow
                key={contract.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onSelect(contract)}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{contract.name}</span>
                    {contract.auto_renew && (
                      <RefreshCw className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                  {contract.contract_number && (
                    <p className="text-sm text-muted-foreground">#{contract.contract_number}</p>
                  )}
                </TableCell>
                <TableCell>{contract.vendor}</TableCell>
                <TableCell>
                  <div className="text-sm">
                    <p>{format(new Date(contract.start_date), 'dd/MM/yyyy', { locale: ptBR })}</p>
                    <p className="text-muted-foreground">até {format(new Date(contract.end_date), 'dd/MM/yyyy', { locale: ptBR })}</p>
                  </div>
                </TableCell>
                <TableCell>{formatCurrency(contract.value)}</TableCell>
                <TableCell>
                  {contract.payment_frequency ? getPaymentFrequencyLabel(contract.payment_frequency) : '-'}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Badge className={getContractStatusColor(contract.status)} variant="outline">
                      {getContractStatusLabel(contract.status)}
                    </Badge>
                    {isExpiringSoon && (
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

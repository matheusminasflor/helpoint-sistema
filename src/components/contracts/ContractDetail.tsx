import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SoftwareContract, getContractStatusLabel, getContractStatusColor, getPaymentFrequencyLabel, formatCurrency, getDaysUntilExpiry } from '@/types/it-management';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowLeft, Edit, Trash2, Calendar, DollarSign, User, Phone, Mail, FileText, RefreshCw, AlertTriangle, ExternalLink } from 'lucide-react';

interface ContractDetailProps {
  contract: SoftwareContract;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function ContractDetail({
  contract,
  onBack,
  onEdit,
  onDelete,
  canEdit = false,
  canDelete = false,
}: ContractDetailProps) {
  const daysUntilExpiry = getDaysUntilExpiry(contract.end_date);
  const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry > 0 && daysUntilExpiry <= contract.renewal_alert_days;
  const isExpired = daysUntilExpiry !== null && daysUntilExpiry < 0;

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
              <h2 className="text-2xl font-bold">{contract.name}</h2>
              <Badge className={getContractStatusColor(contract.status)} variant="outline">
                {getContractStatusLabel(contract.status)}
              </Badge>
              {contract.auto_renew && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <RefreshCw className="h-3 w-3" />
                  Auto-renovação
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              {contract.vendor}
              {contract.contract_number && ` • #${contract.contract_number}`}
            </p>
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

      {/* Alert Banner */}
      {(isExpiringSoon || isExpired) && (
        <Card className={`${isExpired ? 'border-destructive bg-destructive/5' : 'border-yellow-500 bg-yellow-500/5'}`}>
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className={`h-5 w-5 ${isExpired ? 'text-destructive' : 'text-yellow-500'}`} />
            <div>
              <p className={`font-medium ${isExpired ? 'text-destructive' : 'text-yellow-600'}`}>
                {isExpired
                  ? `Contrato expirado há ${Math.abs(daysUntilExpiry!)} dias`
                  : `Contrato expira em ${daysUntilExpiry} dias`}
              </p>
              <p className="text-sm text-muted-foreground">
                {isExpired
                  ? 'Entre em contato com o fornecedor para renovação.'
                  : `Alerta configurado para ${contract.renewal_alert_days} dias antes do vencimento.`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Início
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">
              {format(new Date(contract.start_date), 'dd/MM/yyyy', { locale: ptBR })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Término
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">
              {format(new Date(contract.end_date), 'dd/MM/yyyy', { locale: ptBR })}
            </p>
            {daysUntilExpiry !== null && !isExpired && (
              <p className="text-sm text-muted-foreground">
                {daysUntilExpiry} dias restantes
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Valor
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{formatCurrency(contract.value)}</p>
            {contract.payment_frequency && (
              <p className="text-sm text-muted-foreground">
                {getPaymentFrequencyLabel(contract.payment_frequency)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Nº Contrato
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{contract.contract_number || '-'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Description */}
      {contract.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Descrição</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{contract.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Contact Info */}
      {(contract.contact_name || contract.contact_email || contract.contact_phone) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contato do Fornecedor</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {contract.contact_name && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span>{contract.contact_name}</span>
                </div>
              )}
              {contract.contact_email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${contract.contact_email}`} className="text-primary hover:underline">
                    {contract.contact_email}
                  </a>
                </div>
              )}
              {contract.contact_phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{contract.contact_phone}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Document */}
      {contract.document_url && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documento</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <a href={contract.document_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Abrir Documento
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {contract.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{contract.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

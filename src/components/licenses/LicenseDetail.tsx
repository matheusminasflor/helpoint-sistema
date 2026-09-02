import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LicenseWithAssignments, getLicenseTypeLabel, formatCurrency, getDaysUntilExpiry, LICENSE_ITEM_CATEGORY_LABEL } from '@/types/it-management';
import { useLicenseRenewals } from '@/hooks/useLicenseRenewals';
import { RenewLicenseDialog } from './RenewLicenseDialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowLeft, Edit, Trash2, UserPlus, UserMinus, Key, Calendar, DollarSign, Package, Globe, ExternalLink, User, RefreshCw, History } from 'lucide-react';


interface LicenseDetailProps {
  license: LicenseWithAssignments;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAssign: () => void;
  onUnassign: (assignmentId: string) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function LicenseDetail({
  license,
  onBack,
  onEdit,
  onDelete,
  onAssign,
  onUnassign,
  canEdit = false,
  canDelete = false,
}: LicenseDetailProps) {
  const isSoftware = (license.item_category || 'software') === 'software';
  const isRenewable = !isSoftware; // domínios, hospedagem, SSL, serviços online
  const usagePercent = isSoftware && license.total_quantity > 0
    ? (license.used_quantity / license.total_quantity) * 100
    : 0;
  const daysUntilExpiry = getDaysUntilExpiry(license.expiry_date);
  const [renewOpen, setRenewOpen] = useState(false);
  const { data: renewals = [] } = useLicenseRenewals(isRenewable ? license.id : null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold">{license.name}</h2>
            <p className="text-muted-foreground">{license.vendor || 'Fabricante não informado'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {isRenewable && canEdit && (
            <Button onClick={() => setRenewOpen(true)} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Renovar
            </Button>
          )}



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
              <Package className="h-4 w-4" />
              Tipo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{getLicenseTypeLabel(license.license_type)}</p>
          </CardContent>
        </Card>

        {isSoftware && (
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Key className="h-4 w-4" />
                Disponibilidade
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{license.used_quantity} em uso</span>
                  <span>{license.available_quantity} disponíveis</span>
                </div>
                <Progress value={usagePercent} className="h-2" />
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Validade
            </CardDescription>
          </CardHeader>
          <CardContent>
            {license.expiry_date ? (
              <div>
                <p className="text-xl font-semibold">
                  {format(new Date(license.expiry_date), 'dd/MM/yyyy', { locale: ptBR })}
                </p>
                {daysUntilExpiry !== null && (
                  <p className={`text-sm ${daysUntilExpiry < 0 ? 'text-destructive' : daysUntilExpiry <= 30 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                    {daysUntilExpiry < 0
                      ? `Expirada há ${Math.abs(daysUntilExpiry)} dias`
                      : `${daysUntilExpiry} dias restantes`}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xl font-semibold">Perpétua</p>
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
            <p className="text-xl font-semibold">{formatCurrency(license.purchase_value)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Web fields */}
      {(license.domain || license.public_url || license.admin_url || license.internal_owner || license.technical_notes) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="w-4 h-4" /> {LICENSE_ITEM_CATEGORY_LABEL[license.item_category || 'software']}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 text-sm">
            {license.domain && <div><div className="text-xs text-muted-foreground">Domínio</div><div className="font-medium">{license.domain}</div></div>}
            {license.public_url && <div><div className="text-xs text-muted-foreground">URL pública</div><a href={license.public_url} target="_blank" rel="noreferrer" className="font-medium text-primary inline-flex items-center gap-1">{license.public_url} <ExternalLink className="w-3 h-3" /></a></div>}
            {license.admin_url && <div className="md:col-span-2"><div className="text-xs text-muted-foreground">Painel/admin</div><a href={license.admin_url} target="_blank" rel="noreferrer" className="font-medium text-primary inline-flex items-center gap-1">{license.admin_url} <ExternalLink className="w-3 h-3" /></a></div>}
            {license.internal_owner && <div><div className="text-xs text-muted-foreground">Responsável</div><div className="font-medium inline-flex items-center gap-1"><User className="w-3 h-3" />{license.internal_owner}</div></div>}
            {license.technical_notes && <div className="md:col-span-2"><div className="text-xs text-muted-foreground">Observações técnicas</div><div className="whitespace-pre-wrap text-sm">{license.technical_notes}</div></div>}
          </CardContent>
        </Card>
      )}

      {/* License Key */}
      {license.license_key && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Chave da Licença</CardTitle>
          </CardHeader>
          <CardContent>
            <code className="bg-muted px-3 py-2 rounded block font-mono text-sm">
              {license.license_key}
            </code>
          </CardContent>
        </Card>
      )}

      {/* Assignments (only for software with seats) */}
      {isSoftware && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Atribuições</CardTitle>
              <CardDescription>
                {license.used_quantity} de {license.total_quantity} licenças em uso
              </CardDescription>
            </div>
            {canEdit && license.available_quantity > 0 && (
              <Button onClick={onAssign} size="sm">
                <UserPlus className="h-4 w-4 mr-2" />
                Atribuir
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {license.assignments.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                Nenhuma atribuição registrada
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Atribuído a</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Atribuído por</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {license.assignments.map((assignment) => (
                    <TableRow key={assignment.id}>
                      <TableCell>
                        {assignment.assigned_user ? (
                          <div>
                            <p className="font-medium">{assignment.assigned_user.full_name || assignment.assigned_user.email}</p>
                            <p className="text-sm text-muted-foreground">{assignment.assigned_user.email}</p>
                          </div>
                        ) : assignment.asset ? (
                          <div>
                            <p className="font-medium">{assignment.asset.name}</p>
                            <p className="text-sm text-muted-foreground">{assignment.asset.asset_tag}</p>
                          </div>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        {format(new Date(assignment.assigned_at), 'dd/MM/yyyy', { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        {assignment.assigned_by_user?.full_name || '-'}
                      </TableCell>
                      <TableCell>
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onUnassign(assignment.id)}
                          >
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {license.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{license.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Renewal history (only for domain/hosting/ssl/online_service/other) */}
      {isRenewable && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-4 h-4" />
              Histórico de renovações
            </CardTitle>
            <CardDescription>
              Cada renovação registra o período anterior, o novo período, valor pago e fornecedor.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {renewals.length === 0 ? (
              <p className="text-muted-foreground text-center py-4 text-sm">
                Nenhuma renovação registrada ainda. Use o botão "Renovar" no topo para iniciar.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Registrada em</TableHead>
                    <TableHead>Período anterior</TableHead>
                    <TableHead>Novo período</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Observações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {renewals.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">
                        {format(new Date(r.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.previous_purchase_date ? format(new Date(r.previous_purchase_date), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                        {' → '}
                        {r.previous_expiry_date ? format(new Date(r.previous_expiry_date), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {r.new_purchase_date ? format(new Date(r.new_purchase_date), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                        {' → '}
                        {r.new_expiry_date ? format(new Date(r.new_expiry_date), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                      </TableCell>
                      <TableCell className="text-sm">{formatCurrency(r.renewal_value)}</TableCell>
                      <TableCell className="text-sm">{r.provider || '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{r.notes || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <RenewLicenseDialog
        license={license}
        open={renewOpen}
        onClose={() => setRenewOpen(false)}
      />
    </div>
  );
}


import { useState, useEffect } from 'react';
import { Pencil, Info, Clock, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSLAPolicies, SLAPolicy } from '@/hooks/useSLAPolicies';
import { TenantSettings } from '@/hooks/useTenantSettings';

const PRIORITY_LABELS: Record<string, string> = {
  critical: 'Crítico',
  high: 'Alto',
  medium: 'Médio',
  low: 'Baixo',
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'destructive',
  high: 'default',
  medium: 'secondary',
  low: 'outline',
};

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

interface SLAPoliciesTabProps {
  tenantSettings?: TenantSettings;
  settingsLoading?: boolean;
  onSettingsChange?: (key: keyof TenantSettings['alerts'], value: number | boolean) => void;
}

export function SLAPoliciesTab({ tenantSettings, settingsLoading, onSettingsChange }: SLAPoliciesTabProps) {
  const { policies, isLoading, updatePolicy } = useSLAPolicies();
  const [editing, setEditing] = useState<SLAPolicy | null>(null);
  const [form, setForm] = useState({ name: '', first_response_time: 0, resolution_time: 0, is_active: true });

  // Local state for sliders to provide real-time feedback without spamming saves.
  // The actual save is dispatched via onValueCommit (when user releases the thumb).
  const [localSlaPct, setLocalSlaPct] = useState<number>(
    tenantSettings?.alerts?.slaWarningPercentage ?? 75
  );
  const [localContractDays, setLocalContractDays] = useState<number>(
    tenantSettings?.alerts?.contractAlertDays ?? 30
  );
  const [localLicenseDays, setLocalLicenseDays] = useState<number>(
    tenantSettings?.alerts?.licenseAlertDays ?? 30
  );

  // Re-sync local state when tenantSettings refreshes (e.g. after invalidation)
  useEffect(() => {
    if (tenantSettings?.alerts?.slaWarningPercentage !== undefined) {
      setLocalSlaPct(tenantSettings.alerts.slaWarningPercentage);
    }
    if (tenantSettings?.alerts?.contractAlertDays !== undefined) {
      setLocalContractDays(tenantSettings.alerts.contractAlertDays);
    }
    if (tenantSettings?.alerts?.licenseAlertDays !== undefined) {
      setLocalLicenseDays(tenantSettings.alerts.licenseAlertDays);
    }
  }, [
    tenantSettings?.alerts?.slaWarningPercentage,
    tenantSettings?.alerts?.contractAlertDays,
    tenantSettings?.alerts?.licenseAlertDays,
  ]);

  const openEdit = (policy: SLAPolicy) => {
    setEditing(policy);
    setForm({
      name: policy.name,
      first_response_time: policy.first_response_time,
      resolution_time: policy.resolution_time,
      is_active: policy.is_active,
    });
  };

  const handleSave = async () => {
    if (!editing) return;
    await updatePolicy.mutateAsync({
      id: editing.id,
      name: form.name,
      first_response_time: form.first_response_time,
      resolution_time: form.resolution_time,
      is_active: form.is_active,
    });
    setEditing(null);
  };

  const handleToggleActive = (policy: SLAPolicy) => {
    updatePolicy.mutate({ id: policy.id, is_active: !policy.is_active });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          SLA e Prazos
        </CardTitle>
        <CardDescription>
          Configure tempos, alertas e prazos do módulo de TI
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Section 1: SLA Policies Table */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : policies.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">
            Nenhuma política de SLA encontrada.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prioridade</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead className="text-center">1ª Resposta</TableHead>
                <TableHead className="text-center">Resolução</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {policies.map(policy => (
                <TableRow key={policy.id} className={!policy.is_active ? 'opacity-50' : ''}>
                  <TableCell>
                    <Badge variant={PRIORITY_COLORS[policy.priority] as any}>
                      {PRIORITY_LABELS[policy.priority] || policy.priority}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{policy.name}</TableCell>
                  <TableCell className="text-center">{formatMinutes(policy.first_response_time)}</TableCell>
                  <TableCell className="text-center">{formatMinutes(policy.resolution_time)}</TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={policy.is_active}
                      onCheckedChange={() => handleToggleActive(policy)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(policy)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-sm">
          <Info className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <p className="text-muted-foreground">
            Os tempos de SLA são calculados automaticamente ao criar um chamado.
            O usuário pode alterar o prazo manualmente depois.
          </p>
        </div>

        {/* Section 2: Alerts & Notifications */}
        <Separator />

        <div className="space-y-1">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Alertas e Notificações
          </h3>
          <p className="text-sm text-muted-foreground">
            Configure quando os alertas devem ser disparados
          </p>
        </div>

        {settingsLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Notificações por Email</Label>
                <p className="text-sm text-muted-foreground">
                  Enviar alertas por email para supervisores
                </p>
              </div>
              <Switch
                checked={tenantSettings?.alerts?.emailNotifications ?? true}
                onCheckedChange={(checked) => onSettingsChange?.('emailNotifications', checked)}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Alerta de SLA</Label>
                <span className="text-sm font-medium">
                  {localSlaPct}% do tempo
                </span>
              </div>
              <Slider
                value={[localSlaPct]}
                onValueChange={([value]) => setLocalSlaPct(value)}
                onValueCommit={([value]) => onSettingsChange?.('slaWarningPercentage', value)}
                min={50}
                max={95}
                step={5}
              />
              <p className="text-xs text-muted-foreground">
                Alertar quando o chamado atingir este percentual do tempo de SLA
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Alerta de Contratos</Label>
                <span className="text-sm font-medium">
                  {localContractDays} dias antes
                </span>
              </div>
              <Slider
                value={[localContractDays]}
                onValueChange={([value]) => setLocalContractDays(value)}
                onValueCommit={([value]) => onSettingsChange?.('contractAlertDays', value)}
                min={7}
                max={90}
                step={7}
              />
              <p className="text-xs text-muted-foreground">
                Alertar sobre contratos expirando com esta antecedência
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Alerta de Licenças</Label>
                <span className="text-sm font-medium">
                  {localLicenseDays} dias antes
                </span>
              </div>
              <Slider
                value={[localLicenseDays]}
                onValueChange={([value]) => setLocalLicenseDays(value)}
                onValueCommit={([value]) => onSettingsChange?.('licenseAlertDays', value)}
                min={7}
                max={90}
                step={7}
              />
              <p className="text-xs text-muted-foreground">
                Alertar sobre licenças expirando com esta antecedência
              </p>
            </div>

            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-sm">
              <Info className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <p className="text-muted-foreground">
                Os alertas são verificados automaticamente pelo sistema e notificações são
                enviadas para os supervisores e diretores.
              </p>
            </div>
          </div>
        )}
      </CardContent>

      {/* Edit SLA Policy Dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Política de SLA</DialogTitle>
            <DialogDescription>
              Altere os tempos de resposta e resolução para a prioridade{' '}
              <strong>{editing ? PRIORITY_LABELS[editing.priority] : ''}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>1ª Resposta (minutos)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.first_response_time}
                  onChange={e => setForm(f => ({ ...f, first_response_time: Number(e.target.value) }))}
                />
                <p className="text-xs text-muted-foreground">
                  = {formatMinutes(form.first_response_time)}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Resolução (minutos)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.resolution_time}
                  onChange={e => setForm(f => ({ ...f, resolution_time: Number(e.target.value) }))}
                />
                <p className="text-xs text-muted-foreground">
                  = {formatMinutes(form.resolution_time)}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label>Ativo</Label>
              <Switch
                checked={form.is_active}
                onCheckedChange={checked => setForm(f => ({ ...f, is_active: checked }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!form.name.trim() || updatePolicy.isPending}>
              {updatePolicy.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

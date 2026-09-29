// Alertas da TI — o que sobrou de `SLAPoliciesTab` quando os prazos foram para o componente
// único `PrazosDeAtendimento` (LEVA P). Eram duas coisas numa aba chamada "SLA e Prazos":
// a tabela de prazos (que editava a linha da empresa inteira) e estes alertas, que são da TI.
import { useEffect, useState } from 'react';
import { Bell, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useTenantSettings, useUpdateTenantSettings, type TenantSettings } from '@/hooks/useTenantSettings';

type ChaveDeAlerta = keyof NonNullable<TenantSettings['alerts']>;

export function AlertasTab() {
  const { data: tenantSettings, isLoading } = useTenantSettings();
  const updateSettings = useUpdateTenantSettings();

  const mudar = (key: ChaveDeAlerta, value: number | boolean) => {
    // A chave liga/desliga avisa que salvou; o controle deslizante salva calado — ele já mostra
    // o valor enquanto se arrasta.
    updateSettings.mutate({
      settings: { alerts: { ...tenantSettings?.alerts, [key]: value } },
      silent: typeof value === 'number',
    });
  };

  // Estado local para o controle deslizante responder enquanto se arrasta; grava ao soltar.
  const [slaPct, setSlaPct] = useState(tenantSettings?.alerts?.slaWarningPercentage ?? 75);
  const [contratoDias, setContratoDias] = useState(tenantSettings?.alerts?.contractAlertDays ?? 30);
  const [licencaDias, setLicencaDias] = useState(tenantSettings?.alerts?.licenseAlertDays ?? 30);

  useEffect(() => {
    const a = tenantSettings?.alerts;
    if (a?.slaWarningPercentage !== undefined) setSlaPct(a.slaWarningPercentage);
    if (a?.contractAlertDays !== undefined) setContratoDias(a.contractAlertDays);
    if (a?.licenseAlertDays !== undefined) setLicencaDias(a.licenseAlertDays);
  }, [tenantSettings?.alerts]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Bell className="h-4 w-4" />Alertas e notificações</CardTitle>
        <CardDescription>Quando o sistema avisa sobre prazo de chamado, contrato e licença.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Notificações por e-mail</Label>
                <p className="text-sm text-muted-foreground">Enviar alertas por e-mail para supervisores</p>
              </div>
              <Switch
                checked={tenantSettings?.alerts?.emailNotifications ?? true}
                onCheckedChange={(checked) => mudar('emailNotifications', checked)}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Alerta de prazo do chamado</Label>
                <span className="text-sm font-medium">{slaPct}% do tempo</span>
              </div>
              <Slider value={[slaPct]} onValueChange={([v]) => setSlaPct(v)}
                onValueCommit={([v]) => mudar('slaWarningPercentage', v)} min={50} max={95} step={5} />
              <p className="text-xs text-muted-foreground">Alertar quando o chamado atingir este percentual do prazo</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Alerta de contratos</Label>
                <span className="text-sm font-medium">{contratoDias} dias antes</span>
              </div>
              <Slider value={[contratoDias]} onValueChange={([v]) => setContratoDias(v)}
                onValueCommit={([v]) => mudar('contractAlertDays', v)} min={7} max={90} step={7} />
              <p className="text-xs text-muted-foreground">Alertar sobre contratos vencendo com esta antecedência</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Alerta de licenças</Label>
                <span className="text-sm font-medium">{licencaDias} dias antes</span>
              </div>
              <Slider value={[licencaDias]} onValueChange={([v]) => setLicencaDias(v)}
                onValueCommit={([v]) => mudar('licenseAlertDays', v)} min={7} max={90} step={7} />
              <p className="text-xs text-muted-foreground">Alertar sobre licenças vencendo com esta antecedência</p>
            </div>

            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-sm">
              <Info className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <p className="text-muted-foreground">
                Os alertas são verificados automaticamente e as notificações vão para supervisores e diretores.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

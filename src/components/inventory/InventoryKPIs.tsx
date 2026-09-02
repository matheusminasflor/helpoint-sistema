import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Package, Monitor, Mouse, Keyboard, Printer, Smartphone, Wifi, Wrench, CheckCircle2, Archive } from 'lucide-react';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { KPICard } from '@/components/glpi/KPICard';
import { useInventoryAssets } from '@/hooks/useInventory';
import type { AssetCategory, AssetStatus } from '@/types/helpdesk';

const STATUS_LABEL: Record<AssetStatus, string> = {
  active: 'Em uso',
  inactive: 'Em estoque',
  maintenance: 'Em manutenção',
  decommissioned: 'Descartado',
  in_use: 'Em uso',
  in_stock: 'Em estoque',
};

const CATEGORY_LABEL: Record<AssetCategory, string> = {
  hardware: 'Hardware',
  mobile: 'Móveis',
  peripheral: 'Periféricos',
  network: 'Rede',
  software: 'Software',
  other: 'Outros',
};

// Subcategorias que costumam aparecer e ícones associados
const SUBCATEGORY_ICONS: Record<string, any> = {
  'Mouse': Mouse,
  'Teclado': Keyboard,
  'Monitor': Monitor,
  'Notebook': Monitor,
  'Desktop': Monitor,
  'Impressora': Printer,
  'Smartphone': Smartphone,
  'Tablet': Smartphone,
  'Roteador': Wifi,
  'Switch': Wifi,
};

export function InventoryKPIs() {
  const { assets, isLoading } = useInventoryAssets();

  const metrics = useMemo(() => {
    const byStatus: Record<string, number> = { active: 0, inactive: 0, maintenance: 0, decommissioned: 0 };
    const byCategory: Record<string, number> = {};
    const bySub: Record<string, { total: number; active: number; inactive: number }> = {};

    (assets || []).forEach(a => {
      byStatus[a.status] = (byStatus[a.status] || 0) + 1;
      byCategory[a.category] = (byCategory[a.category] || 0) + 1;
      const sub = a.subcategory || 'Sem subcategoria';
      if (!bySub[sub]) bySub[sub] = { total: 0, active: 0, inactive: 0 };
      bySub[sub].total++;
      if (a.status === 'active') bySub[sub].active++;
      if (a.status === 'inactive') bySub[sub].inactive++;
    });

    const subRows = Object.entries(bySub)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 8);

    return { total: assets?.length || 0, byStatus, byCategory, subRows };
  }, [assets]);

  if (isLoading) {
    return <div className="h-32 animate-pulse bg-muted/40 rounded-lg" />;
  }

  return (
    <div className="space-y-4">
      <KPIGrid lgCols={5}>
        <KPICard value={metrics.total} label="Total de ativos" icon={Package} color="blue" />
        <KPICard value={metrics.byStatus.active || 0} label="Em uso" icon={CheckCircle2} color="green" />
        <KPICard value={metrics.byStatus.inactive || 0} label="Em estoque" icon={Archive} color="grey" />
        <KPICard value={metrics.byStatus.maintenance || 0} label="Em manutenção" icon={Wrench} color="yellow" />
        <KPICard value={metrics.byStatus.decommissioned || 0} label="Descartados" icon={Package} color="red" />
      </KPIGrid>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Por subcategoria</h3>
        {metrics.subRows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhum ativo cadastrado.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {metrics.subRows.map(([name, v]) => {
              const Icon = SUBCATEGORY_ICONS[name] || Package;
              return (
                <div key={name} className="flex items-center gap-3 p-3 rounded-md border border-border bg-card">
                  <div className="p-2 rounded bg-primary/10 text-primary shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{name}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono font-semibold text-foreground">{v.total}</span> total
                      {' · '}
                      <span className="text-green-600">{v.active}</span> em uso
                      {' · '}
                      <span>{v.inactive}</span> estoque
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Por categoria</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Object.entries(metrics.byCategory).map(([cat, count]) => (
            <div key={cat} className="p-3 rounded-md border border-border bg-card">
              <p className="text-xs text-muted-foreground">{CATEGORY_LABEL[cat as AssetCategory] || cat}</p>
              <p className="text-xl font-bold text-foreground">{count}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

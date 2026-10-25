import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WorkOSStatsCardProps {
  icon: LucideIcon;
  label: string;
  value: number | string;
  change?: { value: number; trend: 'up' | 'down' | 'stable' };
  color?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}

// A cara nova (etapa 2, 2ª parte, 2026-10-25), a mesma do KPICard: rótulo em cima, número embaixo, sem ícone em
// círculo colorido e sem sombra. Cor só no dado: o vermelho no número que pede ação (`danger`), e zero não ganha cor.
// Mora dentro de uma `.faixa-de-numeros` (Manutenções, Contratos, Licenças, Tutoriais).
export function WorkOSStatsCard({ icon: Icon, label, value, change, color = 'default', className }: WorkOSStatsCardProps) {
  const TrendIcon = change?.trend === 'up' ? TrendingUp : change?.trend === 'down' ? TrendingDown : Minus;
  const alerta = color === 'danger' && value !== 0 && value !== '0';
  return (
    <div className={cn('kpi-tile flex-col items-start justify-start gap-1 min-h-0', className)}>
      <span className="kpi-tile-label text-muted-foreground flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> {label}
      </span>
      <span className={cn('kpi-tile-number tabular-nums', alerta && 'text-status-danger')}>{value}</span>
      {change && (
        <span className={cn('flex items-center gap-1 text-[12px]', change.trend === 'down' ? 'text-status-danger' : 'text-muted-foreground')}>
          <TrendIcon className="h-3 w-3" aria-hidden="true" />
          {change.value > 0 ? '+' : ''}{change.value}%
        </span>
      )}
    </div>
  );
}

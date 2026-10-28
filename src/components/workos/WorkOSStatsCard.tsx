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

const ICONE: Record<NonNullable<WorkOSStatsCardProps['color']>, string> = {
  default: 'kpi-icone-lilas',
  success: 'kpi-icone-verde',
  warning: 'kpi-icone-amarelo',
  danger: 'kpi-icone-vermelho',
  info: 'kpi-icone-azul',
};

// O cartão de número da DashStack (2026-10-28), o mesmo do KPICard: rótulo em cima, número grande, o ícone no quadrado
// colorido à direita e a tendência embaixo. O vermelho no número que pede ação (`danger`), e zero não ganha cor.
// Mora dentro de uma `.faixa-de-numeros` (Manutenções, Contratos, Licenças, Tutoriais).
export function WorkOSStatsCard({ icon: Icon, label, value, change, color = 'default', className }: WorkOSStatsCardProps) {
  const TrendIcon = change?.trend === 'up' ? TrendingUp : change?.trend === 'down' ? TrendingDown : Minus;
  const alerta = color === 'danger' && value !== 0 && value !== '0';
  return (
    <div className={cn('kpi-tile items-start gap-3 min-h-0', className)}>
      <div className="flex flex-col gap-1 min-w-0">
        <span className="kpi-tile-label text-foreground">{label}</span>
        <span className={cn('kpi-tile-number tabular-nums mt-2', alerta && 'text-status-danger')}>{value}</span>
        {change && (
          <span className="mt-3 flex items-center gap-1.5 text-[14px] font-semibold text-muted-foreground">
            <TrendIcon className={cn('h-5 w-5', change.trend === 'down' ? 'text-aviso' : 'text-status-success')} aria-hidden="true" />
            <span className={change.trend === 'down' ? 'text-aviso' : 'text-status-success'}>{change.value > 0 ? '+' : ''}{change.value}%</span>
          </span>
        )}
      </div>
      <span className={cn('w-[60px] h-[60px] rounded-[23px] shrink-0 flex items-center justify-center max-sm:w-11 max-sm:h-11 max-sm:rounded-[16px]', ICONE[color])}>
        <Icon className="w-7 h-7 max-sm:w-5 max-sm:h-5" aria-hidden="true" />
      </span>
    </div>
  );
}

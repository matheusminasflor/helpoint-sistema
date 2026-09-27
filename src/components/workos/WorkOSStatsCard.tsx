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

const colorMap = {
  default: 'bg-primary/10 text-primary',
  success: 'bg-status-success/10 text-status-success',
  warning: 'bg-status-warning/10 text-status-warning',
  danger: 'bg-status-danger/10 text-status-danger',
  info: 'bg-status-info/10 text-status-info',
};

export function WorkOSStatsCard({ 
  icon: Icon, 
  label, 
  value, 
  change, 
  color = 'default',
  className 
}: WorkOSStatsCardProps) {
  const TrendIcon = change?.trend === 'up' ? TrendingUp : change?.trend === 'down' ? TrendingDown : Minus;
  
  return (
    <div className={cn(
      "bg-card border border-border rounded-lg p-4 flex items-center gap-4 shadow-sm",
      className
    )}>
      <div className={cn("p-2.5 rounded-lg", colorMap[color])}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1">
        <p className="font-mono text-2xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      {change && (
        <div className={cn(
          "flex items-center gap-1 text-xs font-medium",
          change.trend === 'up' && "text-status-success",
          change.trend === 'down' && "text-status-danger",
          change.trend === 'stable' && "text-muted-foreground"
        )}>
          <TrendIcon className="h-3 w-3" />
          <span>
            {change.value > 0 ? '+' : ''}{change.value}%
          </span>
        </div>
      )}
    </div>
  );
}

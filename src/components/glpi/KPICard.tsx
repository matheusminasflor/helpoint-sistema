import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type KPIColor = 'yellow' | 'green' | 'red' | 'blue' | 'grey' | 'purple' | 'orange';

/**
 * `iconBg` traz sempre um par fundo + texto com contraste suficiente:
 * nos matizes claros (amarelo, verde, laranja) o ícone usa a variante ESCURA
 * do próprio matiz; nos escuros, branco.
 */
const colorMap: Record<KPIColor, { bg: string; iconBg: string; text: string }> = {
  yellow: { bg: 'bg-kpi-yellow', iconBg: 'bg-monday-yellow text-on-yellow', text: 'text-foreground-bright' },
  green:  { bg: 'bg-kpi-green',  iconBg: 'bg-monday-green text-on-green',   text: 'text-foreground-bright' },
  red:    { bg: 'bg-kpi-red',    iconBg: 'bg-monday-red text-white',        text: 'text-foreground-bright' },
  blue:   { bg: 'bg-kpi-blue',   iconBg: 'bg-primary text-primary-foreground', text: 'text-foreground-bright' },
  grey:   { bg: 'bg-kpi-grey',   iconBg: 'bg-status-muted text-white',      text: 'text-foreground-bright' },
  purple: { bg: 'bg-kpi-purple', iconBg: 'bg-monday-purple text-white',     text: 'text-foreground-bright' },
  orange: { bg: 'bg-kpi-orange', iconBg: 'bg-monday-orange text-on-orange', text: 'text-foreground-bright' },
};

interface KPICardProps {
  value: number | string;
  label: string;
  color?: KPIColor;
  icon?: LucideIcon;
  onClick?: () => void;
  className?: string;
}

export function KPICard({ value, label, color = 'blue', icon: Icon, onClick, className }: KPICardProps) {
  const c = colorMap[color];

  const content = (
    <>
      <div className="flex flex-col">
        <span className="kpi-tile-number">{value}</span>
        <span className="kpi-tile-label text-muted-foreground">{label}</span>
      </div>
      {Icon && (
        <div
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm',
            c.iconBg,
          )}
        >
          <Icon className="w-5 h-5" strokeWidth={2} aria-hidden="true" />
        </div>
      )}
    </>
  );

  // Sem ação: é um indicador informativo, não um botão desabilitado.
  if (!onClick) {
    return (
      <div className={cn('kpi-tile group text-left w-full cursor-default', c.bg, c.text, className)}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: ${value}. Ver lista filtrada`}
      className={cn('kpi-tile group text-left w-full min-h-11', c.bg, c.text, className)}
    >
      {content}
    </button>
  );
}

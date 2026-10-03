import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageHeader';
import { PeriodoPersonalizado } from '@/components/ui/PeriodoPersonalizado';
import { PERIODS, PERSONALIZADO, type IntervaloDeDias, type Period } from '@/lib/period';

interface DashboardHeaderProps<P extends string> {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  period?: P;
  onPeriodChange?: (p: P) => void;
  /** Override default period list (e.g. for TI which uses 'today'/'7d'/'30d'/'90d'/'year'). */
  periodOptions?: { value: string; label: string }[];
  /**
   * O intervalo em vigor quando `period` é "personalizado" — aparecem os dois
   * campos de data de `<PeriodoPersonalizado>`. Quem passa isto põe
   * `OPCOES_DE_CALENDARIO` em `periodOptions`.
   */
  intervalo?: IntervaloDeDias | null;
  onIntervaloChange?: (intervalo: IntervaloDeDias) => void;
}

const SHORT_LABELS: Record<string, string> = {
  '7d': '7 dias',
  '30d': '30 dias',
  '90d': '90 dias',
  '12m': '12 meses',
  'all': 'Tudo',
  'today': 'Hoje',
  'year': 'Ano',
};

/** @deprecated Use `PageHeader` diretamente — este componente apenas o encapsula. */
export function DashboardHeader<P extends string = Period>({
  title,
  subtitle,
  actions,
  period,
  onPeriodChange,
  periodOptions,
  intervalo,
  onIntervaloChange,
}: DashboardHeaderProps<P>) {
  const opts = periodOptions ?? PERIODS.map(p => ({ value: p.value, label: SHORT_LABELS[p.value] ?? p.label }));

  return (
    <PageHeader
      title={title}
      description={subtitle}
      className="-mx-4 lg:-mx-6 mb-6"
      actions={
        <>
          {actions}
          {period !== undefined && onPeriodChange && (
            <div className="flex gap-1 flex-wrap ml-2">
              {opts.map(o => (
                <Button
                  key={o.value}
                  size="sm"
                  variant={period === o.value ? 'default' : 'outline'}
                  onClick={() => onPeriodChange(o.value as P)}
                >
                  {SHORT_LABELS[o.value] ?? o.label}
                </Button>
              ))}
            </div>
          )}
          {period === PERSONALIZADO && intervalo && onIntervaloChange && (
            <PeriodoPersonalizado de={intervalo.de} ate={intervalo.ate} onChange={onIntervaloChange} />
          )}
        </>
      }
    />
  );
}

import { ReactNode } from 'react';
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
            // As abas da DashStack (caixa contornada, a escolhida azul); no celular rolam de lado em vez de quebrar.
            <div className="inline-flex h-9 min-w-0 max-w-full overflow-x-auto rounded-md border border-input bg-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="group" aria-label="Período">
              {opts.map(o => (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={period === o.value}
                  onClick={() => onPeriodChange(o.value as P)}
                  className={period === o.value
                    ? 'px-3.5 text-[14px] font-bold whitespace-nowrap shrink-0 border-r border-input last:border-r-0 bg-primary text-primary-foreground'
                    : 'px-3.5 text-[14px] font-semibold whitespace-nowrap shrink-0 border-r border-input last:border-r-0 text-foreground hover:bg-muted'}
                >
                  {SHORT_LABELS[o.value] ?? o.label}
                </button>
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

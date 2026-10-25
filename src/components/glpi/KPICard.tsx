import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ExplicacaoDoIndicador } from '@/components/ajuda/ExplicacaoDoIndicador';
import type { IdDaExplicacao } from '@/config/explicacoes-dos-indicadores';
import { ListaDeChamadosNoHover, type ChamadoNoHover } from '@/components/dashboard/ListaDeChamadosNoHover';

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
  /** Explicação ao passar o mouse (dono, 2026-10-04) — texto em `explicacoes-dos-indicadores.ts`. */
  explicacao?: IdDaExplicacao;
  /**
   * Os chamados por trás do número: passar o mouse mostra QUAIS são, cada um clicável (dono, 2026-10-15:
   * "ao passar o cursor em SLA violados mostrar quais"). Fica no lugar da explicação.
   */
  chamados?: ChamadoNoHover[];
  /** O setor dos chamados da lista (para onde o clique leva), quando eles não trazem o próprio. */
  modulo?: string;
  /**
   * Comparação (regra 6, etapa 3, 2026-10-24): o mesmo número no período anterior. Mostra "▲ 3 vs anterior"; a cor
   * só aparece quando piorou, segundo `melhorQuando`.
   */
  anterior?: number | null;
  melhorQuando?: 'mais' | 'menos';
}

export function KPICard({ explicacao, chamados, modulo, ...props }: KPICardProps) {
  if (chamados) {
    return (
      <ListaDeChamadosNoHover titulo={props.label} chamados={chamados} modulo={modulo} side="bottom">
        <div><KPICardSemExplicacao {...props} /></div>
      </ListaDeChamadosNoHover>
    );
  }
  if (!explicacao) return <KPICardSemExplicacao {...props} />;
  return (
    <ExplicacaoDoIndicador id={explicacao}>
      <KPICardSemExplicacao {...props} />
    </ExplicacaoDoIndicador>
  );
}

function KPICardSemExplicacao({ value, label, color = 'blue', icon: Icon, onClick, className, anterior, melhorQuando = 'mais' }: Omit<KPICardProps, 'explicacao'>) {
  const c = colorMap[color];
  // Nova cara (2026-10-24): sem ícone em círculo colorido; cor só no dado — o vermelho no número que pede ação, e
  // zero não ganha cor. Rótulo em cima, número embaixo, com algarismos de mesma largura.
  const zero = value === 0 || value === '0';
  const alerta = color === 'red' && !zero;

  const content = (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="kpi-tile-label text-muted-foreground flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />}
        {label}
      </span>
      <span className={cn('kpi-tile-number tabular-nums', alerta && 'text-status-danger')}>{value}</span>
      {anterior != null && typeof value === 'number' && (() => {
        const dif = value - anterior;
        const piorou = melhorQuando === 'mais' ? dif < 0 : dif > 0;
        return (
          <span className={cn('text-[12px] tabular-nums', piorou ? 'text-status-danger' : 'text-muted-foreground')}>
            {dif === 0 ? 'igual ao anterior' : `${dif > 0 ? '▲' : '▼'} ${Math.abs(dif)} vs anterior`}
          </span>
        );
      })()}
    </div>
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

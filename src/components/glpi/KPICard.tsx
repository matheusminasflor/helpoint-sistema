import { LucideIcon, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ExplicacaoDoIndicador } from '@/components/ajuda/ExplicacaoDoIndicador';
import type { IdDaExplicacao } from '@/config/explicacoes-dos-indicadores';
import { ListaDeChamadosNoHover, type ChamadoNoHover } from '@/components/dashboard/ListaDeChamadosNoHover';

type KPIColor = 'yellow' | 'green' | 'red' | 'blue' | 'grey' | 'purple' | 'orange';

/**
 * O cartão de número da DashStack ("Total User", "Total Order"…): o ícone fica num quadrado de 60px, cantos de 23px, com
 * a cor a 21% no fundo e a cor cheia no ícone (`.kpi-icone-*` em index.css).
 */
const colorMap: Record<KPIColor, { bg: string; iconBg: string; text: string }> = {
  yellow: { bg: 'bg-kpi-yellow', iconBg: 'kpi-icone-amarelo', text: 'text-foreground-bright' },
  green:  { bg: 'bg-kpi-green',  iconBg: 'kpi-icone-verde',   text: 'text-foreground-bright' },
  red:    { bg: 'bg-kpi-red',    iconBg: 'kpi-icone-vermelho', text: 'text-foreground-bright' },
  blue:   { bg: 'bg-kpi-blue',   iconBg: 'kpi-icone-azul',    text: 'text-foreground-bright' },
  grey:   { bg: 'bg-kpi-grey',   iconBg: 'kpi-icone-cinza',   text: 'text-foreground-bright' },
  purple: { bg: 'bg-kpi-purple', iconBg: 'kpi-icone-lilas',   text: 'text-foreground-bright' },
  orange: { bg: 'bg-kpi-orange', iconBg: 'kpi-icone-laranja', text: 'text-foreground-bright' },
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
  melhorQuando?: 'mais' | 'menos' | 'neutro';
  /** O número por trás de um `value` já formatado ("R$ 1.200,00"), para a comparação; e como mostrar a diferença. */
  numero?: number | null;
  formatarDiferenca?: (n: number) => string;
  /** Uma linha de apoio embaixo do número (a meta, por exemplo); vermelha com `notaRuim`. */
  nota?: string;
  notaRuim?: boolean;
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

function KPICardSemExplicacao({
  value, label, color = 'blue', icon: Icon, onClick, className, anterior, melhorQuando = 'mais', numero, formatarDiferenca = String,
  nota, notaRuim,
}: Omit<KPICardProps, 'explicacao'>) {
  const atual = typeof value === 'number' ? value : numero;
  const c = colorMap[color];
  // DashStack (2026-10-28): rótulo em cima, número grande, o ícone no quadrado colorido à direita e a linha de tendência
  // embaixo ("↗ 3 a mais que o anterior"), verde quando melhorou e rosa quando piorou. O número que pede ação
  // (vermelho e diferente de zero) fica vermelho. Zero também quando vem formatado ("R$ 0,00", "0%").
  const zero = numero === 0 || /^[^1-9]*0[^1-9]*$/.test(String(value));
  const alerta = color === 'red' && !zero;

  const content = (
    <div className="flex items-start justify-between gap-3 w-full min-w-0">
      <div className="flex flex-col gap-1 min-w-0">
        <span className="kpi-tile-label text-foreground">{label}</span>
        <span className={cn('kpi-tile-number tabular-nums mt-2', alerta && 'text-status-danger')}>{value}</span>
        {nota && <span className={cn('text-[14px] font-semibold', notaRuim ? 'text-status-danger' : 'text-muted-foreground')}>{nota}</span>}
        {anterior != null && atual != null && (() => {
          const dif = atual - anterior;
          const piorou = melhorQuando === 'neutro' ? false : melhorQuando === 'mais' ? dif < 0 : dif > 0;
          if (dif === 0) return <span className="mt-3 text-[14px] font-semibold text-muted-foreground">igual ao anterior</span>;
          const Seta = dif > 0 ? TrendingUp : TrendingDown;
          return (
            <span className="mt-3 flex items-center gap-1.5 text-[14px] font-semibold text-muted-foreground tabular-nums">
              <Seta className={cn('w-5 h-5 shrink-0', piorou ? 'text-aviso' : 'text-status-success')} aria-hidden="true" />
              <span className={piorou ? 'text-aviso' : 'text-status-success'}>{formatarDiferenca(Math.abs(dif))}</span>
              {dif > 0 ? 'a mais que o anterior' : 'a menos que o anterior'}
            </span>
          );
        })()}
      </div>
      {Icon && (
        <span className={cn('kpi-icone w-[60px] h-[60px] rounded-[23px] shrink-0 flex items-center justify-center', c.iconBg)}>
          <Icon className="w-7 h-7 max-sm:w-5 max-sm:h-5" strokeWidth={2} aria-hidden="true" />
        </span>
      )}
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

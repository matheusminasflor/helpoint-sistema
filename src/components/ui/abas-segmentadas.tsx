// As abas do Novo Visual (a "Day / Week / Month" da template): caixa contornada, a ativa azul cheia. Uma peça só para
// período, situação e agrupamento — antes cada tela tinha a sua (pílula, aba cinza, botão).
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function AbasSegmentadas<T extends string>({ opcoes, valor, onValor, rotulo, className }: {
  opcoes: readonly { valor: T; rotulo: ReactNode }[];
  valor: T;
  onValor: (v: T) => void;
  /** O nome do grupo para o leitor de tela ("Período", "Filtrar por situação"). */
  rotulo: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={rotulo}
      className={cn('inline-flex h-9 max-w-full overflow-x-auto rounded-md border border-input bg-card', className)}>
      {opcoes.map((o) => (
        <button key={o.valor} type="button" aria-pressed={valor === o.valor} onClick={() => onValor(o.valor)}
          className={cn('h-full shrink-0 whitespace-nowrap border-r border-input px-4 text-[14px] transition-colors last:border-r-0',
            valor === o.valor ? 'bg-primary font-bold text-primary-foreground' : 'font-semibold text-foreground hover:bg-muted')}>
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

// As abas do Novo Visual (a "Day / Week / Month" da template): caixa contornada, a ativa azul cheia. Uma peça só para
// período, situação e agrupamento — antes cada tela tinha a sua (pílula, aba cinza, botão).
// No celular (2026-10-29): com mais de 3 opções a fila de abas escondia quase todas atrás de uma rolagem lateral; lá
// ela vira a lista de escolha do próprio telefone (Hick e Jakob: todas as opções à vista, no jeito que a pessoa já
// conhece). Com até 3 opções, as abas cabem e ficam.
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const textoDe = (r: ReactNode) => (typeof r === 'string' || typeof r === 'number' ? String(r) : '');

export function AbasSegmentadas<T extends string>({ opcoes, valor, onValor, rotulo, className }: {
  opcoes: readonly { valor: T; rotulo: ReactNode }[];
  valor: T;
  onValor: (v: T) => void;
  /** O nome do grupo para o leitor de tela ("Período", "Filtrar por situação"). */
  rotulo: string;
  className?: string;
}) {
  const viraLista = opcoes.length > 3 && opcoes.every((o) => textoDe(o.rotulo));
  return (
    <>
      {viraLista && (
        <select aria-label={rotulo} value={valor} onChange={(e) => onValor(e.target.value as T)}
          className="sm:hidden h-9 max-w-full rounded-md border border-input bg-card px-3 text-[14px] font-semibold text-foreground">
          {opcoes.map((o) => <option key={o.valor} value={o.valor}>{textoDe(o.rotulo)}</option>)}
        </select>
      )}
      <div role="group" aria-label={rotulo}
        className={cn('h-9 max-w-full overflow-x-auto rounded-md border border-input bg-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          viraLista ? 'hidden sm:inline-flex' : 'inline-flex', className)}>
        {opcoes.map((o) => (
          <button key={o.valor} type="button" aria-pressed={valor === o.valor} onClick={() => onValor(o.valor)}
            className={cn('h-full shrink-0 whitespace-nowrap border-r border-input px-4 text-[14px] transition-colors last:border-r-0',
              valor === o.valor ? 'bg-primary font-bold text-primary-foreground' : 'font-semibold text-foreground hover:bg-muted')}>
            {o.rotulo}
          </button>
        ))}
      </div>
    </>
  );
}

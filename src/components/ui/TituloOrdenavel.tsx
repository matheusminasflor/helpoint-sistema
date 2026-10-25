import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Ordem } from '@/lib/tabela';

/**
 * O título de coluna que ordena (regra 4 da proposta, etapa 3, 2026-10-24): crescente, decrescente e volta à ordem da
 * tela. Usa `proximaOrdem` de `@/lib/tabela` no `onOrdenar` de quem chama.
 */
export function TituloOrdenavel<C extends string>({ coluna, ordem, onOrdenar, children, className, direita = false }: {
  coluna: C;
  ordem: Ordem<C> | null;
  onOrdenar: (coluna: C) => void;
  children: ReactNode;
  className?: string;
  direita?: boolean;
}) {
  const ativa = ordem?.coluna === coluna;
  const Seta = ordem?.direcao === 'desc' ? ArrowDown : ArrowUp;
  return (
    <th className={className} aria-sort={ativa ? (ordem!.direcao === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onOrdenar(coluna)}
        className={cn('inline-flex items-center gap-1 font-semibold hover:text-foreground', direita && 'flex-row-reverse', ativa && 'text-foreground')}
      >
        {children}
        {ativa && <Seta className="w-3 h-3" aria-hidden="true" />}
      </button>
    </th>
  );
}

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface KPIGridProps {
  children: ReactNode;
  className?: string;
  /** Number of columns on lg breakpoint (defaults to 6). */
  lgCols?: 3 | 4 | 5 | 6;
}

const lgMap: Record<number, string> = {
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
};

export function KPIGrid({ children, className, lgCols = 6 }: KPIGridProps) {
  return (
    // A faixa dividida da proposta (etapa 2, 2ª parte): os números numa faixa só, separados por linha fina
    // (`.faixa-de-numeros` em index.css), em vez de cartões soltos.
    <div className={cn('faixa-de-numeros grid grid-cols-2 md:grid-cols-3 mb-6', lgMap[lgCols], className)}>
      {children}
    </div>
  );
}

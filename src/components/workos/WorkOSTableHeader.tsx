import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Ordem } from '@/lib/tabela';
import type { ColunaDaFila } from './WorkOSTable';

interface WorkOSTableHeaderProps {
  gridCols?: string;
  simplified?: boolean;
  /** Clicar no título ordena (regra 4, etapa 3, 2026-10-24): crescente, decrescente, volta à urgência. */
  ordem?: Ordem<ColunaDaFila> | null;
  onOrdenar?: (coluna: ColunaDaFila) => void;
}

export function WorkOSTableHeader({
  gridCols = 'grid-cols-[60px_1fr_100px_80px_100px_90px]',
  simplified = false,
  ordem = null,
  onOrdenar,
}: WorkOSTableHeaderProps) {
  const titulo = (coluna: ColunaDaFila, rotulo: string, centro = true) => {
    const ativa = ordem?.coluna === coluna;
    const Seta = ordem?.direcao === 'desc' ? ArrowDown : ArrowUp;
    const conteudo = (
      <>
        {rotulo}
        {ativa && <Seta className="w-3 h-3 shrink-0" aria-hidden="true" />}
      </>
    );
    const classe = cn('flex items-center gap-1 min-w-0', centro && 'justify-center border-l border-border pl-2');
    if (!onOrdenar) return <span className={classe}>{conteudo}</span>;
    return (
      <button
        type="button"
        onClick={() => onOrdenar(coluna)}
        aria-sort={ativa ? (ordem!.direcao === 'asc' ? 'ascending' : 'descending') : undefined}
        className={cn(classe, 'hover:text-foreground text-left', ativa && 'text-foreground')}
      >
        {conteudo}
      </button>
    );
  };
  return (
    <div
      className={cn(
        'workos-table-header text-[12px] font-semibold',
        'bg-muted text-muted-foreground border-b border-border',
        gridCols,
      )}
    >
      {titulo('numero', 'Nº', false)}
      {titulo('titulo', simplified ? 'Título / Categoria' : 'Título / Quem abriu', false)}
      {titulo('status', 'Status')}
      {simplified && (
        <>
          {titulo('responsavel', 'Quem atende')}
          {titulo('prazo', 'Prazo')}
        </>
      )}
      {!simplified && (
        <>
          {titulo('prioridade', 'Prioridade')}
          {titulo('responsavel', 'Responsável')}
          {titulo('prazo', 'Prazo')}
        </>
      )}
    </div>
  );
}

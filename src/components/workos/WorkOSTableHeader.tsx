import { cn } from '@/lib/utils';

interface WorkOSTableHeaderProps {
  gridCols?: string;
  simplified?: boolean;
}

export function WorkOSTableHeader({ 
  gridCols = 'grid-cols-[60px_1fr_100px_80px_100px_90px]',
  simplified = false
}: WorkOSTableHeaderProps) {
  return (
    <div
      className={cn(
        'workos-table-header uppercase tracking-wider text-[11px] font-semibold',
        'bg-muted text-muted-foreground border-b border-border',
        gridCols,
      )}
    >
      <span>#</span>
      <span>Título {simplified ? '/ Categoria' : '/ Solicitante'}</span>
      <span className="text-center border-l border-border pl-2">Status</span>
      {!simplified && (
        <>
          <span className="text-center border-l border-border pl-2">Prioridade</span>
          <span className="text-center border-l border-border pl-2">Responsável</span>
          <span className="text-center border-l border-border pl-2">SLA</span>
        </>
      )}
    </div>
  );
}

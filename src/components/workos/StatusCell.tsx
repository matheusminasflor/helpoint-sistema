import { cn } from '@/lib/utils';
import type { TicketStatus } from '@/types/helpdesk';
import { getTicketStatusMeta } from '@/config/ticket-status';

interface StatusCellProps {
  status: TicketStatus;
  /** Compras tem nomes próprios ("Aguardando aprovação"…). */
  module?: string | null;
  size?: 'sm' | 'md';
}

/** A situação na linha da tabela: a mesma pílula do estado (rodada 3) que o resto do sistema usa. */
export function StatusCell({ status, module, size = 'md' }: StatusCellProps) {
  const config = getTicketStatusMeta(status, module);
  return (
    <span className={cn('estado', `estado-${config.familia}`, size === 'md' && 'text-[12.5px]')}>
      {config.label}
    </span>
  );
}

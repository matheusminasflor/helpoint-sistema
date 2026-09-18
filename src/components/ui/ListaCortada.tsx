import { AlertTriangle } from 'lucide-react';
import { TETO_DE_LISTA } from '@/lib/listas';

/**
 * Aviso de que a lista foi cortada pelo teto de busca (`buscarComTeto`,
 * `@/lib/listas`). Sem isto o corte fica invisível — o PostgREST devolve o
 * teto de linhas e nenhum sinal de que existiam mais, e a tela apresenta o
 * pedaço como se fosse o todo.
 */
export function ListaCortada({ teto = TETO_DE_LISTA }: { teto?: number }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-status-warning/40 bg-status-warning/5 p-3">
      <AlertTriangle className="h-4 w-4 shrink-0 text-status-warning" />
      <p className="text-[13px] text-foreground">
        Mostrando os primeiros {teto}. Refine a busca para encontrar o que falta.
      </p>
    </div>
  );
}

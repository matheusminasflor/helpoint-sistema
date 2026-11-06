import { Inbox } from 'lucide-react';
import { useChecklists, useNotasDoComercial } from '@/hooks/usePedidosChecklist';
import { formatBRL } from '@/types/financeiro';

/**
 * A FILA DO GESTOR do Comercial (etapa 4 · Comercial, 2026-10-24): num lugar só, os checklists que o Financeiro
 * devolveu (a vendedora tem de corrigir) e os pedidos aprovados que ainda não têm nota. Antes cada um morava numa tela.
 * No celular, 3 de cada (6 no computador): a fila vinha antes da carteira e a empurrava para longe (R3).
 */
export function FilaDoGestor() {
  const { data: checklists = [], isError } = useChecklists();
  const devolvidos = checklists.filter((c) => c.situacao === 'Recusado');
  const { data: notas = [] } = useNotasDoComercial();
  const semNota = notas.filter((n) => n.situacao === 'falta_nota');

  if (isError) return <p className="text-[13px] text-status-danger">Não consegui carregar a fila do gestor.</p>;
  if (devolvidos.length === 0 && semNota.length === 0) return null;

  return (
    <section aria-label="Fila do gestor" className="rounded-lg border border-border bg-card p-3 print:hidden">
      <h2 className="text-[14px] font-semibold flex items-center gap-2 mb-2">
        <Inbox className="w-4 h-4 text-muted-foreground" aria-hidden="true" /> Fila do gestor
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <p className={`text-[13px] mb-1 ${devolvidos.length ? 'text-status-danger font-semibold' : 'text-muted-foreground'}`}>
            Checklists devolvidos pelo Financeiro ({devolvidos.length})
          </p>
          <ul className="space-y-1 text-[13px]">
            {devolvidos.slice(0, 6).map((c, i) => (
              <li key={c.id} className={`min-w-0 ${i >= 3 ? 'max-sm:hidden' : ''}`}>
                <span className="font-medium">{c.protocolo}</span> · {c.cliente_nome} · {c.vendedor_nome ?? '—'}
                {c.retorno_motivos?.length ? <span className="text-muted-foreground"> — {c.retorno_motivos.join(', ')}</span> : null}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[13px] mb-1 text-muted-foreground">Falta informar a nota ({semNota.length})</p>
          <ul className="space-y-1 text-[13px]">
            {semNota.slice(0, 6).map((p, i) => (
              <li key={p.pedido_id} className={`min-w-0 ${i >= 3 ? 'max-sm:hidden' : ''}`}>
                <span className="font-medium">Pedido {p.numero}</span> ({p.filial}) · {p.cliente} · {p.vendedor ?? '—'}
                <span className="tabular-nums text-muted-foreground"> · {formatBRL(p.valor_pedido)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

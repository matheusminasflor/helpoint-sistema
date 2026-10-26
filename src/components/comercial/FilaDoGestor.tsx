import { useQuery } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';
import { useChecklists } from '@/hooks/usePedidosChecklist';
import { formatBRL } from '@/types/financeiro';

/**
 * A FILA DO GESTOR do Comercial (etapa 4 · Comercial, 2026-10-24): num lugar só, os checklists que o Financeiro
 * devolveu (a vendedora tem de corrigir) e os pedidos aprovados que ainda não têm nota. Antes cada um morava numa tela.
 * No celular, 3 de cada (6 no computador): a fila vinha antes da carteira e a empurrava para longe (R3).
 */
export function FilaDoGestor() {
  const { tenantId } = useAuth();
  const { data: checklists = [], isError } = useChecklists();
  const devolvidos = checklists.filter((c) => c.situacao === 'Recusado');
  const aprovados = checklists.filter((c) => c.situacao === 'Aprovado');
  const ids = aprovados.map((c) => c.id);
  const { data: semNota = [] } = useQuery({
    queryKey: ['pedidos-checklist', 'sem-nota', tenantId, ids.join(',')],
    enabled: !!tenantId && ids.length > 0,
    queryFn: async () => (unwrap(await supabase.from('ped_pedidos').select('id, checklist_id, numero, filial, valor')
      .in('checklist_id', ids).is('nota_fiscal', null)) ?? []) as { id: string; checklist_id: string; numero: string; filial: string; valor: number }[],
  });
  const doChecklist = new Map(aprovados.map((c) => [c.id, c]));

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
          <p className="text-[13px] mb-1 text-muted-foreground">Pedidos aprovados sem nota ({semNota.length})</p>
          <ul className="space-y-1 text-[13px]">
            {semNota.slice(0, 6).map((p, i) => {
              const c = doChecklist.get(p.checklist_id);
              return (
                <li key={p.id} className={`min-w-0 ${i >= 3 ? 'max-sm:hidden' : ''}`}>
                  <span className="font-medium">Pedido {p.numero}</span> ({p.filial}) · {c?.cliente_nome ?? '—'} · {c?.vendedor_nome ?? '—'}
                  <span className="tabular-nums text-muted-foreground"> · {formatBRL(Number(p.valor))}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}

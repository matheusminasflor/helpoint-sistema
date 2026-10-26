// A conta a pagar que um pedido gerou (rodada 2, R6): a compra (`fin_entries.purchase_request_id`, uma linha por
// parcela) e o reembolso/adiantamento (`solicitacoes.fin_entry_id`). Mostra valor, vencimento e se já foi paga, com o
// link para a conta em Contas a pagar (`?conta=`) para quem vê o Financeiro. A policy de `fin_entries` decide quem lê:
// quem não lê não vê o quadro.
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { useTenantPath } from '@/hooks/useTenantPath';
import { unwrap } from '@/lib/supabase-result';
import { effectiveStatus, formatBRL, formatDateBR } from '@/types/financeiro';

interface ContaLigada { id: string; amount: number; due_date: string; status: string; settled_at: string | null; parcela: number | null }

export function ContasLigadas({ compraId, contaId }: { compraId?: string | null; contaId?: string | null }) {
  const { tenantId } = useAuth();
  const { can } = useDepartmentPermissions('financeiro');
  const tenantPath = useTenantPath();
  const { data: contas = [] } = useQuery({
    queryKey: ['contas-ligadas', tenantId, compraId ?? null, contaId ?? null],
    enabled: !!tenantId && !!(compraId || contaId),
    queryFn: async () => {
      const q = supabase.from('fin_entries').select('id, amount, due_date, status, settled_at, parcela');
      const r = compraId ? q.eq('purchase_request_id', compraId).order('parcela') : q.eq('id', contaId!);
      return unwrap(await r) as unknown as ContaLigada[];
    },
  });
  if (!contas.length) return null;
  const verContas = can('payables', 'view');
  return (
    <div className="space-y-1 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conta a pagar</p>
      {contas.map((c) => {
        const s = effectiveStatus(c as never);
        const situacao = s === 'paid' ? `paga${c.settled_at ? ` em ${formatDateBR(c.settled_at)}` : ''}` : s === 'overdue' ? 'vencida' : 'a pagar';
        return (
          <div key={c.id} className="flex flex-wrap justify-between gap-x-4">
            <span className="text-muted-foreground">
              {contas.length > 1 ? `Parcela ${c.parcela ?? '?'}/${contas.length} · ` : ''}vence {formatDateBR(c.due_date)}
            </span>
            <span className="inline-flex gap-2">
              <span className="tabular-nums">{formatBRL(Number(c.amount))}</span>
              <span className={s === 'paid' ? 'text-status-success' : s === 'overdue' ? 'text-status-danger' : ''}>{situacao}</span>
              {verContas && (
                <Link to={tenantPath(`/financeiro/contas-a-pagar?conta=${c.id}`)} className="text-primary underline">abrir</Link>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

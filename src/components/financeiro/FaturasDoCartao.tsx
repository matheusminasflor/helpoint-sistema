// As faturas do cartão em aberto (dono, 2026-10-14: o cartão vence na fatura). Cada compra no cartão vira uma
// conta por parcela, vencendo no dia da fatura (`vencimento_da_fatura`); aqui elas se juntam por fatura, e o
// Financeiro dá baixa na fatura inteira de uma vez, quando paga o banco.
import { CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBaixarFatura } from '@/hooks/useFinanceiro';
import { effectiveStatus, formatBRL, formatDateBR, type FinEntry } from '@/types/financeiro';

export function FaturasDoCartao({ entries, podeBaixar }: { entries: FinEntry[]; podeBaixar: boolean }) {
  const baixar = useBaixarFatura();
  const porFatura = new Map<string, FinEntry[]>();
  for (const e of entries) {
    const s = effectiveStatus(e);
    if (e.source !== 'compra' || !e.payment_method?.startsWith('Cartão') || (s !== 'pending' && s !== 'overdue')) continue;
    porFatura.set(e.due_date, [...(porFatura.get(e.due_date) ?? []), e]);
  }
  if (porFatura.size === 0) return null;
  const faturas = [...porFatura.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <p className="flex items-center gap-1.5 text-sm font-semibold"><CreditCard className="w-4 h-4" aria-hidden="true" />Faturas do cartão em aberto</p>
      <ul className="divide-y divide-border">
        {faturas.map(([vence, contas]) => (
          <li key={vence} className="flex flex-wrap items-center gap-3 py-2 text-sm">
            <span className="font-medium">Vence {formatDateBR(vence)}</span>
            <span className="text-muted-foreground">{contas.length} parcela{contas.length === 1 ? '' : 's'}</span>
            <span className="font-mono font-semibold">{formatBRL(contas.reduce((s, c) => s + Number(c.amount), 0))}</span>
            {podeBaixar && (
              <Button size="sm" variant="outline" className="ml-auto" disabled={baixar.isPending}
                onClick={() => baixar.mutate(contas.map((c) => c.id))}>
                Dar baixa na fatura
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

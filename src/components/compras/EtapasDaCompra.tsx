import { cn } from '@/lib/utils';
import { formatBRL } from '@/types/financeiro';
import type { PurchaseQuote } from '@/types/purchases';

interface CompraParaEtapas {
  status: string;
  created_at: string;
  approved_at: string | null;
  pagamento_em?: string | null;
  executed_at?: string | null;
  caixinha?: boolean;
  approved_quote_id: string | null;
  quotes?: PurchaseQuote[];
}

const dia = (iso: string | null | undefined) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : null);

/**
 * A barra de etapas dentro da compra (etapa 4 · Compras, 2026-10-24): Pedido → Aprovada → Paga → Nota, com a data de
 * cada uma e o que falta. E a economia na cotação: o escolhido contra o mais caro dos orçamentos.
 */
export function EtapasDaCompra({ compra }: { compra: CompraParaEtapas }) {
  const recusada = compra.status === 'rejected' || compra.status === 'cancelled';
  const etapas = [
    { rotulo: 'Pedido', quando: dia(compra.created_at) },
    { rotulo: 'Aprovada', quando: dia(compra.approved_at) },
    // A Caixinha paga na hora da compra: não tem a etapa "Paga" separada.
    ...(compra.caixinha ? [] : [{ rotulo: 'Paga', quando: dia(compra.pagamento_em) }]),
    { rotulo: compra.caixinha ? 'Comprada' : 'Nota', quando: compra.status === 'completed' ? dia(compra.executed_at) : null },
  ];
  const atual = etapas.findIndex((e) => !e.quando);
  const proximo = recusada ? null
    : compra.status === 'pending_approval' ? 'Quem aprova decide entre os orçamentos.'
    : compra.status === 'adjustment_requested' ? 'Quem pediu ajusta o pedido.'
    : compra.status === 'approved' && !compra.caixinha && !compra.pagamento_em ? 'Quem compra paga e anexa o boleto ou o comprovante.'
    : compra.status === 'approved' ? 'Quem compra anexa a nota fiscal quando o produto chegar.'
    : null;

  const valores = (compra.quotes ?? []).map((q) => Number(q.amount)).filter((v) => Number.isFinite(v) && v > 0);
  const escolhido = (compra.quotes ?? []).find((q) => q.id === compra.approved_quote_id);
  const maisCaro = valores.length ? Math.max(...valores) : null;
  const economia = escolhido && maisCaro !== null && valores.length > 1 ? maisCaro - Number(escolhido.amount) : null;

  return (
    <div className="space-y-2">
      <ol className="grid gap-1" style={{ gridTemplateColumns: `repeat(${etapas.length}, minmax(0, 1fr))` }} aria-label="Etapas da compra">
        {etapas.map((e, i) => (
          <li key={e.rotulo} className="min-w-0">
            <span className={cn('block h-1 rounded-full', e.quando ? 'bg-foreground' : i === atual && !recusada ? 'bg-status-info' : 'bg-secondary')} />
            <span className={cn('block text-[12px] mt-1 truncate', e.quando ? 'text-foreground' : 'text-muted-foreground')}>
              {e.rotulo}{e.quando ? ` ${e.quando}` : i === atual && !recusada ? ' · agora' : ''}
            </span>
          </li>
        ))}
      </ol>
      {recusada && <p className="text-[13px] text-status-danger">Compra {compra.status === 'rejected' ? 'reprovada' : 'cancelada'}.</p>}
      {proximo && <p className="text-[13px]"><span className="text-muted-foreground">Próximo passo:</span> {proximo}</p>}
      {economia !== null && economia > 0 && (
        <p className="text-[13px] tabular-nums">
          <span className="text-muted-foreground">Economia na cotação:</span> {formatBRL(economia)}
          <span className="text-muted-foreground"> (escolhido {formatBRL(Number(escolhido!.amount))}, o mais caro {formatBRL(maisCaro!)})</span>
        </p>
      )}
    </div>
  );
}

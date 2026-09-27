import { useParams } from 'react-router-dom';
import { CreditCard, FileX2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePublicProposal } from '@/hooks/usePublicProposal';
import { formatBRL, formatDateBR } from '@/lib/crm';
import { todayISO } from '@/lib/dates';

/**
 * Página pública da proposta (CRM-1c): `/proposta/:token`. O cliente abre pelo
 * link que o vendedor mandou; não há login. Lê só `crm_public_proposal` — a
 * função decide o que pode aparecer. Imprimir vira PDF pelo navegador; os
 * botões somem na impressão.
 */
export default function PropostaPublica() {
  const { token } = useParams<{ token: string }>();
  const { data: proposal, isPending, isError } = usePublicProposal(token);

  if (isPending) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-3xl mx-auto space-y-3">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (isError || !proposal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full rounded-xl border border-border bg-card p-8 text-center space-y-3">
          <FileX2 className="w-12 h-12 mx-auto text-muted-foreground" />
          <h1 className="text-xl font-semibold text-foreground">Proposta não encontrada</h1>
          <p className="text-sm text-muted-foreground">O link pode estar errado ou a proposta foi cancelada. Fale com quem a enviou.</p>
        </div>
      </div>
    );
  }

  const expired = !!proposal.valid_until && proposal.valid_until < todayISO() && !['accepted', 'paid'].includes(proposal.status);
  const statusLine =
    proposal.status === 'paid' ? 'Pedido pago — obrigado!'
    : proposal.status === 'accepted' ? 'Proposta aceita'
    : expired ? 'Proposta vencida — peça uma nova ao vendedor'
    : proposal.valid_until ? `Válida até ${formatDateBR(proposal.valid_until)}`
    : null;

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8 print:p-0">
      <div className="max-w-3xl mx-auto rounded-xl border border-border bg-card p-6 sm:p-10 space-y-6 print:border-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {proposal.company.logo_url && <img src={proposal.company.logo_url} alt="" className="h-12 w-12 rounded-lg object-contain" />}
            <div>
              <p className="text-lg font-semibold text-foreground">{proposal.company.name}</p>
              {proposal.seller && <p className="text-xs text-muted-foreground">Vendedor: {proposal.seller}</p>}
            </div>
          </div>
          <div className="text-right">
            <h1 className="text-xl font-semibold text-foreground">Proposta nº {proposal.number}</h1>
            {proposal.sent_at && <p className="text-xs text-muted-foreground">{new Date(proposal.sent_at).toLocaleDateString('pt-BR')}</p>}
          </div>
        </header>

        <section className="text-sm">
          <p className="text-muted-foreground">Para</p>
          <p className="font-medium text-foreground">{proposal.contact.name}{proposal.contact.company ? ` — ${proposal.contact.company}` : ''}</p>
        </section>

        <section className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 font-medium">Item</th>
                <th className="py-2 font-medium text-right">Qtd.</th>
                <th className="py-2 font-medium text-right">Unitário</th>
                <th className="py-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {proposal.items.map((item, i) => (
                <tr key={i} className="border-b border-border/60">
                  <td className="py-2 text-foreground">{item.description}</td>
                  <td className="py-2 text-right">{Number(item.quantity).toLocaleString('pt-BR')}</td>
                  <td className="py-2 text-right">{formatBRL(Number(item.unit_price))}</td>
                  <td className="py-2 text-right font-medium">{formatBRL(Number(item.total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatBRL(Number(proposal.subtotal))}</span></div>
          {Number(proposal.discount) > 0 && <div className="flex justify-between text-muted-foreground"><span>Desconto</span><span>− {formatBRL(Number(proposal.discount))}</span></div>}
          {Number(proposal.shipping) > 0 && <div className="flex justify-between text-muted-foreground"><span>Frete</span><span>{formatBRL(Number(proposal.shipping))}</span></div>}
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold text-foreground"><span>Total</span><span>{formatBRL(Number(proposal.total))}</span></div>
        </section>

        {proposal.notes && (
          <section className="text-sm">
            <p className="text-muted-foreground">Observações</p>
            <p className="whitespace-pre-wrap text-foreground">{proposal.notes}</p>
          </section>
        )}

        {statusLine && <p className={`text-sm ${expired ? 'text-destructive' : 'text-muted-foreground'}`}>{statusLine}</p>}

        <footer className="flex flex-wrap gap-2 print:hidden">
          {proposal.link_url && !expired && (
            <Button asChild>
              <a href={proposal.link_url}><CreditCard className="w-4 h-4 mr-1.5" /> Pagar agora</a>
            </Button>
          )}
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-1.5" /> Imprimir / salvar PDF
          </Button>
        </footer>
      </div>
    </div>
  );
}

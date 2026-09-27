import { useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';

/**
 * Página pública para onde o Stripe devolve o cliente depois do checkout
 * (`/pagamento/obrigado` ou `/pagamento/cancelado`). Não lê o banco: o que
 * confirma o pagamento é o webhook, não esta tela.
 */
export default function PagamentoStatus() {
  const { status } = useParams<{ status: string }>();
  const [params] = useSearchParams();
  const pedido = params.get('pedido');
  const ok = status === 'obrigado';

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full rounded-xl border border-border bg-card p-8 text-center space-y-3">
        {ok ? (
          <CheckCircle2 className="w-12 h-12 mx-auto text-primary" />
        ) : (
          <XCircle className="w-12 h-12 mx-auto text-muted-foreground" />
        )}
        <h1 className="text-xl font-semibold text-foreground">
          {ok ? 'Pagamento recebido' : 'Pagamento não concluído'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {ok
            ? `Obrigado! ${pedido ? `O pedido #${pedido} ` : 'Seu pedido '}foi registrado e o vendedor já foi avisado.`
            : `${pedido ? `O pedido #${pedido} ` : 'Seu pedido '}continua em aberto. Se quiser, use o mesmo link para pagar mais tarde ou fale com o vendedor.`}
        </p>
        <p className="text-xs text-muted-foreground">Você já pode fechar esta página.</p>
      </div>
    </div>
  );
}

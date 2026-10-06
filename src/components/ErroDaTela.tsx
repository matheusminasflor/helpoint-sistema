// A rede de segurança de todo o sistema (2026-10-06): antes, qualquer erro de tela deixava a
// página BRANCA, sem mensagem. Pedaço de tela que não veio (versão nova publicada) recarrega
// sozinho uma vez; o resto mostra o que houve e um botão para recarregar.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ehPedacoQueNaoVeio, recarregarUmaVez } from '@/lib/versao-nova';

interface Estado { erro: Error | null }

export class ErroDaTela extends Component<{ children: ReactNode }, Estado> {
  state: Estado = { erro: null };

  static getDerivedStateFromError(erro: Error): Estado {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error('[ErroDaTela]', erro, info.componentStack);
    if (ehPedacoQueNaoVeio(erro)) recarregarUmaVez();
  }

  render() {
    const { erro } = this.state;
    if (!erro) return this.props.children;
    const versao = ehPedacoQueNaoVeio(erro);
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full rounded-lg border border-border bg-card p-6 space-y-3 text-center">
          <h1 className="text-lg font-semibold text-foreground">
            {versao ? 'O sistema foi atualizado' : 'Esta tela teve um problema'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {versao
              ? 'Saiu uma versão nova enquanto você estava com a página aberta. Recarregue para continuar.'
              : 'Recarregue a página. Se continuar, avise a TI e diga em qual tela aconteceu.'}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Recarregar
          </button>
        </div>
      </div>
    );
  }
}

// Um bloco de farol: título com ícone, subtítulo opcional, e a lista — ou a
// frase de vazio, que num farol é a mensagem mais importante que ele dá.
//
// Nasceu dentro de `ComercialBonificacao.tsx` (farol da bonificação) e saiu para
// cá na leva D, quando o farol do cashback precisou do mesmo bloco. Duas cópias
// do mesmo cartão divergem na primeira vez que alguém ajustar o espaçamento de
// uma — e o farol é a tela em que o dono confia para não precisar procurar.
//
// **Componente em `components/`, não exportado da página**, porque exportar
// componente de um arquivo de página dispara o aviso do react-refresh (foi o que
// aconteceu com `useVisaoRelatorio` na etapa 3, e a lição ficou).
//
// `vazio` é obrigatório de propósito: bloco de farol sem frase de vazio fica
// invisível quando não há nada a apontar, e "não há nada a apontar" é exatamente
// o que um farol precisa dizer em voz alta. Silêncio ali se lê como falha de
// carregamento.
import type { ReactNode } from 'react';

export function BlocoFarol({
  icone, titulo, subtitulo, vazio, discreto, children,
}: {
  icone: ReactNode;
  titulo: string;
  subtitulo?: string;
  vazio: string;
  /**
   * Bloco informativo, não alerta: borda e título em cinza. Entrou na leva D
   * para o "tabela sem faixa de cashback" — o dono decidiu que aquilo é conferência
   * e não cobrança (DIRETORIA é interno; REVENDA e SALÃO REF podem ser decisão
   * comercial), e alerta vermelho todo dia sobre uma decisão já tomada é como se
   * ensina alguém a ignorar o farol inteiro.
   */
  discreto?: boolean;
  children: ReactNode;
}) {
  const vazioDeVerdade = Array.isArray(children) && children.length === 0;
  return (
    <div className={`rounded-lg border ${discreto ? 'border-dashed border-border' : 'border-border'}`}>
      <div className={`px-4 py-2 text-[13px] font-semibold flex items-center gap-2 ${discreto ? 'text-muted-foreground' : ''}`}>
        {icone}{titulo}
      </div>
      {subtitulo && <p className="px-4 pb-2 text-[11px] text-muted-foreground">{subtitulo}</p>}
      {vazioDeVerdade ? (
        <p className="px-4 py-3 text-[12px] text-muted-foreground border-t border-border">{vazio}</p>
      ) : (
        <ul className="max-h-80 overflow-y-auto">{children}</ul>
      )}
    </div>
  );
}

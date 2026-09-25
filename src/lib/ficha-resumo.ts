// As contas da visão SIMPLIFICADA da ficha do cliente. Regra pura de
// propósito: nada aqui toca React nem Supabase, então o Vitest prova sem
// montar tela — e a tela só exibe o que estas funções devolvem.
//
// Nenhuma delas REFAZ conta do banco. O faturamento, o cashback e a variação
// já vêm apurados; o que mora aqui é a decisão de EXIBIÇÃO: quantas linhas
// mostrar, e como dizer em português o que um número pode significar —
// inclusive quando ele não existe.

/**
 * Corta a lista no topo e diz quantas ficaram de fora — a base de "mostrando
 * 5, [ver todos os 38]". `restantes` é 0 quando cabe tudo, e aí o botão não
 * aparece: link que promete mais e entrega a mesma coisa é pior que nenhum.
 */
export function primeiros<T>(linhas: T[], n = 5): { mostradas: T[]; restantes: number } {
  const mostradas = linhas.slice(0, n);
  return { mostradas, restantes: Math.max(0, linhas.length - mostradas.length) };
}

export type DirecaoTendencia = 'sobe' | 'desce' | 'estavel' | 'sem-base';

/**
 * A tendência do farol. `variacao` vem do banco como fração (0.184 = +18,4%)
 * e é NULA quando não há três meses anteriores para comparar.
 *
 * Nulo NUNCA vira "0,0%" — essa é a regra que já mordeu quatro vezes neste
 * módulo (docs/nao-funciona.md, "Sem dado virando zero"): "0%" afirma que o
 * cliente ficou igual, e "—" diz que não se sabe. São coisas diferentes, e o
 * farol é exatamente o lugar onde a diferença muda uma ligação de vendedor.
 */
export function tendencia(variacao: number | null): { texto: string; direcao: DirecaoTendencia } {
  if (variacao === null || !Number.isFinite(variacao)) {
    return { texto: '—', direcao: 'sem-base' };
  }
  const percentual = variacao * 100;
  // Abaixo de 0,05% o arredondamento de uma casa já escreveria "0,0%" — e aí
  // a seta viraria mentira nos dois sentidos. Vira "estável", sem seta.
  if (Math.abs(percentual) < 0.05) return { texto: '0,0%', direcao: 'estavel' };
  const sinal = percentual > 0 ? '+' : '−';
  return {
    texto: `${sinal}${Math.abs(percentual).toFixed(1).replace('.', ',')}%`,
    direcao: percentual > 0 ? 'sobe' : 'desce',
  };
}

/**
 * O que o farol de cashback escreve embaixo do valor. As três situações são
 * diferentes e o dono precisa distinguir:
 *
 * - **sem tabela de preço** — o cliente sequer está no relatório
 *   CLIENTESXTABELA; não é que ele não ganhou, é que não dá para saber;
 * - **tabela sem programa** (REVENDA, SALÃO REF, DIRETORIA) — não participa
 *   do cashback, e nunca vai participar enquanto estiver nessa tabela;
 * - **participa** — aí sim vale dizer quanto falta para a próxima faixa,
 *   que é a frase que faz alguém ligar para o cliente.
 */
export function legendaCashback(resumo: {
  sem_tabela: boolean;
  sem_programa: boolean;
  meses_com_direito: number;
  falta_proxima_faixa: number | null;
} | null): string {
  if (!resumo) return 'Sem apuração no período.';
  if (resumo.sem_tabela) return 'Cliente sem tabela de preço — não dá para apurar.';
  if (resumo.sem_programa) return 'A tabela de preço deste cliente não tem programa de cashback.';
  const meses = `${resumo.meses_com_direito} ${resumo.meses_com_direito === 1 ? 'mês' : 'meses'} com direito`;
  // `falta_proxima_faixa` nulo = ele já está na faixa mais alta da tabela
  // dele, não "falta R$ 0,00".
  if (resumo.falta_proxima_faixa === null) return `${meses} · já está na faixa mais alta`;
  return meses;
}

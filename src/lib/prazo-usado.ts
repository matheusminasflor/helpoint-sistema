// "Prazo usado" (dono, 2026-10-20): quanto do prazo de resolução a pessoa gastou até resolver. Quem resolve tudo
// perto de 100% deixa para o limite — o "SLA cumprido %" não mostra isso, porque no prazo é no prazo.
// ponytail: conta do relógio corrido, da abertura até o prazo gravado. A transferência recomeça o prazo e a pausa
// (fim de semana, agendado) o empurra; os dois aumentam o denominador e a conta sai a favor de quem atende. Se o
// número precisar ser exato, a saída é o banco gravar o início do prazo vigente.
export function fracaoDoPrazo(abertoEm: string, resolvidoEm: string, prazo: string): number | null {
  const inicio = new Date(abertoEm).getTime();
  const total = new Date(prazo).getTime() - inicio;
  if (!(total > 0)) return null;
  return (new Date(resolvidoEm).getTime() - inicio) / total;
}

/** Média em %, ou null sem nenhum chamado com prazo. Acima de 80% é "resolve no limite". */
export function prazoUsadoMedio(fracoes: number[]): number | null {
  return fracoes.length > 0 ? Math.round((fracoes.reduce((s, f) => s + f, 0) / fracoes.length) * 100) : null;
}

export const LIMITE_DO_PRAZO_USADO = 80;

// O que uma célula numérica editável deve gravar a partir do texto digitado
// (Frente 7 — .scratch/plano-frente7-metas-digitadas.md §2, regra 1). Extraído
// de `CelulaMeta` (DiretoriaMetas.tsx) para poder ser testado sem montar
// componente: este repositório não tem suíte de componente (só Vitest puro e
// pgTAP) — a regra que decide aqui é exatamente a que é fácil de confundir
// por engano, então precisa de prova própria.
//
// Campo vazio é NULO ("não informei"); dígito "0" é zero de verdade ("foi
// zero"). Confundir os dois foi a causa do "Fechamento de 2025: R$ 0,00" que
// a Frente 2 existiu para desfazer do lado da importação — aqui é o mesmo
// cuidado, do lado da digitação.

export type ValorInterpretado =
  | { tipo: 'nulo' }
  | { tipo: 'numero'; valor: number }
  | { tipo: 'invalido' };

export function interpretarValorDigitado(texto: string): ValorInterpretado {
  if (texto.trim() === '') return { tipo: 'nulo' };
  const numero = Number(texto.replace(',', '.'));
  if (!Number.isFinite(numero)) return { tipo: 'invalido' };
  return { tipo: 'numero', valor: numero };
}

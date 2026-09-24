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
  const limpo = texto.trim();
  if (limpo === '') return { tipo: 'nulo' };
  // Frente 7b: o campo virou type="text" (type="number" não formata em
  // reais), então passa a aceitar a forma que o brasileiro digita —
  // "311.254,03" e "311254,03" — além de "311254.03" (a forma que o próprio
  // número sai do banco, sem ponto de milhar). A vírgula é quem decide: se
  // ela aparece, é o separador decimal, e todo ponto ANTES dela é milhar e
  // sai. Tratar esse ponto como decimal transformaria R$ 311.254,03 em
  // R$ 311,25 — o defeito que esta frente existe para não introduzir.
  // Sem vírgula, o único ponto (se houver) É o decimal.
  const normalizado = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
  const numero = Number(normalizado);
  if (!Number.isFinite(numero)) return { tipo: 'invalido' };
  return { tipo: 'numero', valor: numero };
}

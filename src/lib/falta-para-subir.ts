// "Quanto falta para subir de faixa" na Curva ABC (revisão do Comercial aprovada pelo dono,
// https://claude.ai/artifact/DogLjeM9MuJUzFt2H7ALFV, 7.6): o produto da faixa B precisa vender o que vende o menor da A;
// o da C, o menor da B. A régua é o menor da faixa de cima no MESMO período e critério (valor ou quantidade).
// ponytail: é uma leitura do período, não uma previsão — se outros produtos venderem mais, a régua sobe junto.

export type Faixa = 'A' | 'B' | 'C' | '-';
const ACIMA: Partial<Record<Faixa, Faixa>> = { B: 'A', C: 'B' };

export function faltaParaSubir<L extends { faixa: Faixa }>(linhas: L[], metrica: (l: L) => number): Map<L, number> {
  const menorDa = new Map<Faixa, number>();
  for (const l of linhas) {
    const v = metrica(l);
    menorDa.set(l.faixa, Math.min(menorDa.get(l.faixa) ?? Infinity, v));
  }
  const falta = new Map<L, number>();
  for (const l of linhas) {
    const acima = ACIMA[l.faixa];
    const regua = acima ? menorDa.get(acima) : undefined;
    if (regua !== undefined && regua > metrica(l)) falta.set(l, regua - metrica(l));
  }
  return falta;
}

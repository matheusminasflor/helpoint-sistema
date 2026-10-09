// A chama da "Sua Performance" (dono, 2026-10-09): um gatilho para quem entrega muito E no prazo.
// Volume sem qualidade não acende — abaixo de 80% no prazo a chama fica apagada, com a dica do que falta.
//   nível 1 "Acesa"        ≥ 5 entregas em 7 dias  (≥ 20 em 30)
//   nível 2 "Pegando fogo" ≥ 10 em 7 dias          (≥ 40 em 30)
//   nível 3 "Em chamas"    ≥ 15 em 7 dias          (≥ 60 em 30)

export type NivelDaChama = 0 | 1 | 2 | 3;

const FAIXAS: Record<7 | 30, [number, number, number]> = { 7: [5, 10, 15], 30: [20, 40, 60] };
const NOMES = ['Apagada', 'Acesa', 'Pegando fogo', 'Em chamas'] as const;
export const NO_PRAZO_MINIMO = 80;

export function nivelDaChama({ noPrazo, entregas, dias }: { noPrazo: number | null; entregas: number; dias: 7 | 30 }) {
  const [um, dois, tres] = FAIXAS[dias];
  const nivel: NivelDaChama = noPrazo === null || noPrazo < NO_PRAZO_MINIMO ? 0
    : entregas >= tres ? 3 : entregas >= dois ? 2 : entregas >= um ? 1 : 0;
  const proxima = nivel < 3 ? [um, dois, tres][nivel] : null;
  let frase: string;
  if (noPrazo !== null && noPrazo < NO_PRAZO_MINIMO) {
    frase = `Entregue no prazo para acender: precisa de ${NO_PRAZO_MINIMO}% (está em ${noPrazo}%).`;
  } else if (nivel === 3) {
    frase = `${entregas} entregas e ${noPrazo}% no prazo. Ninguém segura!`;
  } else if (nivel === 0) {
    frase = `Faltam ${Math.max(0, um - entregas)} entregas no prazo para acender.`;
  } else {
    frase = `${entregas} entregas e ${noPrazo}% no prazo. Mais ${proxima! - entregas} para o próximo nível.`;
  }
  return { nivel, nome: NOMES[nivel], frase };
}

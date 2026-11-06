// Telas que o dono pausou (2026-10-03): "desative metas e projetos, por enquanto não vamos usar" e
// "Meu RH ainda não funciona, o RH ainda não está usando — o botão deve ficar inativo". O código e os
// dados ficam; para voltar, basta tirar a tela daqui. Projetos voltou em 2026-10-07, refeito por setor
// (docs/especificacao-projetos.md).

/** Somem do menu e do resto do sistema; o endereço leva para o início. */
export const TELAS_PAUSADAS = ['/metas'] as const;

/** Ficam no menu, apagadas e sem clique, com o motivo ao passar o mouse; o endereço leva ao início. */
export const TELAS_EM_BREVE: Record<string, string> = {
  '/meu-rh': 'Em breve: o RH ainda não começou a usar o Meu RH.',
};

export const estaPausada = (to: string) =>
  TELAS_PAUSADAS.some((p) => to === p || to.startsWith(`${p}/`));

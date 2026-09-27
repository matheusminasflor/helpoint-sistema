/**
 * A regra do seletor de tema (leva J, 2026-09-26).
 *
 * Mora fora do componente pelo mesmo motivo de `acesso-comercial.ts`: regra pura
 * se prova com Vitest, e um módulo sem dependência não arrasta o cliente do
 * Supabase para dentro do teste (o CI não tem `.env`).
 *
 * TRÊS ESTADOS, e não dois: claro, escuro e **sistema**. "Sistema" não é enfeite —
 * é o único que acompanha quem muda o tema do computador à noite, e é o padrão
 * justamente por isso. Um botão de duas posições obrigaria a pessoa a escolher
 * para sempre.
 */

export type Tema = 'light' | 'dark' | 'system';

export const TEMAS: readonly { valor: Tema; rotulo: string; descricao: string }[] = [
  { valor: 'light',  rotulo: 'Claro',   descricao: 'sempre claro' },
  { valor: 'dark',   rotulo: 'Escuro',  descricao: 'sempre escuro' },
  { valor: 'system', rotulo: 'Sistema', descricao: 'segue o computador' },
] as const;

export function isTema(valor: unknown): valor is Tema {
  return valor === 'light' || valor === 'dark' || valor === 'system';
}

/**
 * O tema que está VALENDO, que não é o mesmo que o escolhido: com 'system'
 * escolhido, o que vale depende do computador.
 *
 * É esta diferença que decide o ícone do botão — mostrar o sol com 'system'
 * escolhido numa máquina no escuro seria o botão mentindo sobre o que está na
 * tela.
 */
export function temaEmUso(escolhido: Tema | undefined, sistemaPrefereEscuro: boolean): 'light' | 'dark' {
  if (escolhido === 'light' || escolhido === 'dark') return escolhido;
  return sistemaPrefereEscuro ? 'dark' : 'light';
}

/** O rótulo do que está valendo, para o `title` e para o leitor de tela. */
export function descricaoDoTema(escolhido: Tema | undefined, sistemaPrefereEscuro: boolean): string {
  const emUso = temaEmUso(escolhido, sistemaPrefereEscuro);
  const nome = emUso === 'dark' ? 'escuro' : 'claro';
  // Com 'system', dizer só "escuro" esconderia por que ele mudou sozinho de manhã.
  return escolhido === 'system' || escolhido === undefined
    ? `Tema ${nome}, seguindo o computador`
    : `Tema ${nome}`;
}

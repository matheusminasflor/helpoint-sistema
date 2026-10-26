// Fora de `useContadoresDeAvisos` para o Vitest não carregar o cliente do Supabase (o menu do celular a usa, R3).

/** O grupo do menu e a fila de chamados de cada módulo de chamado. */
export function lugarNoMenuDoModulo(modulo: string): { grupo: string; fila: string } {
  if (modulo === 'tickets') return { grupo: 'ti', fila: '/ti/chamados' };
  if (modulo === 'marketing') return { grupo: 'mkt', fila: '/mkt/chamados' };
  return { grupo: modulo, fila: `/${modulo}/chamados` };
}

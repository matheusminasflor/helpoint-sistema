// A lista do Financeiro na memória da tela: `useFinEntries` guarda `{ linhas, cortou }`, não um array.
export interface ListaDeLancamentos<T> { linhas: T[]; cortou: boolean }

export function marcaNaLista<T extends { id: string }>(atual: ListaDeLancamentos<T> | undefined, id: string, mudanca: Partial<T>) {
  return atual && { ...atual, linhas: atual.linhas.map((l) => (l.id === id ? { ...l, ...mudanca } : l)) };
}

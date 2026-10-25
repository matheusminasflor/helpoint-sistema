// "Fixados" e "Usados por último" no menu (proposta "Helpoint no dia a dia", etapa 4 · Configurações e busca,
// 2026-10-24). Conveniência de cada pessoa, no navegador dela (sem armazenamento, vale até recarregar). Puro, para o
// teste: a lista nova a partir da antiga.

export interface ItemDoMenu { to: string; label: string }

export const MAX_RECENTES = 4;

/** Põe o item no começo, sem repetir, e corta em `MAX_RECENTES`. */
export function registrarUso(lista: ItemDoMenu[], item: ItemDoMenu): ItemDoMenu[] {
  return [item, ...lista.filter((i) => i.to !== item.to)].slice(0, MAX_RECENTES);
}

/** Fixa ou solta. */
export function alternarFixado(lista: ItemDoMenu[], item: ItemDoMenu): ItemDoMenu[] {
  return lista.some((i) => i.to === item.to) ? lista.filter((i) => i.to !== item.to) : [...lista, item];
}

export function ler(chave: string): ItemDoMenu[] {
  try {
    const v = JSON.parse(localStorage.getItem(chave) ?? '[]');
    return Array.isArray(v) ? v.filter((i) => typeof i?.to === 'string' && typeof i?.label === 'string') : [];
  } catch { return []; }
}

export function gravar(chave: string, lista: ItemDoMenu[]) {
  try { localStorage.setItem(chave, JSON.stringify(lista)); } catch { /* sem armazenamento: vale até recarregar */ }
}

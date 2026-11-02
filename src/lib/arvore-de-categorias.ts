// A árvore das categorias do período (Sistemas › Forteplus › Correções e Ajustes) — da tela "Chamados por categoria",
// do modo apresentação e do PDF dos Indicadores da TI. O caminho é o do cadastro (20270212170000).
import type { ChamadoDoPeriodo } from '@/hooks/useHelpdeskMetrics';

export interface No { nome: string; caminho: string; chamados: ChamadoDoPeriodo[]; filhos: No[] }

export const caminhoDo = (c: ChamadoDoPeriodo) => [c.category || 'Sem categoria', ...(c.subcategory ? c.subcategory.split(' › ') : [])];

/** A árvore do período: cada nível soma os chamados de baixo; o maior primeiro. */
export function arvore(chamados: { chamado: ChamadoDoPeriodo; resto: string[] }[], pai = ''): No[] {
  const grupos = new Map<string, { chamado: ChamadoDoPeriodo; resto: string[] }[]>();
  for (const item of chamados) {
    const [nome] = item.resto;
    grupos.set(nome, [...(grupos.get(nome) ?? []), item]);
  }
  return [...grupos.entries()]
    .map(([nome, itens]) => {
      const caminho = pai ? `${pai} › ${nome}` : nome;
      const abaixo = itens.filter((i) => i.resto.length > 1).map((i) => ({ chamado: i.chamado, resto: i.resto.slice(1) }));
      const filhos = arvore(abaixo, caminho);
      const soAqui = itens.length - abaixo.length;
      // Quem parou neste nível, quando há níveis abaixo, aparece como "Sem subcategoria" (a soma tem de fechar).
      if (filhos.length && soAqui > 0) {
        filhos.push({ nome: 'Sem subcategoria', caminho: `${caminho} › Sem subcategoria`, filhos: [],
          chamados: itens.filter((i) => i.resto.length === 1).map((i) => i.chamado) });
      }
      return { nome, caminho, chamados: itens.map((i) => i.chamado), filhos };
    })
    .sort((a, b) => b.chamados.length - a.chamados.length);
}

/** A árvore a partir dos chamados do período. */
export const arvoreDosChamados = (chamados: ChamadoDoPeriodo[]) => arvore(chamados.map((chamado) => ({ chamado, resto: caminhoDo(chamado) })));

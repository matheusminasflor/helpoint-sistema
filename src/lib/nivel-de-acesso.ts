import type { ModuleSchema, PermissionsMap } from '@/config/access-profile-schemas';

/**
 * O nível de acesso por tela (dono, 2026-10-28, proposta https://claude.ai/artifact/9CxkD1d97FZ9nhR3UNCYGS): no lugar de
 * marcar caixinha por caixinha, cada tela escolhe Não vê, Vê, Trabalha ou Tudo. O nível só MARCA as caixinhas de uma
 * vez: o que se grava, e o que o banco confere, continua sendo cada caixinha.
 */
export type Nivel = 0 | 1 | 2 | 3;

export const ROTULO_DO_NIVEL: Record<Nivel, string> = { 0: 'Não vê', 1: 'Vê', 2: 'Trabalha', 3: 'Tudo' };

type Acao = ModuleSchema['actions'][number];

/** Nos chamados, transferir, mudar prioridade e prazo e reabrir são de quem coordena, não do dia a dia. */
const DE_QUEM_COORDENA: Record<string, string[]> = { tickets: ['transfer', 'change_priority', 'reopen'] };

/**
 * A partir de que nível a ação fica ligada: ver é "Vê"; excluir, o sensível e o de quem coordena é "Tudo"; o resto,
 * "Trabalha". Excluir conta à parte porque o "Excluir" das telas de cadastro (CRUD) não leva a marca de sensível.
 */
export function nivelDaAcao(modulo: Pick<ModuleSchema, 'key'>, acao: Acao): 1 | 2 | 3 {
  if (acao.key.startsWith('view') && !acao.sensitive) return 1;
  if (acao.sensitive || acao.key === 'delete' || DE_QUEM_COORDENA[modulo.key]?.includes(acao.key)) return 3;
  return 2;
}

/** Os níveis que fazem diferença nesta tela (sem ação de ver, "Vê" é igual a "Não vê" e não aparece). */
export function niveisDaTela(modulo: ModuleSchema): Nivel[] {
  const tem = new Set(modulo.actions.map((a) => nivelDaAcao(modulo, a)));
  return ([0, 1, 2, 3] as Nivel[]).filter((n) => n === 0 || tem.has(n as 1 | 2 | 3));
}

/** As caixinhas da tela marcadas como o nível manda. */
export function aplicarNivel(modulo: ModuleSchema, nivel: Nivel): Record<string, boolean> {
  return Object.fromEntries(modulo.actions.map((a) => [a.key, nivel > 0 && nivelDaAcao(modulo, a) <= nivel]));
}

/** O nível que as caixinhas marcadas formam, ou `null` quando é uma combinação própria ("Personalizado"). */
export function nivelAtual(modulo: ModuleSchema, perms: PermissionsMap): Nivel | null {
  const marcadas = perms[modulo.key] ?? {};
  for (const n of niveisDaTela(modulo)) {
    const esperado = aplicarNivel(modulo, n);
    if (modulo.actions.every((a) => !!marcadas[a.key] === esperado[a.key])) return n;
  }
  return null;
}

export type GrupoDaTela = 'trabalho' | 'relatorios' | 'configuracoes';

export const ROTULO_DO_GRUPO: Record<GrupoDaTela, string> = {
  trabalho: 'Trabalho do setor',
  relatorios: 'Relatórios',
  configuracoes: 'Configurações do setor',
};

/** A ordem do menu (Lei de Jakob): o trabalho do dia a dia primeiro, as configurações por último. */
export function grupoDaTela(modulo: ModuleSchema): GrupoDaTela {
  if (modulo.label.startsWith('Configurações')) return 'configuracoes';
  if (modulo.key === 'reports' || /indicador|relat[oó]rio/i.test(modulo.label)) return 'relatorios';
  return 'trabalho';
}

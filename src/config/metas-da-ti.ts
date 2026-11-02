// As metas dos Indicadores da TI. Rodada 2 (2026-11-02): padrão de mercado + histórico, mudado em Configurações de
// TI › Metas. Rodada 3 (mesmo dia): a meta começa no que a equipe entrega hoje (a TI tem uma pessoa no helpdesk e o
// líder de recursos operacionais; 90% de saída não se sustentava — média de 80% nas últimas 4 semanas).
//
// UMA META POR INDICADOR (dono, 2026-11-02: "não tem necessidade de meta de novembro, dezembro… deixa 80%, e o gestor
// muda manualmente"). A tela mostra só a meta; quando o gestor muda, a nova vale a partir do mês da mudança e os meses
// anteriores continuam com a que valia (`ti_metas_degraus`, 20270212190000, guarda essa história sem mostrá-la).
import type { Sentido } from '@/lib/ti-equipe';

export interface Degrau { a_partir_de: string; meta: number }

export interface MetaDaTI {
  chave: string;
  rotulo: string;
  sentido: Sentido;
  /** Percentual: o amarelo vai até 10 pontos da meta. Tempo e quantidade: até 70% (ou 130%, quando menos é melhor). */
  percentual: boolean;
  /** A meta padrão, enquanto o gestor não grava outra. */
  padrao: number;
  /** Como o número aparece: "90%", "8 h", "2 por mês". */
  unidade: string;
  /** A meta é por mês e o período da tela leva a parte proporcional (só as interrupções). */
  proporcional?: boolean;
  mercado: string;
}

export const METAS_DA_TI: MetaDaTI[] = [
  { chave: 'sla_cumprido', rotulo: 'SLA cumprido', sentido: 'mais', percentual: true, padrao: 80, unidade: '%',
    mercado: 'Contratos de suporte costumam pedir de 90% a 95% dos chamados dentro do prazo. A TI da Minasflor fez 80% em média nas últimas semanas.' },
  { chave: 'primeira_resposta', rotulo: '1ª resposta no prazo', sentido: 'mais', percentual: true, padrao: 85, unidade: '%',
    mercado: 'De 90% a 95%, a mesma prática dos contratos de suporte.' },
  // Horas CORRIDAS (com noite e fim de semana), como a tela conta: 8 h, a régua de "um dia útil", era injusta.
  { chave: 'tempo_medio_horas', rotulo: 'Tempo médio de resolução (no máximo)', sentido: 'menos', percentual: false, padrao: 24, unidade: ' h',
    mercado: 'Conta horas corridas, com noite e fim de semana: um chamado aberto às 17h e resolvido às 9h do dia seguinte já soma 16 h.' },
  { chave: 'fsense_trabalho', rotulo: '% Trabalho da equipe (FSENSE)', sentido: 'mais', percentual: true, padrao: 55, unidade: '%',
    mercado: 'Cerca de 50% do dia é produtivo (WorkTime 49%, Hubstaff 51%). Na Minasflor, metade das semanas passa de 55%.' },
  { chave: 'fsense_ocioso', rotulo: '% Ocioso da equipe (FSENSE, no máximo)', sentido: 'menos', percentual: true, padrao: 20, unidade: '%',
    mercado: 'Não há régua comparável (cada ferramenta mede de um jeito). Nos últimos meses a equipe ficou entre 17% e 21%.' },
  { chave: 'interrupcoes', rotulo: 'Interrupções: luz, internet, sistema, intranet (no máximo)', sentido: 'menos', percentual: false,
    padrao: 2, unidade: ' por mês', proporcional: true, mercado: 'Sem régua de mercado; 2 por mês era a meta da planilha.' },
];

export const META_DA_TI = Object.fromEntries(METAS_DA_TI.map((m) => [m.chave, m])) as Record<string, MetaDaTI>;

/** As metas gravadas, por indicador, com o mês a partir do qual cada uma vale (o que `useMetasDaTI` devolve). */
export type DegrausGravados = Map<string, Degrau[]>;

/** A meta que valia no dia: a última gravada até ele (antes da primeira, a primeira); sem nada gravado, a padrão. */
export function metaNoDia(gravados: DegrausGravados | undefined, chave: string, diaISO: string): number | undefined {
  const g = [...(gravados?.get(chave) ?? [])].sort((a, b) => a.a_partir_de.localeCompare(b.a_partir_de));
  if (g.length === 0) return META_DA_TI[chave]?.padrao;
  return ([...g].reverse().find((d) => d.a_partir_de <= diaISO) ?? g[0]).meta;
}

/** A nota do cartão: "meta: pelo menos 80%" — sem mês, sem a próxima (dono, 2026-11-02). */
export function notaDaMeta(gravados: DegrausGravados | undefined, chave: string, dia: string, formatar: (v: number) => string): string | undefined {
  const def = META_DA_TI[chave];
  const meta = metaNoDia(gravados, chave, dia);
  if (!def || meta === undefined) return undefined;
  return `meta: ${def.sentido === 'mais' ? 'pelo menos' : 'até'} ${formatar(meta)}`;
}

/**
 * Gravar uma meta nova HOJE: as que valiam antes deste mês ficam (a história dos meses passados), e a deste mês em
 * diante passa a ser a nova. Sem nada gravado, o mês anterior guarda a padrão, para o passado não mudar de cor.
 */
export function degrausAoMudar(gravados: Degrau[], padrao: number, nova: number, hojeISO: string): Degrau[] {
  const mes = `${hojeISO.slice(0, 7)}-01`;
  const antes = gravados.filter((d) => d.a_partir_de < mes);
  const historia = antes.length ? antes : [{ a_partir_de: '2026-01-01', meta: padrao }];
  return [...historia, { a_partir_de: mes, meta: nova }];
}
